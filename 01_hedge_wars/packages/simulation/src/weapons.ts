/**
 * Impact rocket, timed bouncing grenade, explosion damage, radial knockback (SIM-06).
 *
 * Provenance:
 * - Weapon launch (`spawnWeaponProjectile`): adapted from `Attack` in `hedgewars/uGearsHedgehog.pas`
 *   (lines 313-356) and gear defaults in `hedgewars/uGearsList.pas` (lines 259-381) at commit
 *   `54437aa1a9078f77b0103f1df0aa81f4edc1be05` (GPL-2.0).
 * - Explosion damage and knockback (`triggerExplosion`): ported from `doMakeExplosion` in
 *   `hedgewars/uGearsUtils.pas` (lines 94-262).
 * - Rocket and grenade step handlers (`stepProjectiles`): ported from `doStepShell`, `doStepBomb`,
 *   and `doStepFallingGear` in `hedgewars/uGearsHandlersMess.pas` (lines 374-698, 780-795).
 */

import { refreshCharacterGrounding } from './character';
import { sweepProjectileStep, testCollisionY } from './collision';
import type {
  CharacterState,
  ProjectileState,
  SimulationEvent,
  WeaponKind,
  WorldState,
} from './state';
import { carveCrater, isCoordInWater } from './terrain';
import {
  GRAVITY_PER_TICK,
  GRENADE_BOOM_RADIUS,
  GRENADE_DEFAULT_FUSE_TICKS,
  GRENADE_DENSITY,
  GRENADE_ELASTICITY,
  GRENADE_FRICTION,
  GRENADE_MAX_FUSE_TICKS,
  GRENADE_MIN_FUSE_TICKS,
  GRENADE_RADIUS,
  HEDGEHOG_DENSITY,
  HEDGEHOG_RADIUS,
  MAX_LAUNCH_SPEED_PER_TICK,
  MAX_POWER,
  MAX_SPEED_PER_TICK,
  MIN_KICK_SPEED_PER_TICK,
  ROCKET_BOOM_RADIUS,
  ROCKET_DENSITY,
  ROCKET_ELASTICITY,
  ROCKET_FRICTION,
  ROCKET_RADIUS,
  SETTLE_SPEED_THRESHOLD,
  TERRAIN_EMPTY,
  upstreamVelocityToTick,
} from './units';

export function clampFuseTicks(fuseTicks?: number): number {
  if (fuseTicks === undefined) return GRENADE_DEFAULT_FUSE_TICKS;
  return Math.max(
    GRENADE_MIN_FUSE_TICKS,
    Math.min(GRENADE_MAX_FUSE_TICKS, Math.round(fuseTicks)),
  );
}

export function spawnWeaponProjectile(
  state: WorldState,
  shooter: CharacterState,
  power: number,
  events: SimulationEvent[],
): ProjectileState | null {
  if (!shooter.alive || shooter.drowning) return null;

  const team = state.teams.find((t) => t.id === shooter.teamId);
  const kind: WeaponKind = shooter.selectedWeapon;
  if (team) {
    if (team.inventory[kind] <= 0) {
      return null;
    }
    team.inventory[kind] -= 1;
  }

  const clampedPower = Math.max(0, Math.min(MAX_POWER, power));
  const launchSpeed = (clampedPower / MAX_POWER) * MAX_LAUNCH_SPEED_PER_TICK;
  const rad = (shooter.aimAngleDeg * Math.PI) / 180;
  const dirX = shooter.facing * Math.cos(rad);
  const dirY = -Math.sin(rad);

  const id = `proj-${state.nextEntitySeq++}`;
  const isRocket = kind === 'rocket';

  const projectile: ProjectileState = {
    id,
    kind,
    ownerTeamId: shooter.teamId,
    ownerCharacterId: shooter.id,
    x: shooter.x,
    y: shooter.y,
    vx: dirX * launchSpeed,
    vy: dirY * launchSpeed,
    radius: isRocket ? ROCKET_RADIUS : GRENADE_RADIUS,
    boomRadius: isRocket ? ROCKET_BOOM_RADIUS : GRENADE_BOOM_RADIUS,
    density: isRocket ? ROCKET_DENSITY : GRENADE_DENSITY,
    elasticity: isRocket ? ROCKET_ELASTICITY : GRENADE_ELASTICITY,
    friction: isRocket ? ROCKET_FRICTION : GRENADE_FRICTION,
    fuseTicksRemaining: isRocket ? null : clampFuseTicks(shooter.grenadeFuseTicks),
    bounces: 0,
    active: true,
    leftOwnerGrace: false,
  };

  state.projectiles.push(projectile);
  events.push({
    type: 'projectile.spawned',
    tick: state.tick,
    projectileId: projectile.id,
    kind: projectile.kind,
    x: projectile.x,
    y: projectile.y,
  });
  return projectile;
}

