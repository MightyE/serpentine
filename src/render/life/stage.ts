/**
 * Growing up, as a number.
 *
 * ## The one idea in this file
 *
 * **Age is a continuous parameter, not a set of four sprites.**
 *
 * The obvious design is an enum — `egg | hatchling | juvenile | adult` — and four hand-tuned
 * bodies. It is also the wrong one, for a reason that only shows up later: a snake in this game
 * *grows*, and growth that pops from one form to the next reads as a bug even when it is
 * deliberate. Worse, four hand-tuned bodies drift apart as you tune them, so the juvenile stops
 * looking like the same animal.
 *
 * So the primitive is `age ∈ [0, 1]`, and the four names are **points on that line**
 * ({@link STAGE_AGE}). Everything visible — proportions, eye size, how confidently it moves — is
 * a smooth function of it. The named stages exist for the game and the UI to talk about; the
 * renderer only ever sees the number. A growth animation is `age += dt * rate`, and it costs
 * nothing extra because it was never discrete in the first place.
 *
 * ## Where the egg sits on that line
 *
 * It doesn't, quite. `ageOfStage('egg')` is 0 so the mapping is total, but {@link stageAtAge}
 * **never returns `'egg'`** — and that asymmetry is honest rather than sloppy. An egg is not a
 * smaller snake (see `egg.ts`); it is a hatchling at age 0 with a shell around it. Whether the
 * shell is still on is a fact the *game* owns, not something you can read off a body's
 * proportions. Keeping it out of `stageAtAge` means the growth slider stays a pure
 * body-proportion control and never has to special-case a thing that isn't a body.
 *
 * ## Why proportions and not scale
 *
 * See the long note on {@link LifeShape} in `../bodyShape.ts`. Short version: a scaled-down
 * adult reads as a small adult. What reads as *baby* is a set of changed **ratios** — more of
 * the animal is head, the head is wider than the belly, the body is short for its girth, the
 * snout is blunt, the eyes are enormous. This file is where those ratios live.
 */

import type { EyeAppearance } from '../contract'
import { ADULT_SHAPE, type LifeShape } from '../bodyShape'
import { clamp01, lerp } from '../colour'

/** The four names the rest of the game uses. Points on the age line, not separate forms. */
export type LifeStage = 'egg' | 'hatchling' | 'juvenile' | 'adult'

export const LIFE_STAGES: readonly LifeStage[] = ['egg', 'hatchling', 'juvenile', 'adult']

/**
 * Where each named stage sits on the 0..1 age line.
 *
 * `egg` and `hatchling` share age 0 on purpose: the animal inside an egg *is* the hatchling, at
 * exactly the proportions it will have the moment it comes out. Hatching changes what you can
 * see, not how old it is.
 *
 * `juvenile` is at 0.45 rather than 0.5 because proportion maturity runs ahead of size
 * (see {@link ratioMaturity}) — 0.45 is where it *looks* half-grown, which is what the word is
 * for.
 */
export const STAGE_AGE: Readonly<Record<LifeStage, number>> = {
  egg: 0,
  hatchling: 0,
  juvenile: 0.45,
  adult: 1,
}

/** Age of a named stage. Total, including `'egg'` (which is 0 — see the note above). */
export function ageOfStage(stage: LifeStage): number {
  return STAGE_AGE[stage]
}

/**
 * The closest name for an age. Never returns `'egg'` — see the file header.
 *
 * Thresholds, not nearest-neighbour: "juvenile" should cover most of the middle of the line,
 * because that is where an animal spends most of its growing.
 */
export function stageAtAge(age: number): Exclude<LifeStage, 'egg'> {
  const a = clamp01(age)
  if (a < 0.2) return 'hatchling'
  if (a < 0.78) return 'juvenile'
  return 'adult'
}

// ---------------------------------------------------------------------------
// The two ends of the line
// ---------------------------------------------------------------------------

/**
 * A newly hatched animal, as a set of multipliers over its adult self.
 *
 * Every one of these was picked by putting a hatchling next to its own adult in the life lab
 * and asking "does that read as a baby or as a small adult". They are ratios, so a stout snake
 * and a whip-thin one both get babyish in their own way rather than converging on one shape.
 *
 * Sanity check on the numbers, for a typical body: an adult is 300px long with a 17.5px head —
 * head width is 5.8% of length. This hatchling is 108px long with a 13px head — 12.1%. That
 * doubling, plus a neck pinch that has moved from 13% of the body back to 21%, is the entire
 * baby read. Scale alone cannot move either number.
 */
export const HATCHLING_SHAPE: LifeShape = {
  lengthMul: 0.36,
  // Girth is derived from length, so shrinking alone keeps a hatchling exactly as slender as
  // its parent. This puts it back: ~10% of its own length at the thickest point, against 6.2%
  // for an adult. Short for its girth is most of what "stubby" means.
  girthMul: 1.62,
  // Head *wider* than the mid-body — the one place this renderer deliberately breaks its own
  // "a snake's widest point is its stomach" rule, because on a real hatchling it very nearly is.
  headMul: 1.26,
  // The big one. A fifth of the animal is head, against an eighth for an adult.
  headSpan: 0.215,
  neckPinch: 0.76,
  snoutBlunt: 0.58,
  taperBias: -0.32,
}

