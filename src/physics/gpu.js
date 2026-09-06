import * as THREE from 'three/webgpu';
import { Fn, If, Loop, float, int, uint, vec2, vec4, ivec2, uniform, instanceIndex, textureLoad, textureStore, storage, clamp, select, length, max, cos } from 'three/tsl';
import { config, footprint, stability, Reference } from './reference.js';

const makeTexture=(n,half=false)=>{
  const t=new THREE.StorageTexture(n,n);
  t.type=half?THREE.HalfFloatType:THREE.FloatType;
  t.format=THREE.RGBAFormat;
  t.minFilter=t.magFilter=half?THREE.LinearFilter:THREE.NearestFilter;
  t.generateMipmaps=false;return t;
};

export class CoupledWater {
  constructor(renderer,options={}){
    this.renderer=renderer;this.p=config(options);this.steps=0;
    const {n:N}=this.p;
    if(stability(this.p,footprint(this.p).w).courantBound>.5)throw new RangeError('Unsafe timestep');
    this.state=makeTexture(N);this.kicked=makeTexture(N);this.display=makeTexture(N,true);
    this.rowAttribute=new THREE.StorageBufferAttribute(new Float32Array(N*4),4);
    this.bodyAttribute=new THREE.StorageBufferAttribute(new Float32Array(8),4);
    this.readAttribute=new THREE.StorageBufferAttribute(new Float32Array((N*N+2)*4),4);
    this.rows=storage(this.rowAttribute,'vec4',N);
    this.body=storage(this.bodyAttribute,'vec4',2);
    this.u={center:uniform(new THREE.Vector2()),coupling:uniform(1),held:uniform(0),handTarget:uniform(0),
      waterDamping:uniform(this.p.waterDamping),bodyDamping:uniform(this.p.bodyDamping),
      initialZ:uniform(0),initialSpeed:uniform(0),initialWave:uniform(0),feedback:uniform(1)};
    this.build();
  }

  build(){
    const p=this.p,N=p.n,dx=p.dx,dt=p.dt,u=this.u,body=this.body,rows=this.rows;
    const xy=()=>[int(instanceIndex.mod(uint(N))),int(instanceIndex.div(uint(N)))];
    const at=(tex,x,y)=>textureLoad(tex,ivec2(clamp(x,0,N-1),clamp(y,0,N-1)),0);
    const weight=(x,y)=>{
      const pos=vec2(float(x).add(.5).mul(dx).sub(p.length/2),float(y).add(.5).mul(dx).sub(p.length/2));
      const r=length(pos.sub(u.center)).div(p.radius),a=max(float(1).sub(r),0);
      return a.mul(a).mul(a).mul(a).mul(float(1).add(r.mul(4)));
    };
    this.reduce=Fn(()=>{
      const y=int(instanceIndex),s=float(0).toVar(),w=float(0).toVar();
      Loop(N,({i})=>{const a=weight(i,y);s.addAssign(at(this.state,i,y).x.mul(a));w.addAssign(a);});
      rows.element(instanceIndex).assign(vec4(s,w,0,0));
    })().compute(N);
    this.kickBody=Fn(()=>{
      const s=float(0).toVar(),w=float(0).toVar();
      Loop(N,({i})=>{s.addAssign(rows.element(i).x);w.addAssign(rows.element(i).y);});
      const mean=s.div(max(w,1e-12)),old=body.element(0).toVar();
      const q=old.x.sub(mean),K=u.coupling.mul(p.stiffness);
      const hand=clamp(u.handTarget.sub(old.x).mul(1350).sub(old.y.mul(110)),-220,220).mul(u.held);
      const force=K.mul(q).negate();
      const speed=old.y.add(force.add(hand).mul(dt/p.mass)).mul(u.bodyDamping.mul(-dt).exp());
      body.element(0).assign(vec4(old.x.add(speed.mul(dt)),speed,q,mean));
      body.element(1).assign(vec4(w.mul(dx*dx),force,hand,0));
    })().compute(1);
    this.kickWater=Fn(()=>{
      const [x,y]=xy(),c=at(this.state,x,y),r=at(this.state,x.add(1),y),t=at(this.state,x,y.add(1));
      const K=u.coupling.mul(p.stiffness).mul(u.feedback),q=body.element(0).z;
      const factor=K.mul(q).div(body.element(1).x.mul(p.rho));
      const mu=c.x.mul(p.gravity).sub(factor.mul(weight(x,y)));
      const mur=r.x.mul(p.gravity).sub(factor.mul(weight(x.add(1),y)));
      const mut=t.x.mul(p.gravity).sub(factor.mul(weight(x,y.add(1))));
      const damp=u.waterDamping.mul(-dt).exp();
      const east=select(x.lessThan(N-1),c.y.sub(mur.sub(mu).mul(dt/dx)).mul(damp),0);
      const north=select(y.lessThan(N-1),c.z.sub(mut.sub(mu).mul(dt/dx)).mul(damp),0);
      textureStore(this.kicked,ivec2(x,y),vec4(c.x,east,north,0)).toWriteOnly();
    })().compute(N*N);
    this.driftWater=Fn(()=>{
      const [x,y]=xy(),c=at(this.kicked,x,y);
      const left=select(x.greaterThan(0),at(this.kicked,x.sub(1),y).y,0);
      const down=select(y.greaterThan(0),at(this.kicked,x,y.sub(1)).z,0);
      const div=c.y.sub(left).add(c.z.sub(down)).div(dx);
      textureStore(this.state,ivec2(x,y),vec4(c.x.sub(div.mul(p.depth*dt)),c.yz,0)).toWriteOnly();
    })().compute(N*N);
    this.copyDisplay=Fn(()=>{const [x,y]=xy();textureStore(this.display,ivec2(x,y),at(this.state,x,y)).toWriteOnly();})().compute(N*N);
    this.clearField=Fn(()=>{
      const [x,y]=xy(),h=u.initialWave.mul(cos(float(x).add(.5).mul(Math.PI/N))).mul(cos(float(y).add(.5).mul(2*Math.PI/N)));
      textureStore(this.state,ivec2(x,y),vec4(h,0,0,0)).toWriteOnly();
    })().compute(N*N);
    this.clearBody=Fn(()=>{body.element(0).assign(vec4(u.initialZ,u.initialSpeed,0,0));body.element(1).assign(vec4(1,0,0,0));})().compute(1);
    const read=storage(this.readAttribute,'vec4',N*N+2);
    this.copyRead=Fn(()=>{
      If(instanceIndex.lessThan(uint(N*N)),()=>{
        const [x,y]=xy();read.element(instanceIndex).assign(at(this.state,x,y));
      }).Else(()=>{read.element(instanceIndex).assign(body.element(instanceIndex.sub(uint(N*N))));});
    })().compute(N*N+2);
  }

