# Assets and provenance

External visual/audio assets: NONE.

All basin and float geometry, materials, tile patterns, field motion and studio-light reflection accents are procedural. System fonts are used. There is no audio. No downloaded mesh, HDRI, photograph, generated bitmap, baked simulation, telemetry or account service enters the runtime.

| Dependency | Locked version | Purpose | License |
|---|---|---|---|
| Three.js | 0.185.1 | WebGPU, TSL, rendering, RoundedBoxGeometry and procedural RoomEnvironment | MIT |
| Vite | 8.1.4 | Development server and production bundling | MIT |

Packages and development transitive dependencies are obtained by the explicit `npm ci` installation step. `package-lock.json` records exact versions and integrity metadata. The Three.js MIT notice is included in the production output under `THIRD_PARTY_LICENSES/`.

New implementation: the files in `src/`, CPU tests, model, interface and presentation were authored for Countercurrent in this Astra task. ARSENAL 023 and the earlier one-way Float Test supplied context and the behavior to extend; no solver code or showcase source was copied from either. The ARSENAL TSL cookbook supplied engineering conventions and implementation cautions. The mathematical method references are linked in MODEL.md; no paper text, figures or source code are included.

`docs/assets/` contains the released browser captures of this app. Additional raw captures are retained in the local workshop's `output/playwright/`, excluded from the public package. These are output documentation, not input assets; they do not establish physical truth or universal device support.
