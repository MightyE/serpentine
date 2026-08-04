/**
 * `light` layer — the basking pool at the warm end, and a vignette pulling the cool end down.
 *
 * This is most of the cosiness budget and it is deliberately the last thing to draw: it tints
 * everything under it, so a stone at the warm end and the same stone at the cool end are visibly
 * different objects. Nothing else in the pipeline creates that gradient, and without it a
 * top-down enclosure reads flat no matter how good the furniture is.
 */

import type { LayerDefinition } from '../contract'
import { toCss } from '../../render/colour'
import { roundRectPath } from './support'

type Params = {
  /** Pool radius as a fraction of the enclosure's longer side. */
  readonly reach: number
  /** Peak opacity at the centre of the pool. */
  readonly intensity: number
  /** How dark the far corner goes, 0..1. */
  readonly vignette: number
}

export const warmPoolLayer: LayerDefinition<Params> = {
  kind: 'light',
  name: 'warmPool',
  describe: 'The basking pool at the warm end, plus a vignette at the cool end.',
  defaults: { reach: 0.58, intensity: 0.34, vignette: 0.28 },
  draw: (ctx, scene, params) => {
    const { rect, palette, warmSide } = scene
    const short = Math.min(rect.width, rect.height)

    ctx.save()
    roundRectPath(ctx, rect.x, rect.y, rect.width, rect.height, short * 0.05)
    ctx.clip()

    const cx = rect.x + rect.width * (0.5 + warmSide * 0.28)
    const cy = rect.y + rect.height * 0.42
    const r = Math.max(rect.width, rect.height) * params.reach

    const pool = ctx.createRadialGradient(cx, cy, r * 0.04, cx, cy, r)
    pool.addColorStop(0, toCss({ ...palette.light, a: params.intensity }))
    pool.addColorStop(0.45, toCss({ ...palette.light, a: params.intensity * 0.35 }))
    pool.addColorStop(1, toCss({ ...palette.light, a: 0 }))
    ctx.fillStyle = pool
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height)

    const shade = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r * 1.15)
    shade.addColorStop(0, 'rgba(0, 0, 0, 0)')
    shade.addColorStop(1, `rgba(0, 0, 0, ${params.vignette})`)
    ctx.fillStyle = shade
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
    ctx.restore()
  },
}
