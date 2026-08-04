/**
 * `scatter` layer — small stones lying on the substrate.
 *
 * The template for a scatter layer, and the shortest one: fork nothing, take `scene.rng` (the
 * composer has already forked it for you), scatter, draw. Copy this file to add gravel, shed
 * skin, cuttlebone or anything else that lies flat.
 */

import type { LayerDefinition } from '../contract'
import { lighten, mix, toCss } from '../../render/colour'
import { blobPath, scatter } from './support'

type Params = {
  /** How many stones. Scaled by enclosure area, so this is a density, not a count. */
  readonly density: number
  /** Stone radius as a fraction of the enclosure's shorter side. */
  readonly size: number
  /** 0 is `stone`; 1 is fully the substrate colour. Buries them into the ground. */
  readonly blend: number
}

export const pebbleScatterLayer: LayerDefinition<Params> = {
  kind: 'scatter',
  name: 'pebbleScatter',
  describe: 'Small stones lying flat on the substrate.',
  defaults: { density: 30, size: 0.018, blend: 0.35 },
  draw: (ctx, scene, params) => {
    const { rect, palette, rng } = scene
    const short = Math.min(rect.width, rect.height)
    const area = (rect.width * rect.height) / (short * short)
    const count = Math.max(1, Math.round(params.density * area))
    const radius = short * params.size
    const body = mix(palette.stone, palette.substrate, params.blend)

    for (const p of scatter(rng, rect, count, radius * 1.6)) {
      const r = radius * p.size
      ctx.fillStyle = `rgba(0, 0, 0, 0.22)`
      blobPath(ctx, p.x + r * 0.16, p.y + r * 0.2, r, p.seed, 0.2, 10)
      ctx.fill()

      blobPath(ctx, p.x, p.y, r, p.seed, 0.2, 10)
      ctx.fillStyle = toCss(body)
      ctx.fill()

      // A lit crescent on the warm side. One highlight is the difference between a stone and
      // a hole in the floor.
      ctx.save()
      blobPath(ctx, p.x, p.y, r, p.seed, 0.2, 10)
      ctx.clip()
      ctx.fillStyle = toCss({ ...lighten(body, 0.12), a: 0.85 })
      ctx.beginPath()
      ctx.arc(p.x + scene.warmSide * r * 0.3, p.y - r * 0.3, r * 0.72, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  },
}
