/**
 * `furniture` layer — a hide, from above: a lid with a dark entrance notch cut into one side.
 *
 * The single most important object in any of these enclosures, and the reason the game never has
 * to model an animal being stressed: baseline husbandry includes a hide, so baseline is already
 * adequate. See `provisions.ts` — this is the drawing of that decision.
 */

import type { LayerDefinition } from '../contract'
import { lighten, mix, toCss } from '../../render/colour'
import { fbm2D } from '../../render/noise'
import { contactShadow, roundRectPath } from './support'

type Params = {
  /** Width as a fraction of the enclosure's shorter side. */
  readonly size: number
  /** Height as a fraction of the width. */
  readonly aspect: number
  /** Corner radius as a fraction of the width. */
  readonly radius: number
  /** 0 draws moulded plastic; 1 draws cork bark with a ragged edge. */
  readonly bark: number
}

export const hideBoxLayer: LayerDefinition<Params> = {
  kind: 'furniture',
  name: 'hideBox',
  describe: 'A hide from above — lid, entrance notch, and the dark inside you cannot see into.',
  defaults: { size: 0.34, aspect: 0.72, radius: 0.22, bark: 0.6 },
  draw: (ctx, scene, params, placement) => {
    const { rect, palette, warmSide } = scene
    const short = Math.min(rect.width, rect.height)
    const w = short * params.size * placement.scale
    const h = w * params.aspect
    const x = placement.x - w / 2
    const y = placement.y - h / 2

    contactShadow(ctx, placement.x, placement.y, Math.max(w, h) * 0.6, warmSide, 0.45)

    const shell = mix(palette.wood, palette.stone, 1 - params.bark)
    const radius = w * params.radius
    roundRectPath(ctx, x, y, w, h, radius)
    ctx.fillStyle = toCss(mix(shell, palette.substrateDark, 0.25))
    ctx.fill()

    ctx.save()
    roundRectPath(ctx, x, y, w, h, radius)
    ctx.clip()

    // A cork tube is a half-cylinder: bright along the ridge, falling off to dark at both long
    // edges. Getting that one gradient right is the difference between a hide and a beige tile,
    // and it was the whole of the first draft's problem.
    const barrel = ctx.createLinearGradient(x, y, x, y + h)
    barrel.addColorStop(0, 'rgba(0, 0, 0, 0.34)')
    barrel.addColorStop(0.34, toCss({ ...lighten(shell, 0.14), a: 0.95 }))
    barrel.addColorStop(0.52, toCss({ ...shell, a: 0.6 }))
    barrel.addColorStop(1, 'rgba(0, 0, 0, 0.42)')
    ctx.fillStyle = barrel
    ctx.fillRect(x, y, w, h)

    // Bark ridges running the length of the tube. Cheap, and the only thing that says "cork"
    // rather than "moulded plastic" — so it fades out with the `bark` parameter.
    if (params.bark > 0.05) {
      const lines = Math.max(3, Math.round(h / Math.max(2, h * 0.13)))
      for (let i = 0; i < lines; i++) {
        const ly = y + ((i + 0.5) / lines) * h
        const n = fbm2D(Math.round(placement.x * 13 + placement.y), i * 1.7, 0, 2)
        ctx.strokeStyle = `rgba(0, 0, 0, ${0.1 + n * 0.16 * params.bark})`
        ctx.lineWidth = Math.max(0.6, h * 0.035)
        ctx.beginPath()
        ctx.moveTo(x + w * 0.04, ly + n * h * 0.03)
        ctx.bezierCurveTo(x + w * 0.35, ly - h * 0.02, x + w * 0.65, ly + h * 0.03, x + w * 0.96, ly)
        ctx.stroke()
      }
    }
    ctx.restore()

    // The entrance: an arch cut into the short end away from the lamp, drawn straddling the edge
    // so it reads as an opening in a wall rather than a hatch in a lid. Pure black — what you
    // cannot see into is the entire point of a hide, and a drawn interior would undo it.
    const mouthW = w * 0.16
    const mouthH = h * 0.52
    const mx = placement.x - warmSide * (w / 2) - mouthW / 2
    ctx.save()
    roundRectPath(ctx, x, y, w, h, radius)
    ctx.clip()
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'
    ctx.beginPath()
    ctx.ellipse(mx + mouthW / 2, placement.y, mouthW, mouthH / 2, 0, 0, Math.PI * 2)
    ctx.fill()
    // A hairline of lit edge on the near lip. One highlight is what gives the opening a rim.
    ctx.strokeStyle = toCss({ ...lighten(shell, 0.2), a: 0.55 })
    ctx.lineWidth = Math.max(0.6, w * 0.012)
    ctx.stroke()
    ctx.restore()
  },
}
