import './style.css';
import * as THREE from 'three/webgpu';
import { CoupledWater, compareReference } from './physics/gpu.js';
import { makeScene } from './scene.js';

const $=id=>document.getElementById(id);
const dialog=$('inspector');
$('open-inspector').onclick=()=>dialog.showModal();
$('fallback-explain').onclick=()=>dialog.showModal();
$('close-inspector').onclick=()=>dialog.close();
dialog.addEventListener('click',e=>{if(e.target===dialog&&e.clientX<dialog.getBoundingClientRect().left)dialog.close();});
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const query=new URLSearchParams(location.search);
const runtime={ready:false,paused:false,coupled:true,verifying:false,top:false,mode:'surface',steps:0,frames:0,droppedWallSeconds:0,hiddenPauses:0,interactions:0,lastVerification:null,lastDiagnostics:null,fps:0};
window.__countercurrent={runtime};

function unsupported(message){
  $('loading').classList.add('ready');$('loading').setAttribute('aria-hidden','true');$('fallback').hidden=false;$('fallback-detail').textContent=message;
  $('phase').textContent='WEBGPU REQUIRED';$('read-state').textContent='Not running';
}

async function boot(){
  if(query.has('forceFallback')||!navigator.gpu){unsupported('Open this piece in a WebGPU-capable browser. The interactive simulation has not started.');return;}
  const renderer=new THREE.WebGPURenderer({antialias:true,alpha:false});
  await renderer.init();
  if(!renderer.backend.isWebGPUBackend){renderer.dispose();unsupported('This browser selected a graphics backend without WebGPU compute. The simulation has not started.');return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.setSize(innerWidth,innerHeight);
  renderer.toneMapping=THREE.AgXToneMapping;renderer.toneMappingExposure=1.06;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  $('stage').appendChild(renderer.domElement);renderer.domElement.setAttribute('aria-hidden','true');
  const sim=new CoupledWater(renderer);sim.reset();
  const {scene,camera,floatGroup,pointerRing,view,setCamera}=makeScene(renderer,sim);
  const ray=new THREE.Raycaster(),mouse=new THREE.Vector2(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
  const target=new THREE.Vector2(),center=new THREE.Vector2(),velocity=new THREE.Vector2();
  let held=false,pressUntil=-1,auto=!reduced&&!query.has('studio'),autoDone=false;
  let last=performance.now(),accumulator=0,readPending=false,lastRead=0,lastFullRead=0,fpsFrames=0,fpsMark=last;
  let lastBody=new Float32Array(8),lastDiagnostic=null;
  const setPaused=value=>{runtime.paused=!!value;accumulator=0;last=performance.now();$('pause').textContent=runtime.paused?'▷':'Ⅱ';$('pause').setAttribute('aria-label',runtime.paused?'Resume':'Pause');$('pause').setAttribute('aria-pressed',String(runtime.paused));};
  const setCoupling=value=>{runtime.coupled=!!value;sim.setCoupling(value);$('coupling').setAttribute('aria-pressed',String(value));};
  const cancelAuto=()=>{auto=false;autoDone=true;};
  const reset=({demo=false}={})=>{
    sim.u.held.value=0;held=false;pressUntil=-1;center.set(0,0);target.set(0,0);velocity.set(0,0);sim.setCenter(0,0);sim.reset();
    auto=demo&&!reduced;autoDone=!auto;accumulator=0;last=performance.now();setPaused(false);
  };
  const press=()=>{cancelAuto();if(runtime.paused)setPaused(false);pressUntil=sim.steps*sim.p.dt+.78;runtime.interactions++;};
  $('press').onclick=press;$('reset').onclick=()=>reset({demo:true});$('pause').onclick=()=>{cancelAuto();setPaused(!runtime.paused);};
  $('coupling').onclick=()=>{cancelAuto();setCoupling(!runtime.coupled);runtime.interactions++;};
  $('top-view').onclick=()=>{runtime.top=!runtime.top;setCamera(runtime.top);dialog.close();};
  for(const button of document.querySelectorAll('[data-view]'))button.onclick=()=>{
    runtime.mode=button.dataset.view;view.value={surface:0,height:1,flow:2}[runtime.mode];
    for(const b of document.querySelectorAll('[data-view]')){b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));}
    dialog.close();
  };
  async function diagnostics(){
    const snap=await sim.snapshot();lastDiagnostic=snap.diagnostics;runtime.lastDiagnostics=lastDiagnostic;
    if(!lastDiagnostic.finite){setPaused(true);$('phase').textContent='NON-FINITE STATE — PAUSED';}
    return lastDiagnostic;
  }
  async function verify(){
    if(runtime.verifying)return runtime.lastVerification;
    const wasPaused=runtime.paused;setPaused(true);runtime.verifying=true;$('verify').disabled=true;
    $('verify-status').textContent='Running three measured CPU/GPU comparisons…';
    try{
      const result=await compareReference(renderer);runtime.lastVerification=result;
      const worst=Math.max(...result.cases.flatMap(c=>[c.heightError,c.velocityError,c.bodyError]));
      $('verify-status').textContent=`${result.pass?'PASS':'FAIL'} · ${result.cases.filter(c=>c.pass).length}/3 cases · largest component error ${worst.toExponential(2)} (limit 5e−5).`;
      $('verify-status').classList.toggle('fail',!result.pass);return result;
    }catch(error){$('verify-status').textContent=`Check could not complete: ${error.message}`;$('verify-status').classList.add('fail');throw error;}
    finally{runtime.verifying=false;$('verify').disabled=false;setPaused(wasPaused);}
  }
  $('verify').onclick=()=>verify().catch(console.error);

  function hit(event){
    const r=renderer.domElement.getBoundingClientRect();mouse.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);
    ray.setFromCamera(mouse,camera);const p=new THREE.Vector3();if(!ray.ray.intersectPlane(plane,p))return null;
    return Math.abs(p.x)<3&&Math.abs(p.z)<3?p:null;
  }
  const boundedTarget=p=>{const limit=sim.p.length/2-sim.p.radius-sim.p.dx;target.set(THREE.MathUtils.clamp(p.x,-limit,limit),THREE.MathUtils.clamp(p.z,-limit,limit));};
  renderer.domElement.addEventListener('pointerdown',event=>{
    if(event.button!==0||runtime.verifying)return;const p=hit(event);if(!p)return;
    cancelAuto();held=true;runtime.interactions++;boundedTarget(p);if(runtime.paused)setPaused(false);
    renderer.domElement.setPointerCapture(event.pointerId);document.body.classList.add('dragging');event.preventDefault();
  });
  renderer.domElement.addEventListener('pointermove',event=>{if(held){const p=hit(event);if(p)boundedTarget(p);}});
  const release=()=>{held=false;document.body.classList.remove('dragging');};
  renderer.domElement.addEventListener('pointerup',release);renderer.domElement.addEventListener('pointercancel',release);renderer.domElement.addEventListener('lostpointercapture',release);
  document.addEventListener('keydown',event=>{
    if(dialog.open||event.target.closest('button,a,input'))return;
    if(event.code==='Space'){event.preventDefault();cancelAuto();setPaused(!runtime.paused);}
    if(event.key.toLowerCase()==='r')reset();
    if(event.key.toLowerCase()==='c')setCoupling(!runtime.coupled);
  });
  document.addEventListener('visibilitychange',()=>{release();accumulator=0;last=performance.now();if(document.hidden)runtime.hiddenPauses++;});
  addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);setCamera(runtime.top);});
  const stepOne=()=>{
    const t=sim.steps*sim.p.dt;
    if(auto){
      if(t>.6&&t<1.4)pressUntil=t+.02;
      if(t>7){auto=false;autoDone=true;}
    }
    // The guide is external work; it moves under a bounded critical spring.
    const omega=9,dt=sim.p.dt;
    velocity.x+=((target.x-center.x)*omega*omega-2*omega*velocity.x)*dt;
    velocity.y+=((target.y-center.y)*omega*omega-2*omega*velocity.y)*dt;
    if(velocity.length()>1.35)velocity.setLength(1.35);
    center.addScaledVector(velocity,dt);
    sim.u.center.value.copy(center);
    sim.u.held.value=held||t<pressUntil?1:0;sim.u.handTarget.value=-.115;
    sim.step();
  };
  await renderer.compileAsync(scene,camera);
  sim.step(1);sim.publish();renderer.render(scene,camera);
  runtime.ready=true;for(const id of ['press','reset','pause','coupling','verify','top-view'])$(id).disabled=false;
  for(const button of document.querySelectorAll('[data-view]'))button.disabled=false;
  $('loading').classList.add('ready');$('loading').setAttribute('aria-hidden','true');
  last=performance.now();fpsMark=last;
  window.__countercurrent={runtime,renderer,sim,scene,camera,reset,press,setPaused,setCoupling,diagnostics,verify,
    setView:mode=>{runtime.mode=mode;view.value={surface:0,height:1,flow:2}[mode]??0;},
    setTop:value=>{runtime.top=!!value;setCamera(runtime.top);},
    getCenter:()=>({x:center.x,z:center.y}),
    project:(x,y,z)=>{const p=new THREE.Vector3(x,y,z).project(camera);return{x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};},
    stepExact:n=>{setPaused(true);cancelAuto();for(let i=0;i<n;i++)stepOne();sim.publish();runtime.steps=sim.steps;},
    snapshot:()=>sim.snapshot()};
  renderer.setAnimationLoop(()=>{
    const now=performance.now(),elapsed=Math.max(0,(now-last)/1000);last=now;
    if(!runtime.paused&&!runtime.verifying&&!document.hidden){
      const wall=Math.min(elapsed,.05);runtime.droppedWallSeconds+=Math.max(0,elapsed-wall);accumulator+=wall;
      let n=0;while(accumulator>=sim.p.dt&&n<12){stepOne();accumulator-=sim.p.dt;n++;}
      sim.publish();
    }
    floatGroup.position.set(center.x,0,center.y);pointerRing.position.x=center.x;pointerRing.position.z=center.y;
    pointerRing.material.opacity=THREE.MathUtils.lerp(pointerRing.material.opacity,held?.65:0,.13);
    renderer.render(scene,camera);runtime.frames++;runtime.steps=sim.steps;fpsFrames++;
    if(now-fpsMark>850){runtime.fps=fpsFrames*1000/(now-fpsMark);fpsFrames=0;fpsMark=now;$('live-stat').textContent=`${runtime.fps.toFixed(0)} fps · ${sim.p.n}² cells`;}
    const status=runtime.paused?'PAUSED':held||sim.u.held.value?'YOUR HAND IS ADDING ENERGY':!runtime.coupled?'CONNECTION OFF':auto?'WATCH THE WATER ANSWER':'YOUR TURN — HOLD, MOVE, RELEASE';
    $('phase').textContent=status;$('read-state').textContent=runtime.paused?'Paused':runtime.coupled?'Coupled':'Connection off';
    document.querySelector('.scene-note').classList.toggle('active',!!sim.u.held.value);
    $('read-time').textContent=`${(sim.steps*sim.p.dt).toFixed(2)} s`;
    if(now-lastRead>150&&!readPending&&!runtime.verifying){lastRead=now;readPending=true;sim.readBody().then(b=>{lastBody=b;$('read-heave').textContent=`${(b[0]*1000).toFixed(1)} mm`;if(!Number.isFinite(b[0]))setPaused(true);}).catch(console.error).finally(()=>readPending=false);}
    if(dialog.open&&now-lastFullRead>900&&!runtime.verifying&&!readPending){lastFullRead=now;diagnostics().then(d=>$('read-wave').textContent=`${(d.maxHeight*1000).toFixed(1)} mm`).catch(console.error);}
  });
}
boot().catch(error=>{console.error(error);unsupported(`The experiment could not start: ${error.message}`);});
