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

import type { Phenotype, Rgba } from '../contract'
import { luminance, mix, rgba, toCss } from '../colour'
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
 * How the rim is shaded, and which way.
 *
 * ## Why the direction is not a constant
 *
 * This used to be one absolute colour: 22% of the way toward `rgba(20, 14, 24)`, whatever the
 * animal was. On a pale animal that is exactly right — the flanks fall away and the body reads as
 * a tube. On a dark one it is the opposite of right, because a dark base has almost no room left
 * to darken: the Starlight fixture (base `rgba(38, 34, 66)`) measured a rim at luminance 68
 * against a body core of 95, which made the *outline the darkest part of the animal*, and on the
 * darkest shipped substrate that rim sat within a few luminance steps of the ground it lay on.
 * The animal was reported as "see-through". Nothing was translucent — `paintBody` fills an opaque
 * undercoat before anything else — the silhouette simply had no contrast in it.
 *
 * So the rim shades **away from whichever end the base colour is already near**: a dark animal
 * gets a lighter rim, a pale one keeps the darkening it had. Both are the same illusion. A
 * cylinder lit from above has dark flanks; a cylinder seen against a light-scattering background
 * has bright ones, which is a rim light, and the eye reads either as roundness. The same Starlight
 * fixture now measures a rim of 111 against that core of 95 — the flanks read as flanks — and its
 * worst edge contrast across the cypress substrates went 0.162 → 0.229 while the contact shadow
 * that was propping it up came *down*. See `CONTACT_SHADOW_PASSES` in `habitat/occupants/occupant.ts`.
 *
 * ## Why `flip` is a step and not a ramp
 *
 * Crossfading the two targets across a band of luminance sounds tidier and is worse: any
 * continuous path from "rim darker" to "rim lighter" passes through "rim the same as the core",
 * so a smooth version has a dead zone of base colours with no rim at all — and the Garter fixture
 * (luminance 0.30) sits close enough to the crossover to land in it. A step keeps the *magnitude*
 * of the shade constant everywhere; only its sign changes, and either sign reads as an edge. Two
 * base colours either side of the flip get opposite rims, which is a difference in look, not in
 * legibility.
 *
 * The flip sits at 0.45 rather than at mid-grey because that is the middle of the widest gap in
 * what is actually authored: every shipped fixture's base colour falls in 0.15–0.39 or 0.52–0.89,
 * and a threshold nobody sits near is a threshold that never has to be argued about. `paint.test.ts`
 * holds that margin open — if a new morph lands on the flip, move the flip.
 *
 * Exported mutable so `edge-contrast-probe.html` can sweep these and re-measure without editing
 * this file; nothing in the game writes to it.
 */
export const RIM_SHADE = {
  /** Base luminance (0–1) at or below which the rim lightens instead of darkening. */
  flip: 0.45,
  /**
   * A pale animal, shaded down. Unchanged from when this was the only case there was: 40% of the
   * way to near-black — slightly violet, so it reads as shadow rather than soot — at 22%.
   */
  darken: { toward: rgba(20, 14, 24, 1), amount: 0.4, alpha: 0.22 },
  /**
   * A dark animal, shaded up — and considerably harder than the mirror image of the above, for
   * two measured reasons.
   *
   * A dark base has little of its own luminance to push around, so the mirror of the darken side
   * (0.4 at 22%) moves the rim by about ten luminance steps and leaves it still *below* the core —
   * measured, not guessed. And the rim has to clear more than the substrate: a `glow` morph lights
   * the ground it lies on, and the ring of substrate within a body width of a Starlight reads 85
   * where the bare fill reads 72. A rim that only just beats the substrate lands inside the
   * animal's own halo and the silhouette goes soft again — on the *pale* biome this time instead
   * of the dark one. Swept in `edge-contrast-probe.html`; see the devlog entry for the grid.
   *
   * Cool white on purpose — a warm highlight turns a cold morph khaki.
   */
  lighten: { toward: rgba(236, 240, 255, 1), amount: 0.8, alpha: 0.3 },
}

/** How the rim stroke is drawn for a given base colour: which colour, and how strongly. */
export interface RimStroke {
  readonly colour: Rgba
  readonly alpha: number
}

/**
 * The rim stroke for a base colour — the whole of the relative-shade decision, in one place.
 *
 * Shared rather than duplicated: `snake.ts` and this file draw the same rim, and a rim that
 * differed between the render lab and the habitat would be a bug nobody could see in one place.
 */
export function rimStroke(base: Rgba): RimStroke {
  const side = luminance(base) <= RIM_SHADE.flip ? RIM_SHADE.lighten : RIM_SHADE.darken
  return { colour: mix(base, side.toward, side.amount), alpha: side.alpha }
}

/**
 * A shaded edge and a light spine line — the cheapest possible way to make a flat fill look like a
 * rounded tube. Two strokes, no gradients, no per-pixel shading.
 *
 * `snake.ts` used to keep a private copy of this, and a comment asking whoever changed one to
 * change the other. The copies had already drifted — only this one guarded a degenerate ribbon —
 * and a rim that shades differently depending on which view drew the animal is a bug nobody can
 * see, because no screen shows both at once. `snake.ts` calls this now.
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

  const rim = rimStroke(phenotype.baseColour)
  ctx.lineWidth = Math.max(1.5, widest * 0.16)
  ctx.strokeStyle = toCss(rim.colour)
  ctx.globalAlpha = rim.alpha
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
