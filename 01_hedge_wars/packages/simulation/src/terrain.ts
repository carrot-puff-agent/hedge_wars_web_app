/**
 * Terrain mask loader, dirty chunk/rectangle revision tracking (SIM-02),
 * and Bresenham circular crater carving (SIM-03).
 *
 * Provenance for circular crater algorithm (carveCrater / fillCircleLines):
 * - Ported from upstream Hedgewars `hedgewars/uLandGraphics.pas` (`FillRoundInLand`, `FillCircleLines`,
 *   lines 319-375) at commit `54437aa1a9078f77b0103f1df0aa81f4edc1be05` (GPL-2.0).
 * - Adapted to 1-byte cell mask (`TERRAIN_EMPTY = 0`, `TERRAIN_SOLID = 1`, `TERRAIN_INDESTRUCTIBLE = 2`)
 *   with dirty 32x32 chunk tracking and FNV-1a checksum updates.
 */

import {
  computeMaskChecksum,
  type DirtyRect,
  type TerrainState,
  validateMapDimensions,
} from './state';
import {
  DEFAULT_MAP_HEIGHT,
  DEFAULT_MAP_WIDTH,
  DIRTY_CHUNK_SIZE,
  TERRAIN_EMPTY,
  TERRAIN_INDESTRUCTIBLE,
  TERRAIN_SOLID,
} from './units';

export type TerrainShape =
  | { kind: 'rect'; x: number; y: number; width: number; height: number; value: number }
  | { kind: 'circle'; x: number; y: number; radius: number; value: number };

export interface MaskLoadOptions {
  width?: number;
  height?: number;
  waterLine?: number;
  mask?: Uint8Array;
  rgba?: Uint8Array;
  alphaThreshold?: number;
  indestructibleBorder?: number;
  shapes?: readonly TerrainShape[];
}

export interface TerrainEditResult {
  changedCells: number;
  revision: number;
  checksum: number;
  modifiedRect: DirtyRect | null;
  dirtyChunks: DirtyRect[];
}

export function isValidCellValue(value: number): boolean {
  return (
    value === TERRAIN_EMPTY ||
    value === TERRAIN_SOLID ||
    value === TERRAIN_INDESTRUCTIBLE
  );
}

/**
 * Loads and validates an initial terrain mask from raw bytes, RGBA pixel data, or geometric shapes.
 */
export function loadTerrainMask(options: MaskLoadOptions = {}): TerrainState {
  const width = options.width ?? DEFAULT_MAP_WIDTH;
  const height = options.height ?? DEFAULT_MAP_HEIGHT;
  const waterLine = options.waterLine ?? height;
  validateMapDimensions(width, height, waterLine);

  const totalCells = width * height;
  const mask = new Uint8Array(totalCells);

  if (options.mask && options.rgba) {
    throw new Error('Specify either mask or rgba in loadTerrainMask, not both');
  }

  if (options.mask) {
    if (options.mask.length !== totalCells) {
      throw new RangeError(
        `Mask byte length ${options.mask.length} does not match ${width}x${height} (${totalCells})`,
      );
    }
    for (let i = 0; i < totalCells; i++) {
      const cell = options.mask[i]!;
      if (!isValidCellValue(cell)) {
        throw new RangeError(`Invalid terrain cell byte ${cell} at index ${i}`);
      }
      mask[i] = cell;
    }
  } else if (options.rgba) {
    const expectedRgbaLength = totalCells * 4;
    if (options.rgba.length !== expectedRgbaLength) {
      throw new RangeError(
        `RGBA byte length ${options.rgba.length} does not match ${width}x${height}x4 (${expectedRgbaLength})`,
      );
    }
    const alphaThreshold = options.alphaThreshold ?? 128;
    for (let i = 0; i < totalCells; i++) {
      const base = i * 4;
      const r = options.rgba[base]!;
      const g = options.rgba[base + 1]!;
      const b = options.rgba[base + 2]!;
      const a = options.rgba[base + 3]!;
      if (a < alphaThreshold) {
        mask[i] = TERRAIN_EMPTY;
      } else if (r >= 200 && g <= 64 && b <= 64) {
        // Upstream mask.png convention: red = lfIndestructible
        mask[i] = TERRAIN_INDESTRUCTIBLE;
      } else {
        mask[i] = TERRAIN_SOLID;
      }
    }
  }

  if (options.shapes) {
    for (const shape of options.shapes) {
      if (!isValidCellValue(shape.value)) {
        throw new RangeError(`Invalid shape cell value ${shape.value}`);
      }
      if (shape.kind === 'rect') {
        const x0 = Math.max(0, Math.floor(shape.x));
        const y0 = Math.max(0, Math.floor(shape.y));
        const x1 = Math.min(width, Math.floor(shape.x + shape.width));
        const y1 = Math.min(height, Math.floor(shape.y + shape.height));
        for (let y = y0; y < y1; y++) {
          mask.fill(shape.value, y * width + x0, y * width + x1);
        }
      } else if (shape.kind === 'circle') {
        applyBresenhamCircleToBuffer(
          mask,
          width,
          height,
          Math.round(shape.x),
          Math.round(shape.y),
          Math.round(shape.radius),
          shape.value,
          true,
        );
      }
    }
  }

  if (options.indestructibleBorder !== undefined) {
    const border = options.indestructibleBorder;
    if (!Number.isInteger(border) || border < 0 || border * 2 >= Math.min(width, height)) {
      throw new RangeError(`Invalid indestructibleBorder ${border}`);
    }
    if (border > 0) {
      // Top, left, and right borders (matching uConsts.pas gfBorder / cBorderWidth = 6)
      for (let y = 0; y < border; y++) {
        mask.fill(TERRAIN_INDESTRUCTIBLE, y * width, (y + 1) * width);
      }
      for (let y = border; y < height; y++) {
        const rowStart = y * width;
        mask.fill(TERRAIN_INDESTRUCTIBLE, rowStart, rowStart + border);
        mask.fill(TERRAIN_INDESTRUCTIBLE, rowStart + width - border, rowStart + width);
      }
    }
  }

  return {
    width,
    height,
    waterLine,
    revision: 0,
    checksum: computeMaskChecksum(mask),
    mask,
    dirtyChunks: [],
  };
}

