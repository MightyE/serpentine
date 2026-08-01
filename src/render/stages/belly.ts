/**
 * `mask` stage — the pale underside.
 *
 * Almost every snake is a different colour underneath, and the transition is usually a fairly
 * sharp line low on the flank rather than a gradual fade. Drawn from above you mostly see the
 * edge of it, but that edge is what gives the body its roundness — without it a snake reads as
 * a flat sticker.
 *
 * It is a `mask` rather than a `pattern` because it replaces whatever is there: markings stop
 * at the ventral line, they do not carry on across the belly scutes.
 */

import type { Rgba, StageDefinition } from '../contract'
import { mix, rgba, smoothstep } from '../colour'

type BellyParams = {
  /** How far down the side the belly colour starts, as |v|. */
  readonly start: number
  /** How abruptly it takes over. */
  readonly softness: number
  /** Usually `'@bellyColour'`. */
  readonly colour: Rgba
  /** How completely it replaces the pattern. Below 1 lets some markings bleed over the edge. */
  readonly strength: number
}

export const bellyStage: StageDefinition<BellyParams> = {
  kind: 'mask',
  name: 'belly',
  describe: 'A paler underside, taking over low on the flanks.',
  defaults: {
    start: 0.74,
    softness: 0.1,
    colour: rgba(238, 232, 214),
    strength: 0.95,
  },
  render: (_u, v, incoming, params) => {
    const soft = Math.max(0.001, params.softness)
    const amount = smoothstep(params.start - soft, params.start + soft, Math.abs(v))
    return mix(incoming, params.colour, amount * params.strength)
  },
}