  reset({z=0,speed=0,amplitude=0}={}){
    if(![z,speed,amplitude].every(Number.isFinite))throw new RangeError('Non-finite reset');
    this.u.initialZ.value=z;this.u.initialSpeed.value=speed;this.u.initialWave.value=amplitude;
    this.renderer.compute(this.clearField);this.renderer.compute(this.clearBody);this.publish();this.steps=0;
  }
  setCenter(x,z){footprint(this.p,x,z);this.u.center.value.set(x,z);}
  setCoupling(on){this.u.coupling.value=on?1:0;}
  step(n=1){
    if(!Number.isInteger(n)||n<0||n>24000)throw new RangeError('Invalid step count');
    for(let i=0;i<n;i++){
      this.renderer.compute(this.reduce);this.renderer.compute(this.kickBody);
      this.renderer.compute(this.kickWater);this.renderer.compute(this.driftWater);
    }
    this.steps+=n;
  }
  publish(){this.renderer.compute(this.copyDisplay);}
  async readBody(){return new Float32Array(await this.renderer.getArrayBufferAsync(this.bodyAttribute));}
  async snapshot(){
    // Capture water and body in one dispatch before awaiting a readback. The
    // animation loop may advance while the staging buffer is being mapped.
    const steps=this.steps,center=[this.u.center.value.x,this.u.center.value.y],coupled=this.u.coupling.value===1;
    this.renderer.compute(this.copyRead);
    const captured=new Float32Array(await this.renderer.getArrayBufferAsync(this.readAttribute));
    const field=captured.subarray(0,this.p.n*this.p.n*4),body=captured.subarray(this.p.n*this.p.n*4);
    const ref=new Reference(this.p);ref.setCenter(...center);
    for(let k=0;k<ref.h.length;k++){ref.h[k]=field[k*4];ref.u[k]=field[k*4+1];ref.v[k]=field[k*4+2];}
    ref.z=body[0];ref.speed=body[1];ref.steps=steps;ref.coupling=coupled;
    return {field,body,diagnostics:ref.diagnostics()};
  }
  dispose(){
    for(const node of [this.reduce,this.kickBody,this.kickWater,this.driftWater,this.copyDisplay,this.clearField,this.clearBody,this.copyRead])node.dispose();
    for(const tex of [this.state,this.kicked,this.display])tex.dispose();
  }
}

// An executable reference case, available in the shipped inspector. No success
// result is cached into the application. Its measured outcome can be a FAIL.
export async function compareReference(renderer,{steps=240,n=24,feedback=1}={}){
  const options={n,radius:n===24?.8:.62,dt:1/240,waterDamping:0,bodyDamping:0};
  const cases=[{name:'float-to-water',initial:{z:-.075,speed:.01,amplitude:0},center:[0,0],on:true},
    {name:'incoming-wave',initial:{z:0,speed:0,amplitude:.012},center:[.4,.3],on:true},
    {name:'coupling-off',initial:{z:-.075,speed:0,amplitude:0},center:[0,0],on:false}];
  const results=[];
  for(const c of cases){
    const cpu=new Reference(options),gpu=new CoupledWater(renderer,options);
    cpu.setCenter(...c.center);gpu.setCenter(...c.center);cpu.coupling=c.on;gpu.setCoupling(c.on);
    gpu.u.feedback.value=feedback;
    cpu.reset(c.initial);gpu.reset(c.initial);
    // Yield between bounded batches so the inspector remains responsive.
    for(let i=0;i<steps;i+=40){const n=Math.min(40,steps-i);for(let j=0;j<n;j++)cpu.step();gpu.step(n);await new Promise(r=>setTimeout(r,0));}
    const snap=await gpu.snapshot();let heightError=0,velocityError=0;
    for(let i=0;i<cpu.h.length;i++){
      heightError=Math.max(heightError,Math.abs(cpu.h[i]-snap.field[4*i]));
      velocityError=Math.max(velocityError,Math.abs(cpu.u[i]-snap.field[4*i+1]),Math.abs(cpu.v[i]-snap.field[4*i+2]));
    }
    const bodyError=Math.max(Math.abs(cpu.z-snap.body[0]),Math.abs(cpu.speed-snap.body[1]));
    const pass=snap.diagnostics.finite&&Math.max(heightError,velocityError,bodyError)<5e-5;
    results.push({name:c.name,pass,steps,n:options.n,dt:options.dt,heightError,velocityError,bodyError,tolerance:5e-5,diagnostics:snap.diagnostics});
    gpu.dispose();
  }
  return {pass:results.every(r=>r.pass),cases:results,backend:'WebGPU',feedback,precision:'fp32 GPU vs float64 CPU; absolute component tolerance',checkedAt:new Date().toISOString()};
}