/**
 * Executes an authoritative explosion at (x, y) with given radius,
 * ported from `doMakeExplosion` in `hedgewars/uGearsUtils.pas` (lines 94-262).
 */
export function triggerExplosion(
  state: WorldState,
  x: number,
  y: number,
  radius: number,
  attackerTeamId: string | null,
  events: SimulationEvent[],
): void {
  const dmgBase = (radius << 1) + Math.floor(HEDGEHOG_RADIUS / 2);

  // 1. Apply damage and knockback to characters in deterministic array order
  for (const ch of state.characters) {
    if (!ch.alive) continue;
    const tdX = ch.x - x;
    const tdY = ch.y - y;
    if (Math.abs(Math.round(tdX)) + Math.abs(Math.round(tdY)) + 2 >= dmgBase) {
      continue;
    }
    const dist = Math.hypot(tdX, tdY);
    const rawDmg = dmgBase - Math.round(dist);
    if (rawDmg <= 1) continue;

    const dmg = Math.min(Math.floor(rawDmg / 2), radius);
    if (dmg > 0) {
      ch.health = Math.max(0, ch.health - dmg);
      ch.lastDamagedByTeamId = attackerTeamId;
      events.push({
        type: 'character.damaged',
        tick: state.tick,
        characterId: ch.id,
        amount: dmg,
        health: ch.health,
        cause: 'explosion',
      });
    }

    // Knockback impulse converted from uGearsUtils.pas lines 176-177:
    // SignAs(_0_005 * dmg + cHHKick, td) / (Density / 3)
    const kickSpeed =
      (upstreamVelocityToTick(0.005 * dmg) + MIN_KICK_SPEED_PER_TICK) /
      (HEDGEHOG_DENSITY / 3.0);
    const signX = tdX < 0 ? -1 : tdX > 0 ? 1 : ch.facing;
    const signY = tdY <= 0 ? -1 : 1;
    ch.vx += signX * kickSpeed;
    ch.vy += signY * kickSpeed;
    ch.grounded = false;
    ch.jumping = 'none';
    ch.moveInput = 0;

    if (ch.health === 0) {
      ch.alive = false;
      events.push({
        type: 'character.eliminated',
        tick: state.tick,
        characterId: ch.id,
        cause: 'explosion',
      });
    }
  }

  // 2. Apply blast impulse to other active projectiles (e.g. grenades in play)
  for (const proj of state.projectiles) {
    if (!proj.active) continue;
    const tdX = proj.x - x;
    const tdY = proj.y - y;
    const dist = Math.hypot(tdX, tdY);
    const rawDmg = dmgBase - Math.round(dist);
    if (rawDmg > 1) {
      const dmg = Math.min(Math.floor(rawDmg / 2), radius);
      const kickSpeed =
        (upstreamVelocityToTick(0.005 * dmg) + MIN_KICK_SPEED_PER_TICK) /
        (proj.density / 3.0);
      const signX = tdX < 0 ? -1 : 1;
      const signY = tdY <= 0 ? -1 : 1;
      proj.vx += signX * kickSpeed;
      proj.vy += signY * kickSpeed;
    }
  }

  // 3. Carve circular terrain crater
  const crater = carveCrater(state.terrain, x, y, radius);
  events.push({
    type: 'explosion',
    tick: state.tick,
    x: Math.round(x),
    y: Math.round(y),
    radius: Math.round(radius),
    clearedCells: crater.changedCells,
    terrainRevision: state.terrain.revision,
  });

  // 4. Wake any character whose ground support was removed by the crater
  for (const ch of state.characters) {
    if (!ch.alive || ch.drowning) continue;
    refreshCharacterGrounding(state.terrain, ch, 0);
  }
}

/**
 * Steps all active projectiles by one 60 Hz tick.
 */
