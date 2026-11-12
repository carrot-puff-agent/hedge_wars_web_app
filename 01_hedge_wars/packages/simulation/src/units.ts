/**
 * Explicit simulation units, timestep, and converted physics constants.
 *
 * Coordinate and unit system:
 * - Spatial unit: 1 world unit (wu) = 1 cell in the terrain mask (default 2048x1024).
 * - Origin: (0, 0) is top-left of the terrain mask; +X is right, +Y is down.
 * - Water line: Y >= waterLine (default 1024) or outside sea edges is water.
 * - Time unit: fixed authoritative tick at 60 Hz (TICKS_PER_SECOND = 60, dt = 1/60 s).
 *
 * Conversion from upstream Hedgewars (hedgewars/uConsts.pas, uVariables.pas, uGearsList.pas):
 * - Upstream engine ticks at 1000 Hz (1 tick = 1 ms), so 1 tick here = 50/3 ms (~16.6667 ms).
 * - Velocities convert as: v_tick = v_upstream_ms * (1000 / 60).
 * - Accelerations convert as: a_tick = a_upstream_ms2 * (1000 / 60)^2.
 */

export const SIMULATION_RULES_VERSION = 1;

export const UPSTREAM_TICKS_PER_SECOND = 1000;
export const TICKS_PER_SECOND = 60;
export const TICK_DT_SECONDS = 1 / TICKS_PER_SECOND;
export const TICK_DURATION_MS = 1000 / TICKS_PER_SECOND;
export const MS_PER_TICK = UPSTREAM_TICKS_PER_SECOND / TICKS_PER_SECOND; // 50 / 3

/** Convert an upstream velocity (wu/ms) to 60 Hz simulation velocity (wu/tick). */
export function upstreamVelocityToTick(velocityPerMs: number): number {
  return velocityPerMs * MS_PER_TICK;
}

/** Convert an upstream acceleration (wu/ms^2) to 60 Hz simulation acceleration (wu/tick^2). */
export function upstreamAccelToTick(accelPerMs2: number): number {
  return accelPerMs2 * MS_PER_TICK * MS_PER_TICK;
}

/** Convert a per-millisecond damping factor (e.g. 0.999) to a per-tick factor at 60 Hz. */
export function upstreamDampingToTick(dampingPerMs: number): number {
  return Math.pow(dampingPerMs, MS_PER_TICK);
}

// Baseline map dimensions (TECH_SPEC.md: bounded 2048x1024 candidate mask, 1 byte per cell)
export const DEFAULT_MAP_WIDTH = 2048;
export const DEFAULT_MAP_HEIGHT = 1024;
export const DEFAULT_WATER_LINE = 1024;
export const MIN_MAP_DIMENSION = 64;
export const MAX_MAP_WIDTH = 4096;
export const MAX_MAP_HEIGHT = 2048;
export const DIRTY_CHUNK_SIZE = 32;

// Terrain cell byte semantics
export const TERRAIN_EMPTY = 0;
export const TERRAIN_SOLID = 1;
export const TERRAIN_INDESTRUCTIBLE = 2;

// Physics constants converted from uVariables.pas / uConsts.pas
// Upstream cGravity = 0.0005 wu/ms^2 (500 wu/s^2) -> 5/36 wu/tick^2
export const GRAVITY_PER_TICK = upstreamAccelToTick(0.0005);
// Upstream cMaxWindSpeed = 0.00025 wu/ms^2 (250 wu/s^2) -> 5/72 wu/tick^2
export const MAX_WIND_ACCEL_PER_TICK = upstreamAccelToTick(0.00025);
// Upstream cDrownSpeed = 0.06 wu/ms (60 wu/s) -> 1.0 wu/tick
export const DROWN_SPEED_PER_TICK = upstreamVelocityToTick(0.06);
// Upstream _1_9 = 1.9 wu/ms velocity clamp -> 31.6667 wu/tick
export const MAX_SPEED_PER_TICK = upstreamVelocityToTick(1.9);
// Upstream cHHKick = 0.01 wu/ms minimum knockback impulse -> 0.1667 wu/tick
export const MIN_KICK_SPEED_PER_TICK = upstreamVelocityToTick(0.01);
// Settling speed threshold: upstream 0.02 wu/ms -> 0.3333 wu/tick
export const SETTLE_SPEED_THRESHOLD = upstreamVelocityToTick(0.02);

// Weapon launch power (uConsts.pas: cMaxPower = 1500, cPowerDivisor = 1500 -> max 1.0 wu/ms)
export const MAX_POWER = 1500;
export const MAX_LAUNCH_SPEED_PER_TICK = upstreamVelocityToTick(1.0);

// Hedgehog parameters (uConsts.pas, uGearsList.pas, rust/lib-hwengine-future/src/gear.rs)
export const HEDGEHOG_RADIUS = 9;
export const HEDGEHOG_INITIAL_HEALTH = 100;
export const HEDGEHOG_DENSITY = 3.0;
export const HEDGEHOG_ELASTICITY = 0.35;
export const HEDGEHOG_SLIDE_FRICTION_PER_TICK = upstreamDampingToTick(0.999);
export const WALK_STEP_DISTANCE = 1;
export const WALK_STEP_INTERVAL_TICKS = 2; // 1 wu every 2 ticks = 30 wu/s (upstream: 1 wu / 29 ms = 34.5 wu/s)
export const MAX_SLOPE_STEP_UP = 6;
export const MAX_SLOPE_STEP_DOWN = 6;
export const LONG_JUMP_DX = upstreamVelocityToTick(0.15); // 2.5 wu/tick
export const LONG_JUMP_DY = -upstreamVelocityToTick(0.15); // -2.5 wu/tick
export const HIGH_JUMP_DY = -upstreamVelocityToTick(0.20); // -3.3333 wu/tick
export const FALL_DAMAGE_SPEED_THRESHOLD = upstreamVelocityToTick(0.4); // 6.6667 wu/tick

// Rocket (gtShell) parameters
export const ROCKET_RADIUS = 4;
export const ROCKET_BOOM_RADIUS = 50;
export const ROCKET_DENSITY = 1.0;
export const ROCKET_ELASTICITY = 0.8;
export const ROCKET_FRICTION = 0.8;

// Grenade (gtGrenade) parameters
export const GRENADE_RADIUS = 5;
export const GRENADE_BOOM_RADIUS = 50;
export const GRENADE_DENSITY = 1.5;
export const GRENADE_ELASTICITY = 0.8;
export const GRENADE_FRICTION = 0.8;
export const GRENADE_MIN_FUSE_TICKS = 1 * TICKS_PER_SECOND;
export const GRENADE_MAX_FUSE_TICKS = 5 * TICKS_PER_SECOND;
export const GRENADE_DEFAULT_FUSE_TICKS = 3 * TICKS_PER_SECOND;

// Default turn duration (45 seconds at 60 Hz)
export const DEFAULT_TURN_TICKS = 45 * TICKS_PER_SECOND;
