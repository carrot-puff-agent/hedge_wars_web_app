# Hedgewars reuse plan and provenance

Official upstream reference on the LXC: `/home/dev/hedgewars-upstream`, cloned from <https://github.com/hedgewars/hw.git>, the official Git mirror of <https://hg.hedgewars.org/hedgewars/>. The full Git clone was inspected at commit `54437aa1a9078f77b0103f1df0aa81f4edc1be05` on 2026-11-12. It is a separate sibling of the app repository, not a build dependency or part of the app's Git history; check its revision before recording an import. To recreate it on the LXC, run `git clone https://github.com/hedgewars/hw.git /home/dev/hedgewars-upstream`. Do not vendor the entire upstream project.

An older Android-fork reference on the original VM is `/home/coder/_PROJECTS/06_warlings_remake/research/hw_android`, inspected at commit `8fbcfe050e2eacdd947c4ba9262f93e57b4113cd`, from <https://github.com/Tokasur/hw_android>. It is a separate, read-only project and is not required to build this app.

Prior assessments, local context only:

- `/home/coder/_PROJECTS/06_warlings_remake/HW_ANDROID_ASSESSMENT.md`
- `/home/coder/_PROJECTS/06_warlings_remake/PWA_ARCHITECTURE_ASSESSMENT.md`

The official checkout includes character/weapon graphics under `share/hedgewars/Data/Graphics/`, static maps under `Data/Maps/`, themes under `Data/Themes/`, sounds and voices under `Data/Sounds/`, and music under `Data/Music/`. Many map and theme folders include `credits.txt`. Review the actual files and their notices before selecting assets for import.

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

Existing Hedgewars server relays commands and manages rooms; it is not the new authoritative physics service. Upstream `CMakeLists.txt` exposes `BUILD_ENGINE_LIBRARY` and `BUILD_ENGINE_JS`; the latter uses a Pascal-to-C/Emscripten route, but `project_files/web/pre.js` and `post.js` are empty. No upstream engine build was attempted in this review, and these flags do not establish a working browser port or an authoritative server integration. The accepted design assumes selective TypeScript ports. If maximizing engine reuse warrants a bounded feasibility spike, compare integration and maintenance costs, browser/touch support, and server authority before changing that design; record any architecture change in a new ADR.

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
| PORT-01 | `54437aa1a9078f77b0103f1df0aa81f4edc1be05` · `hedgewars/uLandGraphics.pas` (`FillRoundInLand`, `FillCircleLines`, lines 319–375) · GPL-2.0 (`licenses/hedgewars-GPL-2.0.txt`) | `01_hedge_wars/packages/simulation/src/terrain.ts` (`carveCrater`, `applyBresenhamCircleToBuffer`) | Adapted Bresenham circle scanlines to 1-byte terrain mask (`0` empty, `1` solid, `2` indestructible), preserving `TERRAIN_INDESTRUCTIBLE` and tracking 32×32 dirty chunks + FNV-1a checksum | `tests/simulation.test.ts` (`SIM-03` r=3 row-width fixture `[3,5,7,7,7,5,3]=37`, indestructible strip preservation, edge/off-map boundaries) |
| PORT-02 | `54437aa1a9078f77b0103f1df0aa81f4edc1be05` · `rust/lib-hwengine-future/src/ai_state/collision.rs` (`test_collision_x`, `test_collision_y`, lines 4–55), `hedgewars/uCollisions.pas` (`LineCollisionTest`, lines 219–251), `hedgewars/uGearsHandlersMess.pas` (`doStepPerPixel`, lines 157–204) · GPL-2.0 | `01_hedge_wars/packages/simulation/src/collision.ts` | Ported directional bounding-edge collision probes, analytic segment-circle intersection and sub-pixel swept stepping (`maxSubstepDistance = 0.5 wu`) for 60 Hz projectiles | `tests/simulation.test.ts` (`SIM-04` 1px horizontal ledge, 1px vertical wall, fast 30 wu/tick swept projectile and character hit tests) |
| PORT-03 | `54437aa1a9078f77b0103f1df0aa81f4edc1be05` · `rust/lib-hwengine-future/src/gear.rs` (`TGear::step`, `start_high_jump`, `start_long_jump`, lines 175–305), `hedgewars/uGearsHedgehog.pas` (`moveHedgehogOutOfWall`, `doStepHedgehogMoving`, lines 957–1200), `hedgewars/uGearsUtils.pas` (`CheckHHDamage`, lines 454–484), `hedgewars/uGearsHandlersMess.pas` (`doStepDrowningGear`, lines 291–371) · GPL-2.0 | `01_hedge_wars/packages/simulation/src/character.ts` | Ported 6px slope climb/descent walking, long/high jumps, wall unsticking, 60 Hz converted fall damage (`vy > 6.67 wu/tick`) and water drowning (`1.0 wu/tick`) | `tests/simulation.test.ts` (`SIM-05` slope walk, cliff fall damage, long jump, crater support removal and drowning tests) |

License decision confirmed: GPL-2.0-compatible application code (`licenses/hedgewars-GPL-2.0.txt`) with separately tracked asset licenses in `ASSET_REGISTER.md`.

Reference: [GNU FAQ on translated code](https://www.gnu.org/licenses/gpl-faq.en.html#TranslateCode).

