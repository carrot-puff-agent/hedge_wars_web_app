/**
 * Terrain and entity collision queries and swept/substep projectile stepping (SIM-04).
 *
 * Provenance:
 * - `testCollisionX` and `testCollisionY`: ported from `rust/lib-hwengine-future/src/ai_state/collision.rs`
 *   (lines 4-55) and `hedgewars/uCollisions.pas` (`TestCollisionXKickImpl`, `TestCollisionYKickImpl`,
 *   lines 545-603) at commit `54437aa1a9078f77b0103f1df0aa81f4edc1be05` (GPL-2.0).
 * - `testSegmentCircleIntersection`: adapted from `LineCollisionTest` in `hedgewars/uCollisions.pas`
 *   (lines 219-251).
 * - `sweepMotion`: adapted from `doStepPerPixel` in `hedgewars/uGearsHandlersMess.pas` (lines 157-204)
 *   for 60 Hz fixed-step simulation so fast projectiles (~16.7-31.7 wu/tick) never tunnel through
 *   1-cell thin ledges or walls.
 */

import type { CharacterState, TerrainState } from './state';
import { getTerrainCell } from './terrain';
import { TERRAIN_EMPTY } from './units';

export interface CircleBody {
  x: number;
  y: number;
  radius: number;
}

export interface SweepCollisionResult {
  collided: boolean;
  x: number;
  y: number;
  lastFreeX: number;
  lastFreeY: number;
  hitX: boolean;
  hitY: boolean;
  terrainFlag: number;
  hitCharacterId: string | null;
  substepsUsed: number;
}

/**
 * Tests horizontal collision along the leading vertical edge of a gear's bounding box,
 * matching `test_collision_x` in `rust/lib-hwengine-future/src/ai_state/collision.rs`.
 * Returns the non-zero terrain cell flag if colliding, or 0 if clear.
 */
export function testCollisionX(
  terrain: TerrainState,
  centerX: number,
  centerY: number,
  radius: number,
  direction: -1 | 1,
): number {
  const cx = Math.round(centerX);
  const cy = Math.round(centerY);
  const r = Math.max(1, Math.round(radius));
  const x = direction < 0 ? cx - r : cx + r;
  const minY = cy - r + 1;
  const maxY = cy + r - 1;
  for (let y = minY; y <= maxY; y++) {
    const cell = getTerrainCell(terrain, x, y);
    if (cell !== TERRAIN_EMPTY) {
      return cell;
    }
  }
  return TERRAIN_EMPTY;
}

/**
 * Tests vertical collision along the leading horizontal edge of a gear's bounding box,
 * matching `test_collision_y` in `rust/lib-hwengine-future/src/ai_state/collision.rs`.
 * Returns the non-zero terrain cell flag if colliding, or 0 if clear.
 */
export function testCollisionY(
  terrain: TerrainState,
  centerX: number,
  centerY: number,
  radius: number,
  direction: -1 | 1,
): number {
  const cx = Math.round(centerX);
  const cy = Math.round(centerY);
  const r = Math.max(1, Math.round(radius));
  const y = direction < 0 ? cy - r : cy + r;
  const minX = cx - r + 1;
  const maxX = cx + r - 1;
  for (let x = minX; x <= maxX; x++) {
    const cell = getTerrainCell(terrain, x, y);
    if (cell !== TERRAIN_EMPTY) {
      return cell;
    }
  }
  return TERRAIN_EMPTY;
}

/**
 * Tests whether any solid terrain cell overlaps a circular body of given radius.
 */
export function testCircleTerrainOverlap(
  terrain: TerrainState,
  centerX: number,
  centerY: number,
  radius: number,
): number {
  const cx = Math.round(centerX);
  const cy = Math.round(centerY);
  const r = Math.max(0, Math.round(radius));
  const rSq = r * r;
  for (let dy = -r; dy <= r; dy++) {
    const y = cy + dy;
    if (y < 0 || y >= terrain.height) continue;
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > rSq) continue;
      const x = cx + dx;
      if (x < 0 || x >= terrain.width) continue;
      const cell = terrain.mask[y * terrain.width + x]!;
      if (cell !== TERRAIN_EMPTY) {
        return cell;
      }
    }
  }
  return TERRAIN_EMPTY;
}

/**
 * Tests whether two circular bodies overlap.
 */
export function circlesOverlap(a: CircleBody, b: CircleBody): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const r = a.radius + b.radius;
  return dx * dx + dy * dy <= r * r;
}

/**
 * Analytic segment-vs-circle intersection test (ported from LineCollisionTest in uCollisions.pas).
 */
