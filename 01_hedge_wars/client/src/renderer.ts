import Phaser from 'phaser';
import {
  GRAVITY_PER_TICK,
  MAX_LAUNCH_SPEED_PER_TICK,
  MAX_POWER,
  MAX_SPEED_PER_TICK,
  TERRAIN_EMPTY,
  TERRAIN_INDESTRUCTIBLE,
  buildCuratedMapTerrain,
  type ProjectileState,
  type SimulationEvent,
  type TeamState,
  type TerrainState,
  type WorldState,
} from '@yizhaklub/hedge-simulation';

const ROOM_SKY_TOP_Y = -180;
const ROOM_WATER_BOTTOM_PAD = 100;
const TOTAL_TRAJECTORY_TICKS = 75;

export interface LocalAimFeedback {
  characterId: string;
  angleDeg: number;
  facing: -1 | 1;
  chargePower: number | null;
}

interface InterpolatedPos {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
}

const TEAM_HELMET_COLORS = [
  0x8ec922,
  0x3094f0,
  0xe8523a,
  0x9c56e8,
  0xebb41e,
  0x1ab8a0,
  0xe04896,
  0xf27d24,
  0x485ce0,
  0xb52b47,
] as const;

const TEAM_TEXT_HEX = [
  '#b8f23a',
  '#63b8ff',
  '#ff8364',
  '#cf9bff',
  '#ffe052',
  '#4af2d8',
  '#ff85c2',
  '#ffa652',
  '#8c9eff',
  '#ff6b8b',
] as const;

