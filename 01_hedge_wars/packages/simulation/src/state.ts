import { normalizeSeed, SeededRng } from './rng';
import {
  DEFAULT_MAP_HEIGHT,
  DEFAULT_MAP_WIDTH,
  DEFAULT_TURN_TICKS,
  DEFAULT_WATER_LINE,
  GRENADE_DEFAULT_FUSE_TICKS,
  HEDGEHOG_INITIAL_HEALTH,
  HEDGEHOG_RADIUS,
  MAX_MAP_HEIGHT,
  MAX_MAP_WIDTH,
  MAX_WIND_ACCEL_PER_TICK,
  MIN_MAP_DIMENSION,
  SIMULATION_RULES_VERSION,
  TERRAIN_EMPTY,
  TERRAIN_INDESTRUCTIBLE,
  TERRAIN_SOLID,
} from './units';

export type WeaponKind = 'rocket' | 'grenade';
export type TurnPhase = 'select' | 'control' | 'resolve' | 'settle' | 'finished';
export type JumpKind = 'none' | 'long' | 'high';

export interface DirtyRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TerrainState {
  width: number;
  height: number;
  waterLine: number;
  revision: number;
  checksum: number;
  mask: Uint8Array;
  dirtyChunks: DirtyRect[];
}

export interface SerializedTerrainState {
  width: number;
  height: number;
  waterLine: number;
  revision: number;
  checksum: number;
  rleMask: number[];
  dirtyChunks: DirtyRect[];
}

export interface TeamInventory {
  rocket: number;
  grenade: number;
}

export interface TeamState {
  id: string;
  name: string;
  colorIndex: number;
  inventory: TeamInventory;
}

export interface CharacterState {
  id: string;
  teamId: string;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  health: number;
  alive: boolean;
  drowning: boolean;
  grounded: boolean;
  jumping: JumpKind;
  facing: -1 | 1;
  aimAngleDeg: number;
  moveInput: -1 | 0 | 1;
  stepCooldownTicks: number;
  selectedWeapon: WeaponKind;
  grenadeFuseTicks: number;
  lastDamagedByTeamId: string | null;
}

export interface ProjectileState {
  id: string;
  kind: WeaponKind;
  ownerTeamId: string;
  ownerCharacterId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  boomRadius: number;
  density: number;
  elasticity: number;
  friction: number;
  fuseTicksRemaining: number | null;
  bounces: number;
  active: boolean;
  leftOwnerGrace: boolean;
}

export interface WorldState {
  rulesVersion: number;
  tick: number;
  rngState: number;
  wind: number;
  activeTeamId: string | null;
  activeCharacterId: string | null;
  turnTicksRemaining: number;
  phase: TurnPhase;
  winnerTeamId: string | null;
  nextEntitySeq: number;
  terrain: TerrainState;
  teams: TeamState[];
  characters: CharacterState[];
  projectiles: ProjectileState[];
}

export interface SerializedWorldState {
  rulesVersion: number;
  tick: number;
  rngState: number;
  wind: number;
  activeTeamId: string | null;
  activeCharacterId: string | null;
  turnTicksRemaining: number;
  phase: TurnPhase;
  winnerTeamId: string | null;
  nextEntitySeq: number;
  terrain: SerializedTerrainState;
  teams: TeamState[];
  characters: CharacterState[];
  projectiles: ProjectileState[];
}

export type SimulationCommand =
  | { type: 'move'; characterId: string; direction: -1 | 0 | 1 }
  | { type: 'aim'; characterId: string; angleDeg: number; facing?: -1 | 1 }
  | { type: 'jump'; characterId: string; kind: 'long' | 'high' }
  | { type: 'selectWeapon'; characterId: string; weapon: WeaponKind; grenadeFuseTicks?: number }
  | { type: 'fire'; characterId: string; power: number }
  | { type: 'rollWind' };

export type SimulationEvent =
  | { type: 'wind.changed'; tick: number; wind: number }
  | { type: 'character.moved'; tick: number; characterId: string; x: number; y: number }
  | { type: 'character.jumped'; tick: number; characterId: string; kind: 'long' | 'high' }
  | { type: 'character.damaged'; tick: number; characterId: string; amount: number; health: number; cause: 'explosion' | 'fall' }
  | { type: 'character.drowned'; tick: number; characterId: string }
  | { type: 'character.eliminated'; tick: number; characterId: string; cause: 'explosion' | 'fall' | 'water' }
  | { type: 'projectile.spawned'; tick: number; projectileId: string; kind: WeaponKind; x: number; y: number }
  | { type: 'projectile.bounced'; tick: number; projectileId: string; x: number; y: number; bounces: number }
  | { type: 'explosion'; tick: number; x: number; y: number; radius: number; clearedCells: number; terrainRevision: number }
  | { type: 'world.settled'; tick: number };

