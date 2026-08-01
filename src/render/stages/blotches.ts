/**
 * `pattern` stage — irregular blotches.
 *
 * Where {@link bandsStage} is regular, this is not. It takes a cloud of fractal noise and keeps
 * everything above a threshold — which produces shapes that are blobby, differently sized, and
 * never quite repeat. That is the ball-python look, and it is what noise is *for*: getting
 * variety without anyone having to draw fifty different blobs.
 *
 * Turn `softness` up and the blotches fade into each other like a watercolour; turn it down and
 * they get hard edges like a jigsaw.
 *
 * ## The one thing that catches everybody out
 *
 * `u` and `v` are **not** the same distance on screen. A snake is roughly fifteen times longer
 * than it is wide, so one unit of `u` covers fifteen times more body than one unit of `v`. Set
 * `scaleU` and `scaleV` to similar numbers and your "blobs" come out as long thin streaks
 * running down the animal. `scaleV` wants to be a small fraction of `scaleU` — which is also
 * why real ball python blotches wrap right across the back rather than sitting in the middle
 * of it.
 */

import type { Rgba, StageDefinition } from '../contract'
import { mix, rgba, smoothstep } from '../colour'
import { fbm2D } from '../noise'

type BlotchParams = {
  /** Blob size along the body. Higher is more, smaller blobs. */
  readonly scaleU: number
  /** Blob size across the body. Wants to be *much* smaller than `scaleU` — see the note above. */
  readonly scaleV: number
  /** How much of the body is covered. Lower threshold = more blotch. */
  readonly threshold: number
  /** Edge softness. */
  readonly softness: number
  /** Noise layers. 2 is smooth and rounded, 5 is crinkly and lichen-like. */
  readonly octaves: number
  /** Usually `'@patternColour'`. */
  readonly colour: Rgba
  readonly strength: number
}

export const blotchesStage: StageDefinition<BlotchParams> = {
  kind: 'pattern',
  name: 'blotches',
  describe: 'Irregular organic blotches, no two the same.',
  defaults: {
    scaleU: 10,
    scaleV: 0.55,
    threshold: 0.52,
    softness: 0.07,
    octaves: 3,
    colour: rgba(60, 45, 35),
    strength: 1,
  },
  render: (u, v, incoming, params, rng) => {
    const seed = rng.int(0, 0x7fffffff)
    const n = fbm2D(seed, u * params.scaleU, v * params.scaleV, Math.max(1, Math.round(params.octaves)))
    const soft = Math.max(0.001, params.softness)
    const edge = smoothstep(params.threshold - soft, params.threshold + soft, n)
    return mix(incoming, params.colour, edge * params.strength)
  },
}
