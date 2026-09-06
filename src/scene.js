import * as THREE from 'three/webgpu';
import { texture, positionLocal, positionWorld, cameraPosition, reflect, vec2, vec3, float, uniform, mix, normalize, transformNormalToView, smoothstep, fract, abs, max, min, select, sin } from 'three/tsl';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

function mesh(geometry,material,parent,position=[0,0,0]){
  const m=new THREE.Mesh(geometry,material);m.position.set(...position);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
}
const box=(w,h,d,r=.05)=>new RoundedBoxGeometry(w,h,d,3,r);

export function makeScene(renderer,sim){
  const scene=new THREE.Scene();scene.background=new THREE.Color('#eeeae2');
  scene.fog=new THREE.Fog('#eeeae2',23,55);
  const camera=new THREE.PerspectiveCamera(34,innerWidth/innerHeight,.1,80);
  const environment=new RoomEnvironment();
  const pmrem=new THREE.PMREMGenerator(renderer);
  scene.environment=pmrem.fromScene(environment,.025).texture;scene.environmentIntensity=.62;
  environment.dispose();
  const ground=new THREE.MeshStandardNodeMaterial({color:'#e7e3da',roughness:.96});
  mesh(new THREE.PlaneGeometry(150,150).rotateX(-Math.PI/2),ground,scene,[0,-.77,0]).castShadow=false;
  const stone=new THREE.MeshStandardNodeMaterial({color:'#d5d4c5',roughness:.78});
  const p=positionLocal;
  const grain=sin(p.x.mul(119).add(sin(p.z.mul(77))).add(p.y.mul(103))).mul(sin(p.z.mul(193).add(p.x.mul(41))));
  stone.colorNode=mix(vec3(.55,.555,.49),vec3(.69,.69,.63),grain.mul(.14).add(.64));
  const underside=new THREE.MeshStandardNodeMaterial({color:'#aaa997',roughness:.85});
  mesh(box(6.7,.23,6.7,.08),underside,scene,[0,-.52,0]);
  mesh(box(6.9,.26,6.9,.065),stone,scene,[0,-.3,0]);
  // Wall inner faces coincide with the 6 m reflecting numerical basin.
  for(const z of [-3.23,3.23])mesh(box(6.92,.55,.46,.055),stone,scene,[0,-.04,z]);
  for(const x of [-3.23,3.23])mesh(box(.46,.55,6,.055),stone,scene,[x,-.04,0]);
  const dark=new THREE.MeshStandardNodeMaterial({color:'#657466',roughness:.8});
  for(const x of [-2.5,2.5])for(const z of [-2.5,2.5])mesh(box(.48,.3,.48,.04),dark,scene,[x,-.62,z]);
  const brass=new THREE.MeshStandardNodeMaterial({color:'#b8a071',metalness:.84,roughness:.29});
  const inlay=new THREE.MeshStandardNodeMaterial({color:'#83988a',roughness:.62});
  for(let i=0;i<=24;i++){
    const a=-2.88+i*.24,len=i%4===0?.11:.045;
    mesh(new THREE.BoxGeometry(.008,.003,len),inlay,scene,[a,.238,3.20]);
    mesh(new THREE.BoxGeometry(len,.003,.008),inlay,scene,[3.20,.238,a]);
  }
  // Deliberately understated maker's plate, modelled rather than downloaded.
  mesh(box(.49,.012,.17,.016),brass,scene,[2.48,.241,3.21]);
  for(let i=0;i<3;i++)mesh(new THREE.BoxGeometry(.19-i*.033,.003,.008),dark,scene,[2.48,.249,3.18+i*.035]);

  const view=uniform(0),tex=texture(sim.display),L=sim.p.length,du=1/sim.p.n;
  const uv=positionLocal.xz.div(L).add(.5),q=tex.sample(uv);
  const hx=tex.sample(uv.add(vec2(du,0))).x.sub(tex.sample(uv.sub(vec2(du,0))).x).div(2*sim.p.dx);
  const hz=tex.sample(uv.add(vec2(0,du))).x.sub(tex.sample(uv.sub(vec2(0,du))).x).div(2*sim.p.dx);
  const water=new THREE.MeshPhysicalNodeMaterial({roughness:.085,metalness:.12,clearcoat:.7,clearcoatRoughness:.085,ior:1.333});
  water.positionNode=positionLocal.add(vec3(0,q.x,0));
  // Optical slope gain improves legibility of centimetre-scale waves at this
  // wide camera distance. Geometry and all measurements keep scale 1.
  const surfaceNormal=normalize(vec3(hx.mul(-3),1,hz.mul(-3)));
  water.normalNode=transformNormalToView(surfaceNormal);
  water.clearcoatNormalNode=water.normalNode;
  // An illustrative refracted tile coordinate. It reacts to the measured
  // gradient but is not a ray-traced caustic or calibrated optical model.
  const floorUV=positionLocal.xz.sub(vec2(hx,hz).mul(1.5));
  const grid=min(abs(fract(floorUV.x.mul(2)).sub(.5)),abs(fract(floorUV.y.mul(2)).sub(.5)));
  const grout=smoothstep(.005,.018,grid);
  const rim=min(float(3).sub(abs(positionLocal.x)),float(3).sub(abs(positionLocal.z)));
  const shallow=smoothstep(0,.65,rim).oneMinus();
  const base=mix(vec3(.009,.077,.080),vec3(.050,.22,.18),shallow.mul(.6).add(.2));
  const tileColor=base.mul(mix(.76,1,grout));
  const focus=sin(hx.mul(38).add(hz.mul(27))).mul(.5).add(.5).pow(7).mul(q.x.abs().mul(5).clamp(0,.16));
  const surface=tileColor.add(vec3(.27,.39,.32).mul(focus));
  const signed=q.x.mul(200).clamp(-1,1);
  const heightColor=mix(mix(vec3(.78,.80,.75),vec3(.015,.16,.30),signed.negate().max(0)),vec3(.68,.16,.025),signed.max(0));
  const flowColor=vec3(q.y.abs().mul(9).add(.045),q.z.abs().mul(9).add(.13),.24);
  // Blend the three discrete modes without control-flow branches. The TSL
  // common texture/UV expression must execute in every mode, not only in the
  // first branch that introduced it into the generated shader.
  const diagnostic=view.clamp(0,1),heightMode=float(1).sub(abs(view.sub(1))).max(0),flowMode=view.sub(1).clamp(0,1);
  water.colorNode=surface.mul(diagnostic.oneMinus());
  // A procedural studio softbox reflected in the actual surface normal.
  // It supplies optical contrast; it never displaces or forces the water.
  const reflected=reflect(normalize(cameraPosition.sub(positionWorld)).negate(),surfaceNormal);
  const lightHit=positionWorld.xz.add(reflected.xz.mul(float(8).sub(positionWorld.y)).div(max(reflected.y,.05)));
  const softbox=smoothstep(3.7,4.2,abs(lightHit.x.add(6))).oneMinus().mul(smoothstep(.09,.24,abs(abs(lightHit.y.add(8)).sub(.43))).oneMinus());
  water.emissiveNode=vec3(.35,.36,.31).mul(softbox).mul(diagnostic.oneMinus()).add(heightColor.mul(heightMode)).add(flowColor.mul(flowMode));
  water.clearcoatNode=float(.7).mul(diagnostic.oneMinus());
  water.specularIntensityNode=diagnostic.oneMinus();
  water.metalnessNode=float(.12).mul(diagnostic.oneMinus());
  water.roughnessNode=mix(float(.085),float(.55),diagnostic);
  const waterMesh=mesh(new THREE.PlaneGeometry(6,6,192,192).rotateX(-Math.PI/2),water,scene);
  waterMesh.castShadow=false;waterMesh.frustumCulled=false;

  const floatGroup=new THREE.Group();scene.add(floatGroup);
  const ceramic=new THREE.MeshPhysicalNodeMaterial({color:'#edeee1',roughness:.26,clearcoat:.65,clearcoatRoughness:.2});
  const profile=[new THREE.Vector2(0,-.065),new THREE.Vector2(.28,-.065),new THREE.Vector2(.42,-.043),new THREE.Vector2(.49,.008),new THREE.Vector2(.48,.05),new THREE.Vector2(.43,.095),new THREE.Vector2(.31,.125),new THREE.Vector2(0,.128)];
  mesh(new THREE.LatheGeometry(profile,96),ceramic,floatGroup);
  const torus=(radius,tube,y,material)=>{const m=mesh(new THREE.TorusGeometry(radius,tube,10,112),material,floatGroup,[0,y,0]);m.rotation.x=Math.PI/2;return m;};
  torus(.466,.008,.06,brass);torus(.25,.003,.132,brass);torus(.28,.003,.13,brass);
  const central=new THREE.MeshStandardNodeMaterial({color:'#6d667c',metalness:.45,roughness:.34});
  mesh(new THREE.CylinderGeometry(.08,.09,.023,48),brass,floatGroup,[0,.14,0]);
  mesh(new THREE.CylinderGeometry(.052,.055,.012,48),central,floatGroup,[0,.155,0]);
  // Every float vertex consumes GPU heave directly. No CPU pose copy or
  // decorative bobbing can substitute for the coupled simulation state.
  for(const child of floatGroup.children){
    child.material=child.material.clone();
    const localHeave=sim.body.element(0).x;
    // The torus local Y is rotated into world Z; insert heave in world space.
    child.material.positionNode=positionLocal;
    child.material.positionNode=positionLocal.add(vec3(0,localHeave,0));
    if(child.geometry.type==='TorusGeometry'){
      child.rotation.x=0;child.geometry.rotateX(Math.PI/2);
    }
    child.frustumCulled=false;
  }
  const pointerRing=new THREE.Mesh(new THREE.RingGeometry(.59,.597,96).rotateX(-Math.PI/2),new THREE.MeshBasicNodeMaterial({color:'#9584a4',transparent:true,opacity:0,depthWrite:false}));
  pointerRing.position.y=.018;scene.add(pointerRing);

  const hemi=new THREE.HemisphereLight('#f5f6ec','#b5b49d',.8);scene.add(hemi);
  const key=new THREE.DirectionalLight('#fff1db',2.8);key.position.set(-4.5,9,4.5);key.castShadow=true;
  key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-7;key.shadow.camera.right=7;key.shadow.camera.top=7;key.shadow.camera.bottom=-7;key.shadow.camera.near=.1;key.shadow.camera.far=28;
  key.shadow.bias=-.0004;key.shadow.normalBias=.025;scene.add(key);
  const fill=new THREE.DirectionalLight('#edf3f0',.6);fill.position.set(5,4,-5);scene.add(fill);
  const target=new THREE.Vector3(-.7,-.08,0);
  const embedded=new URLSearchParams(location.search).has('embed');
  const setCamera=top=>{
    const mobile=innerWidth<600;
    if(top){camera.position.set(0,13,.01);camera.lookAt(0,0,0);}
    else{
      camera.position.set(mobile?8.1:8.5,mobile?10:9.2,mobile?11:11.2);
      camera.lookAt(embedded?new THREE.Vector3(0,-.08,0):mobile?new THREE.Vector3(0,1.8,0):target);
    }
    camera.aspect=innerWidth/innerHeight;
    camera.fov=embedded?Math.max(34,2*Math.atan(Math.tan(34*Math.PI/360)/camera.aspect)*180/Math.PI):mobile?64:34;
    camera.updateProjectionMatrix();
  };
  setCamera(false);
  return {scene,camera,floatGroup,pointerRing,view,setCamera,target,waterMesh};
}
