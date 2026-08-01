/**
 * `modifier` stage — clean the markings off the flanks.
 *
 * The hobby calls the extreme version of this "clown" or "reduced pattern": the markings pull
 * back toward the spine and the sides go clear, often leaving a single clean dorsal line where
 * a row of blotches used to be.
 *
 * Like every modifier it works on whatever is already there — it never asks what pattern it is
 * reducing. It just erases toward a target colour, more strongly the further down the flank you
 * are. `towards` is normally `'@baseColour'`, so the cleared area matches the body.
 */

import type { Rgba, StageDefinition } from '../contract'
import { clamp01, mix, rgba, smoothstep } from '../colour'

type ReductionParams = {
  /** How completely the flanks clear. 0 changes nothing, 1 removes the markings entirely. */
  readonly amount: number
  /** How wide a strip along the spine keeps its markings, as |v|. */
  readonly keepDorsal: number
  /** How gradually the clearing sets in below `keepDorsal`. */
  readonly softness: number
  /** What the cleared area becomes. Usually `'@baseColour'`. */
  readonly towards: Rgba
}

export const patternReductionStage: StageDefinition<ReductionParams> = {
  kind: 'modifier',
  name: 'patternReduction',
  describe: 'Pulls the markings in toward the spine and clears the flanks.',
  defaults: {
    amount: 0.85,
    keepDorsal: 0.3,
    softness: 0.28,
    towards: rgba(150, 140, 110),
  },
  render: (_u, v, incoming, params) => {
    const away = smoothstep(params.keepDorsal, params.keepDorsal + Math.max(0.001, params.softness), Math.abs(v))
    return mix(incoming, params.towards, away * clamp01(params.amount))
  },
}