/**
 * How mature the *ratios* are at a given age, 0..1.
 *
 * Deliberately ahead of size: a half-length juvenile has more than half-grown-up proportions,
 * which is both what real snakes do and what keeps the baby-ness concentrated at the young end
 * where it does the emotional work. Flatten this to `age` and every juvenile looks like a
 * slightly wrong hatchling.
 */
export function ratioMaturity(age: number): number {
  return Math.pow(clamp01(age), 0.55)
}

/** How much of adult *size* is reached at a given age. Very nearly linear. */
export function sizeMaturity(age: number): number {
  return Math.pow(clamp01(age), 0.9)
}

/**
 * The body shape at any age. This is the function the renderer actually calls.
 *
 * Pure interpolation between {@link HATCHLING_SHAPE} and {@link ADULT_SHAPE}, on two different
 * curves — size on one, ratios on the other. Hand it to `widthProfile(body, shape)`.
 */
export function lifeShapeAtAge(age: number): LifeShape {
  const s = sizeMaturity(age)
  const r = ratioMaturity(age)
  const b = HATCHLING_SHAPE
  const a = ADULT_SHAPE
  return {
    lengthMul: lerp(b.lengthMul, a.lengthMul, s),
    girthMul: lerp(b.girthMul, a.girthMul, r),
    headMul: lerp(b.headMul, a.headMul, r),
    headSpan: lerp(b.headSpan, a.headSpan, r),
    neckPinch: lerp(b.neckPinch, a.neckPinch, r),
    snoutBlunt: lerp(b.snoutBlunt, a.snoutBlunt, r),
    taperBias: lerp(b.taperBias, a.taperBias, r),
  }
}

/** Shorthand for `lifeShapeAtAge(ageOfStage(stage))`. */
export function lifeShapeOfStage(stage: LifeStage): LifeShape {
  return lifeShapeAtAge(ageOfStage(stage))
}

// ---------------------------------------------------------------------------
// The face
// ---------------------------------------------------------------------------

/**
 * Eye size relative to the head, by age.
 *
 * This compounds with the head already being proportionally wider, and the compounding is the
 * point: the eye grows *as a fraction of a head that itself grew as a fraction of the body*.
 * Baby eyes are close to adult size in absolute terms in real animals — they finish growing
 * first — which is exactly why they look so oversized on a small head.
 *
 * The ceiling was found by overshooting it. At 1.5 the eye is wider than the skull and hangs off
 * both sides, and the effect is not "baby" — it is a googly eye stuck onto a snake, and it wipes
 * out the head silhouette that the rest of the age work was for. 1.28 puts the outer edge of the
 * eye just past the outline, which is where a real snake's eye sits and where the cue reads
 * hardest. The head has to stay visible *underneath* the eye for the eye to be big *on* it.
 */
export function eyeScaleAtAge(age: number): number {
  return lerp(1.28, 1, ratioMaturity(age))
}

/**
 * Where along the body the eye sits, and how far out to the side.
 *
 * `u` is pinned to a fraction of `headSpan` rather than a constant, so the eye stays on the
 * widest part of the cheek as the skull grows and shrinks along the body. The constant 0.477
 * is chosen so that an adult lands on exactly the 0.062 the original face code used.
 *
 * `v` moves *inward* for the young — a bigger eye set at the adult's `v` hangs off the side of
 * a shorter head. Pulling it in is also the truer cue: young animals of most species have more
 * frontally set eyes, and frontal eyes are half of why a face reads as a face.
 */
export function eyePlacementAtAge(age: number): { u: number; v: number } {
  const shape = lifeShapeAtAge(age)
  return { u: shape.headSpan * 0.477, v: lerp(0.4, 0.46, ratioMaturity(age)) }
}

/** A copy of an eye with its size scaled for an age. The colours are the animal's, untouched. */
export function eyeAtAge(eye: EyeAppearance, age: number): EyeAppearance {
  return { ...eye, sizeScale: eye.sizeScale * eyeScaleAtAge(age) }
}

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

/**
 * How an animal of this age moves.
 *
 * The smallest of the four cues and the one people notice without being able to name. A
 * hatchling is slower over the ground, wobblier side to side, and changes its mind about where
 * it is going far more often. An adult travels in long confident curves.
 *
 * These are multipliers over whatever the caller's defaults are, so tuning the adult tunes
 * every age with it.
 */
export interface LifeMotion {
  /** Multiplies travel speed in logical pixels per second. */
  readonly speedMul: number
  /** Multiplies the slither wave's amplitude — the side-to-side wobble. */
  readonly waveMul: number
  /** Multiplies the wave's frequency. Small animals wiggle *faster*, not just wider. */
  readonly waveSpeedMul: number
  /** Multiplies how fast the head is allowed to turn. High is indecisive; low is purposeful. */
  readonly turnMul: number
  /** Multiplies the idle head sway. */
  readonly swayMul: number
}

export function motionAtAge(age: number): LifeMotion {
  const r = ratioMaturity(age)
  return {
    speedMul: lerp(0.58, 1, sizeMaturity(age)),
    waveMul: lerp(1.55, 1, r),
    waveSpeedMul: lerp(1.7, 1, r),
    turnMul: lerp(1.9, 1, r),
    swayMul: lerp(1.6, 1, r),
  }
}