export function validateMapDimensions(width: number, height: number, waterLine = height): void {
  if (!Number.isInteger(width) || width < MIN_MAP_DIMENSION || width > MAX_MAP_WIDTH) {
    throw new RangeError(`Map width ${width} must be an integer in [${MIN_MAP_DIMENSION}, ${MAX_MAP_WIDTH}]`);
  }
  if (!Number.isInteger(height) || height < MIN_MAP_DIMENSION || height > MAX_MAP_HEIGHT) {
    throw new RangeError(`Map height ${height} must be an integer in [${MIN_MAP_DIMENSION}, ${MAX_MAP_HEIGHT}]`);
  }
  if (!Number.isInteger(waterLine) || waterLine < 0 || waterLine > height + 512) {
    throw new RangeError(`Water line ${waterLine} is out of valid bounds for height ${height}`);
  }
}

export function computeMaskChecksum(mask: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < mask.length; i++) {
    hash ^= mask[i]!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function encodeMaskRle(mask: Uint8Array): number[] {
  const rle: number[] = [];
  if (mask.length === 0) return rle;
  let current = mask[0]!;
  let count = 1;
  for (let i = 1; i < mask.length; i++) {
    const val = mask[i]!;
    if (val === current) {
      count++;
    } else {
      rle.push(current, count);
      current = val;
      count = 1;
    }
  }
  rle.push(current, count);
  return rle;
}

export function decodeMaskRle(rle: readonly number[], expectedLength: number): Uint8Array {
  if (rle.length % 2 !== 0) {
    throw new Error('Invalid RLE terrain mask: odd number of elements');
  }
  const mask = new Uint8Array(expectedLength);
  let offset = 0;
  for (let i = 0; i < rle.length; i += 2) {
    const val = rle[i]!;
    const count = rle[i + 1]!;
    if (
      val !== TERRAIN_EMPTY &&
      val !== TERRAIN_SOLID &&
      val !== TERRAIN_INDESTRUCTIBLE
    ) {
      throw new Error(`Invalid terrain cell byte value: ${val}`);
    }
    if (!Number.isInteger(count) || count <= 0 || offset + count > expectedLength) {
      throw new Error(`Invalid RLE run length ${count} at offset ${offset} (expected ${expectedLength})`);
    }
    mask.fill(val, offset, offset + count);
    offset += count;
  }
  if (offset !== expectedLength) {
    throw new Error(`Decoded RLE mask length ${offset} does not match expected ${expectedLength}`);
  }
  return mask;
}

export interface CreateWorldOptions {
  seed: number | string;
  width?: number;
  height?: number;
  waterLine?: number;
  mask?: Uint8Array;
  teams?: TeamState[];
  characters?: CharacterState[];
  turnTicks?: number;
}

export function createCharacterState(params: {
  id: string;
  teamId: string;
  name: string;
  x: number;
  y: number;
  facing?: -1 | 1;
  health?: number;
}): CharacterState {
  return {
    id: params.id,
    teamId: params.teamId,
    name: params.name,
    x: params.x,
    y: params.y,
    vx: 0,
    vy: 0,
    radius: HEDGEHOG_RADIUS,
    health: params.health ?? HEDGEHOG_INITIAL_HEALTH,
    alive: (params.health ?? HEDGEHOG_INITIAL_HEALTH) > 0,
    drowning: false,
    grounded: false,
    jumping: 'none',
    facing: params.facing ?? 1,
    aimAngleDeg: 0,
    moveInput: 0,
    stepCooldownTicks: 0,
    selectedWeapon: 'rocket',
    grenadeFuseTicks: GRENADE_DEFAULT_FUSE_TICKS,
    lastDamagedByTeamId: null,
  };
}

export function createWorldState(options: CreateWorldOptions): WorldState {
  const width = options.width ?? DEFAULT_MAP_WIDTH;
  const height = options.height ?? DEFAULT_MAP_HEIGHT;
  const waterLine = options.waterLine ?? DEFAULT_WATER_LINE;
  validateMapDimensions(width, height, waterLine);

  const expectedCells = width * height;
  let mask: Uint8Array;
  if (options.mask) {
    if (options.mask.length !== expectedCells) {
      throw new RangeError(`Terrain mask length ${options.mask.length} does not match ${width}x${height} (${expectedCells})`);
    }
    mask = new Uint8Array(options.mask);
  } else {
    mask = new Uint8Array(expectedCells);
  }

  const rng = new SeededRng(options.seed);
  const teams = (options.teams ?? []).map((team) => ({
    ...team,
    inventory: { ...team.inventory },
  }));
  const characters = (options.characters ?? []).map((ch) => ({ ...ch }));
  const firstCharacter = characters.find((ch) => ch.alive) ?? null;

  return {
    rulesVersion: SIMULATION_RULES_VERSION,
    tick: 0,
    rngState: rng.state,
    wind: 0,
    activeTeamId: firstCharacter?.teamId ?? teams[0]?.id ?? null,
    activeCharacterId: firstCharacter?.id ?? null,
    turnTicksRemaining: options.turnTicks ?? DEFAULT_TURN_TICKS,
    phase: 'control',
    winnerTeamId: null,
    nextEntitySeq: 1,
    terrain: {
      width,
      height,
      waterLine,
      revision: 0,
      checksum: computeMaskChecksum(mask),
      mask,
      dirtyChunks: [],
    },
    teams,
    characters,
    projectiles: [],
  };
}

export function serializeWorldState(state: WorldState): SerializedWorldState {
  return {
    rulesVersion: state.rulesVersion,
    tick: state.tick,
    rngState: state.rngState,
    wind: state.wind,
    activeTeamId: state.activeTeamId,
    activeCharacterId: state.activeCharacterId,
    turnTicksRemaining: state.turnTicksRemaining,
    phase: state.phase,
    winnerTeamId: state.winnerTeamId,
    nextEntitySeq: state.nextEntitySeq,
    terrain: {
      width: state.terrain.width,
      height: state.terrain.height,
      waterLine: state.terrain.waterLine,
      revision: state.terrain.revision,
      checksum: state.terrain.checksum,
      rleMask: encodeMaskRle(state.terrain.mask),
      dirtyChunks: state.terrain.dirtyChunks.map((chunk) => ({ ...chunk })),
    },
    teams: state.teams.map((team) => ({
      ...team,
      inventory: { ...team.inventory },
    })),
    characters: state.characters.map((ch) => ({ ...ch })),
    projectiles: state.projectiles.map((proj) => ({ ...proj })),
  };
}

export function deserializeWorldState(snapshot: SerializedWorldState): WorldState {
  if (snapshot.rulesVersion !== SIMULATION_RULES_VERSION) {
    throw new Error(`Unsupported simulation rulesVersion ${snapshot.rulesVersion} (expected ${SIMULATION_RULES_VERSION})`);
  }
  validateMapDimensions(snapshot.terrain.width, snapshot.terrain.height, snapshot.terrain.waterLine);
  const expectedCells = snapshot.terrain.width * snapshot.terrain.height;
  const mask = decodeMaskRle(snapshot.terrain.rleMask, expectedCells);
  const computedChecksum = computeMaskChecksum(mask);
  if (computedChecksum !== (snapshot.terrain.checksum >>> 0)) {
    throw new Error(`Terrain checksum mismatch on restore: expected ${snapshot.terrain.checksum >>> 0}, got ${computedChecksum}`);
  }
  return {
    rulesVersion: snapshot.rulesVersion,
    tick: snapshot.tick,
    rngState: normalizeSeed(snapshot.rngState),
    wind: snapshot.wind,
    activeTeamId: snapshot.activeTeamId,
    activeCharacterId: snapshot.activeCharacterId,
    turnTicksRemaining: snapshot.turnTicksRemaining,
    phase: snapshot.phase,
    winnerTeamId: snapshot.winnerTeamId,
    nextEntitySeq: snapshot.nextEntitySeq,
    terrain: {
      width: snapshot.terrain.width,
      height: snapshot.terrain.height,
      waterLine: snapshot.terrain.waterLine,
      revision: snapshot.terrain.revision,
      checksum: computedChecksum,
      mask,
      dirtyChunks: snapshot.terrain.dirtyChunks.map((chunk) => ({ ...chunk })),
    },
    teams: snapshot.teams.map((team) => ({
      ...team,
      inventory: { ...team.inventory },
    })),
    characters: snapshot.characters.map((ch) => ({ ...ch })),
    projectiles: snapshot.projectiles.map((proj) => ({ ...proj })),
  };
}

export function computeWorldChecksum(state: WorldState): number {
  let hash = state.terrain.checksum >>> 0;
  const mixInt = (val: number) => {
    hash ^= val >>> 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  };
  const mixFloat = (val: number) => {
    mixInt(Math.round(val * 10000));
  };
  mixInt(state.rulesVersion);
  mixInt(state.tick);
  mixInt(state.rngState);
  mixFloat(state.wind);
  mixInt(state.turnTicksRemaining);
  mixInt(state.terrain.revision);
  for (const ch of state.characters) {
    mixFloat(ch.x);
    mixFloat(ch.y);
    mixFloat(ch.vx);
    mixFloat(ch.vy);
    mixInt(ch.health);
    mixInt(ch.alive ? 1 : 0);
    mixInt(ch.drowning ? 1 : 0);
    mixInt(ch.grounded ? 1 : 0);
    mixInt(ch.facing > 0 ? 1 : 0);
    mixFloat(ch.aimAngleDeg);
  }
  for (const proj of state.projectiles) {
    mixFloat(proj.x);
    mixFloat(proj.y);
    mixFloat(proj.vx);
    mixFloat(proj.vy);
    mixInt(proj.fuseTicksRemaining ?? 0);
    mixInt(proj.bounces);
    mixInt(proj.active ? 1 : 0);
  }
  return hash >>> 0;
}

export function rollSeededWind(state: WorldState): { wind: number; rngState: number } {
  const rng = SeededRng.fromState(state.rngState);
  const wind = rng.nextSignedUnit() * MAX_WIND_ACCEL_PER_TICK;
  return { wind, rngState: rng.state };
}
