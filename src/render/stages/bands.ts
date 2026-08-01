/**
 * `pattern` stage — saddles: rounded blotches marching down the back.
 *
 * This is the corn-snake / ball-python silhouette, and it is the most recognisably "snake" of
 * the four starter patterns. Two things make it read as an animal rather than as wallpaper:
 *
 * - the saddle is **narrower at the flanks than on the spine**, so it looks like a shape lying
 *   over a rounded body rather than a stripe painted across a flat one;
 * - the edges **wobble**, driven by noise. Perfectly straight edges look printed.
 */

import type { Rgba, StageDefinition } from '../contract'
import { mix, rgba, smoothstep } from '../colour'
import { fbm2D } from '../noise'

type BandsParams = {
  /** How many saddles from nose to tail. */
  readonly bandCount: number
  /** Fraction of each repeat that is saddle rather than gap. 0.5 is even. */
  readonly duty: number
  /** How far down the sides a saddle reaches. 1 would be all the way to the belly. */
  readonly reach: number
  /** How ragged the saddle edges are. 0 is a clean printed edge. */
  readonly wobble: number
  /** Edge softness. Small is crisp, large is airbrushed. */
  readonly softness: number
  /** Usually `'@patternColour'`. */
  readonly colour: Rgba
  /** 0 draws nothing, 1 draws the saddle at full strength. */
  readonly strength: number
}

export const bandsStage: StageDefinition<BandsParams> = {
  kind: 'pattern',
  name: 'bands',
  describe: 'Rounded saddles repeating down the back, narrowing at the sides.',
  defaults: {
    bandCount: 24,
    duty: 0.52,
    reach: 0.72,
    wobble: 0.22,
    softness: 0.09,
    colour: rgba(90, 55, 40),
    strength: 1,
  },
  render: (u, v, incoming, params, rng) => {
    const seed = rng.int(0, 0x7fffffff)

    // Nudge the saddle boundaries around so no two are identical. Divided by `bandCount` so the
    // wobble is a fraction of *one saddle* — without that division, "0.3" means a third of the
    // whole body and the saddles dissolve into noise.
    const jitter = ((fbm2D(seed, u * 7, v * 1.5, 3) - 0.5) * params.wobble) / params.bandCount
    const cycle = (u + jitter) * params.bandCount
    const withinBand = cycle - Math.floor(cycle)

    const soft = Math.max(0.001, params.softness)
    const alongBody =
      smoothstep(0, soft, withinBand) * (1 - smoothstep(params.duty - soft, params.duty, withinBand))

    // Saddles pinch in toward the head and tail, following the body itself.
    const taper = 0.55 + 0.45 * smoothstep(0, 0.18, u) * (1 - smoothstep(0.82, 1, u))
    const reach = params.reach * taper
    const acrossBody = 1 - smoothstep(reach - 0.22, reach, Math.abs(v))

    const amount = alongBody * acrossBody * params.strength
    return mix(incoming, params.colour, amount)
  },
}
