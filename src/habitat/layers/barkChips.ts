/**
 * `scatter` layer — orchid bark or cypress mulch: coarse angular chips over the substrate.
 *
 * A humidity-holding substrate looks *chunky* from above, where sand looks smooth. That contrast
 * is doing real work in the store view — two enclosures at postage-stamp size are told apart by
 * their grain long before anyone reads the label.
 */

import type { LayerDefinition } from '../contract'
import { lighten, mix, toCss } from '../../render/colour'
import { scatter } from './support'

type Params = {
  readonly density: number
  /** Chip length as a fraction of the shorter side. */
  readonly size: number
  /** How much darker than `wood` the chips sit. 0 is fresh bark; 1 is damp mould. */
  readonly damp: number
}

export const barkChipsLayer: LayerDefinition<Params> = {
  kind: 'scatter',
  name: 'barkChips',
  describe: 'Coarse angular bark chips — the chunky grain of a humidity substrate.',
  defaults: { density: 90, size: 0.038, damp: 0.4 },
  draw: (ctx, scene, params) => {
    const { rect, palette, rng } = scene
    const short = Math.min(rect.width, rect.height)
    const area = (rect.width * rect.height) / (short * short)
    const count = Math.max(1, Math.round(params.density * area))
    const length = short * params.size
    const body = mix(palette.wood, palette.substrateDark, params.damp)

    for (const p of scatter(rng, rect, count, length)) {
      const l = length * (0.6 + p.size * 0.8)
      const w = l * (0.34 + rng.next() * 0.24)
      const tint = rng.chance(0.35) ? lighten(body, 0.07) : body

      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.angle)
      // Four-sided and irregular: a chip, not a pill.
      ctx.beginPath()
      ctx.moveTo(-l / 2, -w * 0.3)
      ctx.lineTo(-l * 0.1, -w / 2)
      ctx.lineTo(l / 2, -w * 0.24)
      ctx.lineTo(l * 0.34, w / 2)
      ctx.closePath()
      ctx.fillStyle = toCss(tint)
      ctx.fill()
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)'
      ctx.lineWidth = Math.max(0.4, l * 0.05)
      ctx.stroke()
      ctx.restore()
    }
  },
}
