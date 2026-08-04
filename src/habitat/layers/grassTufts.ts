/**
 * `planting` layer — tufts of grass, seen from above: blades radiating from a crown.
 *
 * The layer the biomes share most. Written for the prairie, reused unchanged by the woodland and
 * the scrub, and it looks right in all three because it takes every colour from
 * `scene.palette` — which is exactly the payoff `contract.ts` promises for keeping colour out of
 * layer files.
 */

import type { LayerDefinition } from '../contract'
import { lighten, mix, toCss } from '../../render/colour'
import { scatter } from './support'

type Params = {
  readonly density: number
  /** Crown radius as a fraction of the enclosure's shorter side. */
  readonly size: number
  /** Blades per tuft. */
  readonly blades: number
  /** How far the blades bend, in radians of arc. 0 is a starburst; 0.9 is wind-blown. */
  readonly bend: number
  /** 0 keeps `foliage`; 1 dries all the way to `wood`. */
  readonly dryness: number
}

export const grassTuftsLayer: LayerDefinition<Params> = {
  kind: 'planting',
  name: 'grassTufts',
  describe: 'Tufts of grass from above — blades radiating from a crown, bent by one wind.',
  // Sizes are fractions of the enclosure's shorter side, and that side is about two feet of real
  // enclosure — so `size: 0.05` is a tuft with a crown the width of your thumb, which is what a
  // clump of bunch grass actually is. The first draft of this file used 0.13 and every biome grew
  // triffids. When a scatter layer looks wrong, check its size against the real object first.
  defaults: { density: 34, size: 0.05, blades: 22, bend: 0.42, dryness: 0.2 },
  draw: (ctx, scene, params) => {
    const { rect, palette, rng } = scene
    const short = Math.min(rect.width, rect.height)
    const area = (rect.width * rect.height) / (short * short)
    const count = Math.max(1, Math.round(params.density * area))
    const radius = short * params.size
    const tip = mix(palette.foliage, palette.wood, params.dryness)
    const root = mix(palette.foliageDeep, palette.wood, params.dryness * 0.5)

    for (const p of scatter(rng, rect, count, radius * 0.8)) {
      const r = radius * (0.6 + p.size * 0.7)

      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.lineCap = 'round'

      // The tuft's own soft shadow, so it sits *in* the substrate rather than on top of it.
      ctx.fillStyle = 'rgba(0, 0, 0, 0.18)'
      ctx.beginPath()
      ctx.ellipse(0, r * 0.12, r * 0.55, r * 0.4, 0, 0, Math.PI * 2)
      ctx.fill()

      // Blades are drawn as filled tapered slivers rather than strokes. A uniform-width stroke
      // radiating from a dot is what made the first draft read as a spider — a blade has to be
      // wide at the root and come to a point, and the tuft has to have far more of them than
      // looks necessary before it stops looking like legs.
      for (let i = 0; i < params.blades; i++) {
        const a = p.angle + (i / params.blades) * Math.PI * 2 + rng.range(-0.35, 0.35)
        const len = r * rng.range(0.42, 1.05)
        const bend = params.bend * rng.range(-1, 1)
        const width = r * rng.range(0.1, 0.17)
        const ex = Math.cos(a + bend) * len
        const ey = Math.sin(a + bend) * len
        const cx = Math.cos(a) * len * 0.55
        const cy = Math.sin(a) * len * 0.55
        // Perpendicular at the root, so the sliver has a base to taper from.
        const nx = -Math.sin(a) * width
        const ny = Math.cos(a) * width

        ctx.fillStyle = toCss(mix(root, lighten(tip, 0.1), rng.next() ** 0.6))
        ctx.beginPath()
        ctx.moveTo(nx, ny)
        ctx.quadraticCurveTo(cx + nx * 0.4, cy + ny * 0.4, ex, ey)
        ctx.quadraticCurveTo(cx - nx * 0.4, cy - ny * 0.4, -nx, -ny)
        ctx.closePath()
        ctx.fill()
      }
      ctx.restore()
    }
  },
}
