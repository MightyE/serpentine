/**
 * `substrate` layer — the floor covering, mottled with two octaves of noise.
 *
 * One layer, every biome: sand, aspen shavings, leaf mould and coir all differ by *palette and
 * grain*, not by drawing code. That is the whole argument for a shared registry — retinting is
 * editing a biome's `BiomePalette`, and it is not editing this file.
 */

import type { LayerDefinition } from '../contract'
import { mix, toCss } from '../../render/colour'
import { fbm2D } from '../../render/noise'
import { roundRectPath } from './support'

type Params = {
  /** Noise cells across the enclosure. Low is dunes; high is shavings. */
  readonly grain: number
  /** How far the mottle swings between `substrateDark` and `substrate`, 0..1. */
  readonly contrast: number
  /** Octaves of fbm. 1 is smooth; 4 is gritty. */
  readonly octaves: number
  /** Cell size in logical pixels. Bigger cells are cheaper and blockier. */
  readonly step: number
}

export const substrateWashLayer: LayerDefinition<Params> = {
  kind: 'substrate',
  name: 'substrateWash',
  describe: 'The floor covering, mottled with seeded noise. Every biome uses this one.',
  defaults: { grain: 7, contrast: 0.8, octaves: 3, step: 4 },
  draw: (ctx, scene, params) => {
    const { rect, palette, seed } = scene
    const step = Math.max(2, params.step)
    const short = Math.min(rect.width, rect.height)

    ctx.save()
    roundRectPath(ctx, rect.x, rect.y, rect.width, rect.height, short * 0.05)
    ctx.clip()

    const scale = params.grain / Math.max(1, short)
    for (let y = rect.y; y < rect.y + rect.height; y += step) {
      for (let x = rect.x; x < rect.x + rect.width; x += step) {
        const n = fbm2D(seed, (x - rect.x) * scale, (y - rect.y) * scale, params.octaves)
        const t = 0.5 + (n - 0.5) * params.contrast
        ctx.fillStyle = toCss(mix(palette.substrateDark, palette.substrate, t))
        ctx.fillRect(x, y, step, step)
      }
    }
    ctx.restore()
  },
}
