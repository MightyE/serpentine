/**
 * Hand-rolled, seeded noise.
 *
 * ## Why these are written out rather than installed
 *
 * They are twenty lines each. A dependency would cost more to understand than the code does,
 * and every one of these has to be a *pure function of (seed, x, y)* — no internal state, no
 * call-order dependence — which is a stronger promise than most noise libraries make.
 *
 * That purity is the whole point. A snake's markings are generated fresh every time it is
 * drawn and never stored anywhere. The only reason that works is that asking for the noise at
 * the same spot always gives the same answer, on this frame, on the next one, and after a
 * reload three weeks later.
 *
 * ## Which one to reach for
 *
 * - {@link valueNoise2D} — smooth blobby randomness. The raw material.
 * - {@link fbm2D} — several octaves of value noise stacked. Natural, cloudy, irregular edges.
 *   This is what makes blotches look organic instead of like circles.
 * - {@link worley2D} — distance to the nearest of a scattering of points. Cellular. Good for
 *   speckles, scale-like texture, and anything that should look like discrete spots.
 */

/**
 * Integer hash → a number in [0, 1).
 *
 * Not random — completely determined by its three inputs. It just *looks* random, which is
 * all noise ever needs. Same bit-mixing family as `mulberry32` in `src/lib/rng.ts`.
 */
export function hash2(seed: number, ix: number, iy: number): number {
  let h = (seed ^ Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1)) | 0
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d)
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39)
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

function fade(t: number): number {
  // Same S-curve as smoothstep. Keeps the noise from showing the square grid it is built on.
  return t * t * (3 - 2 * t)
}

/**
 * Smooth value noise in [0, 1).
 *
 * Picture a grid with a random height at every corner, and the value at any point being a
 * smooth blend of the four corners around it. Bigger `x`/`y` steps move you across more grid
 * cells, so multiply your coordinates to control the feature size.
 */
export function valueNoise2D(seed: number, x: number, y: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = fade(x - x0)
  const fy = fade(y - y0)
  const n00 = hash2(seed, x0, y0)
  const n10 = hash2(seed, x0 + 1, y0)
  const n01 = hash2(seed, x0, y0 + 1)
  const n11 = hash2(seed, x0 + 1, y0 + 1)
  const top = n00 + (n10 - n00) * fx
  const bottom = n01 + (n11 - n01) * fx
  return top + (bottom - top) * fy
}

/**
 * Fractal Brownian motion: value noise at several scales, added up.
 *
 * Each octave is twice as fine and half as strong as the one before, which is roughly how
 * real natural texture is built — big shapes with smaller shapes riding on them.
 *
 * @param octaves how many layers. 1 is smooth blobs, 6 is grainy. 3–4 is usually right.
 * @param gain how much weaker each layer is than the last. Above 0.5 keeps the big blobs
 *   dominant — which is exactly what piebald patches want.
 */
export function fbm2D(
  seed: number,
  x: number,
  y: number,
  octaves = 4,
  lacunarity = 2,
  gain = 0.5,
): number {
  let sum = 0
  let amp = 0.5
  let freq = 1
  let norm = 0
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise2D(seed + o * 7919, x * freq, y * freq)
    norm += amp
    amp *= gain
    freq *= lacunarity
  }
  return norm === 0 ? 0 : sum / norm
}

/**
 * Worley (cellular) noise: the distance from `(x, y)` to the nearest scattered feature point,
 * measured in cells. 0 means you are standing on a point; ~1 means you are far from all of them.
 *
 * Threshold it low and you get dots. That is the speckle pattern, and the glitter effect.
 */
export function worley2D(seed: number, x: number, y: number, cellSize = 1): number {
  const cx = Math.floor(x / cellSize)
  const cy = Math.floor(y / cellSize)
  let minD = Infinity
  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      const gx = cx + ox
      const gy = cy + oy
      // Two independent offsets per cell, so the point sits somewhere inside it.
      const px = (gx + hash2(seed, gx, gy)) * cellSize
      const py = (gy + hash2(seed ^ 0x9e3779b9, gx, gy)) * cellSize
      const d = Math.hypot(x - px, y - py)
      if (d < minD) minD = d
    }
  }
  return minD / cellSize
}
