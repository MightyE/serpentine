/**
 * `planting` layer — sphagnum or cushion moss spreading across one end of the floor.
 *
 * Drawn as a noise-thresholded field rather than as objects, because moss has no individuals to
 * scatter — it has an edge, and the edge is the interesting part. `fbm2D` thresholded low gives a
 * fringed boundary for free, which is what a drawn-by-hand blob never manages.
 */

import type { LayerDefinition } from '../contract'
import { mix, toCss } from '../../render/colour'
import { fbm2D } from '../../render/noise'
import { roundRectPath } from './support'

type Params = {
  /** Share of the floor covered, 0..1. */
  readonly coverage: number
  /** Which end it grows at: -1 or 1 along the enclosure's long axis. `0` centres it. */
  readonly side: number
  /** Noise cells across the enclosure. Low is one sheet; high is speckled. */
  readonly grain: number
  readonly step: number
}

export const mossPatchLayer: LayerDefinition<Params> = {
  kind: 'planting',
  name: 'mossPatch',
  describe: 'Damp moss spreading across one end of the floor, with a fringed edge.',
  defaults: { coverage: 0.34, side: -1, grain: 13, step: 3 },
  draw: (ctx, scene, params) => {
    const { rect, palette, seed } = scene
    const short = Math.min(rect.width, rect.height)
    const step = Math.max(2, params.step)
    const scale = params.grain / Math.max(1, short)
    const cx = rect.x + rect.width * (0.5 + params.side * 0.3)
    const cy = rect.y + rect.height * 0.5
    const reach = Math.max(rect.width, rect.height) * 0.62

    ctx.save()
    roundRectPath(ctx, rect.x, rect.y, rect.width, rect.height, short * 0.05)
    ctx.clip()

    for (let y = rect.y; y < rect.y + rect.height; y += step) {
      for (let x = rect.x; x < rect.x + rect.width; x += step) {
        const falloff = 1 - Math.min(1, Math.hypot(x - cx, y - cy) / reach)
        const n = fbm2D(seed ^ 0x5eed, (x - rect.x) * scale, (y - rect.y) * scale, 3)
        const field = n * 0.55 + falloff * 0.65 - (1 - params.coverage)
        if (field <= 0) continue
        // Fade in over the first slice of the field rather than switching on at the threshold.
        // A hard edge here is what made the first draft read as green fog poured over the floor;
        // moss has a fringe, and the fringe is the only part anyone actually looks at.
        const alpha = Math.min(1, field * 22)
        // A second, much finer noise gives the cushion texture. Without it this is a flat wash
        // however good the outline is.
        const fleck = fbm2D(seed ^ 0x11a5, (x - rect.x) * scale * 5, (y - rect.y) * scale * 5, 2)
        ctx.fillStyle = toCss({
          ...mix(palette.foliageDeep, palette.foliage, 0.25 + fleck * 0.75),
          a: alpha,
        })
        ctx.fillRect(x, y, step, step)
      }
    }
    ctx.restore()
  },
}
