/**
 * Character grounding, slope walking, jumping, falling, fall damage and drowning (SIM-05).
 *
 * Provenance:
 * - Slope walking and jump initiation (`stepCharacterWalk`, `startCharacterJump`):
 *   ported from `rust/lib-hwengine-future/src/gear.rs` (`TGear::step`, `start_high_jump`,
 *   `start_long_jump`, `stop_jump`, lines 175-305) at commit `54437aa1a9078f77b0103f1df0aa81f4edc1be05` (GPL-2.0).
 * - Unsticking, sliding and fall-damage calculation (`moveCharacterOutOfWall`, `stepCharacterPhysics`):
 *   ported from `hedgewars/uGearsHedgehog.pas` (`moveHedgehogOutOfWall`, `doStepHedgehogMoving`,
 *   lines 957-1200), `hedgewars/uGearsUtils.pas` (`CheckHHDamage`, lines 454-484), and
 *   `hedgewars/uGearsHandlersMess.pas` (`doStepDrowningGear`, lines 291-371).
 */

import { testCollisionX, testCollisionY } from './collision';
import type { CharacterState, SimulationEvent, TerrainState } from './state';
import { isCoordInWater } from './terrain';
import {
  DROWN_SPEED_PER_TICK,
  FALL_DAMAGE_SPEED_THRESHOLD,
  GRAVITY_PER_TICK,
  HEDGEHOG_ELASTICITY,
  HEDGEHOG_SLIDE_FRICTION_PER_TICK,
  HIGH_JUMP_DY,
  LONG_JUMP_DX,
  LONG_JUMP_DY,
  MAX_SLOPE_STEP_DOWN,
  MAX_SLOPE_STEP_UP,
  MAX_SPEED_PER_TICK,
  MS_PER_TICK,
  SETTLE_SPEED_THRESHOLD,
  TERRAIN_EMPTY,
  WALK_STEP_DISTANCE,
  WALK_STEP_INTERVAL_TICKS,
} from './units';

const HIGH_JUMP_DX = 0.15;

export function isCharacterGrounded(terrain: TerrainState, ch: CharacterState): boolean {
  if (!ch.alive || ch.drowning) return false;
  if (ch.vy < 0) return false;
  return testCollisionY(terrain, ch.x, ch.y, ch.radius, 1) !== TERRAIN_EMPTY;
}

/**
 * Nudges a character horizontally if one side is embedded in a wall while the opposite side is free,
 * ported from `moveHedgehogOutOfWall` in `hedgewars/uGearsHedgehog.pas` (lines 957-1003).
 */
export function moveCharacterOutOfWall(terrain: TerrainState, ch: CharacterState): void {
  for (let i = 0; i < ch.radius; i++) {
    if (testCollisionY(terrain, ch.x, ch.y, ch.radius, 1) === TERRAIN_EMPTY) {
      break;
    }
    const collLeft = testCollisionX(terrain, ch.x + 1, ch.y, ch.radius, -1) !== TERRAIN_EMPTY;
    const collRight = testCollisionX(terrain, ch.x - 1, ch.y, ch.radius, 1) !== TERRAIN_EMPTY;
    if (collLeft === collRight) {
      break;
    }
    if (collLeft) {
      if (testCollisionX(terrain, ch.x, ch.y, ch.radius, 1) !== TERRAIN_EMPTY) break;
      ch.x += 1;
    } else {
      if (testCollisionX(terrain, ch.x, ch.y, ch.radius, -1) !== TERRAIN_EMPTY) break;
      ch.x -= 1;
    }
  }
}

/**
 * Settles a character downward onto the nearest supporting ground up to `maxDrop` world units,
 * or marks the character as airborne if no ground is within reach.
 */
export function refreshCharacterGrounding(
  terrain: TerrainState,
  ch: CharacterState,
  maxSnapDown = 0,
): boolean {
  if (!ch.alive || ch.drowning) {
    ch.grounded = false;
    return false;
  }
  if (testCollisionY(terrain, ch.x, ch.y, ch.radius, 1) !== TERRAIN_EMPTY) {
    ch.grounded = ch.vy >= 0;
    return ch.grounded;
  }
  const revertY = ch.y;
  for (let i = 0; i < maxSnapDown; i++) {
    ch.y += 1;
    if (testCollisionY(terrain, ch.x, ch.y, ch.radius, 1) !== TERRAIN_EMPTY) {
      ch.grounded = true;
      return true;
    }
  }
  ch.y = revertY;
  ch.grounded = false;
  return false;
}

