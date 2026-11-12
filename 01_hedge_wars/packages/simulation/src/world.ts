/**
 * Authoritative fixed-step world simulation loop, command application and settling (SIM-06, SIM-07).
 */

import { isCharacterSettled, startCharacterJump, stepCharacterPhysics } from './character';
import {
  rollSeededWind,
  type SimulationCommand,
  type SimulationEvent,
  type WorldState,
} from './state';
import { clampFuseTicks, spawnWeaponProjectile, stepProjectiles } from './weapons';

export function isWorldSettled(state: WorldState): boolean {
  if (state.projectiles.some((p) => p.active)) {
    return false;
  }
  for (const ch of state.characters) {
    if (!isCharacterSettled(ch)) {
      return false;
    }
  }
  return true;
}

export function applySimulationCommand(
  state: WorldState,
  command: SimulationCommand,
  events: SimulationEvent[],
): void {
  if (command.type === 'rollWind') {
    const { wind, rngState } = rollSeededWind(state);
    state.wind = wind;
    state.rngState = rngState;
    events.push({ type: 'wind.changed', tick: state.tick, wind });
    return;
  }

  const ch = state.characters.find((c) => c.id === command.characterId);
  if (!ch || !ch.alive || ch.drowning) return;

  switch (command.type) {
    case 'move':
      ch.moveInput = command.direction;
      if (command.direction !== 0) {
        ch.facing = command.direction;
      }
      break;
    case 'aim':
      ch.aimAngleDeg = Math.max(-90, Math.min(90, command.angleDeg));
      if (command.facing !== undefined) {
        ch.facing = command.facing;
      }
      break;
    case 'jump':
      startCharacterJump(state.terrain, ch, command.kind, state.tick, events);
      break;
    case 'selectWeapon':
      ch.selectedWeapon = command.weapon;
      if (command.grenadeFuseTicks !== undefined) {
        ch.grenadeFuseTicks = clampFuseTicks(command.grenadeFuseTicks);
      }
      break;
    case 'fire': {
      ch.moveInput = 0;
      const spawned = spawnWeaponProjectile(state, ch, command.power, events);
      if (spawned) {
        state.phase = 'resolve';
      }
      break;
    }
  }
}

export function getSurvivingTeamIds(state: WorldState): string[] {
  const aliveTeamSet = new Set<string>();
  for (const ch of state.characters) {
    if (ch.alive) {
      aliveTeamSet.add(ch.teamId);
    }
  }
  return state.teams.map((t) => t.id).filter((id) => aliveTeamSet.has(id));
}

/**
 * Advances the authoritative world state by one 60 Hz tick.
 */
export function stepWorld(
  state: WorldState,
  commands: readonly SimulationCommand[] = [],
): SimulationEvent[] {
  const events: SimulationEvent[] = [];
  state.tick += 1;

  for (const cmd of commands) {
    applySimulationCommand(state, cmd, events);
  }

  if (state.phase === 'control' && state.turnTicksRemaining > 0) {
    state.turnTicksRemaining -= 1;
  }

  const wasResolvingOrSettling = state.phase === 'resolve' || state.phase === 'settle';

  // Step active projectiles (rockets, grenades, explosions)
  stepProjectiles(state, events);

  // Step characters in deterministic array order
  for (const ch of state.characters) {
    const canControlWalk =
      state.phase === 'control' && ch.id === state.activeCharacterId;
    stepCharacterPhysics(state.terrain, ch, state.tick, events, canControlWalk);
  }

  if (state.phase === 'control' && state.activeCharacterId) {
    const activeChar = state.characters.find((c) => c.id === state.activeCharacterId);
    if (!activeChar || !activeChar.alive || activeChar.drowning) {
      if (activeChar) activeChar.moveInput = 0;
      state.phase = 'resolve';
    }
  }

  if (state.phase === 'resolve' && state.projectiles.length === 0) {
    state.phase = 'settle';
  }

  if ((wasResolvingOrSettling || state.phase === 'settle') && isWorldSettled(state)) {
    events.push({ type: 'world.settled', tick: state.tick });
    const survivingTeams = getSurvivingTeamIds(state);
    if (state.teams.length > 1 && survivingTeams.length <= 1) {
      state.phase = 'finished';
      state.winnerTeamId = survivingTeams[0] ?? null;
    } else if (state.teams.length === 1 && survivingTeams.length === 0) {
      state.phase = 'finished';
      state.winnerTeamId = null;
    } else {
      state.phase = 'control';
    }
  }

  return events;
}
