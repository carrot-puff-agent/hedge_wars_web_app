# `@yizhaklub/hedge-simulation` — Pure Simulation Package

Pure, deterministic, serializable simulation package for **Їжачі баталії** (Hedge Wars).
Contains zero DOM, Phaser, WebSocket, or wall-clock (`Date.now()` / `Math.random()`) dependencies.

## Units and Fixed-Step Decision (`SIM-01`)

- **Spatial unit**: `1 world unit (wu) = 1 terrain mask cell` on the baseline `2048x1024` grid (`2,097,152` bytes, 1 byte per cell: `0` = empty, `1` = solid destructible, `2` = solid indestructible).
- **Coordinate system**: `(0, 0)` is the top-left corner of the map; `+X` points right, `+Y` points down; default `waterLine = 1024`.
- **Fixed timestep**: `TICKS_PER_SECOND = 60` (`dt = 16.6667 ms`, `SIMULATION_RULES_VERSION = 1`).
- **Conversion from upstream Hedgewars (`1000 Hz` / `1 ms` ticks)**:
  - `MS_PER_TICK = 1000 / 60 = 50 / 3`
  - Velocity (`wu/tick`): `v_tick = v_upstream_ms * (1000 / 60)`
  - Acceleration (`wu/tick²`): `a_tick = a_upstream_ms2 * (1000 / 60)^2`
  - Key converted values:
    - Gravity (`cGravity = 0.0005 wu/ms²`): `5 / 36 ≈ 0.138889 wu/tick²` (`500 wu/s²`)
    - Max wind acceleration (`cMaxWindSpeed = 0.00025 wu/ms²`): `5 / 72 ≈ 0.069444 wu/tick²` (`250 wu/s²`)
    - Drowning sink speed (`cDrownSpeed = 0.06 wu/ms`): `1.0 wu/tick` (`60 wu/s`)
    - Max launch speed (`1.0 wu/ms`): `50 / 3 ≈ 16.6667 wu/tick` (`1000 wu/s`)
    - Hedgehog radius: `9 wu`; rocket radius: `4 wu` (`boom = 50 wu`); grenade radius: `5 wu` (`boom = 50 wu`, default fuse `180` ticks = `3 s`).
- **Measured `2048x1024` baseline budget (Node 20.19.2 on LXC)**:
  - Full `createWorldState` + RLE `serializeWorldState` + `deserializeWorldState` + FNV-1a checksum validation (12 characters across 4 teams on `2048x1024` terrain): `~14.2 ms` total (well within snapshot/join budget; per-tick simulation step measured in `SIM-07`).
