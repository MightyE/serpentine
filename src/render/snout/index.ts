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
 * A phenotype opts in by setting `extra.snoutShape` to {@link HOGNOSE_SNOUT_SHAPE} (done once, in
 * `species/hognose/phenotype.ts` — every hognose has it, no trait needs to set it).
 * {@link drawUpturnedSnout} checks that flag itself and is a no-op for every other phenotype, so
 * wiring it into a renderer is one unconditional call right after that renderer draws its face.
 *
 * Every renderer that draws a snake now makes that call: `render/snake.ts`, `render/portrait.ts`,
 * `render/life/view.ts`, `render/life/hatch.ts`, `render/pose/heldView.ts`, and
 * `habitat/occupants/occupant.ts`. Add the line to any new one — a hognose without its nose is
 * the bug this module exists to prevent, and it fails silently.
 */

import type { Phenotype } from '../contract'
import type { Ribbon } from '../ribbon'
import { add, angleOf, perp, scale, type Vec2 } from '../geometry'
import { headWidth } from '../head'
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
  // Sized against the **head**, not `ribbon.widths[0]`. That is the snout-tip width, which the
  // width profile pinches to about a third of the skull, so sizing off it drew this at a third
  // of its intended size — a small bead stuck on the nose rather than part of the animal.
  const w = headWidth(ribbon) || 1

  // How far the point reaches forward of the nose, and how wide it is where it meets it. The
  // base half-width is the **nose's own** half-width, so the wedge starts exactly flush with the
  // silhouette and continues its taper. Anything wider is a bulb on the end of the face: an
  // ellipse centred forward of the tip was the first attempt here, and at any size that read it
  // could actually be seen at, it read as a ball glued to the snout.
  const radiusAlong = 0.34 * w
  const radiusAcross = 0.5 * (ribbon.widths[0] || w * 0.34)
  const angle = angleOf(dir)

  return {
    centre: tipPoint,
    radiusAlong,
    radiusAcross,
    angle,
    tip: add(tipPoint, scale(dir, radiusAlong)),
    back: add(tipPoint, scale(dir, -radiusAlong)),
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

  const { centre, radiusAlong, radiusAcross, tip } = upturnedSnoutOutline(ribbon)
  const dir = ribbon.tangents[0]
  const side = perp(dir)
  const w = headWidth(ribbon) || 1

  // The wedge is the head, continued. Barely off the body colour on purpose: the moment this
  // fill is visibly its own colour it stops being the front of the snout and becomes an object
  // resting on it. The keel and the shadow do all the shaping.
  const bumpColour = mix(phenotype.baseColour, phenotype.patternColour, 0.07)
  const keelHighlight = lighten(bumpColour, 0.18)

  const left = add(centre, scale(side, radiusAcross))
  const right = add(centre, scale(side, -radiusAcross))
  // Shoulders a little forward of the base, so the sides bow out very slightly before closing
  // to the point — a straight-sided triangle reads as a beak.
  const shoulderL = add(add(centre, scale(dir, radiusAlong * 0.45)), scale(side, radiusAcross * 0.92))
  const shoulderR = add(add(centre, scale(dir, radiusAlong * 0.45)), scale(side, -radiusAcross * 0.92))

  ctx.save()

  ctx.beginPath()
  ctx.moveTo(left.x, left.y)
  ctx.quadraticCurveTo(shoulderL.x, shoulderL.y, tip.x, tip.y)
  ctx.quadraticCurveTo(shoulderR.x, shoulderR.y, right.x, right.y)
  ctx.closePath()
  ctx.fillStyle = toCss(bumpColour)
  ctx.fill()

  // A soft shadow across the base, so the point reads as lifted off the ground rather than as a
  // flat extension of the outline — this is the only cue a top-down view has for "upturned".
  ctx.save()
  ctx.clip()
  ctx.beginPath()
  ctx.moveTo(left.x, left.y)
  ctx.lineTo(right.x, right.y)
  ctx.lineTo(add(right, scale(dir, -radiusAlong * 0.5)).x, add(right, scale(dir, -radiusAlong * 0.5)).y)
  ctx.lineTo(add(left, scale(dir, -radiusAlong * 0.5)).x, add(left, scale(dir, -radiusAlong * 0.5)).y)
  ctx.closePath()
  ctx.fillStyle = 'rgba(20, 14, 16, 0.18)'
  ctx.fill()
  ctx.restore()

  // The keel: the raised ridge down the midline that gives the scale its name.
  ctx.strokeStyle = toCss(keelHighlight)
  ctx.lineWidth = Math.max(1, w * 0.045)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(centre.x, centre.y)
  ctx.lineTo(tip.x, tip.y)
  ctx.stroke()

  ctx.restore()
}
