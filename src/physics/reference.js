// New Countercurrent reference. Linear shallow-water MAC discretization and
// reciprocal heave coupling derived in MODEL.md. No inherited solver copied.
export const DEFAULTS = Object.freeze({
  n: 96, length: 6, depth: 0.28, rho: 1000, gravity: 9.81,
  mass: 28, stiffness: 1800, radius: 0.62, dt: 1 / 240,
  waterDamping: 0.28, bodyDamping: 0.8,
});

export function config(overrides = {}) {
  const p = { ...DEFAULTS, ...overrides };
  for (const key of Object.keys(DEFAULTS)) {
    if (!Number.isFinite(p[key])) throw new RangeError(`Non-finite ${key}`);
  }
  if (!Number.isInteger(p.n) || p.n < 8 || p.n > 256) throw new RangeError('Grid must be an integer in [8,256]');
  for (const k of ['length','depth','rho','mass','radius','dt']) if (p[k] <= 0) throw new RangeError(`Non-positive ${k}`);
  for (const k of ['gravity','stiffness','waterDamping','bodyDamping']) if (p[k] < 0) throw new RangeError(`Negative ${k}`);
  p.dx = p.length / p.n;
  if (p.radius < 3 * p.dx || p.radius > p.length / 4) throw new RangeError('Footprint must resolve at least three cells and fit the basin');
  return p;
}

// Compact C2 Wendland profile. Normalization is discrete, not an area guess.
export function footprint(p, cx = 0, cz = 0) {
  if (!Number.isFinite(cx) || !Number.isFinite(cz)) throw new RangeError('Invalid footprint location');
  const limit = p.length / 2 - p.radius - p.dx;
  if (Math.abs(cx) > limit || Math.abs(cz) > limit) throw new RangeError('Footprint outside supported basin');
  const w = new Float64Array(p.n * p.n);
  let sum = 0;
  for (let j = 0; j < p.n; j++) for (let i = 0; i < p.n; i++) {
    const x = (i + 0.5) * p.dx - p.length / 2 - cx;
    const z = (j + 0.5) * p.dx - p.length / 2 - cz;
    const r = Math.hypot(x, z) / p.radius;
    const v = r < 1 ? (1 - r) ** 4 * (1 + 4 * r) : 0;
    w[j * p.n + i] = v; sum += v * p.dx ** 2;
  }
  for (let i = 0; i < w.length; i++) w[i] /= sum;
  return { w, normalization: sum };
}

export function gradient(a, p) {
  const gx = new Float64Array(a.length), gz = new Float64Array(a.length);
  for (let j = 0; j < p.n; j++) for (let i = 0; i < p.n; i++) {
    const k = j * p.n + i;
    if (i < p.n - 1) gx[k] = (a[k + 1] - a[k]) / p.dx;
    if (j < p.n - 1) gz[k] = (a[k + p.n] - a[k]) / p.dx;
  }
  return [gx, gz];
}

export function divergence(u, v, p) {
  const d = new Float64Array(u.length);
  for (let j = 0; j < p.n; j++) for (let i = 0; i < p.n; i++) {
    const k = j * p.n + i;
    const east = i < p.n - 1 ? u[k] : 0, north = j < p.n - 1 ? v[k] : 0;
    d[k] = (east - (i ? u[k - 1] : 0) + north - (j ? v[k - p.n] : 0)) / p.dx;
  }
  return d;
}

export function stability(p, w) {
  const [gx, gz] = gradient(w, p);
  let beta = 0;
  for (let k = 0; k < w.length; k++) beta += (gx[k] ** 2 + gz[k] ** 2) * p.dx ** 2;
  const lambda = 8 / p.dx ** 2 * Math.cos(Math.PI / (2 * p.n)) ** 2;
  const omegaCoupling2 = p.stiffness * (1 / p.mass + p.depth * beta / p.rho);
  const omegaBound = Math.sqrt(p.gravity * p.depth * lambda + omegaCoupling2);
  return { beta, omegaCoupling2, omegaBound, courantBound: p.dt * omegaBound };
}

export class Reference {
  constructor(options = {}) {
    this.p = config(options);
    this.h = new Float64Array(this.p.n ** 2);
    this.u = new Float64Array(this.h.length);
    this.v = new Float64Array(this.h.length);
    this.mu = new Float64Array(this.h.length);
    this.z = 0; this.speed = 0; this.steps = 0;
    this.coupling = true; this.mutant = null;
    this.setCenter(0, 0);
    if (stability(this.p, this.w).courantBound > 0.5) throw new RangeError('Timestep exceeds conservative interactive stability bound');
  }

