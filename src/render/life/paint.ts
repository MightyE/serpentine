/**
 * Painting a body onto a ribbon — the part every life stage shares.
 *
 * `snake.ts` does this inline for the adult case and keeps its rounding pass private. Both the
 * live view (`view.ts`) and the hatching sequence (`hatch.ts`) need the identical sequence, and
 * the hatch needs it on a *partial* ribbon, so it lives here once:
 *
 *     opaque undercoat  →  textured strips  →  rim shade + spine highlight
 *
 * The undercoat is not decoration. The texture strips are clipped to the outline, and
 * antialiasing leaves hairline gaps at the very edge; filling underneath means those gaps show
 * body colour instead of whatever is behind the snake.
 */

import type { Phenotype } from '../contract'
import { mix, rgba, toCss } from '../colour'
import { add, perp, scale } from '../geometry'
import { paintRibbon, traceRibbon, type Ribbon } from '../ribbon'
import type { PatternTexture } from '../texture'

/**
 * Draw a snake's body onto a ribbon.
 *
 * @param uOffset scrolls the markings along the body — the animated-drift effect. 0 keeps them
 *   put, which is what you want everywhere else.
 */
export function paintBody(
  ctx: CanvasRenderingContext2D,
  ribbon: Ribbon,
  phenotype: Phenotype,
  texture: PatternTexture,
  uOffset = 0,
): void {
  ctx.save()
  traceRibbon(ctx, ribbon)
  ctx.fillStyle = toCss(phenotype.baseColour)
  ctx.fill()
  ctx.restore()

  paintRibbon(ctx, ribbon, texture.canvas, texture.width, texture.height, uOffset)
  drawRoundness(ctx, ribbon, phenotype)
}

/**
 * A dark edge and a light spine line — the cheapest possible way to make a flat fill look like a
 * rounded tube. Two strokes, no gradients, no per-pixel shading.
 *
 * Kept in step with `snake.ts`'s private version of the same thing; if you change one, change
 * both, or an adult will shade differently depending on which view drew it.
 */
export function drawRoundness(
  ctx: CanvasRenderingContext2D,
  ribbon: Ribbon,
  phenotype: Phenotype,
): void {
  const widest = Math.max(...ribbon.widths)
  if (!Number.isFinite(widest) || widest <= 0) return

  ctx.save()
  traceRibbon(ctx, ribbon)
  ctx.clip()

  ctx.lineWidth = Math.max(1.5, widest * 0.16)
  ctx.strokeStyle = toCss(mix(phenotype.baseColour, rgba(20, 14, 24, 1), 0.4))
  ctx.globalAlpha = 0.22
  traceRibbon(ctx, ribbon)
  ctx.stroke()

  ctx.globalAlpha = 0.16
  ctx.lineWidth = Math.max(1, widest * 0.1)
  ctx.strokeStyle = 'rgba(255, 255, 255, 1)'
  ctx.beginPath()
  const spine = ribbon.spine
  const start = Math.floor(spine.length * 0.06)
  const end = Math.floor(spine.length * 0.82)
  for (let i = start; i < end; i++) {
    const offset = scale(perp(ribbon.tangents[i]), ribbon.widths[i] * 0.16)
    const p = add(spine[i], offset)
    if (i === start) ctx.moveTo(p.x, p.y)
    else ctx.lineTo(p.x, p.y)
  }
  ctx.stroke()
  ctx.restore()
}
