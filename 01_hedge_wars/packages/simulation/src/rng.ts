/**
 * Deterministic 32-bit seeded PRNG (Mulberry32 with FNV-1a seed normalization).
 * Never uses Math.random() or wall-clock time.
 */

export function normalizeSeed(seed: number | string): number {
  if (typeof seed === 'number') {
    const uint = seed >>> 0;
    return uint === 0 ? 0x6d2b79f5 : uint;
  }
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash === 0 ? 0x6d2b79f5 : hash;
}

export function stepRngState(state: number): { nextState: number; value: number } {
  const nextState = (state + 0x6d2b79f5) >>> 0;
  let t = nextState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0);
  return { nextState, value };
}

export class SeededRng {
  private currentState: number;

  constructor(seedOrState: number | string) {
    this.currentState = normalizeSeed(seedOrState);
  }

  static fromState(state: number): SeededRng {
    const rng = new SeededRng(1);
    rng.currentState = state >>> 0;
    return rng;
  }

  get state(): number {
    return this.currentState;
  }

  setState(state: number): void {
    this.currentState = state >>> 0;
  }

  nextUint32(): number {
    const { nextState, value } = stepRngState(this.currentState);
    this.currentState = nextState;
    return value;
  }

  /** Returns a deterministic float in [0, 1). */
  nextFloat01(): number {
    return this.nextUint32() / 4294967296;
  }

  /** Returns a deterministic float in [-1, 1]. */
  nextSignedUnit(): number {
    return (this.nextUint32() / 2147483647.5) - 1;
  }

  /** Returns an integer in [minInclusive, maxExclusive). */
  nextInt(minInclusive: number, maxExclusive: number): number {
    if (!Number.isInteger(minInclusive) || !Number.isInteger(maxExclusive) || maxExclusive <= minInclusive) {
      throw new RangeError(`Invalid integer range [${minInclusive}, ${maxExclusive})`);
    }
    const span = maxExclusive - minInclusive;
    return minInclusive + Math.floor(this.nextFloat01() * span);
  }

  /**
   * Derives an independent cosmetic RNG without advancing or mutating the authoritative state.
   */
  forkCosmetic(salt: number): SeededRng {
    const mixed = (Math.imul(this.currentState ^ (salt >>> 0), 0x85ebca6b) + 0xc2b2ae35) >>> 0;
    return SeededRng.fromState(mixed === 0 ? 0x9e3779b9 : mixed);
  }
}
