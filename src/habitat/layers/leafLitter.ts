/**
 * `scatter` layer — fallen leaves, drawn as flat ellipses with a midrib.
 *
 * Litter is what makes a woodland floor read as a floor rather than as a brown rectangle, and it
 * is the cheapest cover an enclosure can have — which is also true of the real thing.
 */

import type { LayerDefinition } from '../contract'
import { mix, shiftHue, toCss } from '../../render/colour'
import { scatter } from './support'

type Params = {
  readonly density: number
  /** Leaf length as a fraction of the shorter side. */
  readonly size: number
  /** How far the hue wanders leaf to leaf, in degrees. Autumn wants a lot; a rainforest none. */
  readonly hueSpread: number
  /** 0 keeps the foliage colour; 1 is fully dried toward `wood`. */
  readonly dryness: number
}

export const leafLitterLayer: LayerDefinition<Params> = {
  kind: 'scatter',
  name: 'leafLitter',
  describe: 'Fallen leaves lying flat, each at its own angle and its own shade.',
  defaults: { density: 60, size: 0.05, hueSpread: 26, dryness: 0.65 },
  draw: (ctx, scene, params) => {
    const { rect, palette, rng } = scene
    const short = Math.min(rect.width, rect.height)
    const area = (rect.width * rect.height) / (short * short)
    const count = Math.max(1, Math.round(params.density * area))
    const length = short * params.size
    const base = mix(palette.foliage, palette.wood, params.dryness)

    for (const p of scatter(rng, rect, count, length * 0.6)) {
      const l = length * (0.7 + p.size * 0.6)
      const w = l * 0.42
      const tint = shiftHue(base, (rng.next() - 0.5) * params.hueSpread * 2)

      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.angle)

      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'
      ctx.beginPath()
      ctx.ellipse(l * 0.06, l * 0.08, l / 2, w / 2, 0, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = toCss(tint)
      ctx.beginPath()
      ctx.ellipse(0, 0, l / 2, w / 2, 0, 0, Math.PI * 2)
      ctx.fill()

      ctx.strokeStyle = toCss({ ...mix(tint, palette.foliageDeep, 0.6), a: 0.7 })
      ctx.lineWidth = Math.max(0.5, l * 0.035)
      ctx.beginPath()
      ctx.moveTo(-l / 2, 0)
      ctx.lineTo(l / 2, 0)
      ctx.stroke()
      ctx.restore()
    }
  },
}
