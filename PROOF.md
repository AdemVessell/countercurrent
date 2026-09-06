# Evidence for Countercurrent 0.1.0

This packet supports a working numerical interaction and an exercised browser build. It does not establish calibrated hydrodynamics, scientific novelty, comparative model superiority or artistic acceptance.

## Numerical evidence

`npm test` passes 9/9 groups. The checks include MAC summation by parts, a finite-difference potential derivative, an independently derived zero-gravity oscillator recurrence, stationary and disconnected controls, separate directions of causation, a 10,000-step undamped run, four must-fail implementation mutants and unreset damped recovery. Physical energy is allowed to oscillate with timestep error; the conserved quantity in the named undamped fixed-footprint run is the modified quadratic energy.

`evidence/BUILD_CHECK.txt` contains the production check output. `evidence/GPU_COMPARISON.json` contains the measured full-grid and missing-feedback results. The full 96² GPU solver agrees with the float64 CPU reference on all three 240-step cases, at a preselected absolute component tolerance of 5e−5. Its largest observed height/velocity/body component error is approximately 6.81e−8. A deliberate missing-feedback GPU mutation at 24² is rejected by the same three-case/tolerance protocol, with the disconnected case still passing. The mutation result is retained as an expected failure, not concealed.

The shipped inspector independently reruns three 24² cases on the viewer's device. It was exercised through the actual production UI. These are numerical correspondence checks at the recorded configurations, not convergence, precision across every device, or comparison to measured physical water.

## Browser evidence

The 1440×1000 production build was exercised in desktop Chrome with WebGPU. A trusted pointer drag moved the guide to approximately (1.10, 0.70) m, released the hand, and produced finite waves. Pause held the step count at 512; resume advanced it to 596. The same press path produced zero water height with coupling off and approximately 11.84 mm maximum height with coupling on. After 7,200 additional fixed steps without resetting, energy fell from approximately 1.997 J to 0.000279 J and the state stayed finite.

The production entry loaded one bundled JavaScript file and one stylesheet, both from localhost. The static runtime audit found no first-party external asset or network API. An offline-after-load press advanced the simulation and stayed finite. The unsupported route kept simulation controls disabled and model notes accessible. A 390×844 layout retained its controls, and reduced-motion preference left an untouched basin exactly at rest. The local five-second desktop sample rendered 600 frames at pixel ratio 1, with zero dropped wall time; this is one observed configuration, not a cross-device guarantee.

`evidence/BROWSER_CHECKS.json` preserves those measurements and explicitly binds the initial interaction bundle and final UI-only correction. The final bundle `index-BTNvFsGR.js` was rerun in a fresh browser: GPU quick comparison passed, disconnected water stayed at zero, coupled water responded, and console messages/warnings/errors were all zero. The final uncut recording also uses this bundle. An earlier automation session closed unexpectedly during packaging; no recent browser crash report was found, and its uncompleted check was not counted.

`docs/assets/countercurrent-uncut.mp4` is the earlier complete 109.6-second browser validation recording, transcoded from the locally retained WebM. Its original 38-second excerpt had about 13 seconds of idle opening, identified by Stevenson during review; a valid codec and sampled frames had not established good playback pacing.

The replacement `docs/assets/countercurrent-demo-v2.mp4` is an 18-second contiguous excerpt (7–25 s) from a fresh 35.56-second browser capture. It shows visible water motion immediately, guided dragging, release and reset through the actual controls. The complete new WebM remains local at `output/playwright/countercurrent-retake.webm`; `evidence/MEDIA_CHECK.json` binds its hash, the excerpt, browser frame counters and decoded-frame checks. No speed change, generated image, baked simulation or composited output replaces the live field. Media quality does not establish physical validity or visual acceptance.

Surface heights and heave come from GPU state. Optical slope gain is ×3, while geometry and measurements retain scale 1. Height debug colors saturate at ±5 mm. Their role is visibility, not calibrated color measurement. A procedural reflected light and illustrative tile refraction accent actual gradients; neither writes the solver.

## Reproduce

```sh
npm ci
npm run check
npm run preview
```

Open the preview in a WebGPU browser and run **How it works → Check GPU against the reference**. Reset and compare coupled/disconnected presses. Use `?forceFallback=1` to exercise the unsupported screen. Runtime installation and serving requirements are in README.md.

The explicit `window.__countercurrent` developer hook exposes snapshots, exact stepping and the same input path for reproducible browser diagnostics. It is local instrumentation, not an external API or a remote control service.

## Limits and preserved failures

The first CPU mutant fixture failed to detect a missing feedback path because its sensing footprint sat on a symmetric wave node. The fixture was corrected without relaxing the invariant. The first surface shader rendered a flat-looking field because a shared UV expression was generated inside one display branch; the display graph was changed to unconditional arithmetic and visually rechecked. Both failures are recorded in `evidence/DEVELOPMENT.md`.

The production JavaScript is approximately 882 kB raw / 245 kB gzip, largely the Three.js rendering runtime. Vite reports its normal 500 kB chunk warning. Device coverage is one local desktop Chrome run plus responsive layout and fallback checks; no physical phone or cross-browser performance claim is made. During overload, bounded wall time is deliberately dropped and the simulation slows relative to wall time. Numerical timesteps do not grow.

User visual acceptance controls the final release decision. Model review is advisory; it is not a substitute for executable evidence or human taste.
