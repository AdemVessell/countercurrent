# Development record

2026-09-06 — User selected the ARSENAL showcase and requested a later GitHub and arkhē.org release. A new Countercurrent scope was created; existing projects were preserved. Primary implementation is by the current Astra task. A separate Sol planner reviewed the proposed equations; a read-only explorer located the hosting and existing licensing policy.

CPU gate, first run: 8/9 test groups passed. The missing-feedback mutant survived the modified-energy check because the initial surface wave was antisymmetric about the centred sensing footprint and averaged to zero. This was a test blind spot, not a successful two-way result. The mutant fixture was moved off-node, retaining the same invariant and tolerance. Separate body-to-water and water-to-body checks remain required.

The corrected CPU gate passed 9/9. The full 96² GPU solver and quick 24² inspector cases matched the CPU reference. A deliberately zeroed GPU feedback uniform failed the coupled cases under the same 5e−5 tolerance; the disconnected case continued to pass.

The first browser view made the field look flat. Direct readback showed a nonzero fp32 field and matching fp16 display texture. Inspection of the generated shader exposed a shared UV expression initialized only in the first display branch. Replacing the display-mode branches with unconditional arithmetic restored the gradients. This defect was found by actual render inspection, not by the numerical checks. Both clearcoat and base surface now use the same field normal. The final optical style declares its ×3 slope gain and approximate procedural light reflection.

The original snapshot read water and then body in separate asynchronous operations, which could straddle animation steps. Capture now copies both into one buffer in one dispatch before awaiting mapping, with the corresponding step/centre/coupling metadata.

Tooling failures were kept separate: the offline npm cache lacked a required package, so normal package installation was used; the initial sandboxed build could not write dist, so the authorized source build ran with filesystem permission.