export function testSegmentCircleIntersection(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  projectileRadius: number,
  target: CircleBody,
): { hit: boolean; hitX: number; hitY: number; t: number } {
  const dirX = endX - startX;
  const dirY = endY - startY;
  const toCenterX = startX - target.x;
  const toCenterY = startY - target.y;
  const r = target.radius + projectileRadius;

  const dirNormSqr = dirX * dirX + dirY * dirY;
  const c = toCenterX * toCenterX + toCenterY * toCenterY - r * r;
  if (c <= 0) {
    return { hit: true, hitX: startX, hitY: startY, t: 0 };
  }
  if (dirNormSqr <= 1e-12) {
    return { hit: false, hitX: startX, hitY: startY, t: 1 };
  }
  const b = dirX * toCenterX + dirY * toCenterY;
  if (b > 0) {
    return { hit: false, hitX: endX, hitY: endY, t: 1 };
  }
  const disc = b * b - dirNormSqr * c;
  if (disc < 0) {
    return { hit: false, hitX: endX, hitY: endY, t: 1 };
  }
  let t = (-b - Math.sqrt(disc)) / dirNormSqr;
  if (t < 0) t = 0;
  if (t <= 1) {
    return {
      hit: true,
      hitX: startX + t * dirX,
      hitY: startY + t * dirY,
      t,
    };
  }
  return { hit: false, hitX: endX, hitY: endY, t: 1 };
}

/**
 * Finds the first alive character overlapping the given circle (excluding an ignored character ID).
 */
export function findOverlappingCharacter(
  characters: readonly CharacterState[],
  body: CircleBody,
  ignoreCharacterId?: string | null,
): CharacterState | null {
  for (const ch of characters) {
    if (!ch.alive || ch.id === ignoreCharacterId) continue;
    if (circlesOverlap(body, ch)) {
      return ch;
    }
  }
  return null;
}

/**
 * Advances a circular projectile from (x, y) by (dx, dy) using per-half-pixel substeps
 * (adapted from `doStepPerPixel` in `uGearsHandlersMess.pas`) so fast projectiles cannot
 * tunnel through 1-cell thin ledges, overhangs, or characters.
 */
export function sweepProjectileStep(params: {
  terrain: TerrainState;
  characters?: readonly CharacterState[];
  x: number;
  y: number;
  dx: number;
  dy: number;
  radius: number;
  ignoreCharacterId?: string | null;
  checkCharacterCollisions?: boolean;
  maxSubstepDistance?: number;
}): SweepCollisionResult {
  const {
    terrain,
    characters = [],
    x,
    y,
    dx,
    dy,
    radius,
    ignoreCharacterId = null,
    checkCharacterCollisions = true,
    maxSubstepDistance = 0.5,
  } = params;

  const maxDelta = Math.max(Math.abs(dx), Math.abs(dy));
  const steps = Math.max(1, Math.ceil(maxDelta / maxSubstepDistance));
  const stepX = dx / steps;
  const stepY = dy / steps;
  const dirX: -1 | 1 = dx < 0 ? -1 : 1;
  const dirY: -1 | 1 = dy < 0 ? -1 : 1;

  let curX = x;
  let curY = y;

  for (let i = 1; i <= steps; i++) {
    const nextX = x + stepX * i;
    const nextY = y + stepY * i;

    if (checkCharacterCollisions && characters.length > 0) {
      const hitChar = findOverlappingCharacter(
        characters,
        { x: nextX, y: nextY, radius },
        ignoreCharacterId,
      );
      if (hitChar) {
        return {
          collided: true,
          x: nextX,
          y: nextY,
          lastFreeX: curX,
          lastFreeY: curY,
          hitX: Math.abs(nextX - hitChar.x) >= Math.abs(nextY - hitChar.y),
          hitY: Math.abs(nextY - hitChar.y) >= Math.abs(nextX - hitChar.x),
          terrainFlag: TERRAIN_EMPTY,
          hitCharacterId: hitChar.id,
          substepsUsed: i,
        };
      }
    }

    // Check directional edge collisions and center/disc overlap so 1-cell ledges never tunnel
    const collY = dy !== 0 ? testCollisionY(terrain, nextX, nextY, radius, dirY) : TERRAIN_EMPTY;
    const collX = dx !== 0 ? testCollisionX(terrain, nextX, nextY, radius, dirX) : TERRAIN_EMPTY;
    const centerCell = getTerrainCell(terrain, nextX, nextY);
    const terrainFlag = collY || collX || centerCell;

    if (terrainFlag !== TERRAIN_EMPTY) {
      // Determine whether X, Y, or both axes caused the collision relative to lastFree position
      const hitVertical =
        collY !== TERRAIN_EMPTY ||
        (dy !== 0 && testCollisionY(terrain, curX, nextY, radius, dirY) !== TERRAIN_EMPTY) ||
        (dy !== 0 && getTerrainCell(terrain, curX, nextY) !== TERRAIN_EMPTY);
      const hitHorizontal =
        collX !== TERRAIN_EMPTY ||
        (dx !== 0 && testCollisionX(terrain, nextX, curY, radius, dirX) !== TERRAIN_EMPTY) ||
        (dx !== 0 && getTerrainCell(terrain, nextX, curY) !== TERRAIN_EMPTY);

      return {
        collided: true,
        x: nextX,
        y: nextY,
        lastFreeX: curX,
        lastFreeY: curY,
        hitX: hitHorizontal || !hitVertical,
        hitY: hitVertical || !hitHorizontal,
        terrainFlag,
        hitCharacterId: null,
        substepsUsed: i,
      };
    }

    curX = nextX;
    curY = nextY;
  }

  return {
    collided: false,
    x: curX,
    y: curY,
    lastFreeX: curX,
    lastFreeY: curY,
    hitX: false,
    hitY: false,
    terrainFlag: TERRAIN_EMPTY,
    hitCharacterId: null,
    substepsUsed: steps,
  };
}
