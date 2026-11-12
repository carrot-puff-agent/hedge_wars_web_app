# Hedgewars reuse plan and provenance

Reference only: `/home/coder/_PROJECTS/06_warlings_remake/research/hw_android`, inspected commit `8fbcfe050e2eacdd947c4ba9262f93e57b4113cd`, upstream <https://github.com/Tokasur/hw_android>. This checkout is outside the new repository and must not be required to build the foundation. If unavailable, obtain a pinned reference clone under ignored `.local/references/`; do not vendor the entire project.

Prior assessments, local context only:

- `/home/coder/_PROJECTS/06_warlings_remake/HW_ANDROID_ASSESSMENT.md`
- `/home/coder/_PROJECTS/06_warlings_remake/PWA_ARCHITECTURE_ASSESSMENT.md`

## Candidates

| Upstream path | Candidate | Port strategy |
| --- | --- | --- |
| `share/hedgewars/Data/` | selected art, sound, static map/theme | import only the required subset and licenses; define animation metadata |
| `hedgewars/uConsts.pas`, `uVariables.pas` | parameters and defaults | document units/timestep, convert into typed data |
| `hedgewars/uLandGraphics.pas` | mask crater/tunnel edits | port pure mask behavior; separate visual border/texture work |
| `hedgewars/uCollisions.pas` | terrain/object queries | extract minimal cohesive collision subsystem, test boundaries |
| `hedgewars/uGearsHandlersMess.pas` | falling, bomb, fuse and cluster behaviors | start with rocket/grenade, record dependencies and fixtures |
| `hedgewars/uGearsUtils.pas` | radial damage and knockback | separate simulation decisions from particles/audio |
| `hedgewars/uCommandHandlers.pas` | turn semantics | adapt into explicit server state machine |
| `rust/land2d`, `landgen`, `integral-geometry` | isolated terrain/geometry helpers | investigate only if TypeScript profiling justifies another runtime boundary |

Existing Hedgewars server relays commands and manages rooms; it is not the new authoritative physics service. Existing browser build flags and empty `project_files/web/pre.js` / `post.js` do not establish a working browser port. No reuse of the native engine is assumed.

## Import procedure

1. Choose one behavior with a checklist ID and inspect its callers/types/state dependencies.
2. Record upstream URL, commit, paths, license, authors/notices, intended changes, units and target module.
3. Confirm repository/component licensing before copying/translating code. Hedgewars code is identified as GPL v2 and image/sound data as GFDL 1.2; component notices may differ. Translation does not remove obligations.
4. Extract or capture expected examples where feasible: trajectory, crater mask, damage radius and fuse/bounce outcomes.
5. Port into an independent module, verify those examples, record intentional differences and update ASSET_REGISTER if assets are involved.

No upstream code/assets have been imported at foundation creation. Original hub/preview artwork is authored here. Warlings proprietary material is excluded.

## Code port register

| ID | Upstream commit/path/license | Destination | Changes/units | Verification |
| --- | --- | --- | --- | --- |
| — | No code imports yet | — | — | — |

License decision pending before first import. Expected direction is GPL-v2-compatible application code with separately tracked asset licenses; do not silently apply a permissive license to a port.

Reference: [GNU FAQ on translated code](https://www.gnu.org/licenses/gpl-faq.en.html#TranslateCode).

