/**
 * The face, at any age.
 *
 * ## Why this is not `../head.ts`
 *
 * `head.ts` places the eyes at a fixed `u = 0.062` and sizes them off a fixed fraction of the
 * head's width. That is exactly right for an adult and quietly wrong for a hatchling, because on
 * a hatchling the skull runs a fifth of the way down the body — so a constant `u` puts the eyes
 * out on the snout instead of on the cheek.
 *
 * Everything here is expressed as a fraction of {@link LifeShape.headSpan} instead, which makes
 * the placement follow the skull as it grows. The constants are chosen so that at `age = 1` this
 * lands in the same place `head.ts` does; a full-grown snake drawn either way is identical.
 *
 * ## The cuteness compounding
 *
 * Three multipliers stack on a young face, and the stacking is the whole effect:
 *
 * 1. the head is a bigger fraction of the body ({@link lifeShapeAtAge}),
 * 2. the head is wider relative to the belly (same),
 * 3. the eye is a bigger fraction of *that* head ({@link eyeScaleAtAge}).
 *
 * Any one of them alone is a small tweak. All three together is a baby.
 *
 * The four adult decisions from `head.ts` — oversized eyes, a catchlight, a round pupil rather
 * than a slit, and blinking at all — still hold here, for the same reasons, and are not
 * re-argued. Read that file's header first.
 */

import type { EyeAppearance, Phenotype } from '../contract'
import { lighten, mix, rgba, toCss } from '../colour'
import { perp, scale, add, type Vec2 } from '../geometry'
import { pointOnBody, type Ribbon } from '../ribbon'
import { eyePlacementAtAge, eyeScaleAtAge, ratioMaturity } from './stage'

/** Animation state the face needs. Same shape as `head.ts`'s `FaceState`, on purpose. */
export interface LifeFaceState {
  /** 0 = wide open, 1 = fully shut. */
  readonly blink: number
  /** 0 = tongue hidden, 1 = fully extended. */
  readonly tongue: number
}

/**
 * Draw the eyes and, if it is out, the tongue — sized and placed for `age`.
 *
 * Call after the body, so the face sits on top of the markings.
 */
export function drawLifeFace(
  ctx: CanvasRenderingContext2D,
  ribbon: Ribbon,
  phenotype: Phenotype,
  state: LifeFaceState,
  age: number,
): void {
  const place = eyePlacementAtAge(age)
  if (state.tongue > 0.001) drawTongue(ctx, ribbon, phenotype, state.tongue, place.u, age)
  drawEye(ctx, ribbon, phenotype.eye, place.u, place.v, state.blink, age)
  drawEye(ctx, ribbon, phenotype.eye, place.u, -place.v, state.blink, age)
}

/** Body width where the eyes are — very nearly the widest part of the head. */
function headWidth(ribbon: Ribbon, eyeU: number): number {
  let i = 0
  while (i < ribbon.us.length - 1 && ribbon.us[i] < eyeU) i++
  return ribbon.widths[i]
}

function drawEye(
  ctx: CanvasRenderingContext2D,
  ribbon: Ribbon,
  eye: EyeAppearance,
  eyeU: number,
  v: number,
  blink: number,
  age: number,
): void {
  const centre = pointOnBody(ribbon, eyeU, v * 0.72)
  // 0.23 is `head.ts`'s adult constant, and `eyeScaleAtAge` is 1 at age 1 — so an adult drawn
  // through this file and an adult drawn through `head.ts` come out the same size.
  const radius = headWidth(ribbon, eyeU) * 0.23 * eye.sizeScale * eyeScaleAtAge(age)
  if (radius < 0.4) return

  // The eye squashes vertically as it closes, in the head's own frame — so a blink still looks
  // right when the snake is facing any direction.
  const along = ribbon.tangents[0]
  const angle = Math.atan2(along.y, along.x)
  const open = Math.max(0.06, 1 - blink)

  ctx.save()
  ctx.translate(centre.x, centre.y)
  ctx.rotate(angle)
  ctx.scale(1, open)

  ctx.fillStyle = toCss(mix(eye.pupilColour, rgba(0, 0, 0, 1), 0.25))
  ctx.beginPath()
  ctx.arc(0, 0, radius * 1.16, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = toCss(eye.irisColour)
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, Math.PI * 2)
  ctx.fill()

  // Round, not slit — and *bigger* on a baby, in proportion to the iris. A pupil that stays a
  // fixed fraction while the eye grows reads as staring; one that grows with it reads as young.
  const pupil = 0.52 + 0.12 * (1 - ratioMaturity(age))
  ctx.fillStyle = toCss(eye.pupilColour)
  ctx.beginPath()
  ctx.arc(0, 0, radius * pupil, 0, Math.PI * 2)
  ctx.fill()

  if (eye.highlight) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)'
    ctx.beginPath()
    ctx.arc(radius * 0.34, -radius * 0.34, radius * 0.3, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)'
    ctx.beginPath()
    ctx.arc(-radius * 0.36, radius * 0.3, radius * 0.15, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}

/**
 * The forked tongue. Scaled off the head, so it shrinks with the animal rather than staying an
 * adult-sized tongue on a baby's face — which looks alarming rather than endearing.
 */
function drawTongue(
  ctx: CanvasRenderingContext2D,
  ribbon: Ribbon,
  phenotype: Phenotype,
  extend: number,
  eyeU: number,
  age: number,
): void {
  const snout = ribbon.spine[0]
  const dir = ribbon.tangents[0]
  const side = perp(dir)
  const w = headWidth(ribbon, eyeU)
  // A hatchling's tongue is short and does not reach far. It also flicks more (see `view.ts`).
  const reach = 0.62 + 0.38 * ratioMaturity(age)

  const stemLen = w * 0.55 * extend * reach
  const forkLen = w * 0.5 * extend * reach
  const spread = w * 0.3 * extend * extend * reach

  const start: Vec2 = add(snout, scale(dir, w * 0.28))
  const knee: Vec2 = add(start, scale(dir, stemLen))
  const tipA: Vec2 = add(add(knee, scale(dir, forkLen)), scale(side, spread))
  const tipB: Vec2 = add(add(knee, scale(dir, forkLen)), scale(side, -spread))

  ctx.save()
  ctx.strokeStyle = toCss(lighten(mix(phenotype.patternColour, rgba(220, 60, 90, 1), 0.75), 0.05))
  ctx.lineWidth = Math.max(0.8, w * 0.09)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(start.x, start.y)
  ctx.lineTo(knee.x, knee.y)
  ctx.moveTo(knee.x, knee.y)
  ctx.lineTo(tipA.x, tipA.y)
  ctx.moveTo(knee.x, knee.y)
  ctx.lineTo(tipB.x, tipB.y)
  ctx.stroke()
  ctx.restore()
}
