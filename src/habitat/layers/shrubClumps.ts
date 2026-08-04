/**
 * `planting` layer — leafy shrubs from above: a crown of overlapping lobes, lit from the warm end.
 *
 * Cover is the axis a ball python cares most about, and this is the layer that makes an enclosure
 * *look* like it supplies it. That correspondence is worth keeping: an enclosure whose numbers are
 * good should read as good at a glance, or the readout is doing all the work and the art is
 * decoration.
 */

import type { LayerDefinition } from '../contract'
import { lighten, mix, shiftHue, toCss } from '../../render/colour'
import { blobPath, contactShadow, scatter } from './support'

type Params = {
  readonly density: number
  /** Crown radius as a fraction of the shorter side. */
  readonly size: number
  /** Lobes per crown. More reads bushier. */
  readonly lobes: number
  /** 0 is a flat silhouette; 1 is fully modelled. */
  readonly relief: number
}

export const shrubClumpsLayer: LayerDefinition<Params> = {
  kind: 'planting',
  name: 'shrubClumps',
  describe: 'Leafy shrubs from above — overlapping lobes with a lit side and a shadowed one.',
  // `size` is a fraction of the enclosure's shorter side — roughly two feet of real enclosure —
  // so 0.08 is a crown about four inches across. Small. A plant that fills a quarter of the floor
  // is a tree, and a snake would have nowhere to be.
  defaults: { density: 13, size: 0.08, lobes: 6, relief: 0.8 },
  draw: (ctx, scene, params) => {
    const { rect, palette, rng, warmSide } = scene
    const short = Math.min(rect.width, rect.height)
    const area = (rect.width * rect.height) / (short * short)
    const count = Math.max(1, Math.round(params.density * area))
    const radius = short * params.size

    for (const p of scatter(rng, rect, count, radius * 0.9)) {
      const r = radius * (0.65 + p.size * 0.6)
      contactShadow(ctx, p.x, p.y, r * 0.9, warmSide, 0.3)

      for (let i = 0; i < params.lobes; i++) {
        const a = p.angle + (i / params.lobes) * Math.PI * 2
        const d = r * rng.range(0.25, 0.5)
        const lx = p.x + Math.cos(a) * d
        const ly = p.y + Math.sin(a) * d
        // Lobes facing the lamp are lighter. That single gradient is the whole sense of volume.
        const facing = (Math.cos(a) * warmSide + 1) / 2
        // A few degrees of hue drift per plant. Without it a stand of shrubs is one colour
        // stamped six times, which is exactly what it looks like.
        const leaf = shiftHue(
          mix(palette.foliageDeep, lighten(palette.foliage, 0.05), facing * params.relief),
          rng.range(-14, 14),
        )
        blobPath(ctx, lx, ly, r * rng.range(0.42, 0.7), p.seed + i * 131, 0.34, 12)
        ctx.fillStyle = toCss(leaf)
        ctx.fill()
      }
    }
  },
}
