/**
 * `pattern` stage — stripes running the length of the body.
 *
 * Lengthwise stripes are the opposite axis to {@link bandsStage}: bands repeat along `u`,
 * stripes repeat across `v`. Real striped morphs (the "striped" corn snake, garter snakes) are
 * usually a small odd number of stripes — one down the spine and one on each flank — so the
 * default is 3 rather than something decorative.
 */

import type { Rgba, StageDefinition } from '../contract'
import { mix, rgba, smoothstep } from '../colour'
import { fbm2D } from '../noise'

type StripesParams = {
  /** Number of stripes across the body. Odd numbers put one on the spine. */
  readonly stripeCount: number
  /** Fraction of each stripe's slot that is actually painted. */
  readonly thickness: number
  /** Edge softness across the stripe. */
  readonly softness: number
  /** Sideways waver along the body, so the stripe is not a ruler line. */
  readonly waver: number
  /** Usually `'@patternColour'`. */
  readonly colour: Rgba
  readonly strength: number
}

export const stripesStage: StageDefinition<StripesParams> = {
  kind: 'pattern',
  name: 'stripes',
  describe: 'Stripes running head to tail.',
  defaults: {
    stripeCount: 3,
    thickness: 0.42,
    softness: 0.12,
    waver: 0.05,
    colour: rgba(240, 210, 120),
    strength: 1,
  },
  render: (u, v, incoming, params, rng) => {
    const seed = rng.int(0, 0x7fffffff)

    const drift = (fbm2D(seed, u * 4, 0.5, 2) - 0.5) * 2 * params.waver
    const across = (v + drift) * 0.5 + 0.5 // 0..1 across the body
    const slot = across * params.stripeCount
    const withinSlot = Math.abs(slot - Math.floor(slot) - 0.5) * 2 // 0 at slot centre, 1 at its edge

    const half = params.thickness
    const soft = Math.max(0.001, params.softness)
    const amount = (1 - smoothstep(half - soft, half + soft, withinSlot)) * params.strength

    // Fade out at the very tip of the snout and tail, where there is no room for three stripes.
    const ends = smoothstep(0, 0.08, u) * (1 - smoothstep(0.94, 1, u))
    return mix(incoming, params.colour, amount * ends)
  },
}
