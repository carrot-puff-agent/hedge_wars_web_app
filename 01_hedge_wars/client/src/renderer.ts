import Phaser from 'phaser';
import { TEAM_PRESETS_UK } from '@yizhaklub/hedge-protocol';
import {
  TERRAIN_EMPTY,
  TERRAIN_INDESTRUCTIBLE,
  buildCuratedMapTerrain,
  type ProjectileState,
  type SimulationEvent,
  type TeamState,
  type TerrainState,
  type WorldState,
} from '@yizhaklub/hedge-simulation';

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

const TEAM_COLORS_NUM = [0x225b43, 0xb84a27, 0x2b5b84, 0x7a3e78] as const;

export function createMatchRenderer(parent: string, onWave?: () => void) {
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
          const checker = ((x >> 3) + (y >> 3)) & 1;
          data[pIdx] = checker ? 86 : 70;
          data[pIdx + 1] = checker ? 99 : 82;
          data[pIdx + 2] = checker ? 106 : 90;
          data[pIdx + 3] = 255;
          continue;
        }

        // TERRAIN_SOLID: check sky above for grass crust
        const emptyAbove1 = y >= 2 ? mask[(y - 2) * w + x] === TERRAIN_EMPTY : true;
        const emptyAbove2 = y >= 6 ? mask[(y - 6) * w + x] === TERRAIN_EMPTY : true;
        const emptyBelow = y + 2 < h ? mask[(y + 2) * w + x] === TERRAIN_EMPTY : false;
        const emptySide =
          (x >= 2 && mask[rowOffset + x - 2] === TERRAIN_EMPTY) ||
          (x + 2 < w && mask[rowOffset + x + 2] === TERRAIN_EMPTY);

        let r = 132;
        let g = 93;
        let b = 56;

        if (emptyAbove1) {
          r = 68;
          g = 118;
          b = 62;
        } else if (emptyAbove2) {
          r = 95;
          g = 148;
          b = 80;
        } else if (emptyBelow || emptySide) {
          r = 92;
          g = 64;
          b = 38;
        } else {
          const grain = ((x * 13 + y * 7) & 15) - 7;
          r = 134 + grain;
          g = 95 + grain;
          b = 58 + grain;
        }

        if (scorchCenter) {
          const dx = x - scorchCenter.x;
          const dy = y - scorchCenter.y;
          const dSq = dx * dx + dy * dy;
          if (dSq >= scorchRMinSq && dSq <= scorchRMaxSq) {
            r = Math.max(28, r - 65);
            g = Math.max(24, g - 55);
            b = Math.max(20, b - 45);
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

  // Paint initial terrain mask once
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
    private manualPanUntilMs = 0;
    private dragStartPointer: { x: number; y: number; scrollX: number; scrollY: number } | null =
      null;
    private previewWaveOffset = 0;
    private dirtyChunkUpdateCount = 0;

    create() {
      const worldW = initialMap.terrain.width;
      const worldH = initialMap.terrain.height;

      // Sky & distant hills backdrop
      const bg = this.add.graphics();
      bg.fillGradientStyle(0xcfe4da, 0xcfe4da, 0xf5eedc, 0xf5eedc, 1);
      bg.fillRect(0, 0, worldW, worldH);
      bg.fillStyle(0xf1c967, 0.95).fillCircle(1620, 170, 68);
      bg.fillStyle(0xfffdf5, 0.88)
        .fillRoundedRect(340, 150, 220, 44, 22)
        .fillCircle(420, 142, 42)
        .fillCircle(485, 148, 34);
      bg.fillStyle(0xfffdf5, 0.85)
        .fillRoundedRect(1080, 120, 250, 46, 23)
        .fillCircle(1170, 112, 46)
        .fillCircle(1240, 118, 36);
      bg.fillStyle(0xa7c4b0, 0.55).fillEllipse(580, 920, 1100, 480);
      bg.fillStyle(0x95b6a0, 0.55).fillEllipse(1480, 920, 1150, 500);

      this.canvasTex = this.textures.addCanvas('terrain-canvas', terrainCanvas)!;
      this.add.image(0, 0, 'terrain-canvas').setOrigin(0, 0);

      this.entityGraphics = this.add.graphics();
      this.waterGraphics = this.add.graphics();

      this.cameras.main.setBounds(0, 0, worldW, worldH);
      this.cameras.main.setZoom(0.75);
      this.cameras.main.centerOn(560, 640);

      // Drag-to-pan on canvas without stealing DOM button touches (UI-A03)
      this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        this.dragStartPointer = {
          x: pointer.x,
          y: pointer.y,
          scrollX: this.cameras.main.scrollX,
          scrollY: this.cameras.main.scrollY,
        };
        if (!this.currentWorld) {
          this.wave();
        }
      });

      this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        if (!pointer.isDown || !this.dragStartPointer) return;
        const dx = pointer.x - this.dragStartPointer.x;
        const dy = pointer.y - this.dragStartPointer.y;
        if (Math.hypot(dx, dy) > 8) {
          this.manualPanUntilMs = performance.now() + 4500;
          const zoom = this.cameras.main.zoom;
          this.cameras.main.scrollX = this.dragStartPointer.scrollX - dx / zoom;
          this.cameras.main.scrollY = this.dragStartPointer.scrollY - dy / zoom;
        }
      });

      this.input.on('pointerup', () => {
        this.dragStartPointer = null;
      });

      this.game.canvas.setAttribute('aria-hidden', 'true');
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

    public focusActiveEntity(): void {
      this.overviewMode = false;
      this.manualPanUntilMs = 0;
    }

    public triggerEvents(events: readonly SimulationEvent[]): void {
      for (const ev of events) {
        if (ev.type === 'explosion') {
          this.spawnExplosionVisual(ev.x, ev.y, ev.radius);
        } else if (ev.type === 'character.damaged') {
          const pos = this.charPositions.get(ev.characterId);
          if (pos) {
            this.spawnFloatingText(pos.x, pos.y - 26, `-${ev.amount}`, '#c93822');
          }
        } else if (ev.type === 'character.drowned') {
          const pos = this.charPositions.get(ev.characterId);
          if (pos) {
            this.spawnFloatingText(pos.x, pos.y - 22, 'Бульк!', '#2b5b84');
          }
        }
      }
    }

    private spawnExplosionVisual(x: number, y: number, radius: number): void {
      const circle = this.add.circle(x, y, Math.max(12, radius * 0.4), 0xf4a236, 0.85);
      circle.setStrokeStyle(4, 0xd84727);
      if (reducedMotion) {
        this.time.delayedCall(260, () => circle.destroy());
      } else {
        this.tweens.add({
          targets: circle,
          scale: 2.3,
          alpha: 0,
          duration: 340,
          ease: 'Cubic.easeOut',
          onComplete: () => circle.destroy(),
        });
      }
    }

    private spawnFloatingText(x: number, y: number, text: string, color: string): void {
      const label = this.add
        .text(x, y, text, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '20px',
          fontStyle: 'bold',
          color,
          stroke: '#fffaf0',
          strokeThickness: 4,
        })
        .setOrigin(0.5, 0.5);
      if (reducedMotion) {
        this.time.delayedCall(650, () => label.destroy());
      } else {
        this.tweens.add({
          targets: label,
          y: y - 38,
          alpha: 0,
          duration: 850,
          ease: 'Sine.easeOut',
          onComplete: () => label.destroy(),
        });
      }
    }

    public wave(): void {
      onWave?.();
      let targetX = 520;
      let targetY = 500;
      if (this.currentWorld && this.currentWorld.activeCharacterId) {
        const pos = this.charPositions.get(this.currentWorld.activeCharacterId);
        if (pos) {
          targetX = pos.x;
          targetY = pos.y - 24;
        }
      }
      if (!reducedMotion) {
        this.previewWaveOffset = -16;
        this.time.delayedCall(220, () => {
          this.previewWaveOffset = 0;
        });
      }
      this.spawnFloatingText(targetX + 18, targetY - 22, '♡', '#b84a27');
    }

    update(time: number, delta: number) {
      if (!this.entityGraphics || !this.waterGraphics) return;
      const g = this.entityGraphics;
      g.clear();

      const lerpFactor = Math.min(1, delta / 55);

      if (!this.currentWorld) {
        // Draw friendly preview hedgehog on the curated island before match start
        this.drawHedgehog(g, 520, 521 + this.previewWaveOffset, 1, 25, 0, true, false);
        this.drawWater(initialMap.terrain.width, initialMap.terrain.height, initialMap.terrain.waterLine, time);
        return;
      }

      const world = this.currentWorld;
      const teamById = new Map<string, TeamState>(world.teams.map((t) => [t.id, t]));

      // Smoothly interpolate characters & projectiles
      for (const pos of this.charPositions.values()) {
        pos.x += (pos.targetX - pos.x) * lerpFactor;
        pos.y += (pos.targetY - pos.y) * lerpFactor;
      }
      for (const pos of this.projPositions.values()) {
        pos.x += (pos.targetX - pos.x) * lerpFactor;
        pos.y += (pos.targetY - pos.y) * lerpFactor;
      }

      // Camera tracking
      this.updateCamera(world, time);

      // Draw characters and overhead badges
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

        this.drawHedgehog(
          g,
          pos.x,
          pos.y,
          facing,
          aimAngleDeg,
          colorIndex,
          isActive,
          false,
          aimOverride?.chargePower ?? null,
        );

        // Update overhead text badge with symbol + name + HP (UI-A01 / UI-05)
        const preset = TEAM_PRESETS_UK[colorIndex % TEAM_PRESETS_UK.length]!;
        const badgeText = `${preset.symbol} ${ch.name} · ${ch.health}`;
        let label = this.labelPool.get(ch.id);
        if (!label) {
          label = this.add
            .text(pos.x, pos.y - 30, badgeText, {
              fontFamily: 'system-ui, sans-serif',
              fontSize: '13px',
              fontStyle: 'bold',
              color: '#1f2b22',
              backgroundColor: '#fffdf7e6',
              padding: { x: 6, y: 2 },
            })
            .setOrigin(0.5, 1);
          this.labelPool.set(ch.id, label);
        } else {
          label.setText(badgeText);
          label.setPosition(pos.x, pos.y - 26);
          label.setVisible(true);
        }
      }

      for (const [id, label] of this.labelPool.entries()) {
        if (!activeCharIds.has(id)) {
          label.setVisible(false);
        }
      }

      // Draw active projectiles
      for (const proj of world.projectiles) {
        if (!proj.active) continue;
        const pos = this.projPositions.get(proj.id) ?? { x: proj.x, y: proj.y };
        this.drawProjectile(g, proj, pos.x, pos.y);
      }

      this.drawWater(world.terrain.width, world.terrain.height, world.terrain.waterLine, time);
    }

    private updateCamera(world: WorldState, nowMs: number): void {
      const cam = this.cameras.main;
      if (this.overviewMode) {
        const targetZoom = Math.min(cam.width / world.terrain.width, cam.height / world.terrain.height);
        cam.setZoom(Phaser.Math.Linear(cam.zoom, Math.max(0.38, targetZoom), 0.12));
        cam.centerOn(world.terrain.width / 2, world.terrain.height / 2);
        return;
      }

      cam.setZoom(Phaser.Math.Linear(cam.zoom, 0.85, 0.1));
      if (nowMs < this.manualPanUntilMs) return;

      const activeProj = world.projectiles.find((p) => p.active);
      if (activeProj) {
        const pPos = this.projPositions.get(activeProj.id) ?? activeProj;
        cam.centerOn(
          Phaser.Math.Linear(cam.midPoint.x, pPos.x, 0.18),
          Phaser.Math.Linear(cam.midPoint.y, pPos.y, 0.18),
        );
        return;
      }

      if (world.activeCharacterId) {
        const cPos = this.charPositions.get(world.activeCharacterId);
        if (cPos) {
          cam.centerOn(
            Phaser.Math.Linear(cam.midPoint.x, cPos.x, 0.1),
            Phaser.Math.Linear(cam.midPoint.y, cPos.y - 30, 0.1),
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
      isPreview: boolean,
      chargePower: number | null = null,
    ): void {
      const teamColor = TEAM_COLORS_NUM[colorIndex % TEAM_COLORS_NUM.length]!;
      const r = isPreview ? 16 : 11;

      // Active character highlight halo & turn pointer
      if (isActive) {
        g.lineStyle(2.5, 0xf1c967, 0.95);
        g.strokeCircle(x, y, r + 6);
        g.fillStyle(0xd84727, 1);
        g.fillTriangle(x - 6, y - 48, x + 6, y - 48, x, y - 38);
      }

      // Spiky back
      g.fillStyle(teamColor, 1);
      g.fillCircle(x - facing * 3, y - 1, r);

      // Face / snout
      g.fillStyle(0xecb184, 1);
      g.fillCircle(x + facing * 3, y + 1, r * 0.78);

      // Eye & nose
      g.fillStyle(0x1f2b22, 1);
      g.fillCircle(x + facing * 5, y - 2, 2);
      g.fillCircle(x + facing * 10, y + 1, 2.4);

      // Aim reticle & trajectory dots when active
      if (isActive) {
        const rad = (-aimAngleDeg * Math.PI) / 180;
        const dirX = Math.cos(rad) * facing;
        const dirY = Math.sin(rad);
        const aimDist = 42;
        const targetX = x + dirX * aimDist;
        const targetY = y + dirY * aimDist;

        g.lineStyle(2, teamColor, 0.85);
        g.lineBetween(x + dirX * 14, y + dirY * 14, targetX, targetY);
        g.strokeCircle(targetX, targetY, 5);

        if (chargePower !== null && chargePower > 0) {
          const ratio = Math.min(1, chargePower / 1000);
          const barLen = 14 + ratio * 38;
          g.lineStyle(4, 0xd84727, 0.95);
          g.lineBetween(
            x + dirX * 14,
            y + dirY * 14,
            x + dirX * (14 + barLen),
            y + dirY * (14 + barLen),
          );
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
        g.fillStyle(0xd84727, 1);
        g.fillCircle(x, y, 6);
        g.fillStyle(0xf4a236, 0.85);
        g.fillCircle(x - proj.vx * 0.8, y - proj.vy * 0.8, 4);
      } else {
        g.fillStyle(0x2f5233, 1);
        g.fillCircle(x, y, 6);
        g.lineStyle(2, 0xf1c967, 1);
        g.strokeCircle(x, y, 6);
      }
    }

    private drawWater(width: number, height: number, waterLine: number, time: number): void {
      const wg = this.waterGraphics!;
      wg.clear();
      wg.fillStyle(0x2b6282, 0.78);
      wg.fillRect(0, waterLine, width, height - waterLine);
      wg.lineStyle(3, 0x89c2d9, 0.85);
      wg.beginPath();
      const phase = reducedMotion ? 0 : time * 0.003;
      for (let x = 0; x <= width; x += 32) {
        const wy = waterLine + Math.sin(x * 0.02 + phase) * 3;
        if (x === 0) wg.moveTo(x, wy);
        else wg.lineTo(x, wy);
      }
      wg.strokePath();
    }

    public getDirtyChunkUpdateCount(): number {
      return this.dirtyChunkUpdateCount;
    }
  }

  const scene = new MatchFieldScene('match-field');
  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    parent,
    width: 960,
    height: 480,
    backgroundColor: '#cfe4da',
    scene,
    audio: { noAudio: true },
    input: { activePointers: 4 },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    banner: false,
  });

  return {
    wave: () => scene.wave(),
    refreshFullTerrain: (terrain: TerrainState) => scene.refreshFullTerrain(terrain),
    applyCraterEdit: (terrain: TerrainState, x: number, y: number, radius: number) =>
      scene.applyCraterEdit(terrain, x, y, radius),
    setWorldState: (world: WorldState | null, localAim: LocalAimFeedback | null) =>
      scene.setWorldState(world, localAim),
    setLocalAim: (localAim: LocalAimFeedback | null) => scene.setLocalAim(localAim),
    triggerEvents: (events: readonly SimulationEvent[]) => scene.triggerEvents(events),
    toggleOverview: () => scene.toggleOverview(),
    focusActiveEntity: () => scene.focusActiveEntity(),
    getDirtyChunkUpdateCount: () => scene.getDirtyChunkUpdateCount(),
    destroy: () => game.destroy(true),
  };
}
