/**
 * `foreground` layer — the lid: a diagonal sheen and a mesh grid, drawn over everything.
 *
 * Side-on, `foreground` is the few blades nearer than the animal. Top-down, the thing in front of
 * the animal is the *lid*, so that is what this draws. One band of glare across the corner is
 * enough — a full mesh at postage-stamp size turns into moiré, so the grid fades out below a
 * legibility threshold rather than being drawn at any size.
 */

import type { LayerDefinition } from '../contract'
import { roundRectPath } from './support'

type Params = {
  /** Sheen angle in degrees. */
  readonly angle: number
  /** Peak opacity of the sheen band. */
  readonly sheen: number
  /** Mesh spacing in logical pixels. Below `minMesh` the grid is skipped entirely. */
  readonly mesh: number
  /** Enclosures narrower than this (logical px) get no mesh — it would only alias. */
  readonly minMesh: number
}

export const glassGlareLayer: LayerDefinition<Params> = {
  kind: 'foreground',
  name: 'glassGlare',
  describe: 'The lid over the top: one band of glare, and a mesh grid when there is room for it.',
  defaults: { angle: -28, sheen: 0.09, mesh: 13, minMesh: 190 },
  draw: (ctx, scene, params) => {
    const { rect } = scene
    const short = Math.min(rect.width, rect.height)

    ctx.save()
    roundRectPath(ctx, rect.x, rect.y, rect.width, rect.height, short * 0.05)
    ctx.clip()

    if (short >= params.minMesh) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
      ctx.lineWidth = 1
      for (let x = rect.x; x <= rect.x + rect.width; x += params.mesh) {
        ctx.beginPath()
        ctx.moveTo(x, rect.y)
        ctx.lineTo(x, rect.y + rect.height)
        ctx.stroke()
      }
      for (let y = rect.y; y <= rect.y + rect.height; y += params.mesh) {
        ctx.beginPath()
        ctx.moveTo(rect.x, y)
        ctx.lineTo(rect.x + rect.width, y)
        ctx.stroke()
      }
    }

    ctx.translate(rect.x + rect.width / 2, rect.y + rect.height / 2)
    ctx.rotate((params.angle * Math.PI) / 180)
    const diag = Math.hypot(rect.width, rect.height)
    const band = ctx.createLinearGradient(-diag / 2, 0, diag / 2, 0)
    band.addColorStop(0, 'rgba(255, 255, 255, 0)')
    band.addColorStop(0.3, `rgba(255, 255, 255, ${params.sheen})`)
    band.addColorStop(0.42, `rgba(255, 255, 255, ${params.sheen * 0.3})`)
    band.addColorStop(0.6, 'rgba(255, 255, 255, 0)')
    ctx.fillStyle = band
    ctx.fillRect(-diag / 2, -diag / 2, diag, diag)
    ctx.restore()
  },
}
