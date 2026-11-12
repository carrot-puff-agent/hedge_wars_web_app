import Phaser from 'phaser';
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

const TEAM_HELMET_COLORS = [0xb8d838, 0x4ca2f4, 0xf26c4f, 0xb676f2] as const;
const TEAM_TEXT_HEX = ['#c7ec3a', '#63b8ff', '#ff8364', '#cf9bff'] as const;

export function createMatchRenderer(
  parent: string,
  options?: {
    onCanvasAimChange?: (angleDeg: number, facing: -1 | 1) => void;
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
    private manualPanUntilMs = 0;
    private dragState: {
      mode: 'pan' | 'aim';
      startX: number;
      startY: number;
      scrollX: number;
      scrollY: number;
    } | null = null;
    private dirtyChunkUpdateCount = 0;

    create() {
      const worldW = initialMap.terrain.width;
      const worldH = initialMap.terrain.height;

      // Bright clear blue sky and soft cartoon clouds matching gameplay ui sample.jpg
      const bg = this.add.graphics();
      bg.fillGradientStyle(0x6ab3e8, 0x6ab3e8, 0xc4e5f8, 0xc4e5f8, 1);
      bg.fillRect(0, 0, worldW, worldH + 120);

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

      this.cameras.main.setBounds(0, 0, worldW, worldH + 100);
      this.applyResponsiveZoom(true);
      this.cameras.main.centerOn(760, 680);

      this.scale.on('resize', () => {
        this.applyResponsiveZoom(false);
      });

      // Direct canvas drag: drag near active character to aim, or drag anywhere else to pan camera
      this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (this.currentWorld && this.localAim) {
          const activePos = this.charPositions.get(this.localAim.characterId);
          if (activePos) {
            const worldPt = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
            if (Math.hypot(worldPt.x - activePos.x, worldPt.y - activePos.y) <= 260) {
              this.dragState = {
                mode: 'aim',
                startX: pointer.x,
                startY: pointer.y,
                scrollX: this.cameras.main.scrollX,
                scrollY: this.cameras.main.scrollY,
              };
              this.updateAimFromWorldPoint(activePos, worldPt.x, worldPt.y);
              return;
            }
          }
        }
        this.dragState = {
          mode: 'pan',
          startX: pointer.x,
          startY: pointer.y,
          scrollX: this.cameras.main.scrollX,
          scrollY: this.cameras.main.scrollY,
        };
      });

      this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        if (!pointer.isDown || !this.dragState) return;
        if (this.dragState.mode === 'aim' && this.localAim) {
          const activePos = this.charPositions.get(this.localAim.characterId);
          if (activePos) {
            const worldPt = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
            this.updateAimFromWorldPoint(activePos, worldPt.x, worldPt.y);
          }
          return;
        }
        const dx = pointer.x - this.dragState.startX;
        const dy = pointer.y - this.dragState.startY;
        if (Math.hypot(dx, dy) > 8) {
          this.manualPanUntilMs = performance.now() + 4500;
          const zoom = this.cameras.main.zoom;
          this.cameras.main.scrollX = this.dragState.scrollX - dx / zoom;
          this.cameras.main.scrollY = this.dragState.scrollY - dy / zoom;
        }
      });

      this.input.on('pointerup', () => {
        this.dragState = null;
      });

      this.game.canvas.setAttribute('aria-hidden', 'true');
    }

    private updateAimFromWorldPoint(
      charPos: { x: number; y: number },
      worldX: number,
      worldY: number,
    ): void {
      const dx = worldX - charPos.x;
      const dy = charPos.y - worldY;
      if (Math.hypot(dx, dy) < 6) return;
      const facing: -1 | 1 = dx >= 0 ? 1 : -1;
      const rawDeg = (Math.atan2(dy, Math.abs(dx)) * 180) / Math.PI;
      const clampedDeg = Math.max(-80, Math.min(85, Math.round(rawDeg)));
      options?.onCanvasAimChange?.(clampedDeg, facing);
    }

    private getDesiredPlayZoom(): number {
      const w = this.scale.width || window.innerWidth;
      const h = this.scale.height || window.innerHeight;
      return Math.max(0.58, Math.min(1.15, Math.min(w / 1150, h / 620)));
    }

    private applyResponsiveZoom(immediate: boolean): void {
      const cam = this.cameras?.main;
      if (!cam) return;
      const target = this.overviewMode
        ? Math.max(0.35, Math.min(this.scale.width / 2048, this.scale.height / 1024))
        : this.getDesiredPlayZoom();
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
            this.spawnFloatingText(pos.x, pos.y - 34, `-${ev.amount}`, '#ff4d36');
          }
        } else if (ev.type === 'character.drowned') {
          const pos = this.charPositions.get(ev.characterId);
          if (pos) {
            this.spawnFloatingText(pos.x, pos.y - 24, 'Бульк!', '#63b8ff');
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
          duration: 850,
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
        // Draw scenic demo hedgehogs on the island while the lobby modal is open
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

      this.updateCamera(world, time);

      // Draw characters with clean floating HP numbers above helmets (like gameplay ui sample.jpg)
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
          aimOverride?.chargePower ?? null,
        );

        const hpText = String(ch.health);
        const textHex = TEAM_TEXT_HEX[colorIndex % TEAM_TEXT_HEX.length]!;
        let label = this.labelPool.get(ch.id);
        if (!label) {
          label = this.add
            .text(pos.x, pos.y - 26, hpText, {
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
          label.setPosition(pos.x, pos.y - 24);
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
      if (this.overviewMode) {
        const targetZoom = Math.max(
          0.35,
          Math.min(this.scale.width / world.terrain.width, this.scale.height / world.terrain.height),
        );
        cam.setZoom(Phaser.Math.Linear(cam.zoom, targetZoom, 0.12));
        cam.centerOn(world.terrain.width / 2, world.terrain.height / 2);
        return;
      }

      const desiredZoom = this.getDesiredPlayZoom();
      cam.setZoom(Phaser.Math.Linear(cam.zoom, desiredZoom, 0.1));
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
            Phaser.Math.Linear(cam.midPoint.y, cPos.y + 85, 0.1),
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

      // Military/cartoon helmet in team color (like gameplay ui sample.jpg)
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

      // Aim reticle & charge gauge when active
      if (isActive) {
        const rad = (-aimAngleDeg * Math.PI) / 180;
        const dirX = Math.cos(rad) * facing;
        const dirY = Math.sin(rad);

        for (let step = 1; step <= 4; step++) {
          const dotDist = 18 + step * 11;
          g.fillStyle(0xffffff, 0.9 - step * 0.15);
          g.fillCircle(x + dirX * dotDist, y + dirY * dotDist, 3.2 - step * 0.3);
        }

        if (chargePower !== null && chargePower > 0) {
          const ratio = Math.min(1, chargePower / 1000);
          const barLen = 16 + ratio * 44;
          g.lineStyle(5, 0xff5722, 0.95);
          g.lineBetween(
            x + dirX * 16,
            y + dirY * 16,
            x + dirX * (16 + barLen),
            y + dirY * (16 + barLen),
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
      // Turquoise-teal cartoon water with white foam crest matching gameplay ui sample.jpg
      const crestY = waterLine - 14;
      wg.fillStyle(0x18c5d8, 0.92);
      wg.fillRect(0, crestY, width, height + 140 - crestY);
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
    focusActiveEntity: () => scene.focusActiveEntity(),
    getDirtyChunkUpdateCount: () => scene.getDirtyChunkUpdateCount(),
    destroy: () => game.destroy(true),
  };
}
