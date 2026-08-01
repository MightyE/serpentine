/**
 * `pattern` stage — speckles, confetti, freckles.
 *
 * Built on Worley noise, which measures how far you are from the nearest of a scattering of
 * invisible points. Close to a point → inside a speckle. That gives you dots that are evenly
 * spread but not on a grid, which is what natural speckling looks like and what a simple
 * `x % spacing` never manages.
 *
 * Layered on top of another pattern this is the "confetti"/"pied dust" look; on its own over a
 * dark base it reads as star-speckling.
 */

import type { Rgba, StageDefinition } from '../contract'
import { mix, rgba, smoothstep } from '../colour'
import { worley2D } from '../noise'

type SpeckleParams = {
  /** Speckles per body length. Higher is denser. */
  readonly density: number
  /** How much the speckle field is stretched across the body vs. along it. */
  readonly vStretch: number
  /** Speckle size, as a fraction of the spacing between them. */
  readonly radius: number
  /** Edge softness — 0 gives hard dots, higher gives soft freckles. */
  readonly softness: number
  readonly colour: Rgba
  readonly strength: number
}

export const speckleStage: StageDefinition<SpeckleParams> = {
  kind: 'pattern',
  name: 'speckle',
  describe: 'Scattered dots, evenly spread but never in rows.',
  defaults: {
    density: 40,
    vStretch: 0.035,
    radius: 0.3,
    softness: 0.12,
    colour: rgba(250, 245, 225),
    strength: 0.9,
  },
  render: (u, v, incoming, params, rng) => {
    const seed = rng.int(0, 0x7fffffff)
    const d = worley2D(seed, u * params.density, v * params.density * params.vStretch, 1)
    const soft = Math.max(0.001, params.softness)
    const inside = 1 - smoothstep(params.radius - soft, params.radius + soft, d)
    return mix(incoming, params.colour, inside * params.strength)
  },
}