export function stepProjectiles(state: WorldState, events: SimulationEvent[]): void {
  for (const proj of state.projectiles) {
    if (!proj.active) continue;

    // Check if projectile has cleared its shooter's bounding box (LegacyFixupX/Y in uCollisions.pas)
    if (!proj.leftOwnerGrace) {
      const owner = state.characters.find((c) => c.id === proj.ownerCharacterId);
      if (
        !owner ||
        !owner.alive ||
        Math.abs(proj.x - owner.x) > owner.radius + proj.radius + 4 ||
        Math.abs(proj.y - owner.y) > owner.radius + proj.radius + 4
      ) {
        proj.leftOwnerGrace = true;
      }
    }

    // Apply wind (for rockets, matching doStepShell line 784) and gravity
    if (proj.kind === 'rocket') {
      proj.vx += state.wind / proj.density;
    }
    proj.vy += GRAVITY_PER_TICK;

    // Clamp speeds
    if (Math.abs(proj.vx) > MAX_SPEED_PER_TICK) {
      proj.vx = Math.sign(proj.vx) * MAX_SPEED_PER_TICK;
    }
    if (Math.abs(proj.vy) > MAX_SPEED_PER_TICK) {
      proj.vy = Math.sign(proj.vy) * MAX_SPEED_PER_TICK;
    }

    const isRestingGrenade =
      proj.kind === 'grenade' &&
      Math.abs(proj.vx) < 1e-6 &&
      Math.abs(proj.vy - GRAVITY_PER_TICK) < 1e-6 &&
      testCollisionY(state.terrain, proj.x, proj.y, proj.radius, 1) !== TERRAIN_EMPTY;

    if (isRestingGrenade) {
      proj.vy = 0;
    } else {
      const sweep = sweepProjectileStep({
        terrain: state.terrain,
        characters: state.characters,
        x: proj.x,
        y: proj.y,
        dx: proj.vx,
        dy: proj.vy,
        radius: proj.radius,
        ignoreCharacterId: proj.leftOwnerGrace ? null : proj.ownerCharacterId,
        checkCharacterCollisions: proj.kind === 'rocket',
      });

      if (proj.kind === 'rocket') {
        proj.x = sweep.x;
        proj.y = sweep.y;
        if (sweep.collided) {
          proj.active = false;
          triggerExplosion(
            state,
            proj.x,
            proj.y,
            proj.boomRadius,
            proj.ownerTeamId,
            events,
          );
          continue;
        }
      } else {
        // Timed bouncing grenade (doStepBomb + doStepFallingGear)
        if (sweep.collided) {
          proj.x = sweep.lastFreeX;
          proj.y = sweep.lastFreeY;
          if (sweep.hitY && sweep.hitX) {
            proj.vx = -proj.vx * proj.elasticity * proj.friction;
            proj.vy = -proj.vy * proj.elasticity;
          } else if (sweep.hitY) {
            proj.vy = -proj.vy * proj.elasticity;
            proj.vx = proj.vx * proj.friction;
          } else if (sweep.hitX) {
            proj.vx = -proj.vx * proj.elasticity;
            proj.vy = proj.vy * proj.elasticity;
          }
          proj.bounces += 1;
          events.push({
            type: 'projectile.bounced',
            tick: state.tick,
            projectileId: proj.id,
            x: proj.x,
            y: proj.y,
            bounces: proj.bounces,
          });

          // Settle grenade if bounce velocity is negligible on solid ground
          if (
            Math.abs(proj.vx) + Math.abs(proj.vy) < SETTLE_SPEED_THRESHOLD &&
            testCollisionY(state.terrain, proj.x, proj.y, proj.radius, 1) !== TERRAIN_EMPTY
          ) {
            proj.vx = 0;
            proj.vy = 0;
          }
        } else {
          proj.x = sweep.x;
          proj.y = sweep.y;
        }
      }
    }

    // Drowning / out-of-world check
    if (
      isCoordInWater(state.terrain, proj.x, proj.y + proj.radius) ||
      proj.x < -2048 ||
      proj.x > state.terrain.width + 2048
    ) {
      proj.active = false;
      continue;
    }

    // Grenade fuse countdown (doStepBomb lines 590, 614)
    if (proj.fuseTicksRemaining !== null) {
      proj.fuseTicksRemaining -= 1;
      if (proj.fuseTicksRemaining <= 0) {
        proj.active = false;
        triggerExplosion(
          state,
          proj.x,
          proj.y,
          proj.boomRadius,
          proj.ownerTeamId,
          events,
        );
      }
    }
  }

  // Prune deactivated projectiles to keep state compact and serializable
  state.projectiles = state.projectiles.filter((p) => p.active);
}