/**
 * Attempts a 1-world-unit horizontal walking step with up to 6-unit slope climb or descent,
 * ported from `TGear::step` in `rust/lib-hwengine-future/src/gear.rs` (lines 175-223).
 */
export function stepCharacterWalk(
  terrain: TerrainState,
  ch: CharacterState,
  tick: number,
  events: SimulationEvent[],
): boolean {
  if (!ch.alive || ch.drowning || !ch.grounded || ch.jumping !== 'none') {
    return false;
  }
  if (Math.abs(ch.vx) >= SETTLE_SPEED_THRESHOLD || Math.abs(ch.vy) >= SETTLE_SPEED_THRESHOLD) {
    return false;
  }
  if (ch.moveInput === 0) {
    ch.stepCooldownTicks = 0;
    return false;
  }

  const dir = ch.moveInput;
  ch.facing = dir;

  if (ch.stepCooldownTicks > 0) {
    ch.stepCooldownTicks -= 1;
    return false;
  }
  ch.stepCooldownTicks = WALK_STEP_INTERVAL_TICKS - 1;

  const revertY = ch.y;
  let gapFound = false;
  let hitCeiling = false;

  for (let stepUp = 0; stepUp < MAX_SLOPE_STEP_UP; stepUp++) {
    if (testCollisionX(terrain, ch.x, ch.y, ch.radius, dir) !== TERRAIN_EMPTY) {
      if (testCollisionY(terrain, ch.x, ch.y, ch.radius, -1) === TERRAIN_EMPTY) {
        ch.y -= 1;
      } else {
        hitCeiling = true;
        break;
      }
    } else {
      gapFound = true;
      break;
    }
  }

  if (!hitCeiling) {
    gapFound = testCollisionX(terrain, ch.x, ch.y, ch.radius, dir) === TERRAIN_EMPTY;
  }

  if (!gapFound) {
    ch.y = revertY;
    return false;
  }

  ch.x += dir * WALK_STEP_DISTANCE;

  let hitFloor = false;
  const postStepY = ch.y;
  for (let stepDown = 0; stepDown < MAX_SLOPE_STEP_DOWN; stepDown++) {
    if (testCollisionY(terrain, ch.x, ch.y, ch.radius, 1) === TERRAIN_EMPTY) {
      ch.y += 1;
    } else {
      hitFloor = true;
      break;
    }
  }

  if (!hitFloor) {
    // Stepped off a ledge steeper than MAX_SLOPE_STEP_DOWN -> transition to falling
    ch.y = postStepY;
    ch.vy = 0;
    ch.grounded = false;
  } else {
    ch.grounded = true;
  }

  events.push({ type: 'character.moved', tick, characterId: ch.id, x: ch.x, y: ch.y });
  return true;
}

/**
 * Initiates a long jump or high jump for a grounded character,
 * ported from `start_long_jump` and `start_high_jump` in `rust/lib-hwengine-future/src/gear.rs` (lines 230-268).
 */
export function startCharacterJump(
  terrain: TerrainState,
  ch: CharacterState,
  kind: 'long' | 'high',
  tick: number,
  events: SimulationEvent[],
): boolean {
  if (!ch.alive || ch.drowning || !ch.grounded || ch.jumping !== 'none') {
    return false;
  }
  if (Math.abs(ch.vx) >= SETTLE_SPEED_THRESHOLD || Math.abs(ch.vy) >= SETTLE_SPEED_THRESHOLD) {
    return false;
  }

  if (kind === 'high') {
    if (testCollisionY(terrain, ch.x, ch.y, ch.radius, -1) !== TERRAIN_EMPTY) {
      return false;
    }
    ch.vx = ch.facing * HIGH_JUMP_DX;
    ch.vy = HIGH_JUMP_DY;
    ch.grounded = false;
    ch.jumping = 'high';
    events.push({ type: 'character.jumped', tick, characterId: ch.id, kind: 'high' });
    return true;
  }

  // Long jump
  const dir = ch.facing;
  const revertY = ch.y;
  if (testCollisionY(terrain, ch.x, ch.y, ch.radius, -1) === TERRAIN_EMPTY) {
    if (testCollisionX(terrain, ch.x, ch.y - 2, ch.radius, dir) === TERRAIN_EMPTY &&
        testCollisionX(terrain, ch.x, ch.y, ch.radius, dir) !== TERRAIN_EMPTY) {
      ch.y -= 2;
    } else if (testCollisionX(terrain, ch.x, ch.y - 1, ch.radius, dir) === TERRAIN_EMPTY &&
               testCollisionX(terrain, ch.x, ch.y, ch.radius, dir) !== TERRAIN_EMPTY) {
      ch.y -= 1;
    }
  }

  if (
    testCollisionX(terrain, ch.x, ch.y, ch.radius, dir) === TERRAIN_EMPTY &&
    testCollisionY(terrain, ch.x, ch.y, ch.radius, -1) === TERRAIN_EMPTY
  ) {
    ch.vx = dir * LONG_JUMP_DX;
    ch.vy = LONG_JUMP_DY;
    ch.grounded = false;
    ch.jumping = 'long';
    events.push({ type: 'character.jumped', tick, characterId: ch.id, kind: 'long' });
    return true;
  }

  ch.y = revertY;
  return false;
}