export function getTerrainCell(terrain: TerrainState, x: number, y: number): number {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || ix >= terrain.width || iy < 0 || iy >= terrain.height) {
    return TERRAIN_EMPTY;
  }
  return terrain.mask[iy * terrain.width + ix]!;
}

export function isTerrainSolid(terrain: TerrainState, x: number, y: number): boolean {
  return getTerrainCell(terrain, x, y) !== TERRAIN_EMPTY;
}

export function isTerrainIndestructible(terrain: TerrainState, x: number, y: number): boolean {
  return getTerrainCell(terrain, x, y) === TERRAIN_INDESTRUCTIBLE;
}

/**
 * Checks whether a world coordinate is in water (below waterLine, matching uCollisions.pas CheckCoordInWater).
 */
export function isCoordInWater(terrain: TerrainState, x: number, y: number, seaEdges = false): boolean {
  if (y > terrain.waterLine) return true;
  if (seaEdges && (x < 0 || x >= terrain.width)) return true;
  return false;
}

/**
 * Computes deduplicated 32x32 chunk rectangles intersecting a pixel bounding rectangle,
 * clipped to map bounds, and merges them into terrain.dirtyChunks.
 */
export function recordDirtyChunks(
  terrain: TerrainState,
  minX: number,
  minY: number,
  maxXInclusive: number,
  maxYInclusive: number,
): DirtyRect[] {
  const clampedMinX = Math.max(0, Math.min(terrain.width - 1, minX));
  const clampedMinY = Math.max(0, Math.min(terrain.height - 1, minY));
  const clampedMaxX = Math.max(0, Math.min(terrain.width - 1, maxXInclusive));
  const clampedMaxY = Math.max(0, Math.min(terrain.height - 1, maxYInclusive));
  if (clampedMinX > clampedMaxX || clampedMinY > clampedMaxY) {
    return [];
  }

  const startChunkX = Math.floor(clampedMinX / DIRTY_CHUNK_SIZE);
  const endChunkX = Math.floor(clampedMaxX / DIRTY_CHUNK_SIZE);
  const startChunkY = Math.floor(clampedMinY / DIRTY_CHUNK_SIZE);
  const endChunkY = Math.floor(clampedMaxY / DIRTY_CHUNK_SIZE);

  const existingKeys = new Set(terrain.dirtyChunks.map((c) => `${c.x},${c.y}`));
  const addedChunks: DirtyRect[] = [];

  for (let cy = startChunkY; cy <= endChunkY; cy++) {
    for (let cx = startChunkX; cx <= endChunkX; cx++) {
      const x = cx * DIRTY_CHUNK_SIZE;
      const y = cy * DIRTY_CHUNK_SIZE;
      const width = Math.min(DIRTY_CHUNK_SIZE, terrain.width - x);
      const height = Math.min(DIRTY_CHUNK_SIZE, terrain.height - y);
      const rect: DirtyRect = { x, y, width, height };
      addedChunks.push(rect);
      const key = `${x},${y}`;
      if (!existingKeys.has(key)) {
        existingKeys.add(key);
        terrain.dirtyChunks.push(rect);
      }
    }
  }
  return addedChunks;
}

/**
 * Returns and clears accumulated dirty chunks on the terrain state.
 */
export function consumeDirtyChunks(terrain: TerrainState): {
  revision: number;
  checksum: number;
  dirtyChunks: DirtyRect[];
} {
  const dirtyChunks = terrain.dirtyChunks.map((chunk) => ({ ...chunk }));
  terrain.dirtyChunks = [];
  return {
    revision: terrain.revision,
    checksum: terrain.checksum,
    dirtyChunks,
  };
}

