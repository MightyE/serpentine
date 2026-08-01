/**
 * Head-shape variants — species-specific snout silhouettes layered on top of the generic body.
 *
 * ## Why this is a separate overlay, not a change to `bodyShape.ts` or `head.ts`
 *
 * `src/render/ribbon.ts` draws one generic rounded snout for every species (see
 * `traceRibbon`'s doc comment: rounding it is deliberate, because a wedge reads as venomous).
 * That is correct for a corn snake or a ball python. It is wrong for a western hognose, whose
 * entire visual identity is the upturned, keeled rostral scale — the "hog nose." Rather than
 * teach the generic body/head code one species' anatomy, a snout variant draws *in addition to*
 * the existing rounded nose, using the same {@link Ribbon} every other head-adjacent drawing
 * function already has in hand (`head.ts`'s `drawFace`, `life/face.ts`'s `drawLifeFace`).
 *
 * ## Wiring
 *
 * A phenotype opts in by setting `extra.snoutShape` to {@link HOGNOSE_SNOUT_SHAPE} (done once,
 * in `species/hognose/phenotype.ts`'s base phenotype — every hognose has it, no trait needs to
 * set it). {@link drawUpturnedSnout} checks that flag itself and is a no-op for every other
 * phenotype, so wiring it into the actual game is exactly **one unconditional call**, in two
 * places:
 *
 *   - `src/render/snake.ts`, right after its `drawFace(ctx, ribbon, this.phenotype, ...)` call
 *     in `draw()`: add `drawUpturnedSnout(ctx, ribbon, this.phenotype)`.
 *   - `src/render/life/view.ts`, right after its `drawLifeFace(...)` call in `draw()`: same line,
 *     same import.
 *
 * Both of those files are owned by another agent this cycle (see the hognose execution deposit),
 * which is why the change is not made here — this module is complete and self-guarding on its
 * own; it only needs the one call added at each site above to actually appear on screen.
 */

import type { Phenotype } from '../contract'
import type { Ribbon } from '../ribbon'
import { add, angleOf, scale, type Vec2 } from '../geometry'
import { lighten, mix, toCss } from '../colour'

/** The `Phenotype.extra.snoutShape` value that selects this head shape. */
export const HOGNOSE_SNOUT_SHAPE = 'hognose-upturned'

/** True if this phenotype should get the upturned hognose snout drawn over its head. */
export function hasUpturnedSnout(phenotype: Phenotype): boolean {
  return phenotype.extra.snoutShape === HOGNOSE_SNOUT_SHAPE
}

/** The bump's geometry, in world space. */
export interface SnoutOutline {
  /** Centre of the rounded bump — a little forward of the ribbon's own nose tip, on purpose:
   *  see {@link upturnedSnoutOutline}'s doc comment for why it overlaps the existing silhouette
   *  rather than sitting flush against it. */
  readonly centre: Vec2
  /** Half-length along the direction of travel. */
  readonly radiusAlong: number
  /** Half-width across the body. */
  readonly radiusAcross: number
  /** Radians; feed straight to `ctx.ellipse`'s `rotation`. */
  readonly angle: number
  /** The forward-most point of the bump — used by the keel highlight and by tests. */
  readonly tip: Vec2
  /** The back-most point of the bump, roughly where it should fuse into the existing nose. */
  readonly back: Vec2
}

/**
 * Where the upturned bump sits, relative to the ribbon's own nose.
 *
 * Computed separately from the actual `ctx` drawing so the shape itself is unit-testable without
 * a canvas — vitest's default `node` environment has no `document`, which is also why
 * `render/life/lifeStages.test.ts` sticks to pure geometry and never bakes a real texture.
 *
 * The bump's *centre* sits forward of the ribbon's nose tip, not at it — so its back half
 * overlaps the rounded bulge `traceRibbon` already draws (see `ribbon.ts`) and gets covered by
 * it, and only the front half actually pokes out. That overlap is what keeps this reading as
 * "the front of one nose" instead of "a shape glued on top of one."
 */
export function upturnedSnoutOutline(ribbon: Ribbon): SnoutOutline {
  const tipPoint = ribbon.spine[0]
  const dir = ribbon.tangents[0]
  const w = ribbon.widths[0] || 1

  const radiusAlong = 0.5 * w
  const radiusAcross = 0.34 * w
  const centre = add(tipPoint, scale(dir, 0.42 * w))
  const angle = angleOf(dir)

  return {
    centre,
    radiusAlong,
    radiusAcross,
    angle,
    tip: add(centre, scale(dir, radiusAlong)),
    back: add(centre, scale(dir, -radiusAlong)),
  }
}

/**
 * Draw the upturned snout over an already-drawn body and face. No-ops for any phenotype that has
 * not opted in via {@link hasUpturnedSnout} — see this file's header for the one-line call site
 * another agent needs to add per renderer.
 *
 * Deliberately kept cute rather than anatomically severe (see this cycle's brief: "this is the
 * feature that will make her smile") — a small rounded bump, not a spike:
 *
 *   1. The bump itself, an ellipse rather than a wedge, so it reads as a soft nub.
 *   2. A thin, lighter keel line down its midline — the raised ridge that gives the scale its
 *      name, and the detail that reads as "raised" rather than just "differently shaped."
 *   3. A soft dark crescent under the front of the bump — the cheapest way to make a flat fill
 *      read as something that pokes *up*, the same trick `snake.ts`'s `drawRoundness` uses for
 *      the body as a whole.
 */
export function drawUpturnedSnout(ctx: CanvasRenderingContext2D, ribbon: Ribbon, phenotype: Phenotype): void {
  if (!hasUpturnedSnout(phenotype)) return

  const { centre, radiusAlong, radiusAcross, angle, tip, back } = upturnedSnoutOutline(ribbon)
  const bumpColour = mix(phenotype.baseColour, phenotype.patternColour, 0.18)
  const keelHighlight = lighten(bumpColour, 0.2)

  ctx.save()

  ctx.beginPath()
  ctx.ellipse(centre.x, centre.y, radiusAlong, radiusAcross, angle, 0, Math.PI * 2)
  ctx.fillStyle = toCss(bumpColour)
  ctx.fill()

  // A soft shadow under the front half, so the bump reads as raised rather than flat.
  ctx.save()
  ctx.clip()
  ctx.beginPath()
  ctx.ellipse(
    centre.x + Math.cos(angle) * radiusAlong * 0.25,
    centre.y + Math.sin(angle) * radiusAlong * 0.25,
    radiusAlong * 0.85,
    radiusAcross * 0.85,
    angle,
    0,
    Math.PI * 2,
  )
  ctx.fillStyle = 'rgba(20, 14, 16, 0.16)'
  ctx.fill()
  ctx.restore()

  // The keel: a thin raised ridge down the midline, from the back of the bump to its tip.
  ctx.strokeStyle = toCss(keelHighlight)
  ctx.lineWidth = Math.max(1, (ribbon.widths[0] || 1) * 0.07)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(back.x, back.y)
  ctx.lineTo(tip.x, tip.y)
  ctx.stroke()

  ctx.restore()
}
