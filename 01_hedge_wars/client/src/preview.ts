import Phaser from 'phaser';

/** Presentation-only workshop. This scene intentionally contains no game simulation. */
export function createPreview(parent: string) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  class WorkshopScene extends Phaser.Scene {
    private hog?: Phaser.GameObjects.Container;

    create() {
      const g = this.add.graphics();
      g.fillStyle(0xd9e8e0).fillRect(0, 0, 900, 420);
      g.fillStyle(0xf1c967).fillCircle(750, 75, 38);
      g.lineStyle(4, 0xf1c967);
      for (let i = 0; i < 12; i++) {
        const angle = i * Math.PI / 6;
        g.lineBetween(750 + Math.cos(angle) * 50, 75 + Math.sin(angle) * 50, 750 + Math.cos(angle) * 61, 75 + Math.sin(angle) * 61);
      }
      g.fillStyle(0xfffcf0).fillRoundedRect(120, 75, 130, 26, 13).fillCircle(173, 70, 28).fillCircle(210, 74, 22);
      g.fillStyle(0x7d9d66).fillEllipse(330, 490, 1200, 470);
      g.fillStyle(0x4f784c).fillEllipse(930, 480, 850, 390);
      g.fillStyle(0x354d36).fillRect(610, 160, 7, 145);
      g.fillStyle(0xd16f43).fillTriangle(617, 160, 617, 214, 696, 182);
      const body = this.add.graphics();
      body.fillStyle(0x225b43);
      const spikes: Phaser.Types.Math.Vector2Like[] = [];
      for (let i = 0; i < 24; i++) {
        const angle = i * Math.PI / 12;
        const radius = i % 2 ? 65 : 81;
        spikes.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
      }
      body.fillPoints(spikes, true);
      body.fillStyle(0xecb184).fillEllipse(33, 16, 102, 84);
      body.fillStyle(0x233d32).fillCircle(63, 8, 5).fillEllipse(88, 27, 17, 14).fillEllipse(-36, 72, 32, 13).fillEllipse(45, 72, 32, 13);
      body.fillStyle(0xd88465).fillEllipse(55, 29, 17, 11);
      this.hog = this.add.container(410, 250, body);
      g.lineStyle(3, 0x35593b);
      for (let i = 0; i < 17; i++) { const x = i * 56 + 15; const y = 329 + Math.sin(i) * 18; g.lineBetween(x, y, x + 5, y - 16); }
      this.input.on('pointerdown', () => this.wave());
      this.game.canvas.setAttribute('aria-hidden', 'true');
    }

    wave() {
      if (!this.hog) return;
      this.tweens.killTweensOf(this.hog);
      this.hog.setY(250).setAngle(0);
      if (!reduced) this.tweens.add({ targets: this.hog, y: 218, angle: -8, duration: 190, yoyo: true, ease: 'Sine.easeOut' });
      const heart = this.add.text(460, 162, '♡', { fontFamily: 'sans-serif', fontSize: '42px', color: '#ab4a2d' });
      if (reduced) this.time.delayedCall(800, () => heart.destroy());
      else this.tweens.add({ targets: heart, y: 100, alpha: 0, duration: 1000, onComplete: () => heart.destroy() });
    }
  }
  const scene = new WorkshopScene('workshop');
  const game = new Phaser.Game({
    type: Phaser.AUTO, parent, width: 900, height: 420, backgroundColor: '#d9e8e0',
    scene, audio: { noAudio: true }, input: { activePointers: 3 },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    banner: false,
  });
  return { wave: () => scene.wave(), destroy: () => game.destroy(true) };
}
