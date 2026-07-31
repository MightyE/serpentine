/**
 * Seeded random numbers.
 *
 * Everything random in Serpentine goes through one of these — never `Math.random()`.
 * That single rule buys us a lot:
 *
 *   - The same parents + the same seed always produce the same clutch, so a breeding
 *     result can be shared, saved, replayed, and debugged.
 *   - Tests can assert exact outcomes instead of "roughly a 3:1 ratio, probably, usually".
 *   - A snake's markings can be generated fresh every frame from its id and still look
 *     identical each time, so we never have to store the pattern.
 *
 * If you ever find `Math.random()` in this codebase, it is a bug.
 */

/** Anything that can hand out random numbers in [0, 1). */
export interface Rng {
  /** Next float in [0, 1). */
  next(): number
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number
  /** True with the given probability (0..1). */
  chance(probability: number): boolean
  /** Uniform float in [min, max). */
  range(min: number, max: number): number
  /** A uniformly chosen element. Throws on an empty array. */
  pick<T>(items: readonly T[]): T
  /** A new shuffled copy (Fisher-Yates). Does not mutate the input. */
  shuffle<T>(items: readonly T[]): T[]
  /** Approximately normal, mean 0, standard deviation 1 (Box-Muller). */
  gaussian(): number
  /**
   * A fresh independent stream derived from this one and a label.
   * Use this to keep unrelated systems from stealing each other's numbers —
   * e.g. `rng.fork('pattern')` for markings vs `rng.fork('clutch')` for eggs.
   */
  fork(label: string): Rng
}

/**
 * Hash a string into a 32-bit integer seed (cyrb53, truncated).
 * Lets us seed from readable things: a snake's id, a save-file name, "clutch-3".
 */
export function hashSeed(seed: string): number {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < seed.length; i++) {
    const ch = seed.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0) ^ (h1 >>> 0)
}

/**
 * mulberry32 — small, fast, and statistically good enough for a game.
 * Not cryptographically secure, which is fine; nothing here guards anything.
 */
class Mulberry32 implements Rng {
  private state: number
  private readonly seedLabel: string

  constructor(seed: number | string) {
    this.seedLabel = typeof seed === 'string' ? seed : String(seed)
    this.state = (typeof seed === 'string' ? hashSeed(seed) : seed) >>> 0
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1))
  }

  chance(probability: number): boolean {
    return this.next() < probability
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min)
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('rng.pick() called on an empty array')
    return items[this.int(0, items.length - 1)]!
  }

  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items]
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i)
      ;[out[i], out[j]] = [out[j]!, out[i]!]
    }
    return out
  }

  gaussian(): number {
    // Box-Muller. `next()` can return exactly 0, and log(0) is -Infinity, so nudge it.
    const u = this.next() || Number.EPSILON
    const v = this.next()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }

  fork(label: string): Rng {
    return new Mulberry32(`${this.seedLabel}::${label}::${this.state}`)
  }
}

/** Make a seeded generator. Same seed in, same sequence out, forever. */
export function makeRng(seed: number | string): Rng {
  return new Mulberry32(seed)
}

/**
 * A generator seeded from the clock. Use this only at the true edges of the app —
 * "start a new game", "the player clicked Breed and we need a fresh seed" — and then
 * *record the seed you used* so the result stays reproducible.
 */
export function makeUnseededRng(): Rng {
  return new Mulberry32(`${Date.now()}-${Math.floor(Math.random() * 1e9)}`)
}
