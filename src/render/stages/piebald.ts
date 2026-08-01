/**
 * `mask` stage — piebald: irregular unpigmented patches.
 *
 * ## Why this is a mask and not a pattern
 *
 * Piebald does not add markings. It **removes** them, in patches, right down to bare white
 * skin — and it does not care what was underneath. A piebald albino and a piebald normal have
 * exactly the same white patches, because the patches are places where no pigment cell arrived
 * at all during development.
 *
 * That is precisely what a `mask` stage is: it replaces a region outright rather than mixing
 * with what is there. Writing it as a pattern would mean writing a piebald version of every
 * other pattern, forever.
 *
 * ## Getting the shape right
 *
 * Few noise octaves and a high `gain` keep the big shapes dominant, which is what produces
 * large irregular continents rather than a fine spatter. That single parameter choice is the
 * difference between "piebald" and "dirty".
 */

import type { Rgba, StageDefinition } from '../contract'
import { mix, rgba, smoothstep } from '../colour'
import { fbm2D } from '../noise'

type PiebaldParams = {
  /** Fraction of the body left unpigmented, roughly. 0 is none, 1 is nearly all. */
  readonly coverage: number
  /** Patch size. Lower is a few huge patches; higher is many smaller ones. */
  readonly scale: number
  /** Edge softness. Real piebald edges are fairly crisp, so keep this small. */
  readonly softness: number
  /** The unpigmented colour. Skin, not paint — slightly warm, never pure white. */
  readonly colour: Rgba
  /**
   * Bias toward the middle of the body. Piebald patches concentrate mid-body and spare the
   * head, which is one of the giveaways that it is a developmental pattern and not a paint job.
   */
  readonly spareHead: number
}

export const piebaldStage: StageDefinition<PiebaldParams> = {
  kind: 'mask',
  name: 'piebald',
  describe: 'Irregular patches with no pigment at all, whatever the pattern underneath.',
  defaults: {
    coverage: 0.4,
    scale: 3.4,
    softness: 0.045,
    colour: rgba(248, 244, 236),
    spareHead: 0.22,
  },
  render: (u, v, incoming, params, rng) => {
    const seed = rng.int(0, 0x7fffffff)
    // Two octaves, gain 0.68: big blobby continents rather than fine grain.
    const n = fbm2D(seed, u * params.scale, v * params.scale * 0.14, 2, 2, 0.68)
    // High coverage means a low threshold, so the parameter reads the way you would expect.
    const threshold = 1 - params.coverage
    const soft = Math.max(0.001, params.softness)
    let amount = smoothstep(threshold - soft, threshold + soft, n)
    amount *= smoothstep(0, Math.max(0.001, params.spareHead), u)
    return mix(incoming, params.colour, amount)
  },
}