export function createMatchRenderer(
  parent: string,
  options?: {
    onSlingshotAim?: (angleDeg: number, facing: -1 | 1, power: number | null) => void;
    onSlingshotReleaseFire?: (angleDeg: number, facing: -1 | 1, power: number) => void;
  },
) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const initialMap = buildCuratedMapTerrain();

  const terrainCanvas = document.createElement('canvas');
  terrainCanvas.width = initialMap.terrain.width;
  terrainCanvas.height = initialMap.terrain.height;
  const terrainCtx = terrainCanvas.getContext('2d')!;
  let terrainImageData = terrainCtx.createImageData(terrainCanvas.width, terrainCanvas.height);

  function renderTerrainRegion(
    terrain: TerrainState,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    scorchCenter?: { x: number; y: number; radius: number },
  ): void {
    const w = terrain.width;
    const h = terrain.height;
    const mask = terrain.mask;
    const data = terrainImageData.data;

    const x0 = Math.max(0, Math.floor(minX));
    const y0 = Math.max(0, Math.floor(minY));
    const x1 = Math.min(w - 1, Math.ceil(maxX));
    const y1 = Math.min(h - 1, Math.ceil(maxY));

    const scorchRMinSq = scorchCenter ? scorchCenter.radius * scorchCenter.radius : -1;
    const scorchRMaxSq = scorchCenter
      ? (scorchCenter.radius + 5) * (scorchCenter.radius + 5)
      : -1;

    for (let y = y0; y <= y1; y++) {
      const rowOffset = y * w;
      for (let x = x0; x <= x1; x++) {
        const cellIdx = rowOffset + x;
        const cell = mask[cellIdx]!;
        const pIdx = cellIdx * 4;

        if (cell === TERRAIN_EMPTY) {
          data[pIdx] = 0;
          data[pIdx + 1] = 0;
          data[pIdx + 2] = 0;
          data[pIdx + 3] = 0;
          continue;
        }

        if (cell === TERRAIN_INDESTRUCTIBLE) {
          const grain = ((x * 13 + y * 7) & 7) - 3;
          data[pIdx] = 214 + grain;
          data[pIdx + 1] = 186 + grain;
          data[pIdx + 2] = 132 + grain;
          data[pIdx + 3] = 255;
          continue;
        }

        // Sunny beach sand & grassy top crust inspired by sample screenshot
        const emptyAbove1 = y >= 2 ? mask[(y - 2) * w + x] === TERRAIN_EMPTY : true;
        const emptyAbove2 = y >= 7 ? mask[(y - 7) * w + x] === TERRAIN_EMPTY : true;
        const emptyBelow = y + 2 < h ? mask[(y + 2) * w + x] === TERRAIN_EMPTY : false;
        const emptySide =
          (x >= 2 && mask[rowOffset + x - 2] === TERRAIN_EMPTY) ||
          (x + 2 < w && mask[rowOffset + x + 2] === TERRAIN_EMPTY);

        let r = 232;
        let g = 206;
        let b = 152;

        if (emptyAbove1) {
          r = 98;
          g = 158;
          b = 62;
        } else if (emptyAbove2) {
          r = 242;
          g = 220;
          b = 168;
        } else if (emptyBelow || emptySide) {
          r = 168;
          g = 136;
          b = 92;
        } else {
          const pebble = ((x * 17 + y * 11) & 15) - 7;
          r = 228 + pebble;
          g = 200 + pebble;
          b = 146 + pebble;
        }

        if (scorchCenter) {
          const dx = x - scorchCenter.x;
          const dy = y - scorchCenter.y;
          const dSq = dx * dx + dy * dy;
          if (dSq >= scorchRMinSq && dSq <= scorchRMaxSq) {
            r = Math.max(45, r - 95);
            g = Math.max(38, g - 85);
            b = Math.max(30, b - 70);
          }
        }

        data[pIdx] = r;
        data[pIdx + 1] = g;
        data[pIdx + 2] = b;
        data[pIdx + 3] = 255;
      }
    }

    terrainCtx.putImageData(terrainImageData, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  }

  renderTerrainRegion(
    initialMap.terrain,
    0,
    0,
    initialMap.terrain.width - 1,
    initialMap.terrain.height - 1,
  );

  class MatchFieldScene extends Phaser.Scene {
    private canvasTex?: Phaser.Textures.CanvasTexture;
    private entityGraphics?: Phaser.GameObjects.Graphics;
    private waterGraphics?: Phaser.GameObjects.Graphics;
    private labelPool = new Map<string, Phaser.GameObjects.Text>();
    private currentWorld: WorldState | null = null;
    private localAim: LocalAimFeedback | null = null;
    private readonly charPositions = new Map<string, InterpolatedPos>();
    private readonly projPositions = new Map<string, InterpolatedPos>();
    private overviewMode = false;
    private userZoomOverride: number | null = null;
    private manualPanUntilMs = 0;
    private actionFocusPoint: { x: number; y: number } | null = null;
    private actionHoldUntilMs = 0;
    private trackedThrownCharId: string | null = null;
    private readonly activeTouchPoints = new Map<number, { x: number; y: number }>();
    private dragState:
      | {
          mode: 'pan';
          pointerId: number;
          startX: number;
          startY: number;
          scrollX: number;
          scrollY: number;
        }
      | {
          mode: 'aim';
          pointerId: number;
          angleDeg: number;
          facing: -1 | 1;
          power: number | null;
          pullWorldX: number;
          pullWorldY: number;
        }
      | {
          mode: 'pinch';
          startDist: number;
          startZoom: number;
        }
      | null = null;
    private dirtyChunkUpdateCount = 0;

    create() {
      const worldW = initialMap.terrain.width;
      const worldH = initialMap.terrain.height;
      const totalRoomH = worldH - ROOM_SKY_TOP_Y + ROOM_WATER_BOTTOM_PAD;

      // Bright clear blue sky and soft cartoon clouds matching gameplay ui sample.jpg
      const bg = this.add.graphics();
      bg.fillGradientStyle(0x6ab3e8, 0x6ab3e8, 0xc4e5f8, 0xc4e5f8, 1);
      bg.fillRect(0, ROOM_SKY_TOP_Y, worldW, totalRoomH);

      // Soft puffy clouds
      bg.fillStyle(0xe8f5fc, 0.85)
        .fillEllipse(420, 140, 340, 52)
        .fillCircle(370, 122, 42)
        .fillCircle(450, 118, 52)
        .fillCircle(520, 128, 36);
      bg.fillStyle(0xe8f5fc, 0.82)
        .fillEllipse(1180, 210, 220, 42)
        .fillCircle(1150, 196, 34)
        .fillCircle(1210, 194, 38);
      bg.fillStyle(0xe8f5fc, 0.85)
        .fillEllipse(1680, 130, 310, 48)
        .fillCircle(1630, 112, 44)
        .fillCircle(1710, 114, 48);

      // Distant soft island silhouettes
      bg.fillStyle(0x9ad0ee, 0.55).fillTriangle(120, 940, 380, 680, 660, 940);
      bg.fillStyle(0x8fc7e8, 0.5).fillTriangle(1380, 940, 1680, 660, 1980, 940);

      this.canvasTex = this.textures.addCanvas('terrain-canvas', terrainCanvas)!;
      this.add.image(0, 0, 'terrain-canvas').setOrigin(0, 0);

      this.entityGraphics = this.add.graphics();
      this.waterGraphics = this.add.graphics();

      this.cameras.main.setBounds(0, ROOM_SKY_TOP_Y, worldW, totalRoomH);
      this.applyResponsiveZoom(true);
      this.cameras.main.centerOn(760, 680);

      this.scale.on('resize', () => {
        if (this.userZoomOverride !== null) {
          this.userZoomOverride = Math.max(this.getMinRoomZoom(), this.userZoomOverride);
        }
        this.applyResponsiveZoom(false);
      });

      // Mouse wheel zoom support (clamped so zoom-out stops when room edges reach screen sides)
      this.input.on(
        'wheel',
        (_pointer: Phaser.Input.Pointer, _objs: unknown[], _dx: number, dy: number) => {
          const factor = dy > 0 ? 0.92 : 1.08;
          const minZoom = this.getMinRoomZoom();
          const nextZoom = Phaser.Math.Clamp(this.cameras.main.zoom * factor, minZoom, 1.65);
          this.userZoomOverride = nextZoom;
          this.cameras.main.setZoom(nextZoom);
        },
      );

      // Multitouch gesture handling:
      // - 2 fingers: pinch zoom (stops at room edges)
      // - 1 finger on active character + move: smooth Angry Birds pull-back aiming, release fires
      // - 1 finger elsewhere + move: screen pan
      this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        this.activeTouchPoints.set(pointer.id, { x: pointer.x, y: pointer.y });

        if (this.activeTouchPoints.size >= 2) {
          const pts = Array.from(this.activeTouchPoints.values());
          const dist = Math.max(10, Math.hypot(pts[1]!.x - pts[0]!.x, pts[1]!.y - pts[0]!.y));
          if (this.dragState?.mode === 'aim') {
            options?.onSlingshotAim?.(this.dragState.angleDeg, this.dragState.facing, null);
          }
          this.dragState = {
            mode: 'pinch',
            startDist: dist,
            startZoom: this.cameras.main.zoom,
          };
          return;
        }

        if (this.currentWorld && this.localAim) {
          const activePos = this.getAuthoritativeOrInterpolatedCharPos(this.localAim.characterId);
          if (activePos) {
            const worldPt = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
            if (Math.hypot(worldPt.x - activePos.x, worldPt.y - activePos.y) <= 85) {
              this.dragState = {
                mode: 'aim',
                pointerId: pointer.id,
                angleDeg: this.localAim.angleDeg,
                facing: this.localAim.facing,
                power: null,
                pullWorldX: worldPt.x,
                pullWorldY: worldPt.y,
              };
              return;
            }
          }
        }

        this.dragState = {
          mode: 'pan',
          pointerId: pointer.id,
          startX: pointer.x,
          startY: pointer.y,
          scrollX: this.cameras.main.scrollX,
          scrollY: this.cameras.main.scrollY,
        };
      });

      this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        if (this.activeTouchPoints.has(pointer.id)) {
          this.activeTouchPoints.set(pointer.id, { x: pointer.x, y: pointer.y });
        }
        if (!pointer.isDown || !this.dragState) return;

        if (this.dragState.mode === 'pinch' && this.activeTouchPoints.size >= 2) {
          const pts = Array.from(this.activeTouchPoints.values());
          const dist = Math.max(10, Math.hypot(pts[1]!.x - pts[0]!.x, pts[1]!.y - pts[0]!.y));
          const minZoom = this.getMinRoomZoom();
          const nextZoom = Phaser.Math.Clamp(
            this.dragState.startZoom * (dist / this.dragState.startDist),
            minZoom,
            1.65,
          );
          this.userZoomOverride = nextZoom;
          this.cameras.main.setZoom(nextZoom);
          return;
        }

        if (
          this.dragState.mode === 'aim' &&
          this.dragState.pointerId === pointer.id &&
          this.localAim
        ) {
          const activePos = this.getAuthoritativeOrInterpolatedCharPos(this.localAim.characterId);
          if (activePos) {
            const worldPt = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
            this.updateSlingshotFromWorldPoint(activePos, worldPt.x, worldPt.y);
          }
          return;
        }

        if (this.dragState.mode === 'pan' && this.dragState.pointerId === pointer.id) {
          const dx = pointer.x - this.dragState.startX;
          const dy = pointer.y - this.dragState.startY;
          if (Math.hypot(dx, dy) > 6) {
            this.manualPanUntilMs = performance.now() + 4500;
            const zoom = this.cameras.main.zoom;
            this.cameras.main.scrollX = this.dragState.scrollX - dx / zoom;
            this.cameras.main.scrollY = this.dragState.scrollY - dy / zoom;
          }
        }
      });

      const handlePointerRelease = (pointer: Phaser.Input.Pointer, cancelled: boolean) => {
        this.activeTouchPoints.delete(pointer.id);
        if (!this.dragState) return;

        if (this.dragState.mode === 'aim' && this.dragState.pointerId === pointer.id) {
          const { angleDeg, facing, power } = this.dragState;
          this.dragState = null;
          if (!cancelled && power !== null && power >= 120) {
            options?.onSlingshotReleaseFire?.(angleDeg, facing, power);
          } else {
            options?.onSlingshotAim?.(angleDeg, facing, null);
          }
          return;
        }

        if (this.activeTouchPoints.size === 0) {
          this.dragState = null;
        }
      };

      this.input.on('pointerup', (pointer: Phaser.Input.Pointer) =>
        handlePointerRelease(pointer, false),
      );
      this.input.on('pointerupoutside', (pointer: Phaser.Input.Pointer) =>
        handlePointerRelease(pointer, false),
      );

      this.game.canvas.setAttribute('aria-hidden', 'true');
    }

    private getAuthoritativeOrInterpolatedCharPos(
      charId: string,
    ): { x: number; y: number } | null {
      const auth = this.currentWorld?.characters.find((c) => c.id === charId);
      if (auth) return { x: auth.x, y: auth.y };
      const interp = this.charPositions.get(charId);
      return interp ? { x: interp.x, y: interp.y } : null;
    }

    /**
     * Minimum zoom so zooming out stops immediately when the room edges reach the screen sides.
     */
    private getMinRoomZoom(): number {
      const worldW = this.currentWorld?.terrain.width ?? initialMap.terrain.width;
      const worldH = this.currentWorld?.terrain.height ?? initialMap.terrain.height;
      const totalRoomH = worldH - ROOM_SKY_TOP_Y + ROOM_WATER_BOTTOM_PAD;
      const viewW = this.scale.width || window.innerWidth || 960;
      const viewH = this.scale.height || window.innerHeight || 540;
      return Math.max(viewW / worldW, viewH / totalRoomH);
    }

    /**
     * Smooth continuous Angry Birds slingshot mechanics:
     * Pull away from the character; launch trajectory points in the opposite direction.
     * No integer grid rounding — angleDeg and power vary smoothly with sub-degree precision.
     */
    private updateSlingshotFromWorldPoint(
      charPos: { x: number; y: number },
      worldX: number,
      worldY: number,
    ): void {
      if (!this.dragState || this.dragState.mode !== 'aim') return;
      const pullDx = worldX - charPos.x;
      const pullDy = worldY - charPos.y;
      const pullDist = Math.hypot(pullDx, pullDy);

      this.dragState.pullWorldX = worldX;
      this.dragState.pullWorldY = worldY;

      if (pullDist < 10) {
        this.dragState.power = null;
        options?.onSlingshotAim?.(this.dragState.angleDeg, this.dragState.facing, null);
        return;
      }

      // Opposite direction of pull is the launch vector
      const launchDx = -pullDx;
      const elevationUp = pullDy;
      const facing: -1 | 1 = launchDx >= 0 ? 1 : -1;
      const rawDeg = (Math.atan2(elevationUp, Math.abs(launchDx)) * 180) / Math.PI;
      const clampedDeg = Math.max(-85, Math.min(85, rawDeg));

      const maxPullDist = 150;
      const ratio = Math.min(1, (pullDist - 10) / (maxPullDist - 10));
      const power = 120 + ratio * 880;

      this.dragState.angleDeg = clampedDeg;
      this.dragState.facing = facing;
      this.dragState.power = power;
      options?.onSlingshotAim?.(clampedDeg, facing, power);
    }

    private getDesiredPlayZoom(): number {
      const minZoom = this.getMinRoomZoom();
      if (this.userZoomOverride !== null) {
        return Math.max(minZoom, Math.min(1.65, this.userZoomOverride));
      }
      const w = this.scale.width || window.innerWidth;
      const h = this.scale.height || window.innerHeight;
      return Math.max(minZoom, Math.min(1.15, Math.min(w / 1150, h / 620)));
    }

    private applyResponsiveZoom(immediate: boolean): void {
      const cam = this.cameras?.main;
      if (!cam) return;
      const minZoom = this.getMinRoomZoom();
      const target = this.overviewMode ? minZoom : this.getDesiredPlayZoom();
      if (immediate) cam.setZoom(target);
    }

    public refreshFullTerrain(terrain: TerrainState): void {
      if (
        terrainCanvas.width !== terrain.width ||
        terrainCanvas.height !== terrain.height
      ) {
        terrainCanvas.width = terrain.width;
        terrainCanvas.height = terrain.height;
        terrainImageData = terrainCtx.createImageData(terrain.width, terrain.height);
      }
      renderTerrainRegion(terrain, 0, 0, terrain.width - 1, terrain.height - 1);
      this.canvasTex?.refresh();
    }

    public applyCraterEdit(
      terrain: TerrainState,
      x: number,
      y: number,
      radius: number,
    ): void {
      const margin = radius + 7;
      renderTerrainRegion(terrain, x - margin, y - margin, x + margin, y + margin, {
        x,
        y,
        radius,
      });
      this.canvasTex?.refresh();
      this.dirtyChunkUpdateCount += 1;
    }

    public setWorldState(
      world: WorldState | null,
      localAim: LocalAimFeedback | null,
    ): void {
      this.currentWorld = world;
      this.localAim = localAim;
      if (!world) return;

      const seenChars = new Set<string>();
      for (const ch of world.characters) {
        seenChars.add(ch.id);
        const existing = this.charPositions.get(ch.id);
        if (!existing || Math.hypot(ch.x - existing.x, ch.y - existing.y) > 96) {
          this.charPositions.set(ch.id, {
            x: ch.x,
            y: ch.y,
            targetX: ch.x,
            targetY: ch.y,
          });
        } else {
          existing.targetX = ch.x;
          existing.targetY = ch.y;
        }
      }
      for (const id of this.charPositions.keys()) {
        if (!seenChars.has(id)) this.charPositions.delete(id);
      }

      const seenProjs = new Set<string>();
      for (const proj of world.projectiles) {
        seenProjs.add(proj.id);
        const existing = this.projPositions.get(proj.id);
        if (!existing) {
          this.projPositions.set(proj.id, {
            x: proj.x,
            y: proj.y,
            targetX: proj.x,
            targetY: proj.y,
          });
        } else {
          existing.targetX = proj.x;
          existing.targetY = proj.y;
        }
      }
      for (const id of this.projPositions.keys()) {
        if (!seenProjs.has(id)) this.projPositions.delete(id);
      }
    }

    public setLocalAim(localAim: LocalAimFeedback | null): void {
      this.localAim = localAim;
    }

    public toggleOverview(): boolean {
      this.overviewMode = !this.overviewMode;
      this.manualPanUntilMs = 0;
      return this.overviewMode;
    }

    public focusActiveEntity(immediate = false): void {
      this.overviewMode = false;
      this.manualPanUntilMs = 0;
      // Do not snap camera away while a weapon explosion or thrown character animation is still finishing
      if (!immediate && performance.now() < this.actionHoldUntilMs) {
        return;
      }
      const cam = this.cameras?.main;
      if (cam && this.currentWorld?.activeCharacterId) {
        const pos =
          this.charPositions.get(this.currentWorld.activeCharacterId) ??
          this.currentWorld.characters.find((c) => c.id === this.currentWorld!.activeCharacterId);
        if (pos) {
          cam.centerOn(pos.x, pos.y + 85);
          cam.preRender();
        }
      }
    }

    public triggerEvents(events: readonly SimulationEvent[]): void {
      const now = performance.now();
      for (const ev of events) {
        if (ev.type === 'explosion') {
          this.spawnExplosionVisual(ev.x, ev.y, ev.radius);
          this.actionFocusPoint = { x: ev.x, y: ev.y };
          this.actionHoldUntilMs = Math.max(this.actionHoldUntilMs, now + 1350);
        } else if (ev.type === 'character.damaged') {
          const pos = this.charPositions.get(ev.characterId);
          if (pos) {
            this.spawnFloatingText(pos.x, pos.y - 34, `-${ev.amount}`, '#ff4d36');
            this.trackedThrownCharId = ev.characterId;
            this.actionFocusPoint = { x: pos.x, y: pos.y };
            this.actionHoldUntilMs = Math.max(this.actionHoldUntilMs, now + 1500);
          }
        } else if (ev.type === 'character.drowned') {
          const pos = this.charPositions.get(ev.characterId);
          if (pos) {
            this.spawnFloatingText(pos.x, pos.y - 24, 'Бульк!', '#63b8ff');
            this.trackedThrownCharId = ev.characterId;
            this.actionFocusPoint = { x: pos.x, y: pos.y };
            this.actionHoldUntilMs = Math.max(this.actionHoldUntilMs, now + 1450);
          }
        }
      }
    }

    private spawnExplosionVisual(x: number, y: number, radius: number): void {
      const circle = this.add.circle(x, y, Math.max(14, radius * 0.45), 0xffae34, 0.9);
      circle.setStrokeStyle(4, 0xe03c1f);
      if (reducedMotion) {
        this.time.delayedCall(260, () => circle.destroy());
      } else {
        this.tweens.add({
          targets: circle,
          scale: 2.35,
          alpha: 0,
          duration: 420,
          ease: 'Cubic.easeOut',
          onComplete: () => circle.destroy(),
        });
      }
    }

    private spawnFloatingText(x: number, y: number, text: string, color: string): void {
      const label = this.add
        .text(x, y, text, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '22px',
          fontStyle: 'bold',
          color,
          stroke: '#1b2832',
          strokeThickness: 5,
        })
        .setOrigin(0.5, 0.5);
      if (reducedMotion) {
        this.time.delayedCall(650, () => label.destroy());
      } else {
        this.tweens.add({
          targets: label,
          y: y - 40,
          alpha: 0,
          duration: 950,
          ease: 'Sine.easeOut',
          onComplete: () => label.destroy(),
        });
      }
    }

    update(time: number, delta: number) {
      if (!this.entityGraphics || !this.waterGraphics) return;
      const g = this.entityGraphics;
      g.clear();

      const lerpFactor = Math.min(1, delta / 55);

      if (!this.currentWorld) {
        this.drawHedgehog(g, 520, 521, 1, 25, 0, false);
        this.drawHedgehog(g, 960, 501, -1, 15, 1, false);
        this.drawWater(
          initialMap.terrain.width,
          initialMap.terrain.height,
          initialMap.terrain.waterLine,
          time,
        );
        return;
      }

      const world = this.currentWorld;
      const teamById = new Map<string, TeamState>(world.teams.map((t) => [t.id, t]));

      for (const pos of this.charPositions.values()) {
        pos.x += (pos.targetX - pos.x) * lerpFactor;
        pos.y += (pos.targetY - pos.y) * lerpFactor;
      }
      for (const pos of this.projPositions.values()) {
        pos.x += (pos.targetX - pos.x) * lerpFactor;
        pos.y += (pos.targetY - pos.y) * lerpFactor;
      }

      this.updateCamera(world, performance.now());

      // Draw characters with clean floating HP numbers above helmets
      const activeCharIds = new Set<string>();
      for (const ch of world.characters) {
        if (!ch.alive && !ch.drowning) continue;
        activeCharIds.add(ch.id);
        const pos = this.charPositions.get(ch.id) ?? { x: ch.x, y: ch.y };
        const team = teamById.get(ch.teamId);
        const colorIndex = team?.colorIndex ?? 0;
        const isActive = ch.id === world.activeCharacterId && world.phase === 'control';

        const aimOverride =
          this.localAim && this.localAim.characterId === ch.id ? this.localAim : null;
        const facing = aimOverride ? aimOverride.facing : ch.facing;
        const aimAngleDeg = aimOverride ? aimOverride.angleDeg : ch.aimAngleDeg;

        // Use exact authoritative coordinates for active character when settled so aiming line matches physics 1:1
        const drawX = isActive && ch.grounded && ch.moveInput === 0 ? ch.x : pos.x;
        const drawY = isActive && ch.grounded && ch.moveInput === 0 ? ch.y : pos.y;

        this.drawHedgehog(
          g,
          drawX,
          drawY,
          facing,
          aimAngleDeg,
          colorIndex,
          isActive,
          aimOverride?.chargePower ?? null,
        );

        const hpText = String(ch.health);
        const textHex = TEAM_TEXT_HEX[colorIndex % TEAM_TEXT_HEX.length]!;
        let label = this.labelPool.get(ch.id);
        if (!label) {
          label = this.add
            .text(drawX, drawY - 26, hpText, {
              fontFamily: 'system-ui, sans-serif',
              fontSize: '20px',
              fontStyle: '900',
              color: textHex,
              stroke: '#1d2d3a',
              strokeThickness: 4.5,
            })
            .setOrigin(0.5, 1);
          this.labelPool.set(ch.id, label);
        } else {
          label.setText(hpText);
          label.setColor(textHex);
          label.setPosition(drawX, drawY - 24);
          label.setVisible(true);
        }
      }

      for (const [id, label] of this.labelPool.entries()) {
        if (!activeCharIds.has(id)) {
          label.setVisible(false);
        }
      }

      for (const proj of world.projectiles) {
        if (!proj.active) continue;
        const pos = this.projPositions.get(proj.id) ?? { x: proj.x, y: proj.y };
        this.drawProjectile(g, proj, pos.x, pos.y);
      }

      this.drawWater(world.terrain.width, world.terrain.height, world.terrain.waterLine, time);
    }

    private updateCamera(world: WorldState, nowMs: number): void {
      const cam = this.cameras.main;
      const minZoom = this.getMinRoomZoom();

      if (this.overviewMode) {
        cam.setZoom(Phaser.Math.Linear(cam.zoom, minZoom, 0.12));
        cam.centerOn(world.terrain.width / 2, world.terrain.height / 2);
        return;
      }

      const desiredZoom = this.getDesiredPlayZoom();
      cam.setZoom(Phaser.Math.Clamp(Phaser.Math.Linear(cam.zoom, desiredZoom, 0.1), minZoom, 1.65));
      if (nowMs < this.manualPanUntilMs) return;

      // 1. Follow active projectile in flight
      const activeProj = world.projectiles.find((p) => p.active);
      if (activeProj) {
        const pPos = this.projPositions.get(activeProj.id) ?? activeProj;
        this.actionFocusPoint = { x: pPos.x, y: pPos.y };
        this.actionHoldUntilMs = Math.max(this.actionHoldUntilMs, nowMs + 1200);
        cam.centerOn(
          Phaser.Math.Linear(cam.midPoint.x, pPos.x, 0.24),
          Phaser.Math.Linear(cam.midPoint.y, pPos.y, 0.24),
        );
        return;
      }

      // 2. Follow any character thrown off by an explosion or drowning
      const thrownChar = world.characters.find(
        (c) =>
          (c.alive || c.drowning) &&
          (c.id === this.trackedThrownCharId ||
            c.drowning ||
            ((!c.grounded || Math.hypot(c.vx, c.vy) > 0.6) &&
              (world.phase !== 'control' || c.id !== world.activeCharacterId))),
      );
      if (thrownChar) {
        this.trackedThrownCharId = thrownChar.id;
        const cPos = this.charPositions.get(thrownChar.id) ?? thrownChar;
        this.actionFocusPoint = { x: cPos.x, y: cPos.y };
        if (!thrownChar.grounded || thrownChar.drowning || Math.hypot(thrownChar.vx, thrownChar.vy) > 0.3) {
          this.actionHoldUntilMs = Math.max(this.actionHoldUntilMs, nowMs + 1150);
        }
      }

      // 3. Keep camera on explosion / thrown character until the animation finishes
      if (nowMs < this.actionHoldUntilMs && this.actionFocusPoint) {
        if (this.trackedThrownCharId) {
          const trackedPos = this.charPositions.get(this.trackedThrownCharId);
          if (trackedPos) {
            this.actionFocusPoint = { x: trackedPos.x, y: trackedPos.y };
          }
        }
        cam.centerOn(
          Phaser.Math.Linear(cam.midPoint.x, this.actionFocusPoint.x, 0.18),
          Phaser.Math.Linear(cam.midPoint.y, this.actionFocusPoint.y + 40, 0.18),
        );
        return;
      }

      this.actionFocusPoint = null;
      this.trackedThrownCharId = null;

      // 4. Smoothly pan back to the active character
      if (world.activeCharacterId) {
        const cPos = this.charPositions.get(world.activeCharacterId);
        if (cPos) {
          cam.centerOn(
            Phaser.Math.Linear(cam.midPoint.x, cPos.x, 0.12),
            Phaser.Math.Linear(cam.midPoint.y, cPos.y + 85, 0.12),
          );
        }
      }
    }

    private drawHedgehog(
      g: Phaser.GameObjects.Graphics,
      x: number,
      y: number,
      facing: -1 | 1,
      aimAngleDeg: number,
      colorIndex: number,
      isActive: boolean,
      chargePower: number | null = null,
    ): void {
      const helmetColor = TEAM_HELMET_COLORS[colorIndex % TEAM_HELMET_COLORS.length]!;
      const r = 13;

      if (isActive) {
        g.lineStyle(2.5, 0xffffff, 0.85);
        g.strokeCircle(x, y, r + 5);
      }

      // Round character body
      g.fillStyle(0x6b747b, 1);
      g.fillCircle(x, y + 1, r * 0.88);
      g.lineStyle(2, 0x222a30, 1);
      g.strokeCircle(x, y + 1, r * 0.88);

      // Expressive eyes
      g.fillStyle(0xffffff, 1);
      g.fillCircle(x + facing * 4, y + 1, 3.4);
      g.fillStyle(0x182026, 1);
      g.fillCircle(x + facing * 5, y + 1, 1.7);

      // Military/cartoon helmet in team color
      g.fillStyle(helmetColor, 1);
      g.beginPath();
      g.arc(x, y - 1, r, Math.PI * 1.02, Math.PI * 1.98, false);
      g.closePath();
      g.fillPath();
      g.lineStyle(2, 0x222a30, 1);
      g.strokePath();

      // Helmet band
      g.fillStyle(0xd99b38, 1);
      g.fillRect(x - r, y - 3, r * 2, 3.5);

      // Angry Birds slingshot trajectory parabola & pull band when active
      if (isActive) {
        const rad = (aimAngleDeg * Math.PI) / 180;
        const dirX = facing * Math.cos(rad);
        const dirY = -Math.sin(rad);

        if (chargePower !== null && chargePower > 0) {
          const clampedPower = Math.max(0, Math.min(MAX_POWER, chargePower));
          const ratio = clampedPower / MAX_POWER;
          const pullLen = 16 + ratio * 75;

          // Draw taut slingshot band behind the character (pull direction)
          g.lineStyle(3.5, 0x3b2818, 0.85);
          g.lineBetween(x, y, x - dirX * pullLen, y - dirY * pullLen);
          g.fillStyle(0xffffff, 0.92);
          g.fillCircle(x - dirX * pullLen, y - dirY * pullLen, 5.5);

          // Exact simulation-matched ballistic parabola with smooth fade:
          // 100% opacity from 0% to 40% of the line, fading linearly to 0% at 70% of the line.
          const launchSpeed = (clampedPower / MAX_POWER) * MAX_LAUNCH_SPEED_PER_TICK;
          let simX = x;
          let simY = y;
          let simVx = dirX * launchSpeed;
          let simVy = dirY * launchSpeed;

          const maxVisibleTick = Math.floor(TOTAL_TRAJECTORY_TICKS * 0.7);
          let dashStartX = simX;
          let dashStartY = simY;

          for (let tick = 1; tick <= maxVisibleTick; tick++) {
            simVy += GRAVITY_PER_TICK;
            if (Math.abs(simVx) > MAX_SPEED_PER_TICK) {
              simVx = Math.sign(simVx) * MAX_SPEED_PER_TICK;
            }
            if (Math.abs(simVy) > MAX_SPEED_PER_TICK) {
              simVy = Math.sign(simVy) * MAX_SPEED_PER_TICK;
            }
            simX += simVx;
            simY += simVy;

            const phaseInCycle = tick % 3;
            if (phaseInCycle === 1) {
              dashStartX = simX;
              dashStartY = simY;
            } else if (phaseInCycle === 0 && tick >= 3) {
              const lineFraction = tick / TOTAL_TRAJECTORY_TICKS;
              const alpha =
                lineFraction <= 0.4
                  ? 1.0
                  : Math.max(0, 1.0 - (lineFraction - 0.4) / (0.7 - 0.4));
              if (alpha > 0.01) {
                g.lineStyle(3.5, 0xffffff, alpha);
                g.lineBetween(dashStartX, dashStartY, simX, simY);
              }
            }
          }
        } else {
          // Idle short direction indicator
          for (let step = 1; step <= 4; step++) {
            const dotDist = 18 + step * 11;
            const u = (step - 1) / 4;
            const alpha = u <= 0.4 ? 1.0 : Math.max(0, 1.0 - (u - 0.4) / 0.6);
            g.fillStyle(0xffffff, alpha);
            g.fillCircle(x + dirX * dotDist, y + dirY * dotDist, 3.2 - step * 0.25);
          }
        }
      }
    }

    private drawProjectile(
      g: Phaser.GameObjects.Graphics,
      proj: ProjectileState,
      x: number,
      y: number,
    ): void {
      if (proj.kind === 'rocket') {
        g.fillStyle(0xe04224, 1);
        g.fillCircle(x, y, 6.5);
        g.lineStyle(2, 0x222a30, 1);
        g.strokeCircle(x, y, 6.5);
        g.fillStyle(0xffb73b, 0.85);
        g.fillCircle(x - proj.vx * 0.8, y - proj.vy * 0.8, 4.5);
      } else {
        g.fillStyle(0x3a643d, 1);
        g.fillCircle(x, y, 6.5);
        g.lineStyle(2, 0xe8d245, 1);
        g.strokeCircle(x, y, 6.5);
      }
    }

    private drawWater(width: number, height: number, waterLine: number, time: number): void {
      const wg = this.waterGraphics!;
      wg.clear();
      const crestY = waterLine - 14;
      wg.fillStyle(0x18c5d8, 0.92);
      wg.fillRect(0, crestY, width, height + ROOM_WATER_BOTTOM_PAD - crestY);
      wg.lineStyle(4.5, 0xffffff, 0.96);
      wg.beginPath();
      const phase = reducedMotion ? 0 : time * 0.003;
      for (let x = 0; x <= width; x += 28) {
        const wy = crestY + Math.sin(x * 0.022 + phase) * 3.5;
        if (x === 0) wg.moveTo(x, wy);
        else wg.lineTo(x, wy);
      }
      wg.strokePath();
    }

    public getDirtyChunkUpdateCount(): number {
      return this.dirtyChunkUpdateCount;
    }

    public getCameraZoom(): number {
      return this.cameras?.main?.zoom ?? 1;
    }

    public getActiveCharacterScreenPoint(): { x: number; y: number } | null {
      const cam = this.cameras?.main;
      if (!cam || !this.currentWorld?.activeCharacterId) return null;
      this.actionHoldUntilMs = 0;
      this.actionFocusPoint = null;
      this.trackedThrownCharId = null;
      const authChar = this.currentWorld.characters.find(
        (c) => c.id === this.currentWorld!.activeCharacterId,
      );
      const pos = authChar ?? this.charPositions.get(this.currentWorld.activeCharacterId);
      if (!pos) return null;
      cam.centerOn(pos.x, pos.y + 85);
      cam.preRender();
      const screenX = (pos.x - cam.midPoint.x) * cam.zoom + cam.width * 0.5;
      const screenY = (pos.y - cam.midPoint.y) * cam.zoom + cam.height * 0.5;
      return { x: screenX, y: screenY };
    }
  }

  const scene = new MatchFieldScene('match-field');
  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    parent,
    width: window.innerWidth || 960,
    height: window.innerHeight || 540,
    backgroundColor: '#6ab3e8',
    scene,
    audio: { noAudio: true },
    input: { activePointers: 4 },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.NO_CENTER,
    },
    banner: false,
  });

  return {
    refreshFullTerrain: (terrain: TerrainState) => scene.refreshFullTerrain(terrain),
    applyCraterEdit: (terrain: TerrainState, x: number, y: number, radius: number) =>
      scene.applyCraterEdit(terrain, x, y, radius),
    setWorldState: (world: WorldState | null, localAim: LocalAimFeedback | null) =>
      scene.setWorldState(world, localAim),
    setLocalAim: (localAim: LocalAimFeedback | null) => scene.setLocalAim(localAim),
    triggerEvents: (events: readonly SimulationEvent[]) => scene.triggerEvents(events),
    toggleOverview: () => scene.toggleOverview(),
    focusActiveEntity: (immediate?: boolean) => scene.focusActiveEntity(immediate),
    getDirtyChunkUpdateCount: () => scene.getDirtyChunkUpdateCount(),
    getCameraZoom: () => scene.getCameraZoom(),
    getActiveCharacterScreenPoint: () => scene.getActiveCharacterScreenPoint(),
    destroy: () => game.destroy(true),
  };
}
