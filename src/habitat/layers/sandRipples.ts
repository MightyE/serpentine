/**
 * `scatter` layer — wind ripples across loose sand, plus the track a heavy-bodied snake leaves
 * when it crosses one.
 *
 * Top-down is the only view these are legible from, which is a small piece of luck: ripples are
 * the single strongest cue that a floor is sand rather than brown paint, and side-on they would
 * be a line.
 */

import type { LayerDefinition } from '../contract'
import { lighten, toCss } from '../../render/colour'
import { fbm2D } from '../../render/noise'
import { roundRectPath } from './support'

type Params = {
  /** Ripple crests across the enclosure. */
  readonly frequency: number
  /** Ripple direction in degrees. The prevailing wind, effectively. */
  readonly angle: number
  /** How much the crest lines wander, as a fraction of one wavelength. */
  readonly meander: number
  readonly opacity: number
}

export const sandRipplesLayer: LayerDefinition<Params> = {
  kind: 'scatter',
  name: 'sandRipples',
  describe: 'Wind ripples across loose sand, drawn as soft parallel crests.',
  defaults: { frequency: 9, angle: 22, meander: 0.45, opacity: 0.3 },
  draw: (ctx, scene, params) => {
    const { rect, palette, seed } = scene
    const short = Math.min(rect.width, rect.height)
    const diag = Math.hypot(rect.width, rect.height)
    const wavelength = diag / Math.max(1, params.frequency)

    ctx.save()
    roundRectPath(ctx, rect.x, rect.y, rect.width, rect.height, short * 0.05)
    ctx.clip()
    ctx.translate(rect.x + rect.width / 2, rect.y + rect.height / 2)
    ctx.rotate((params.angle * Math.PI) / 180)

    ctx.lineCap = 'round'
    ctx.lineWidth = Math.max(0.8, wavelength * 0.16)
    ctx.strokeStyle = toCss({ ...lighten(palette.substrate, 0.12), a: params.opacity })

    const half = diag / 2
    for (let offset = -half; offset <= half; offset += wavelength) {
      ctx.beginPath()
      for (let t = -half; t <= half; t += Math.max(3, wavelength * 0.25)) {
        const wobble = (fbm2D(seed, t / wavelength, offset / wavelength, 2) - 0.5) * wavelength * params.meander * 2
        if (t === -half) ctx.moveTo(t, offset + wobble)
        else ctx.lineTo(t, offset + wobble)
      }
      ctx.stroke()
    }
    ctx.restore()
  },
}