/**
 * Computes fall damage from vertical impact speed (wu/tick),
 * ported from `CheckHHDamage` in `hedgewars/uGearsUtils.pas` (lines 454-484).
 */
export function computeFallDamage(impactVyPerTick: number): number {
  if (impactVyPerTick <= FALL_DAMAGE_SPEED_THRESHOLD) {
    return 0;
  }
  const upstreamVyPerMs = impactVyPerTick / MS_PER_TICK;
  const dmg = 1 + Math.round((upstreamVyPerMs - 0.4) * 70);
  return Math.max(1, dmg);
}

/**
 * Advances a single character by one 60 Hz tick:
 * - checks support removal under grounded characters
 * - walks if grounded and commanded
 * - applies gravity, substepped motion, slope sliding, landing/fall damage and drowning
 */
export function stepCharacterPhysics(
  terrain: TerrainState,
  ch: CharacterState,
  tick: number,
  events: SimulationEvent[],
  isActiveTurnCharacter = false,
): void {
  if (!ch.alive) return;

  // Handle active drowning sink
  if (ch.drowning) {
    ch.y += DROWN_SPEED_PER_TICK;
    if (ch.y - ch.radius > terrain.waterLine) {
      ch.alive = false;
      ch.health = 0;
      ch.drowning = false;
      ch.vx = 0;
      ch.vy = 0;
      events.push({ type: 'character.eliminated', tick, characterId: ch.id, cause: 'water' });
    }
    return;
  }

  // Check if already touching water
  if (isCoordInWater(terrain, ch.x, ch.y + ch.radius)) {
    ch.drowning = true;
    ch.grounded = false;
    ch.jumping = 'none';
    ch.vx = 0;
    ch.vy = DROWN_SPEED_PER_TICK;
    events.push({ type: 'character.drowned', tick, characterId: ch.id });
    return;
  }

  // Detect support removal beneath a previously grounded character
  const hasFloorSupport = testCollisionY(terrain, ch.x, ch.y, ch.radius, 1) !== TERRAIN_EMPTY;
  if (!hasFloorSupport && ch.vy >= 0) {
    ch.grounded = false;
  } else if (hasFloorSupport && ch.vy >= 0 && Math.abs(ch.vx) < SETTLE_SPEED_THRESHOLD && ch.jumping === 'none') {
    ch.grounded = true;
    ch.vy = 0;
  }

  // Active character walking when settled on ground
  if (isActiveTurnCharacter && ch.grounded && ch.jumping === 'none' && Math.abs(ch.vx) < SETTLE_SPEED_THRESHOLD) {
    stepCharacterWalk(terrain, ch, tick, events);
    if (isCoordInWater(terrain, ch.x, ch.y + ch.radius)) {
      ch.drowning = true;
      ch.grounded = false;
      ch.vx = 0;
      ch.vy = DROWN_SPEED_PER_TICK;
      events.push({ type: 'character.drowned', tick, characterId: ch.id });
      return;
    }
    if (ch.grounded) {
      return;
    }
  }

  // If completely settled on solid ground with no velocity, nothing more to integrate
  if (ch.grounded && Math.abs(ch.vx) < SETTLE_SPEED_THRESHOLD && Math.abs(ch.vy) < SETTLE_SPEED_THRESHOLD) {
    ch.vx = 0;
    ch.vy = 0;
    return;
  }

  // Clamp velocity to MAX_SPEED_PER_TICK
  if (Math.abs(ch.vx) > MAX_SPEED_PER_TICK) {
    ch.vx = Math.sign(ch.vx) * MAX_SPEED_PER_TICK;
  }
  if (Math.abs(ch.vy) > MAX_SPEED_PER_TICK) {
    ch.vy = Math.sign(ch.vy) * MAX_SPEED_PER_TICK;
  }

  if (!ch.grounded) {
    ch.vy += GRAVITY_PER_TICK;
    if (Math.abs(ch.vy) > MAX_SPEED_PER_TICK) {
      ch.vy = Math.sign(ch.vy) * MAX_SPEED_PER_TICK;
    }
  }

  // Substep movement so fast falling / knockback never tunnels through thin floors or walls
  const maxDelta = Math.max(Math.abs(ch.vx), Math.abs(ch.vy));
  const substeps = Math.max(1, Math.ceil(maxDelta / 0.5));
  const stepX = ch.vx / substeps;
  let stepY = ch.vy / substeps;

  for (let s = 0; s < substeps; s++) {
    // Horizontal movement
    if (ch.vx !== 0) {
      const dirX: -1 | 1 = ch.vx < 0 ? -1 : 1;
      const candidateX = ch.x + stepX;
      if (testCollisionX(terrain, candidateX, ch.y, ch.radius, dirX) === TERRAIN_EMPTY) {
        ch.x = candidateX;
      } else {
        // If sliding along ground, try stepping up a gentle 1..2 px slope
        let climbed = false;
        if (ch.grounded) {
          for (let lift = 1; lift <= 2; lift++) {
            if (
              testCollisionX(terrain, candidateX, ch.y - lift, ch.radius, dirX) === TERRAIN_EMPTY &&
              testCollisionY(terrain, candidateX, ch.y - lift, ch.radius, -1) === TERRAIN_EMPTY
            ) {
              ch.x = candidateX;
              ch.y -= lift;
              ch.vx *= 0.95;
              climbed = true;
              break;
            }
          }
        }
        if (!climbed) {
          if (ch.jumping !== 'none') {
            ch.vx = 0;
          } else {
            ch.vx = -ch.vx * HEDGEHOG_ELASTICITY;
            if (Math.abs(ch.vx) < SETTLE_SPEED_THRESHOLD) {
              ch.vx = 0;
            }
          }
        }
      }
    }

    // Vertical movement
    if (ch.vy !== 0) {
      const dirY: -1 | 1 = ch.vy < 0 ? -1 : 1;
      const candidateY = ch.y + stepY;
      if (testCollisionY(terrain, ch.x, candidateY, ch.radius, dirY) === TERRAIN_EMPTY) {
        ch.y = candidateY;
      } else if (dirY < 0) {
        // Hit ceiling
        ch.vy = 0;
        stepY = 0;
      } else {
        // Landed on floor!
        const impactVy = ch.vy;
        const fallDmg = computeFallDamage(impactVy);
        if (fallDmg > 0) {
          ch.health = Math.max(0, ch.health - fallDmg);
          events.push({
            type: 'character.damaged',
            tick,
            characterId: ch.id,
            amount: fallDmg,
            health: ch.health,
            cause: 'fall',
          });
          if (ch.health === 0) {
            ch.alive = false;
            ch.vx = 0;
            ch.vy = 0;
            ch.grounded = true;
            ch.jumping = 'none';
            events.push({
              type: 'character.eliminated',
              tick,
              characterId: ch.id,
              cause: 'fall',
            });
            return;
          }
        }
        ch.y = Math.round(candidateY);
        ch.vy = 0;
        stepY = 0;
        ch.grounded = true;
        if (ch.jumping !== 'none') {
          ch.jumping = 'none';
          ch.vx = 0;
        }
      }
    }

    // Check water entry during substep
    if (isCoordInWater(terrain, ch.x, ch.y + ch.radius)) {
      ch.drowning = true;
      ch.grounded = false;
      ch.jumping = 'none';
      ch.vx = 0;
      ch.vy = DROWN_SPEED_PER_TICK;
      events.push({ type: 'character.drowned', tick, characterId: ch.id });
      return;
    }
  }

  // Post-step ground friction and support check
  const groundedNow = testCollisionY(terrain, ch.x, ch.y, ch.radius, 1) !== TERRAIN_EMPTY && ch.vy >= 0;
  ch.grounded = groundedNow;
  if (ch.grounded) {
    ch.vy = 0;
    ch.vx *= HEDGEHOG_SLIDE_FRICTION_PER_TICK * 0.85;
    if (Math.abs(ch.vx) < SETTLE_SPEED_THRESHOLD) {
      ch.vx = 0;
    }
  }
}

export function isCharacterSettled(ch: CharacterState): boolean {
  if (!ch.alive) return true;
  if (ch.drowning) return false;
  if (!ch.grounded) return false;
  if (ch.jumping !== 'none') return false;
  return Math.abs(ch.vx) < SETTLE_SPEED_THRESHOLD && Math.abs(ch.vy) < SETTLE_SPEED_THRESHOLD;
}
