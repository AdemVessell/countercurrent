# Countercurrent field interface

This is a scene-local experimental composition interface, not a promoted ARSENAL primitive.

`CoupledWater(renderer, options)` owns a reflecting square linear shallow-water field and one reciprocal heave coordinate. Default extent is 6 m, depth 0.28 m, grid 96², fixed dt 1/240 s. X/Z are horizontal and Y is up.

| Resource | Format / meaning | Update and ownership |
|---|---|---|
| `state` | RGBA32F storage texture: height [m], east-face speed [m/s], north-face speed [m/s], reserved | Owned and written by solver each step; do not sample with linear filtering |
| `display` | RGBA16F linear texture, same components | Solver publishes after stepping; presentation reads only |
| `body[0]` | Storage vec4: heave [m], vertical speed [m/s], old relative heave [m], old sensed water [m] | Solver writes; float geometry reads first component directly |
| `body[1]` | Storage vec4: footprint normalization [m²], coupling force [N], hand force [N], reserved | Solver writes |
| `u.center` | X/Z carriage position [m] | Bounded external guide; changes the normalized footprint |
| `u.held`, `u.handTarget` | Hand active flag, target heave [m] | Interaction writes; force capped at ±220 N |
| `u.coupling` | 0 or 1 | Gates both reciprocal derivatives |

Cell centres lie at `(i+.5)*dx−L/2`. Stored east/north speeds at outer faces are exactly zero. The normalized C2 footprint stays at least one cell inside the basin. The radius resolves at least three cells. Configuration rejects a conservative `dt*omegaBound>0.5`.

`reset`, `setCenter`, `setCoupling`, `step` and `publish` form the main path. `snapshot()` captures water and body in one GPU dispatch before awaiting readback, with the matching centre, coupling flag and step count. `readBody()` is a small live UI probe. `dispose()` releases compute nodes and textures.

Presentation uses `display` for actual height and gradients, then supplies an illustrative ×3 optical-slope gain. It cannot write the simulation. Horizontal float placement follows the guide; vertical placement comes from the storage buffer. The debug `feedback` uniform exists for the must-fail missing-feedback experiment and is not exposed as a product control.
