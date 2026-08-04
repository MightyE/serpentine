/**
 * `backdrop` layer — the enclosure seen from above: floor, inner wall, and the shadow the wall
 * casts onto the substrate.
 *
 * ## Top-down, and what that does to the contract
 *
 * `contract.ts` describes the layer kinds in side-on words ("the back wall and anything distant").
 * The store view is top-down, so the same seven kinds are read one turn of the wrist over:
 * `backdrop` is the box itself, `substrate` is the floor, `planting` and `furniture` are things
 * lying on it, and `light` is what falls across all of it. The *order* is unchanged and so is
 * every signature — see `compose.ts` for the full mapping. This is the first layer to draw and the
 * only one allowed to ignore what came before it.
 */

import type { LayerDefinition } from '../contract'
import { lighten, mix, toCss } from '../../render/colour'
import { roundRectPath } from './support'

type Params = {
  /** Wall thickness as a fraction of the shorter side. */
  readonly wall: number
  /** Corner radius as a fraction of the shorter side. */
  readonly radius: number
}

export const enclosureFloorLayer: LayerDefinition<Params> = {
  kind: 'backdrop',
  name: 'enclosureFloor',
  describe: 'The box itself: rim, inner wall, and the wall shadow falling onto the floor.',
  defaults: { wall: 0.045, radius: 0.06 },
  draw: (ctx, scene, params) => {
    const { rect, palette } = scene
    const short = Math.min(rect.width, rect.height)
    const wall = Math.max(1.5, short * params.wall)
    const radius = short * params.radius

    // The rim, read as the top edge of the glass looking straight down at it.
    const rim = mix(palette.stone, palette.skyTop, 0.55)
    roundRectPath(ctx, rect.x, rect.y, rect.width, rect.height, radius)
    ctx.fillStyle = toCss(lighten(rim, 0.04))
    ctx.fill()

    // The floor. Everything after this draws inside it.
    const inner = {
      x: rect.x + wall,
      y: rect.y + wall,
      width: rect.width - wall * 2,
      height: rect.height - wall * 2,
    }
    roundRectPath(ctx, inner.x, inner.y, inner.width, inner.height, Math.max(0, radius - wall))
    ctx.fillStyle = toCss(palette.substrateDark)
    ctx.fill()

    // The wall's own shadow on the substrate — thin, and thinner on the warm side, because the
    // lamp is over there. Cheap, and it is most of what makes the box read as having depth.
    ctx.save()
    roundRectPath(ctx, inner.x, inner.y, inner.width, inner.height, Math.max(0, radius - wall))
    ctx.clip()
    const shade = ctx.createLinearGradient(
      scene.warmSide === 1 ? inner.x : inner.x + inner.width,
      inner.y,
      scene.warmSide === 1 ? inner.x + inner.width : inner.x,
      inner.y + inner.height,
    )
    shade.addColorStop(0, 'rgba(0, 0, 0, 0.34)')
    shade.addColorStop(0.35, 'rgba(0, 0, 0, 0.08)')
    shade.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = shade
    ctx.fillRect(inner.x, inner.y, inner.width, inner.height)
    ctx.restore()
  },
}
