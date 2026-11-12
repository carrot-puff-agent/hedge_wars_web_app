import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {
  computeWorldChecksum,
  createCharacterState,
  createWorldState,
  DEFAULT_MAP_HEIGHT,
  DEFAULT_MAP_WIDTH,
  deserializeWorldState,
  GRAVITY_PER_TICK,
  MAX_LAUNCH_SPEED_PER_TICK,
  MAX_WIND_ACCEL_PER_TICK,
  MS_PER_TICK,
  rollSeededWind,
  SeededRng,
  serializeWorldState,
  TERRAIN_INDESTRUCTIBLE,
  TERRAIN_SOLID,
  TICKS_PER_SECOND,
  upstreamAccelToTick,
  upstreamVelocityToTick,
} from '../01_hedge_wars/packages/simulation/src/index';

test('SIM-01: explicit units, 60 Hz timestep conversion and deterministic seeded RNG', () => {
  assert.equal(TICKS_PER_SECOND, 60);
  assert.ok(Math.abs(MS_PER_TICK - 50 / 3) < 1e-12);
  // Upstream cGravity = 0.0005 wu/ms^2 -> 500 wu/s^2 -> 5/36 wu/tick^2 at 60 Hz
  assert.ok(Math.abs(GRAVITY_PER_TICK - 5 / 36) < 1e-12);
  assert.ok(Math.abs(MAX_WIND_ACCEL_PER_TICK - 5 / 72) < 1e-12);
  assert.ok(Math.abs(MAX_LAUNCH_SPEED_PER_TICK - 50 / 3) < 1e-12);
  assert.equal(upstreamVelocityToTick(0.06), 1.0);
  assert.ok(Math.abs(upstreamAccelToTick(0.0005) - GRAVITY_PER_TICK) < 1e-12);

  const rngA = new SeededRng('yizhaklub-seed-2026');
  const rngB = new SeededRng('yizhaklub-seed-2026');
  const seqA = Array.from({ length: 16 }, () => rngA.nextUint32());
  const seqB = Array.from({ length: 16 }, () => rngB.nextUint32());
  assert.deepEqual(seqA, seqB);

  // Cosmetic RNG fork must not mutate authoritative RNG state
  const stateBeforeCosmetic = rngA.state;
  const cosmetic = rngA.forkCosmetic(42);
  assert.notEqual(cosmetic.nextUint32(), 0);
  assert.equal(rngA.state, stateBeforeCosmetic);
  assert.equal(rngA.nextUint32(), rngB.nextUint32());
});

test('SIM-01: world state serializes/restores cleanly and measures 2048x1024 budget', () => {
  const mask = new Uint8Array(DEFAULT_MAP_WIDTH * DEFAULT_MAP_HEIGHT);
  // Populate representative layered island terrain on 2048x1024
  for (let y = 500; y < 980; y++) {
    const startX = 180 + ((y * 3) % 40);
    const endX = 1860 - ((y * 5) % 40);
    const rowOffset = y * DEFAULT_MAP_WIDTH;
    mask.fill(y > 950 ? TERRAIN_INDESTRUCTIBLE : TERRAIN_SOLID, rowOffset + startX, rowOffset + endX);
  }

  const teams = [
    { id: 't1', name: 'Колючки', colorIndex: 0, inventory: { rocket: 99, grenade: 99 } },
    { id: 't2', name: 'Каштани', colorIndex: 1, inventory: { rocket: 99, grenade: 99 } },
    { id: 't3', name: 'Жолуді', colorIndex: 2, inventory: { rocket: 99, grenade: 99 } },
    { id: 't4', name: 'Шишки', colorIndex: 3, inventory: { rocket: 99, grenade: 99 } },
  ];
  const characters = teams.flatMap((team, tIdx) =>
    [0, 1, 2].map((cIdx) =>
      createCharacterState({
        id: `${team.id}-h${cIdx + 1}`,
        teamId: team.id,
        name: `${team.name} ${cIdx + 1}`,
        x: 300 + tIdx * 350 + cIdx * 60,
        y: 490,
        facing: tIdx < 2 ? 1 : -1,
      }),
    ),
  );

  const tCreate0 = performance.now();
  const world = createWorldState({
    seed: 'match-seed-01',
    mask,
    teams,
    characters,
  });
  const createMs = performance.now() - tCreate0;

  const windRoll = rollSeededWind(world);
  world.wind = windRoll.wind;
  world.rngState = windRoll.rngState;

  const checksumBefore = computeWorldChecksum(world);

  const tSer0 = performance.now();
  const snapshot = serializeWorldState(world);
  const serializeMs = performance.now() - tSer0;

  const tDeser0 = performance.now();
  const restored = deserializeWorldState(snapshot);
  const deserializeMs = performance.now() - tDeser0;

  assert.equal(computeWorldChecksum(restored), checksumBefore);
  assert.equal(restored.terrain.checksum, world.terrain.checksum);
  assert.equal(restored.rngState, world.rngState);
  assert.equal(restored.characters.length, 12);
  assert.deepEqual(restored.teams, world.teams);

  // Corrupting checksum must reject restore
  assert.throws(
    () =>
      deserializeWorldState({
        ...snapshot,
        terrain: { ...snapshot.terrain, checksum: (snapshot.terrain.checksum + 1) >>> 0 },
      }),
    /checksum mismatch/i,
  );

  // Budget sanity checks: creation and snapshot roundtrip well within server budget
  assert.ok(createMs < 200, `Expected createWorldState < 200ms, got ${createMs.toFixed(2)}ms`);
  assert.ok(serializeMs < 200, `Expected serializeWorldState < 200ms, got ${serializeMs.toFixed(2)}ms`);
  assert.ok(deserializeMs < 200, `Expected deserializeWorldState < 200ms, got ${deserializeMs.toFixed(2)}ms`);
});
