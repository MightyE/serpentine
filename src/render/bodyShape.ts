/**
 * How thick the snake is at each point along its length.
 *
 * ## The one shape rule that matters
 *
 * What makes a drawing read as *snake* rather than *worm* is not the colour and not the wiggle.
 * It is this sequence: **rounded snout → head bulge → neck pinch → thick mid-body → long taper**.
 * A worm is nearly the same width everywhere. A snake's neck is narrower than both its head and
 * its belly, and that single pinch is what your eye is looking for.
 *
 * ## Coordinates
 *
 * `u` runs 0 at the snout tip to 1 at the tail tip — the same `u` the pattern stages use, so a
 * band drawn at `u = 0.3` lands at the same place on the animal as the width measured there.
 */

import type { BodyProportions } from './contract'
import { sampleProfile, type ControlPoint } from './geometry'

/** Length in logical pixels for `lengthScale = 1`. Everything else is relative to this. */
const REFERENCE_LENGTH = 300

// ---------------------------------------------------------------------------
// Age
// ---------------------------------------------------------------------------

/**
 * The parts of the silhouette that change with **age** rather than with genes.
 *
 * ## Why this is separate from {@link BodyProportions}
 *
 * `BodyProportions` is *who this animal is* — a stout hognose stays stout at every age. A
 * `LifeShape` is *how old it is right now*, and it multiplies through the genetic numbers rather
 * than replacing them, so a stout hatchling is stout **and** babyish, not one or the other.
 *
 * ## Why these six fields, and not just "scale"
 *
 * A uniformly scaled-down adult reads as a *small adult*, never as a baby. Every field here
 * exists because it changes a **ratio** that pure scaling leaves untouched:
 *
 * - `lengthMul` on its own would be pure scaling. It is the one field that is *not* enough.
 * - `girthMul` is the stubbiness lever. Girth is derived from length, so shrinking a snake
 *   makes it thinner in lockstep and it stays exactly as slender as it was. Pushing girth back
 *   up is what makes a young animal *short for its thickness*.
 * - `headMul` widens the skull relative to the mid-body.
 * - `headSpan` is the strongest single cue and the least obvious: it moves the **neck pinch**,
 *   i.e. it decides what *fraction of the whole animal* is head. On a hatchling the head is a
 *   fifth of the body; on an adult it is an eighth. No amount of scaling can do this.
 * - `neckPinch` softens that pinch — young animals have rounder, less defined necks.
 * - `snoutBlunt` widens the very tip of the snout. Wedge reads as adult (and as dangerous);
 *   blunt reads as baby.
 *
 * Interpolate the whole struct and you get smooth growth; see `life/stage.ts`.
 */
export interface LifeShape {
  /** Multiplies nose-to-tail length. */
  readonly lengthMul: number
  /** Multiplies girth *after* length has already shrunk it — the stubbiness lever. */
  readonly girthMul: number
  /** Multiplies head width relative to the mid-body. */
  readonly headMul: number
  /** Where the neck pinch sits, as a fraction of total length. Bigger = more of the animal is head. */
  readonly headSpan: number
  /** Neck width as a fraction of peak girth. Lower is a sharper pinch. */
  readonly neckPinch: number
  /** Width of the snout tip as a fraction of head width. Higher is blunter, rounder, younger. */
  readonly snoutBlunt: number
  /** Added to `taperExponent`. Negative gives the shorter, thicker tail of a young animal. */
  readonly taperBias: number
}

/**
 * The neutral shape: every number here reproduces the pre-age renderer exactly.
 *
 * {@link widthProfile} and {@link bodyLength} default to it, so every existing caller gets
 * byte-identical output and nothing had to be updated when age arrived.
 */
export const ADULT_SHAPE: LifeShape = {
  lengthMul: 1,
  girthMul: 1,
  headMul: 1,
  headSpan: 0.13,
  neckPinch: 0.62,
  snoutBlunt: 0.34,
  taperBias: 0,
}

/** Nose-to-tail length, in logical pixels. */
export function bodyLength(body: BodyProportions, life: LifeShape = ADULT_SHAPE): number {
  return REFERENCE_LENGTH * body.lengthScale * life.lengthMul
}

/**
 * Build the width curve for a given body.
 *
 * Returned as a fresh array of control points rather than hard-coded numbers so you can log it,
 * tweak one row, and immediately see what changed. If you want a new body silhouette — a fat
 * hognose, a whip-thin vine snake — this list is the place to do it.
 */
export function widthProfile(body: BodyProportions, life: LifeShape = ADULT_SHAPE): ControlPoint[] {
  const len = bodyLength(body, life)
  // 6% of length at the thickest point. This number was tuned by looking: much above it and
  // the animal reads as a caterpillar, much below it and it reads as a piece of string.
  const peak = len * 0.062 * body.girthScale * life.girthMul
  // The head is *narrower* than the mid-body on most snakes — the widest part of a snake is its
  // stomach, not its skull. Drawing them equal is what makes a snake look like a tadpole.
  // Young animals push this ratio up toward 1, which is exactly the cue we want.
  const head = peak * 0.82 * body.headScale * life.headMul
  const neck = peak * life.neckPinch

  // Tail thinning. Raising `taperExponent` pulls these three down together, which reads as a
  // whippier tail without changing where the body is thickest.
  const taper = (x: number): number =>
    peak * Math.pow(x, Math.max(0.2, body.taperExponent + life.taperBias))

  // The head's control points slide together with the pinch, so a bigger `headSpan` stretches
  // the whole skull down the body rather than leaving a long snout stuck on a distant neck.
  const span = life.headSpan / ADULT_SHAPE.headSpan

  return [
    { u: 0.0, value: head * life.snoutBlunt }, // snout tip — rounded off by the head cap
    { u: 0.025 * span, value: head * 0.78 },
    { u: 0.065 * span, value: head }, // widest across the cheeks, just behind the eyes
    { u: life.headSpan, value: neck }, // the pinch. Do not delete this row.
    { u: 0.4, value: peak },
    { u: 0.62, value: peak * 0.95 },
    { u: 0.78, value: taper(0.72) },
    { u: 0.9, value: taper(0.38) },
    { u: 0.97, value: taper(0.13) },
    { u: 1.0, value: 0 },
  ]
}

/**
 * Width (not half-width) of the body at `u`, in logical pixels.
 *
 * Prefer building the profile once with {@link widthProfile} and passing it here, rather than
 * rebuilding it per point — this gets called ~50 times per snake per frame.
 */
export function widthAt(profile: readonly ControlPoint[], u: number): number {
  return sampleProfile(profile, u)
}
