/**
 * `furniture` layer — a water dish, seen from directly above: a rim, and a disc of water with a
 * highlight on it.
 *
 * Layout puts this at the **cool** end, opposite the lamp, and that is husbandry rather than
 * composition — a dish under a basking lamp is how you get a humid enclosure and an overheated
 * animal. `contract.ts`'s note on `warmSide` explains why the correct arrangement is also the
 * better-looking one.
 */

import type { LayerDefinition } from '../contract'
import { lighten, mix, toCss } from '../../render/colour'
import { contactShadow } from './support'

type Params = {
  /** Outer radius as a fraction of the enclosure's shorter side. */
  readonly size: number
  /** Rim thickness as a fraction of the radius. */
  readonly rim: number
  /** 0 is bone dry; 1 is brim full. */
  readonly fill: number
}

export const waterDishLayer: LayerDefinition<Params> = {
  kind: 'furniture',
  name: 'waterDish',
  describe: 'A water dish from above: ceramic rim, water disc, one specular highlight.',
  defaults: { size: 0.15, rim: 0.2, fill: 0.85 },
  draw: (ctx, scene, params, placement) => {
    const { rect, palette, warmSide } = scene
    const short = Math.min(rect.width, rect.height)
    const r = short * params.size * placement.scale

    contactShadow(ctx, placement.x, placement.y, r, warmSide, 0.4)

    const ceramic = mix(palette.stone, palette.skyTop, 0.3)
    ctx.fillStyle = toCss(ceramic)
    ctx.beginPath()
    ctx.arc(placement.x, placement.y, r, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = toCss(mix(ceramic, palette.substrateDark, 0.45))
    ctx.beginPath()
    ctx.arc(placement.x, placement.y, r * (1 - params.rim), 0, Math.PI * 2)
    ctx.fill()

    const water = r * (1 - params.rim) * (0.5 + params.fill * 0.5)
    const surface = ctx.createRadialGradient(
      placement.x - warmSide * water * 0.3,
      placement.y - water * 0.3,
      water * 0.05,
      placement.x,
      placement.y,
      water,
    )
    // Water is the only cool-coloured thing in most of these palettes, which is why it reads as
    // water at any size — the hue does the identifying, not the shape.
    surface.addColorStop(0, toCss({ ...lighten(mix(palette.skyBottom, palette.light, 0.15), 0.2), a: 0.95 }))
    surface.addColorStop(1, toCss({ ...mix(palette.skyBottom, palette.substrateDark, 0.35), a: 0.95 }))
    ctx.fillStyle = surface
    ctx.beginPath()
    ctx.arc(placement.x, placement.y, water, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
    ctx.beginPath()
    ctx.ellipse(
      placement.x + warmSide * water * 0.34,
      placement.y - water * 0.32,
      water * 0.3,
      water * 0.16,
      -0.5 * warmSide,
      0,
      Math.PI * 2,
    )
    ctx.fill()
  },
}