  setCenter(x, z) {
    const f = footprint(this.p, x, z);
    this.w = f.w; this.normalization = f.normalization;
    this.center = [x, z];
  }

  reset({ z = 0, speed = 0, amplitude = 0 } = {}) {
    if (![z,speed,amplitude].every(Number.isFinite)) throw new RangeError('Non-finite reset');
    this.u.fill(0); this.v.fill(0); this.steps = 0; this.z = z; this.speed = speed;
    const N = this.p.n;
    for (let j=0;j<N;j++) for (let i=0;i<N;i++) this.h[j*N+i] = amplitude * Math.cos(Math.PI*(i+.5)/N) * Math.cos(2*Math.PI*(j+.5)/N);
  }

  meanHeight() {
    let s=0;
    for (let k=0;k<this.h.length;k++) s += this.h[k]*this.w[k];
    return s*this.p.dx**2;
  }

  step({ handForce = 0 } = {}) {
    if (!Number.isFinite(handForce)) throw new RangeError('Non-finite force');
    const p = this.p, N = p.n, dt = p.dt, q = this.z - this.meanHeight();
    const K = this.coupling ? p.stiffness : 0;
    const feedbackSign = this.mutant === 'pressure-sign' ? -1 : 1;
    const bodySign = this.mutant === 'body-sign' ? -1 : 1;
    const feedback = this.mutant === 'one-way' ? 0 : feedbackSign;
    const oldU = this.mutant === 'old-drift' ? this.u.slice() : null;
    const oldV = this.mutant === 'old-drift' ? this.v.slice() : null;
    for (let k=0;k<this.h.length;k++) this.mu[k]=p.gravity*this.h[k]-feedback*K*q*this.w[k]/p.rho;
    for (let j=0;j<N;j++) for (let i=0;i<N;i++) {
      const k=j*N+i;
      this.u[k]=i<N-1 ? (this.u[k]-dt*(this.mu[k+1]-this.mu[k])/p.dx)*Math.exp(-p.waterDamping*dt) : 0;
      this.v[k]=j<N-1 ? (this.v[k]-dt*(this.mu[k+N]-this.mu[k])/p.dx)*Math.exp(-p.waterDamping*dt) : 0;
    }
    this.speed=(this.speed+dt*(-bodySign*K*q+handForce)/p.mass)*Math.exp(-p.bodyDamping*dt);
    const U=oldU??this.u,V=oldV??this.v;
    for(let j=0;j<N;j++) for(let i=0;i<N;i++){
      const k=j*N+i;
      const div=(U[k]-(i?U[k-1]:0)+V[k]-(j?V[k-N]:0))/p.dx;
      this.h[k]-=dt*p.depth*div;
    }
    this.z+=dt*this.speed; this.steps++;
    return { q, force: -K*q, meanHeight: this.meanHeight() };
  }

  diagnostics() {
    const p=this.p, dA=p.dx**2, q=this.z-this.meanHeight(), K=this.coupling?p.stiffness:0;
    let waterKinetic=0,waterPotential=0,volume=0,maxHeight=0,finite=true;
    for(let k=0;k<this.h.length;k++){
      waterKinetic+=.5*p.rho*p.depth*dA*(this.u[k]**2+this.v[k]**2);
      waterPotential+=.5*p.rho*p.gravity*dA*this.h[k]**2;
      volume+=this.h[k]*dA; maxHeight=Math.max(maxHeight,Math.abs(this.h[k]));
      finite&&=Number.isFinite(this.h[k])&&Number.isFinite(this.u[k])&&Number.isFinite(this.v[k]);
    }
    const bodyKinetic=.5*p.mass*this.speed**2, couplingPotential=.5*K*q**2;
    const energy=waterKinetic+waterPotential+bodyKinetic+couplingPotential;
    const div=divergence(this.u,this.v,p);
    let cross=K*q*this.speed;
    for(let k=0;k<this.h.length;k++) cross+=(p.rho*p.gravity*this.h[k]-K*q*this.w[k])*(-p.depth*div[k])*dA;
    return {steps:this.steps,time:this.steps*p.dt,z:this.z,speed:this.speed,meanHeight:this.meanHeight(),q,volume,maxHeight,finite:finite&&Number.isFinite(this.z)&&Number.isFinite(this.speed),waterKinetic,waterPotential,bodyKinetic,couplingPotential,energy,modifiedEnergy:energy-.5*p.dt*cross};
  }
}
