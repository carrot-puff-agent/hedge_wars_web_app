# 2026-11-12 — Phase 1 pure simulation and terrain (`SIM-01`–`SIM-07`)

- Agent/session identifier: `2026-11-12-phase1-simulation`.
- Starting branch/commit and existing changes: `main`, `471b3f7` (1 commit ahead of `origin/main`, clean working tree; pushed `471b3f7` to `origin/main` first).
- Task IDs and acceptance gates: `SIM-01`, `SIM-02`, `SIM-03`, `SIM-04`, `SIM-05`, `SIM-06`, `SIM-07`; gates `SIM-A01`, `SIM-A02`, `SIM-A03`, `SIM-A04`, `SIM-A05`, `SIM-A06`.
- Scope and assumptions: Implement the pure `@yizhaklub/hedge-simulation` workspace package covering Phase 1 in checklist order, recording upstream Hedgewars (`54437aa1a9078f77b0103f1df0aa81f4edc1be05`) provenance and GPL-2.0 license text (`licenses/hedgewars-GPL-2.0.txt`).

## Changes

- Added `@yizhaklub/hedge-simulation` (`01_hedge_wars/packages/simulation/`) and linked it in root `package-lock.json`, `01_hedge_wars/server/package.json`, and `01_hedge_wars/client/package.json`:
  - `src/units.ts` (`SIM-01`): fixed 60 Hz timestep (`TICKS_PER_SECOND = 60`), `1 wu = 1 mask cell` on baseline `2048x1024`, and explicit conversions from upstream Hedgewars 1000 Hz (`1 ms`) per-tick constants.
  - `src/rng.ts` (`SIM-01`): deterministic 32-bit Mulberry32 PRNG (`SeededRng`) and non-mutating cosmetic RNG fork (`forkCosmetic`).
  - `src/state.ts` (`SIM-01`): serializable `WorldState`, RLE terrain mask snapshot encoding (`encodeMaskRle`/`decodeMaskRle`), FNV-1a checksums (`computeMaskChecksum`, `computeWorldChecksum`).
  - `src/terrain.ts` (`SIM-02`, `SIM-03`): initial mask loader (`loadTerrainMask` for raw bytes, RGBA, shapes and indestructible borders), 32×32 dirty chunk tracking (`recordDirtyChunks`, `consumeDirtyChunks`) and Bresenham circular crater carving (`carveCrater`, `PORT-01` from `hedgewars/uLandGraphics.pas`).
  - `src/collision.ts` (`SIM-04`): directional edge collision probes (`testCollisionX`, `testCollisionY`), segment-circle intersections and sub-pixel swept projectile movement (`sweepProjectileStep`, `PORT-02` from `rust/lib-hwengine-future/src/ai_state/collision.rs`, `uCollisions.pas` and `uGearsHandlersMess.pas`).
  - `src/character.ts` (`SIM-05`): grounding, 6px slope climb/descent walking, long/high jumps, wall unsticking, 60 Hz converted fall damage and water drowning (`PORT-03` from `rust/lib-hwengine-future/src/gear.rs`, `uGearsHedgehog.pas`, `uGearsUtils.pas` and `uGearsHandlersMess.pas`).
  - `src/weapons.ts` and `src/world.ts` (`SIM-06`, `SIM-07`): impact rocket (`rocket`) with wind drift, timed bouncing grenade (`grenade`), radial explosion damage and knockback (`triggerExplosion`), fixed-step world runner (`stepWorld`) and settling/victory transitions (`PORT-04`).
- Added 8 comprehensive simulation test suites in `tests/simulation.test.ts` covering `SIM-01`–`SIM-07` and gates `SIM-A01`–`SIM-A06`.
- Recorded GPL-2.0 license text at `licenses/hedgewars-GPL-2.0.txt` and code ports `PORT-01`–`PORT-04` in `01_hedge_wars/docs/REUSE_PLAN.md`.

## Verification

| Command / manual scenario | Observed result | Limits / evidence |
| --- | --- | --- |
| `npm run check` | PASS | Strict typecheck, 10 Node tests (`tests/protocol.test.ts`, `tests/server.test.ts`, `tests/simulation.test.ts`), doc checker (13 files, 20 relative links, 46 tasks) and production builds. |
| `LD_LIBRARY_PATH=/home/dev/.cache/hedge-playwright-deps/root/usr/lib/x86_64-linux-gnu npm run test:e2e` | PASS | All 10 desktop and Android-emulation browser tests passed in 9.7s. |
| `npm run test:dev` | NOT RUN | No dev launcher or proxy changes in this session. |
| `git diff --check` | PASS | No whitespace or formatting errors. |

## Handoff

- Completed tasks (with evidence): `SIM-01`, `SIM-02`, `SIM-03`, `SIM-04`, `SIM-05`, `SIM-06`, `SIM-07` (gates `SIM-A01`–`SIM-A06` verified in `tests/simulation.test.ts`).
- Open/blocked tasks and exact errors (redacted): Phase 2 (`NET-01`–`NET-08`), Phase 3 (`UI-01`–`UI-06`), Phase 4 (`GAME-01`–`GAME-04`) and remaining Phase 5 items remain open.
- Next unblocked task and commands: `NET-01` (extend/version `@yizhaklub/hedge-protocol` contracts for sessions, rooms, inputs, snapshots, events and terrain revisions) or `UI-01` (match/terrain renderer). Run `npm run check` from `/home/dev/games-web-app`.
- Services/processes left running (name/port/PID, or none): Existing `yizhaklub.service` on port 9999 was not modified; all test processes exited cleanly.
- Git commit/push state: Committed `SIM-01`–`SIM-07` on `main` and pushed to `origin/main`.
