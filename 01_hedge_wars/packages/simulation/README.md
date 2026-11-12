# `@yizhaklub/hedge-simulation` — Pure Simulation Package

Pure, deterministic, serializable simulation package for **Їжачі баталії** (Hedge Wars).
Contains zero DOM, Phaser, WebSocket, or wall-clock (`Date.now()` / `Math.random()`) dependencies.

## Modules (`SIM-01`–`SIM-07`)

- `src/units.ts` — Explicit spatial/time units (`1 wu = 1 terrain cell`, `60 Hz` fixed step) and conversion functions from upstream Hedgewars (`1000 Hz` / `1 ms` ticks).
- `src/rng.ts` — Deterministic 32-bit Mulberry32 PRNG (`SeededRng`) with non-mutating cosmetic RNG fork (`forkCosmetic`).
- `src/state.ts` — Serializable `WorldState`, RLE terrain mask snapshot encoding (`encodeMaskRle` / `decodeMaskRle`), FNV-1a checksums (`computeMaskChecksum`, `computeWorldChecksum`).
- `src/terrain.ts` — Initial mask loader (`loadTerrainMask` for raw bytes, RGBA, declarative shapes and indestructible borders), 32×32 dirty chunk revision tracking (`recordDirtyChunks`, `consumeDirtyChunks`) and Bresenham circular crater carving (`carveCrater`, `PORT-01`).
- `src/collision.ts` — Directional edge collision probes (`testCollisionX`, `testCollisionY`), circle/segment intersections and sub-pixel swept projectile movement (`sweepProjectileStep`, `PORT-02`).
- `src/character.ts` — Grounding, 6px slope climb/descent walking, long/high jumps, wall unsticking, 60 Hz converted fall damage and water drowning (`PORT-03`).
- `src/weapons.ts` — Impact rocket (`rocket`) with wind drift, timed bouncing grenade (`grenade`), radial explosion damage and knockback (`triggerExplosion`, `PORT-04`).
- `src/world.ts` — Fixed-step world runner (`stepWorld`), command application (`applySimulationCommand`) and settling/elimination checks (`isWorldSettled`).

## Measured `2048x1024` Performance Budget (`SIM-01`, `SIM-07`)

- Full `createWorldState` + RLE `serializeWorldState` + `deserializeWorldState` + FNV-1a checksum validation (12 characters across 4 teams on `2048x1024` terrain): `~14–22 ms` total.
- Active 60 Hz simulation step (`stepWorld` across 200 ticks with 12 characters, bouncing grenade, explosion crater and settling on `2048x1024` terrain): `~0.08 ms/tick` average (`< 0.5%` of the `16.67 ms` 60 Hz server tick budget).
