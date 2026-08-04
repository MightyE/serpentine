/**
 * The animal in your hands, drawn live.
 *
 * {@link heldPose} decides where the body is; everything about how it *looks* is the same paint,
 * face and snout code every other view uses. The only thing this file adds is the expression:
 * being picked up is a surprise, so the eyes go wide and settle — {@link pickupDilation} is the
 * curve, `FaceState.dilation` is the door into the renderer, and neither is forked here.
 *
 * ## Why the carried animal is a live canvas and not the cached portrait
 *
 * A portrait is a still S-curve, which is the right picture of a snake on a shelf and the wrong
 * picture of one being held: the pose is the point of the gesture. One animal at a time is ever in
 * hand, so this is one extra loop at most, and it stops the moment you put the animal down.
 */

import type { Phenotype } from '../contract'
import { bodyLength } from '../bodyShape'
import { widthProfile } from '../bodyShape'
import { clamp01 } from '../colour'
import { effectsFor, totalDrift, type EffectDefinition, type EffectDrawContext } from '../effects'
import type { ControlPoint } from '../geometry'
import { vec } from '../geometry'
import { drawLifeFace } from '../life/face'
import { paintBody } from '../life/paint'
import { lifeShapeAtAge } from '../life/stage'
import { fitCanvasToDisplay, startRenderLoop } from '../loop'
import { buildRibbon } from '../ribbon'
import { drawUpturnedSnout } from '../snout'
import { patternTextureFor, type PatternTexture } from '../texture'
import { hashSeed } from '../../lib/rng'
import { HELD_EXTENT, heldPose, pickupDilation } from './held'

/** Body points. The pose is a smooth curve at any count; 34 is plenty at ghost size. */
const POINT_COUNT = 34
/** How much of the box the animal is allowed to fill, leaving room for the sway. */
const FILL = 0.88

export interface HeldSnakeOptions {
  readonly phenotype: Phenotype
  /** 0 newly hatched, 1 full grown. Drives the same head/eye proportions the floor uses. */
  readonly age: number
  /** Freeze the sway for `prefers-reduced-motion`. The dilation still plays — it is the message. */
  readonly still?: boolean
}

/**
 * Draw one held animal into a canvas until {@link destroy} is called.
 *
 * The clock starts at construction, which is what makes the dilation a *pickup* reaction: the view
 * exists exactly as long as the animal is in hand.
 */
export class HeldSnakeView {
  private readonly ctx: CanvasRenderingContext2D
  private readonly phenotype: Phenotype
  private readonly age: number
  private readonly still: boolean
  private readonly texture: PatternTexture
  private readonly effects: readonly EffectDefinition[]
  private readonly drift: number
  private readonly seed: number
  private readonly phase: number
  private readonly stop: () => void
  private time = 0

  constructor(
    private readonly canvas: HTMLCanvasElement,
    options: HeldSnakeOptions,
  ) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get a 2D context for a held snake')
    this.ctx = ctx
    this.phenotype = options.phenotype
    this.age = clamp01(options.age)
    this.still = options.still ?? false
    this.texture = patternTextureFor(options.phenotype)
    this.effects = effectsFor(options.phenotype)
    this.drift = totalDrift(this.effects)
    this.seed = hashSeed(options.phenotype.seed)
    // Two animals picked up in the same second should not swing in step. Derived from the seed,
    // never from a clock or a random number — see the determinism note in CLAUDE.md.
    this.phase = (this.seed % 1000) / 1000 * Math.PI * 2

    this.stop = startRenderLoop((dt) => {
      this.time += dt
      this.draw()
    })
  }

  destroy(): void {
    this.stop()
  }

  private draw(): void {
    const { ctx, canvas } = this
    fitCanvasToDisplay(canvas, ctx)
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    ctx.clearRect(0, 0, rect.width, rect.height)

    const shape = lifeShapeAtAge(this.age)
    const logical = bodyLength(this.phenotype.body, shape)
    // One uniform scale, both axes — the same rule `portraitLayout` states at length. The pose's
    // own footprint is what is fitted, so the sway never carries the tail off the edge.
    const scale = Math.min(
      (rect.width * FILL) / (logical * HELD_EXTENT.width),
      (rect.height * FILL) / (logical * HELD_EXTENT.height),
    )
    const drawn = logical * scale
    const profile: ControlPoint[] = widthProfile(this.phenotype.body, shape).map((point) => ({
      u: point.u,
      value: point.value * scale,
    }))

    // The hand sits where the body bends: right of centre, high, so the level head runs left and
    // the tail has the lower half of the box to hang in.
    const anchor = vec(
      rect.width / 2 + drawn * HELD_EXTENT.width * 0.5 - drawn * 0.04,
      rect.height / 2 - drawn * HELD_EXTENT.height * 0.5 + drawn * 0.11,
    )

    const points = heldPose({
      count: POINT_COUNT,
      segLength: drawn / (POINT_COUNT - 1),
      time: this.time,
      anchor,
      sway: this.still ? 0 : 1,
      phase: this.phase,
    })
    const ribbon = buildRibbon(points, profile)

    const effectCtx: EffectDrawContext = {
      ctx,
      ribbon,
      phenotype: this.phenotype,
      time: this.time,
      seed: this.seed,
    }
    for (const effect of this.effects) effect.drawBehind?.(effectCtx)
    paintBody(ctx, ribbon, this.phenotype, this.texture, this.drift * this.time)
    for (const effect of this.effects) effect.drawOver?.(effectCtx)
    drawLifeFace(
      ctx,
      ribbon,
      this.phenotype,
      { blink: 0, tongue: 0, dilation: pickupDilation(this.time) },
      this.age,
    )
    drawUpturnedSnout(ctx, ribbon, this.phenotype)
  }
}
