import { testCollisionY } from './collision';
import { computeMaskChecksum, type TerrainState } from './state';
import { loadTerrainMask, type TerrainShape } from './terrain';
import {
  DEFAULT_MAP_HEIGHT,
  DEFAULT_MAP_WIDTH,
  HEDGEHOG_RADIUS,
  TERRAIN_EMPTY,
  TERRAIN_INDESTRUCTIBLE,
  TERRAIN_SOLID,
} from './units';

export interface CuratedSpawnPoint {
  x: number;
  y: number;
  facing: -1 | 1;
}

export interface CuratedMapManifest {
  id: string;
  titleUk: string;
  descriptionUk: string;
  width: number;
  height: number;
  waterLine: number;
  contentHash: string;
  shapes: readonly TerrainShape[];
  /** Up to 8 team spawn groups, each supporting up to 4 characters interleaved across the island. */
  teamSpawns: readonly (readonly CuratedSpawnPoint[])[];
}

export const CURATED_MAP_MEADOW: CuratedMapManifest = {
  id: 'meadow-boulders',
  titleUk: 'Сонячна галявина',
  descriptionUk: 'Два мальовничі пагорби, камінний місток і глибока водойма навколо острова.',
  width: DEFAULT_MAP_WIDTH,
  height: DEFAULT_MAP_HEIGHT,
  waterLine: 940,
  contentHash: 'meadow-boulders-v1-2048x1024',
  shapes: [
    // Main left and right hills
    { kind: 'circle', x: 560, y: 880, radius: 340, value: TERRAIN_SOLID },
    { kind: 'circle', x: 1488, y: 880, radius: 340, value: TERRAIN_SOLID },
    // Central connecting saddle and upper plateau
    { kind: 'rect', x: 520, y: 690, width: 1008, height: 250, value: TERRAIN_SOLID },
    { kind: 'circle', x: 1024, y: 740, radius: 220, value: TERRAIN_SOLID },
    // Left and right outer terraces
    { kind: 'rect', x: 220, y: 720, width: 320, height: 220, value: TERRAIN_SOLID },
    { kind: 'rect', x: 1508, y: 720, width: 320, height: 220, value: TERRAIN_SOLID },
    // Carve scenic archways / craters for cover
    { kind: 'circle', x: 820, y: 690, radius: 75, value: TERRAIN_EMPTY },
    { kind: 'circle', x: 1228, y: 690, radius: 75, value: TERRAIN_EMPTY },
    // Flatten top ledges for stable character footing
    { kind: 'rect', x: 250, y: 650, width: 220, height: 70, value: TERRAIN_EMPTY },
    { kind: 'rect', x: 450, y: 500, width: 240, height: 60, value: TERRAIN_EMPTY },
    { kind: 'rect', x: 924, y: 480, width: 200, height: 60, value: TERRAIN_EMPTY },
    { kind: 'rect', x: 1358, y: 500, width: 240, height: 60, value: TERRAIN_EMPTY },
    { kind: 'rect', x: 1578, y: 650, width: 220, height: 70, value: TERRAIN_EMPTY },
    // Indestructible ancient stone anchors near the base
    { kind: 'rect', x: 460, y: 860, width: 180, height: 60, value: TERRAIN_INDESTRUCTIBLE },
    { kind: 'rect', x: 934, y: 840, width: 180, height: 70, value: TERRAIN_INDESTRUCTIBLE },
    { kind: 'rect', x: 1408, y: 860, width: 180, height: 60, value: TERRAIN_INDESTRUCTIBLE },
  ],
  teamSpawns: [
    [
      { x: 520, y: 530, facing: 1 },
      { x: 310, y: 690, facing: 1 },
      { x: 960, y: 510, facing: 1 },
      { x: 710, y: 660, facing: 1 },
    ],
    [
      { x: 1528, y: 530, facing: -1 },
      { x: 1738, y: 690, facing: -1 },
      { x: 1088, y: 510, facing: -1 },
      { x: 1338, y: 660, facing: -1 },
    ],
    [
      { x: 620, y: 530, facing: 1 },
      { x: 1420, y: 530, facing: -1 },
      { x: 470, y: 530, facing: 1 },
      { x: 1640, y: 690, facing: -1 },
    ],
    [
      { x: 1428, y: 530, facing: -1 },
      { x: 628, y: 530, facing: 1 },
      { x: 1578, y: 530, facing: -1 },
      { x: 408, y: 690, facing: 1 },
    ],
    [
      { x: 990, y: 510, facing: 1 },
      { x: 560, y: 530, facing: 1 },
      { x: 1480, y: 530, facing: -1 },
      { x: 270, y: 690, facing: 1 },
    ],
    [
      { x: 1058, y: 510, facing: -1 },
      { x: 1490, y: 530, facing: -1 },
      { x: 570, y: 530, facing: 1 },
      { x: 1778, y: 690, facing: -1 },
    ],
    [
      { x: 495, y: 530, facing: 1 },
      { x: 1024, y: 510, facing: 1 },
      { x: 1385, y: 530, facing: -1 },
      { x: 355, y: 690, facing: 1 },
    ],
    [
      { x: 1553, y: 530, facing: -1 },
      { x: 1024, y: 510, facing: -1 },
      { x: 663, y: 530, facing: 1 },
      { x: 1693, y: 690, facing: -1 },
    ],
  ],
};

export const CURATED_MAPS: Record<string, CuratedMapManifest> = {
  [CURATED_MAP_MEADOW.id]: CURATED_MAP_MEADOW,
};

/**
 * Finds the exact grounded y coordinate at `x` by scanning downward from `startY`
 * until the character circle contacts solid ground.
 */
export function resolveSpawnPoint(
  terrain: TerrainState,
  spawn: CuratedSpawnPoint,
  radius: number = HEDGEHOG_RADIUS,
): CuratedSpawnPoint {
  let y = Math.max(radius + 4, Math.min(terrain.waterLine - radius - 2, Math.round(spawn.y)));
  // Move upward if initially embedded in terrain
  while (y > radius + 4 && testCollisionY(terrain, spawn.x, y, radius, 1) !== 0) {
    y -= 1;
  }
  // Drop downward until feet touch solid terrain
  while (
    y < terrain.waterLine - radius - 2 &&
    testCollisionY(terrain, spawn.x, y + 1, radius, 1) === 0
  ) {
    y += 1;
  }
  return { x: Math.round(spawn.x), y, facing: spawn.facing };
}

/**
 * Builds the initial TerrainState for a curated map.
 */
export function buildCuratedMapTerrain(mapId: string = CURATED_MAP_MEADOW.id): {
  manifest: CuratedMapManifest;
  terrain: TerrainState;
  initialChecksum: number;
} {
  const manifest = CURATED_MAPS[mapId];
  if (!manifest) {
    throw new Error(`Unknown curated map ID: ${mapId}`);
  }
  const terrain = loadTerrainMask({
    width: manifest.width,
    height: manifest.height,
    waterLine: manifest.waterLine,
    shapes: manifest.shapes,
  });
  return {
    manifest,
    terrain,
    initialChecksum: computeMaskChecksum(terrain.mask),
  };
}
