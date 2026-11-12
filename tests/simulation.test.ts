import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {
  carveCrater,
  computeWorldChecksum,
  consumeDirtyChunks,
  createCharacterState,
  createWorldState,
  DEFAULT_MAP_HEIGHT,
  DEFAULT_MAP_WIDTH,
  deserializeWorldState,
  editTerrainRect,
  getTerrainCell,
  GRAVITY_PER_TICK,
  isCoordInWater,
  loadTerrainMask,
  MAX_LAUNCH_SPEED_PER_TICK,
  MAX_WIND_ACCEL_PER_TICK,
  MS_PER_TICK,
  rollSeededWind,
  SeededRng,
  serializeWorldState,
  TERRAIN_INDESTRUCTIBLE,
  TERRAIN_SOLID,
  testCollisionX,
  testCollisionY,
  testSegmentCircleIntersection,
  sweepProjectileStep,
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

test('SIM-02: initial mask loader, edge/size validation and 32x32 chunk revision tracking', () => {
  // Edge and dimension validation
  assert.throws(() => loadTerrainMask({ width: 32, height: 128 }), /width/i);
  assert.throws(() => loadTerrainMask({ width: 128, height: 8192 }), /height/i);
  assert.throws(
    () => loadTerrainMask({ width: 64, height: 64, mask: new Uint8Array(100) }),
    /length/i,
  );
  const badMask = new Uint8Array(64 * 64);
  badMask[10] = 99;
  assert.throws(() => loadTerrainMask({ width: 64, height: 64, mask: badMask }), /invalid terrain cell/i);

  // RGBA loader with transparent, solid, and red indestructible pixels + indestructible border
  const rgba = new Uint8Array(64 * 64 * 4);
  // Set pixel (20, 20) to opaque green -> TERRAIN_SOLID
  const solidIdx = (20 * 64 + 20) * 4;
  rgba[solidIdx] = 40;
  rgba[solidIdx + 1] = 180;
  rgba[solidIdx + 2] = 60;
  rgba[solidIdx + 3] = 255;
  // Set pixel (30, 30) to opaque red -> TERRAIN_INDESTRUCTIBLE
  const redIdx = (30 * 64 + 30) * 4;
  rgba[redIdx] = 255;
  rgba[redIdx + 1] = 0;
  rgba[redIdx + 2] = 0;
  rgba[redIdx + 3] = 255;

  const terrain = loadTerrainMask({
    width: 64,
    height: 64,
    waterLine: 60,
    rgba,
    indestructibleBorder: 6,
  });

  assert.equal(terrain.revision, 0);
  assert.equal(getTerrainCell(terrain, 20, 20), TERRAIN_SOLID);
  assert.equal(getTerrainCell(terrain, 30, 30), TERRAIN_INDESTRUCTIBLE);
  assert.equal(getTerrainCell(terrain, 2, 2), TERRAIN_INDESTRUCTIBLE); // top/left border
  assert.equal(getTerrainCell(terrain, -5, 10), 0); // out-of-bounds is empty
  assert.equal(isCoordInWater(terrain, 20, 61), true);
  assert.equal(isCoordInWater(terrain, 20, 59), false);

  // Edit a rectangle crossing chunk boundary (30..35, 10..15)
  const initialChecksum = terrain.checksum;
  const edit = editTerrainRect(terrain, { x: 30, y: 10, width: 6, height: 6 }, TERRAIN_SOLID);
  assert.equal(edit.changedCells, 36);
  assert.equal(terrain.revision, 1);
  assert.notEqual(terrain.checksum, initialChecksum);
  // Spans x=30..35 (chunks x=0 and x=32) and y=10..15 (chunk y=0) -> 2 dirty chunks
  assert.equal(edit.dirtyChunks.length, 2);
  assert.deepEqual(
    edit.dirtyChunks.map((c) => [c.x, c.y, c.width, c.height]),
    [
      [0, 0, 32, 32],
      [32, 0, 32, 32],
    ],
  );

  // Repeating identical edit changes 0 cells and does not bump revision
  const noOp = editTerrainRect(terrain, { x: 30, y: 10, width: 6, height: 6 }, TERRAIN_SOLID);
  assert.equal(noOp.changedCells, 0);
  assert.equal(terrain.revision, 1);

  const consumed = consumeDirtyChunks(terrain);
  assert.equal(consumed.revision, 1);
  assert.equal(consumed.dirtyChunks.length, 2);
  assert.equal(terrain.dirtyChunks.length, 0);
});

test('SIM-03: circular crater edits match Bresenham fixture, preserve indestructible cells and handle boundaries', () => {
  const terrain = loadTerrainMask({
    width: 128,
    height: 128,
    shapes: [
      { kind: 'rect', x: 0, y: 0, width: 128, height: 128, value: TERRAIN_SOLID },
      { kind: 'rect', x: 60, y: 60, width: 20, height: 4, value: TERRAIN_INDESTRUCTIBLE },
    ],
  });

  // Fixture 1: radius 3 crater at (32, 32) in pure solid terrain
  // Bresenham circle r=3 has row widths [3, 5, 7, 7, 7, 5, 3] = 37 cells
  const r3 = carveCrater(terrain, 32, 32, 3);
  assert.equal(r3.changedCells, 37);
  assert.equal(terrain.revision, 1);
  assert.deepEqual(r3.modifiedRect, { x: 29, y: 29, width: 7, height: 7 });

  // Verify exact row widths for r=3 fixture and that no cell outside [29..35, 29..35] was cleared
  const rowCounts: number[] = [];
  for (let y = 28; y <= 36; y++) {
    let clearedInRow = 0;
    for (let x = 28; x <= 36; x++) {
      if (getTerrainCell(terrain, x, y) === 0) {
        assert.ok(x >= 29 && x <= 35 && y >= 29 && y <= 35, `Cell (${x},${y}) outside r=3 bounding box`);
        clearedInRow++;
      }
    }
    if (y >= 29 && y <= 35) rowCounts.push(clearedInRow);
  }
  assert.deepEqual(rowCounts, [3, 5, 7, 7, 7, 5, 3]);

  // Fixture 2: crater overlapping TERRAIN_INDESTRUCTIBLE strip at (64, 62) with r=6
  const rIndestructible = carveCrater(terrain, 64, 62, 6);
  assert.ok(rIndestructible.changedCells > 0);
  // Every cell in the indestructible strip [60..79, 60..63] must remain TERRAIN_INDESTRUCTIBLE
  for (let y = 60; y < 64; y++) {
    for (let x = 60; x < 80; x++) {
      assert.equal(getTerrainCell(terrain, x, y), TERRAIN_INDESTRUCTIBLE);
    }
  }

  // Fixture 3: map boundary craters and off-map / negative-radius craters must not crash
  const edgeCrater = carveCrater(terrain, 0, 0, 5);
  assert.ok(edgeCrater.changedCells > 0);
  assert.deepEqual(edgeCrater.modifiedRect, { x: 0, y: 0, width: 6, height: 6 });

  const revBeforeOffMap = terrain.revision;
  const offMap = carveCrater(terrain, -100, -100, 10);
  assert.equal(offMap.changedCells, 0);
  assert.equal(offMap.modifiedRect, null);
  assert.equal(terrain.revision, revBeforeOffMap);

  const negativeRadius = carveCrater(terrain, 50, 50, -3);
  assert.equal(negativeRadius.changedCells, 0);
  assert.equal(terrain.revision, revBeforeOffMap);
});

test('SIM-04: terrain/object collision and swept/substep projectile checks prevent tunnelling on 1px ledges', () => {
  const terrain = loadTerrainMask({
    width: 256,
    height: 256,
    shapes: [
      // 1-pixel thin horizontal ledge at y = 120, x = 40..200
      { kind: 'rect', x: 40, y: 120, width: 160, height: 1, value: TERRAIN_SOLID },
      // 1-pixel thin vertical wall at x = 180, y = 40..110
      { kind: 'rect', x: 180, y: 40, width: 1, height: 70, value: TERRAIN_INDESTRUCTIBLE },
    ],
  });

  // Directional edge collision queries at the 1px ledge
  assert.equal(testCollisionY(terrain, 100, 111, 9, 1), TERRAIN_SOLID);
  assert.equal(testCollisionY(terrain, 100, 110, 9, 1), 0);
  assert.equal(testCollisionX(terrain, 171, 70, 9, 1), TERRAIN_INDESTRUCTIBLE);
  assert.equal(testCollisionX(terrain, 170, 70, 9, 1), 0);

  // Fast downward projectile (dy = +28 wu/tick, radius = 4) starting at y = 100 must NOT tunnel through y = 120
  const verticalSweep = sweepProjectileStep({
    terrain,
    x: 100,
    y: 100,
    dx: 4,
    dy: 28,
    radius: 4,
  });
  assert.equal(verticalSweep.collided, true);
  assert.equal(verticalSweep.hitY, true);
  assert.equal(verticalSweep.terrainFlag, TERRAIN_SOLID);
  assert.ok(verticalSweep.y <= 120, `Expected projectile to stop at or above ledge y=120, got y=${verticalSweep.y}`);

  // Fast horizontal projectile (dx = +30 wu/tick, radius = 4) starting at x = 160 must NOT tunnel through 1px wall x = 180
  const horizontalSweep = sweepProjectileStep({
    terrain,
    x: 160,
    y: 70,
    dx: 30,
    dy: -2,
    radius: 4,
  });
  assert.equal(horizontalSweep.collided, true);
  assert.equal(horizontalSweep.hitX, true);
  assert.equal(horizontalSweep.terrainFlag, TERRAIN_INDESTRUCTIBLE);
  assert.ok(horizontalSweep.x <= 180, `Expected projectile to stop at or left of wall x=180, got x=${horizontalSweep.x}`);

  // Swept projectile vs character collision (ignoring shooter until clear)
  const shooter = createCharacterState({ id: 'h-shooter', teamId: 't1', name: 'Стрілець', x: 50, y: 60 });
  const target = createCharacterState({ id: 'h-target', teamId: 't2', name: 'Ціль', x: 95, y: 60 });
  const charSweep = sweepProjectileStep({
    terrain,
    characters: [shooter, target],
    x: 50,
    y: 60,
    dx: 60,
    dy: 0,
    radius: 4,
    ignoreCharacterId: 'h-shooter',
  });
  assert.equal(charSweep.collided, true);
  assert.equal(charSweep.hitCharacterId, 'h-target');
  assert.ok(charSweep.x < target.x);

  // Analytic segment-circle intersection check
  const segHit = testSegmentCircleIntersection(50, 60, 120, 60, 4, target);
  assert.equal(segHit.hit, true);
  assert.ok(Math.abs(segHit.hitX - (95 - (9 + 4))) < 1e-6);
});
