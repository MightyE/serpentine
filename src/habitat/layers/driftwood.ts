/**
 * `furniture` layer — a branch or a length of cork bark lying across the enclosure.
 *
 * Drawn as a tapered spine with a couple of forks, which is enough: from directly above, a branch
 * is a line with thickness and a shadow under it, and everything else is grain.
 */

import type { LayerDefinition } from '../contract'
import { lighten, mix, toCss } from '../../render/colour'
import { fbm2D } from '../../render/noise'

type Params = {
  /** Length as a fraction of the enclosure's longer side. */
  readonly length: number
  /** Thickness at the butt, as a fraction of the length. */
  readonly thickness: number
  /** How many side branches fork off. */
  readonly forks: number
  /** How much the main spine curves, in radians. */
  readonly curve: number
}

function limb(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  length: number,
  width: number,
  curve: number,
  colour: string,
): { x: number; y: number } {
  const ex = x + Math.cos(angle + curve) * length
  const ey = y + Math.sin(angle + curve) * length
  ctx.strokeStyle = colour
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.quadraticCurveTo(x + Math.cos(angle) * length * 0.55, y + Math.sin(angle) * length * 0.55, ex, ey)
  ctx.stroke()
  return { x: ex, y: ey }
}

export const driftwoodLayer: LayerDefinition<Params> = {
  kind: 'furniture',
  name: 'driftwood',
  describe: 'A branch or cork length lying across the floor, with forks and lengthwise grain.',
  defaults: { length: 0.62, thickness: 0.12, forks: 2, curve: 0.45 },
  draw: (ctx, scene, params, placement) => {
    const { rect, palette, rng } = scene
    const long = Math.max(rect.width, rect.height)
    const len = long * params.length * placement.scale
    const width = len * params.thickness
    const angle = placement.facing === 1 ? -0.25 : Math.PI + 0.25

    ctx.save()
    // Shadow first, offset off the contact line — a branch is the one furniture item that is
    // actually raised off the floor, and the gap under it is what says so.
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.34)'
    limb(ctx, placement.x + width * 0.3, placement.y + width * 0.45, angle, len, width, params.curve, 'rgba(0,0,0,0.34)')

    const barkLight = lighten(palette.wood, 0.08)
    const barkDeep = mix(palette.wood, palette.substrateDark, 0.55)

    const tip = limb(ctx, placement.x, placement.y, angle, len, width, params.curve, toCss(palette.wood))
    for (let i = 0; i < params.forks; i++) {
      const t = rng.range(0.3, 0.8)
      const fx = placement.x + (tip.x - placement.x) * t
      const fy = placement.y + (tip.y - placement.y) * t
      limb(
        ctx,
        fx,
        fy,
        angle + rng.range(-1.1, 1.1),
        len * rng.range(0.22, 0.4),
        width * rng.range(0.45, 0.7),
        rng.range(-0.4, 0.4),
        toCss(barkDeep),
      )
    }

    // Grain: short strokes along the spine, brightened by noise. Sells "wood" over "tube".
    const steps = 22
    for (let i = 0; i < steps; i++) {
      const t = i / steps
      const gx = placement.x + (tip.x - placement.x) * t
      const gy = placement.y + (tip.y - placement.y) * t
      const n = fbm2D(scene.seed, t * 9, placement.depth * 3, 2)
      ctx.strokeStyle = toCss({ ...(n > 0.5 ? barkLight : barkDeep), a: 0.5 })
      ctx.lineWidth = Math.max(0.5, width * 0.12)
      ctx.beginPath()
      ctx.moveTo(gx, gy - width * (0.34 - n * 0.5))
      ctx.lineTo(gx + (tip.x - placement.x) / steps, gy - width * (0.3 - n * 0.5))
      ctx.stroke()
    }
    ctx.restore()
  },
}
