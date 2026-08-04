/**
 * `furniture` layer — a slab of rock, drawn at the placement `layout.ts` chose for it.
 *
 * ## Furniture layers read `placement`; biome layers ignore it
 *
 * That is the one difference between the two halves of the registry, and it falls out of the
 * signature rather than being enforced: a biome layer is handed the whole enclosure as its
 * placement and fills it, a feature layer is handed the site the layout picked and draws there.
 * Same function type, same registry, no branch anywhere.
 */

import type { LayerDefinition } from '../contract'
import { lighten, mix, toCss } from '../../render/colour'
import { blobPath, contactShadow } from './support'

type Params = {
  /** Slab radius as a fraction of the enclosure's shorter side, before `placement.scale`. */
  readonly size: number
  /** How many satellite stones sit around the main slab. */
  readonly satellites: number
  /** Fracture lines across the face. */
  readonly cracks: number
}

export const rockOutcropLayer: LayerDefinition<Params> = {
  kind: 'furniture',
  name: 'rockOutcrop',
  describe: 'A flat rock slab with satellite stones and fracture lines. Basking furniture.',
  defaults: { size: 0.24, satellites: 3, cracks: 3 },
  draw: (ctx, scene, params, placement) => {
    const { rect, palette, rng, warmSide } = scene
    const short = Math.min(rect.width, rect.height)
    const r = short * params.size * placement.scale
    const face = palette.stone
    const lit = lighten(face, 0.11)
    const shade = mix(face, palette.substrateDark, 0.5)

    for (let i = 0; i < params.satellites; i++) {
      const a = rng.next() * Math.PI * 2
      const d = r * rng.range(0.9, 1.5)
      const sr = r * rng.range(0.16, 0.32)
      const sx = placement.x + Math.cos(a) * d
      const sy = placement.y + Math.sin(a) * d
      contactShadow(ctx, sx, sy, sr, warmSide, 0.3)
      blobPath(ctx, sx, sy, sr, placement.x * 31 + i * 977, 0.24, 10)
      ctx.fillStyle = toCss(mix(face, shade, 0.4))
      ctx.fill()
    }

    contactShadow(ctx, placement.x, placement.y, r, warmSide, 0.42)

    const seed = Math.round(placement.x * 17 + placement.y * 7)
    blobPath(ctx, placement.x, placement.y, r, seed, 0.18, 16)
    ctx.fillStyle = toCss(face)
    ctx.fill()

    // The lit face, clipped to the slab: a slab is a plane, so its highlight has a hard edge
    // where the top surface stops, not the soft ramp a boulder would have.
    ctx.save()
    blobPath(ctx, placement.x, placement.y, r, seed, 0.18, 16)
    ctx.clip()
    ctx.fillStyle = toCss({ ...lit, a: 0.9 })
    blobPath(ctx, placement.x + warmSide * r * 0.16, placement.y - r * 0.16, r * 0.78, seed + 5, 0.2, 14)
    ctx.fill()

    ctx.strokeStyle = toCss({ ...shade, a: 0.75 })
    ctx.lineWidth = Math.max(0.6, r * 0.035)
    for (let i = 0; i < params.cracks; i++) {
      const a = rng.next() * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(placement.x + Math.cos(a) * r, placement.y + Math.sin(a) * r)
      ctx.quadraticCurveTo(
        placement.x + rng.range(-r * 0.4, r * 0.4),
        placement.y + rng.range(-r * 0.4, r * 0.4),
        placement.x + Math.cos(a + Math.PI + rng.range(-0.7, 0.7)) * r,
        placement.y + Math.sin(a + Math.PI + rng.range(-0.7, 0.7)) * r,
      )
      ctx.stroke()
    }
    ctx.restore()
  },
}
