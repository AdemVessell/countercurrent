import test from 'node:test';
import assert from 'node:assert/strict';
import { Reference, config, footprint, gradient, divergence, stability } from '../src/physics/reference.js';

const opts={n:24,dt:1/240,waterDamping:0,bodyDamping:0,radius:.8};
let seed=91247;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296-.5;};
const close=(a,b,tol=1e-11)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b} (tol ${tol})`);

test('normalized nonnegative resolved footprint and conservative stability bound',()=>{
  const p=config(opts),{w}=footprint(p,.17,-.23);
  close(w.reduce((a,b)=>a+b,0)*p.dx**2,1,1e-14);
  assert.ok(w.every(x=>x>=0));
  assert.ok(stability(p,w).courantBound<.5);
  assert.throws(()=>new Reference({n:96,dt:.1}),/Timestep/);
  assert.throws(()=>config({dt:NaN}),/Non-finite/);
  assert.throws(()=>footprint(p,99,0),/outside/);
});

test('reflecting MAC gradient and divergence obey summation by parts',()=>{
  const p=config(opts),a=Float64Array.from({length:p.n**2},random),u=Float64Array.from(a,random),v=Float64Array.from(a,random);
  const [gx,gz]=gradient(a,p),d=divergence(u,v,p);
  let residual=0,scale=0;
  for(let k=0;k<a.length;k++){residual+=(gx[k]*u[k]+gz[k]*v[k]+a[k]*d[k])*p.dx**2;scale+=Math.abs(a[k]*d[k])*p.dx**2;}
  assert.ok(Math.abs(residual)/scale<1e-14);
});

test('potential gradient agrees with independent finite-difference virtual work',()=>{
  const s=new Reference(opts);s.reset({z:.07,amplitude:.01});
  const dir=Float64Array.from(s.h,random),dz=.31,eps=1e-6;
  const energy=()=>s.diagnostics().waterPotential+s.diagnostics().couplingPotential;
  let derivative=s.p.stiffness*(s.z-s.meanHeight())*dz;
  for(let i=0;i<s.h.length;i++)derivative+=(s.p.rho*s.p.gravity*s.h[i]-s.p.stiffness*(s.z-s.meanHeight())*s.w[i])*dir[i]*s.p.dx**2;
  for(let i=0;i<s.h.length;i++)s.h[i]+=eps*dir[i];s.z+=eps*dz;const plus=energy();
  for(let i=0;i<s.h.length;i++)s.h[i]-=2*eps*dir[i];s.z-=2*eps*dz;const minus=energy();
  close((plus-minus)/(2*eps),derivative,1e-7);
});

test('coupling-only frequency follows an independently derived scalar recurrence',()=>{
  const s=new Reference({...opts,gravity:0});s.reset({z:.08,speed:.03,amplitude:.01});
  const omega2=stability(s.p,s.w).omegaCoupling2,qs=[s.z-s.meanHeight()];
  for(let i=0;i<500;i++){s.step();qs.push(s.z-s.meanHeight());}
  let worst=0;
  for(let i=1;i<qs.length-1;i++)worst=Math.max(worst,Math.abs(qs[i+1]-(2-s.p.dt**2*omega2)*qs[i]+qs[i-1]));
  assert.ok(worst<1e-12,`recurrence residual ${worst}`);
});

test('10,000-step closed undamped run preserves volume and modified energy',()=>{
  const s=new Reference(opts);s.reset({z:.08,speed:.01,amplitude:.01});
  const initial=s.diagnostics();let maxRelative=0,maxPhysical=0;
  for(let i=0;i<10000;i++){
    s.step();
    if(i%100===0){const d=s.diagnostics();assert.ok(d.finite);maxRelative=Math.max(maxRelative,Math.abs(d.modifiedEnergy/initial.modifiedEnergy-1));maxPhysical=Math.max(maxPhysical,Math.abs(d.energy/initial.energy-1));}
  }
  assert.ok(maxRelative<1e-9,`modified-energy drift ${maxRelative}`);
  assert.ok(maxPhysical<.08,`physical-energy oscillation ${maxPhysical}`);
  close(s.diagnostics().volume,initial.volume,1e-12);
});

test('uniform displacement is exactly stationary and coupling-off is inert',()=>{
  const s=new Reference(opts);s.h.fill(.012);s.z=.012;
  for(let i=0;i<120;i++)s.step();
  close(s.z,.012,1e-13);assert.ok(s.h.every(h=>Math.abs(h-.012)<1e-13));
  s.reset({z:.08});s.coupling=false;
  for(let i=0;i<480;i++)s.step();
  assert.equal(s.diagnostics().maxHeight,0);assert.equal(s.z,.08);
});

test('body-to-water and water-to-body are separately observable',()=>{
  const fromBody=new Reference(opts);fromBody.reset({z:.08});
  for(let i=0;i<240;i++)fromBody.step();
  assert.ok(fromBody.diagnostics().maxHeight>.001);
  const fromWater=new Reference(opts);fromWater.reset({amplitude:.025});fromWater.setCenter(-1,-.7);
  for(let i=0;i<240;i++)fromWater.step();
  assert.ok(Math.abs(fromWater.z)>.0001);
});

test('the same invariant rejects pressure sign, body sign, missing feedback and old-velocity drift',()=>{
  for(const mutant of ['pressure-sign','body-sign','one-way','old-drift']){
    const s=new Reference(opts);s.setCenter(.4,.3);s.reset({z:.08,speed:.01,amplitude:.01});s.mutant=mutant;
    const e=s.diagnostics().modifiedEnergy;
    for(let i=0;i<160;i++)s.step();
    const relative=Math.abs(s.diagnostics().modifiedEnergy/e-1);
    assert.ok(relative>1e-4,`${mutant} escaped: ${relative}`);
  }
});

test('damped release remains finite and loses most energy without resets',()=>{
  const s=new Reference({...opts,waterDamping:.5,bodyDamping:1.1});s.reset({z:-.1});
  const start=s.diagnostics().energy;
  for(let i=0;i<7200;i++)s.step();
  const d=s.diagnostics();assert.ok(d.finite);assert.ok(d.energy<start*.015);assert.equal(d.steps,7200);
});
