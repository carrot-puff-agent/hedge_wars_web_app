/**
 * Gesture-gated sound effects controller with Ukrainian mute toggle (UI-05 / UI-A04).
 * Uses curated upstream Hedgewars .ogg clips with a Web Audio API synth fallback.
 */

export type SoundEffectId =
  | 'explosion'
  | 'bounce'
  | 'splash'
  | 'launch'
  | 'turn'
  | 'jump'
  | 'wave';

const AUDIO_CLIPS: Partial<Record<SoundEffectId, string>> = {
  explosion: new URL('../public/audio/explosion.ogg', import.meta.url).href,
  bounce: new URL('../public/audio/grenadeimpact.ogg', import.meta.url).href,
  splash: new URL('../public/audio/splash.ogg', import.meta.url).href,
  launch: new URL('../public/audio/throwrelease.ogg', import.meta.url).href,
  turn: new URL('../public/audio/switchhog.ogg', import.meta.url).href,
};

const MUTE_STORAGE_KEY = 'yizhaklub.hedge.muted';

export class SoundController {
  private unlocked = false;
  private muted = false;
  private ctx: AudioContext | null = null;
  private readonly elements = new Map<SoundEffectId, HTMLAudioElement>();

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_STORAGE_KEY) === '1';
    } catch {
      this.muted = false;
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_STORAGE_KEY, muted ? '1' : '0');
    } catch {
      // ignore storage quota errors
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  public unlockFromGesture(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx && !this.ctx) {
        this.ctx = new AudioCtx();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume().catch(() => {});
      }
    } catch {
      // ignore if Web Audio is unavailable
    }
  }

  public play(effect: SoundEffectId): void {
    if (this.muted || !this.unlocked) return;

    const clipUrl = AUDIO_CLIPS[effect];
    if (clipUrl && typeof Audio !== 'undefined') {
      try {
        let el = this.elements.get(effect);
        if (!el) {
          el = new Audio(clipUrl);
          el.preload = 'auto';
          el.volume = 0.55;
          this.elements.set(effect, el);
        }
        el.currentTime = 0;
        const playPromise = el.play();
        if (playPromise) {
          playPromise.catch(() => {
            this.playSynthFallback(effect);
          });
          return;
        }
      } catch {
        // fall through to synth
      }
    }
    this.playSynthFallback(effect);
  }

  private playSynthFallback(effect: SoundEffectId): void {
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);

      switch (effect) {
        case 'explosion':
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(120, now);
          osc.frequency.exponentialRampToValueAtTime(32, now + 0.28);
          gain.gain.setValueAtTime(0.18, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
          osc.start(now);
          osc.stop(now + 0.3);
          break;
        case 'launch':
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(220, now);
          osc.frequency.exponentialRampToValueAtTime(480, now + 0.14);
          gain.gain.setValueAtTime(0.12, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
          osc.start(now);
          osc.stop(now + 0.15);
          break;
        case 'bounce':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(300, now);
          osc.frequency.exponentialRampToValueAtTime(140, now + 0.08);
          gain.gain.setValueAtTime(0.1, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
          osc.start(now);
          osc.stop(now + 0.09);
          break;
        case 'splash':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(420, now);
          osc.frequency.exponentialRampToValueAtTime(160, now + 0.2);
          gain.gain.setValueAtTime(0.12, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
          osc.start(now);
          osc.stop(now + 0.22);
          break;
        case 'jump':
        case 'wave':
        case 'turn':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(340, now);
          osc.frequency.exponentialRampToValueAtTime(520, now + 0.12);
          gain.gain.setValueAtTime(0.1, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
          osc.start(now);
          osc.stop(now + 0.13);
          break;
      }
    } catch {
      // ignore audio errors
    }
  }
}
