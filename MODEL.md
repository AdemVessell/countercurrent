# The model

Countercurrent couples one vertical rigid coordinate to a linear shallow-water field. It is a small hydroelastic model around a reference equilibrium, not a resolved floating hull. All symbols and dimensions below describe the computation rather than physical calibration.

Let `eta` be surface-height perturbation [m], `u,v` depth-averaged horizontal velocity [m/s], `H` constant depth [m], `rho` density [kg/m³], `z` float heave [m], and `m` its effective mass [kg]. A smooth C2 Wendland footprint `w` [1/m²] is normalized on the actual grid so `sum(w*dA)=1`. It is at least three cells wide. The sensed surface is `etaBar=sum(eta*w*dA)` and relative heave is `q=z-etaBar`.

The new coupling is defined by one potential, `V = k*q²/2`, stiffness `k` [N/m]. Its two derivatives give:

```
float force:     F = -k*q
water pressure:  p = -k*q*w
u_t = -g*grad(eta) - grad(p)/rho
eta_t = -H*div(u)
m*z_tt = F
```

The same normalized footprint senses and acts. A depressed float gives positive pressure, drives water away, and receives an upward reaction. Returning waves change `etaBar` and therefore the actual force. With the coupling disabled, both directions are exactly zero.

## Spatial and temporal contract

Height is cell-centred. X and Z velocities are on east/north MAC faces. Basin boundary fluxes are zero. The divergence and gradient are negative adjoints under cell/face quadrature; they do not absorb/delete the outer ring. This differs from the older ARSENAL 023 diagnostic. No solver source was copied from it.

A kick–drift symplectic Euler step evaluates `q` at the old height and heave, updates both velocities, then drifts both positions with the new velocities. GPU and CPU use the same exponential velocity-damping factors. Interactive operation uses a fixed 1/240 s step, a bounded catch-up budget and a pause when the tab is hidden; it does not turn one animation frame into a fixed number of physical steps.

For a fixed footprint, zero forcing and zero damping, the semi-discrete physical energy is:

```
E = rho*H/2 * sum((u²+v²)*dA)
  + rho*g/2 * sum(eta²*dA)
  + m/2 * z_t² + k/2 * q²
```

The water-pressure, float and coupling-potential powers cancel. Symplectic Euler preserves the modified quadratic energy `Etilde=E-dt*C/2`, where

```
C = sum((rho*g*eta-k*q*w) * (-H*div(u)) * dA) + k*q*z_t
```

The ordinary physical energy oscillates with timestep error; it is not exactly conserved. A conservative frequency bound is `g*H*lambdaMax + k*(1/m + H*beta/rho)`, with `beta=sum(|grad(w)|²*dA)` and the reflecting-grid Laplacian bound. Configuration rejects `dt*omegaBound > 0.5`. The fixed demonstration profile is narrower than the formal stability limit of 2.

## What is external work

The hand applies a bounded vertical force. Horizontal footprint placement is a controlled, bounded carriage rather than solved horizontal hull dynamics. Moving the footprint and changing coupling can change the potential energy; undamped conservation claims exclude those operations. Viscous damping is a declared exponential model. The static weight/draft equilibrium is subtracted. Signed incremental pressure is permitted, so this is a reciprocal heave analogue rather than one-sided contact/wetting.

There is no full displaced volume, added-mass calibration, 3D water, breaking wave, wake guarantee, vertical water momentum budget, capsize, rigid-body contact or nonlinear hydrodynamic claim. Rendered optics are an illustrative real-time approximation. Optical surface slopes use a ×3 gain for legibility; geometry and diagnostic measurements keep scale 1. Refracted tile coordinates and procedural studio-light reflections are optical styling driven by those slopes, not calibrated light transport or additional water motion.

## Checks before the GPU port

- Independent finite-difference virtual work verifies the potential derivatives.
- MAC summation by parts verifies spatial reciprocity and reflecting closure.
- For gravity zero, the coupling frequency follows an independently derived scalar oscillator recurrence.
- A 10,000-step undamped run checks volume and modified energy; a damped run checks actual unreset recovery.
- Sign flips, a missing feedback path, and old-velocity drift must fail.
- First test discovery: a centred symmetric wave made the missing-feedback mutant invisible to the energy check. Moving the footprint off the wave node corrected that fixture; the initial failed result is retained in `evidence/DEVELOPMENT.md`.

The mathematical adviser reviewed the equations independently of the implementation. That review is advisory; the executable reference and GPU comparison provide the numerical evidence.

## Method sources and lineage

- Linearized constant-depth shallow-water equations: standard linearization of the conservation equations described by [Clawpack's shallow-water examples](https://www.clawpack.org/gallery/pyclaw/gallery/sill.html) and LeVeque, *Finite Volume Methods for Hyperbolic Problems*, chapter 13.
- Mimetic/Hamiltonian perspective: [Eldred & Randall, 2016](https://arxiv.org/abs/1609.03797), conservation from compatible discrete operators. No paper code is copied; this implementation is a smaller linear MAC system and does not implement their full scheme.
- Wendland, *Piecewise polynomial, positive definite and compactly supported radial functions of minimal degree*, 1995: C2 compact radial profile `(1-r)^4*(1+4r)` on `r<1`.
- ARSENAL 023 and the one-way Float Test supplied local context, conventions and the missing behavior. Countercurrent's reciprocal potential, reflecting MAC reference, GPU implementation and presentation are new code in this successor. No numerical advantage or scientific novelty is asserted.