function applyBresenhamCircleToBuffer(
  mask: Uint8Array,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  radius: number,
  targetValue: number,
  overrideIndestructible: boolean,
): {
  changedCells: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let changedCells = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  if (radius < 0) {
    return { changedCells: 0, minX, minY, maxX, maxY };
  }

  const fillHorizontalSpan = (rowY: number, xStart: number, xEnd: number) => {
    if (rowY < 0 || rowY >= height) return;
    const clampedStart = Math.max(0, xStart);
    const clampedEnd = Math.min(width - 1, xEnd);
    if (clampedStart > clampedEnd) return;
    const rowOffset = rowY * width;
    for (let x = clampedStart; x <= clampedEnd; x++) {
      const idx = rowOffset + x;
      const current = mask[idx]!;
      if (!overrideIndestructible && current === TERRAIN_INDESTRUCTIBLE) {
        continue;
      }
      if (current !== targetValue) {
        mask[idx] = targetValue;
        changedCells++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (rowY < minY) minY = rowY;
        if (rowY > maxY) maxY = rowY;
      }
    }
  };

  const fillCircleSegment = (dx: number, dy: number) => {
    fillHorizontalSpan(centerY + dy, centerX - dx, centerX + dx);
    fillHorizontalSpan(centerY - dy, centerX - dx, centerX + dx);
    fillHorizontalSpan(centerY + dx, centerX - dy, centerX + dy);
    fillHorizontalSpan(centerY - dx, centerX - dy, centerX + dy);
  };

  // Ported from FillRoundInLand in hedgewars/uLandGraphics.pas (lines 354-375)
  let dx = 0;
  let dy = radius;
  let d = 3 - 2 * radius;
  while (dx < dy) {
    fillCircleSegment(dx, dy);
    if (d < 0) {
      d = d + 4 * dx + 6;
    } else {
      d = d + 4 * (dx - dy) + 10;
      dy--;
    }
    dx++;
  }
  if (dx === dy) {
    fillCircleSegment(dx, dy);
  }

  return { changedCells, minX, minY, maxX, maxY };
}

/**
 * Carves a circular crater in the terrain mask (ported from FillRoundInLand / DrawExplosion
 * in hedgewars/uLandGraphics.pas).
 * Indestructible cells (TERRAIN_INDESTRUCTIBLE) are preserved.
 * Increments revision, updates checksum, and records dirty 32x32 chunks only when cells change.
 */
export function carveCrater(
  terrain: TerrainState,
  centerX: number,
  centerY: number,
  radius: number,
): TerrainEditResult {
  const cx = Math.round(centerX);
  const cy = Math.round(centerY);
  const r = Math.round(radius);

  const { changedCells, minX, minY, maxX, maxY } = applyBresenhamCircleToBuffer(
    terrain.mask,
    terrain.width,
    terrain.height,
    cx,
    cy,
    r,
    TERRAIN_EMPTY,
    false,
  );

  if (changedCells === 0) {
    return {
      changedCells: 0,
      revision: terrain.revision,
      checksum: terrain.checksum,
      modifiedRect: null,
      dirtyChunks: [],
    };
  }

  terrain.revision += 1;
  terrain.checksum = computeMaskChecksum(terrain.mask);
  const modifiedRect: DirtyRect = {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
  const dirtyChunks = recordDirtyChunks(terrain, minX, minY, maxX, maxY);

  return {
    changedCells,
    revision: terrain.revision,
    checksum: terrain.checksum,
    modifiedRect,
    dirtyChunks,
  };
}

/**
 * Edits a bounded rectangular region of terrain, respecting TERRAIN_INDESTRUCTIBLE by default.
 */
export function editTerrainRect(
  terrain: TerrainState,
  rect: DirtyRect,
  targetValue: number,
  overrideIndestructible = false,
): TerrainEditResult {
  if (!isValidCellValue(targetValue)) {
    throw new RangeError(`Invalid terrain cell value ${targetValue}`);
  }
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(terrain.width - 1, Math.floor(rect.x + rect.width - 1));
  const y1 = Math.min(terrain.height - 1, Math.floor(rect.y + rect.height - 1));

  let changedCells = 0;
  let minX = terrain.width;
  let minY = terrain.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = y0; y <= y1; y++) {
    const rowOffset = y * terrain.width;
    for (let x = x0; x <= x1; x++) {
      const idx = rowOffset + x;
      const current = terrain.mask[idx]!;
      if (!overrideIndestructible && current === TERRAIN_INDESTRUCTIBLE) {
        continue;
      }
      if (current !== targetValue) {
        terrain.mask[idx] = targetValue;
        changedCells++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (changedCells === 0) {
    return {
      changedCells: 0,
      revision: terrain.revision,
      checksum: terrain.checksum,
      modifiedRect: null,
      dirtyChunks: [],
    };
  }

  terrain.revision += 1;
  terrain.checksum = computeMaskChecksum(terrain.mask);
  const modifiedRect: DirtyRect = {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
  const dirtyChunks = recordDirtyChunks(terrain, minX, minY, maxX, maxY);

  return {
    changedCells,
    revision: terrain.revision,
    checksum: terrain.checksum,
    modifiedRect,
    dirtyChunks,
  };
}
