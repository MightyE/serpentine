/**
 * `modifier` stage — turn the contrast down.
 *
 * "Ghost" in the hobby is usually a combination that reduces pigment *density* without removing
 * a pigment outright. The pattern does not go anywhere; it just stops shouting. Everything
 * drifts toward the middle — the dark parts lighten, the light parts dull, and the whole animal
 * takes on a soft, misty look.
 *
 * As an operation that is almost the definition of contrast reduction: push every lightness
 * value toward the halfway mark, and take some of the saturation with it.
 *
 * Stack it with {@link albinoStage} and you get the pale, dusty pastel that a combination of
 * two pigment-reducing genes actually produces — which is the entire point of stages composing
 * instead of being written out one combination at a time.
 */

import type { StageDefinition } from '../contract'
import { clamp01, fromHsl, toHsl } from '../colour'

type GhostParams = {
  /** 0 changes nothing; 1 flattens almost all contrast. */
  readonly amount: number
  /** What "the middle" is. Above 0.5 fades toward light, below toward smoky. */
  readonly midpoint: number
  /** How much of the colour drains along with the contrast. */
  readonly desaturate: number
}

export const ghostStage: StageDefinition<GhostParams> = {
  kind: 'modifier',
  name: 'ghost',
  describe: 'Softens the pattern by pulling every shade toward the middle.',
  defaults: {
    amount: 0.7,
    midpoint: 0.56,
    desaturate: 0.45,
  },
  render: (_u, _v, incoming, params) => {
    const amount = clamp01(params.amount)
    if (amount === 0) return incoming
    const hsl = toHsl(incoming)
    const l = params.midpoint + (hsl.l - params.midpoint) * (1 - amount * 0.75)
    const s = hsl.s * (1 - amount * clamp01(params.desaturate))
    return fromHsl({ h: hsl.h, s: clamp01(s), l: clamp01(l), a: hsl.a })
  },
}
