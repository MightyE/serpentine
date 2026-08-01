/**
 * One snake on screen: the thing that owns a spine, updates it, and draws it.
 *
 * ## The shape of it
 *
 * ```
 *   update(dt)   move the head, drag the body, tick the blink and tongue clocks
 *   draw(ctx)    spine → wave → ribbon → effects → markings → face
 * ```
 *
 * Nothing here decides *what* the snake looks like — that is the phenotype and the stage
 * pipeline. This file only decides where it is and how it is moving.
 *
 * ## Two states, and why both matter
 *
 * `wander` is the obvious one: pick a spot, swim to it, pick another.
 *
 * `rest` is the one that makes the game feel like it is about animals. A resting snake coils.
 * It is what a calm, unstressed snake actually does in a hide box, and a screen full of snakes
 * lying in straight lines looks like a screen full of objects waiting to be used. The coil is
 * eased into rather than snapped to, so switching states looks like the animal settling.
 */

import type { Phenotype } from './contract'
import { bodyLength, widthProfile } from './bodyShape'
import { toCss, mix, rgba } from './colour'
import { effectsFor, totalDrift, type EffectDefinition, type EffectDrawContext } from './effects'
import { add, distance, perp, scale, vec, type ControlPoint, type Vec2 } from './geometry'
import { drawFace } from './head'
import { drawUpturnedSnout } from './snout'
import { buildRibbon, traceRibbon, paintRibbon, type Ribbon } from './ribbon'
import { coilPose, visualSpine, DEFAULT_WAVE, Spine, type WaveParams } from './spine'
import { patternTextureFor, type PatternTexture } from './texture'
import { hashSeed, makeRng, type Rng } from '../lib/rng'

export type SnakeMode = 'wander' | 'rest'

export interface Rect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface SnakeViewOptions {
  /** The area the snake is allowed to move around in. */
  readonly bounds: Rect
  readonly mode?: SnakeMode
  /** Spine points. More is smoother and slower; 46 across a 300px body is ~6px apart. */
  readonly pointCount?: number
  /** Logical pixels per second while wandering. */
  readonly speed?: number
}

export class SnakeView {
  readonly phenotype: Phenotype
  mode: SnakeMode

  private readonly bounds: Rect
  private readonly spine: Spine
  private readonly profile: ControlPoint[]
  private readonly texture: PatternTexture
  private readonly wave: WaveParams
  /** A calmer version of the same wave, used while resting — see the note in `draw`. */
  private readonly restWave: WaveParams
  private readonly effects: readonly EffectDefinition[]
  private readonly drift: number
  private readonly seed: number
  private readonly rng: Rng
  private readonly speed: number
  private readonly coil: Vec2[]

  private time = 0
  private target: Vec2
  private blink = 0
  private blinkCountdown: number
  private tongue = 0
  private tongueCountdown: number

  constructor(phenotype: Phenotype, options: SnakeViewOptions) {
    this.phenotype = phenotype
    this.bounds = options.bounds
    this.mode = options.mode ?? 'wander'
    this.seed = hashSeed(phenotype.seed)
    this.rng = makeRng(phenotype.seed).fork('animation')
    this.profile = widthProfile(phenotype.body)
    this.texture = patternTextureFor(phenotype)
    this.effects = effectsFor(phenotype)
    this.drift = totalDrift(this.effects)
    this.speed = options.speed ?? 42

    const length = bodyLength(phenotype.body)
    const count = options.pointCount ?? 46
    const segLength = length / (count - 1)

    const centre = vec(options.bounds.x + options.bounds.width / 2, options.bounds.y + options.bounds.height / 2)
    this.spine = new Spine(centre, count, segLength, this.rng.range(0, Math.PI * 2))
    this.coil = coilPose(centre, count, segLength, 1)

    // Every clock is seeded from the snake's own id, so a row of snakes never blinks in unison —
    // which is the single most obvious tell that you are looking at copies of one animation.
    this.wave = {
      ...DEFAULT_WAVE,
      amplitude: DEFAULT_WAVE.amplitude * this.rng.range(0.8, 1.25),
      speed: DEFAULT_WAVE.speed * this.rng.range(0.85, 1.2),
      phase: this.rng.range(0, Math.PI * 2),
    }
    this.restWave = { ...this.wave, amplitude: this.wave.amplitude * 0.2, speed: this.wave.speed * 0.45 }
    this.blinkCountdown = this.rng.range(0.5, 5)
    this.tongueCountdown = this.rng.range(0.5, 6)
    this.target = this.pickTarget()
  }

  /** Advance the animation. `dt` is in seconds and should already be clamped by the loop. */
  update(dt: number): void {
    this.time += dt

    if (this.mode === 'wander') {
      if (distance(this.spine.head, this.target) < 26) this.target = this.pickTarget()
      this.spine.update(this.target, this.speed, dt)
    } else {
      this.spine.easeToPose(this.coil, 1.4, dt)
    }

    this.tickBlink(dt)
    this.tickTongue(dt)
  }

  draw(ctx: CanvasRenderingContext2D): void {
    // A coiled snake still breathes, but the swimming wave has to come almost all the way down:
    // at full strength on a tight spiral it turns the outline into a scallop shell.
    const points = visualSpine(this.spine, this.time, this.mode === 'rest' ? this.restWave : this.wave)
    applyHeadSway(points, this.time, this.mode === 'rest' ? 2.6 : 1.2, this.wave.phase)
    const ribbon = buildRibbon(points, this.profile)

    const effectCtx: EffectDrawContext = {
      ctx,
      ribbon,
      phenotype: this.phenotype,
      time: this.time,
      seed: this.seed,
    }

    for (const effect of this.effects) effect.drawBehind?.(effectCtx)

    // An opaque undercoat first. The textured strips are clipped to this exact outline, and
    // antialiasing can leave hairline gaps at the very edge; filling underneath means those
    // gaps show body colour rather than the background.
    ctx.save()
    traceRibbon(ctx, ribbon)
    ctx.fillStyle = toCss(this.phenotype.baseColour)
    ctx.fill()
    ctx.restore()

    paintRibbon(
      ctx,
      ribbon,
      this.texture.canvas,
      this.texture.width,
      this.texture.height,
      this.drift * this.time,
    )

    drawRoundness(ctx, ribbon, this.phenotype)
    for (const effect of this.effects) effect.drawOver?.(effectCtx)
    drawFace(ctx, ribbon, this.phenotype, { blink: this.blink, tongue: this.tongue })
    drawUpturnedSnout(ctx, ribbon, this.phenotype)
  }

  /** Where the head currently is — handy for debug overlays and hit-testing. */
  get headPosition(): Vec2 {
    return this.spine.head
  }

  private pickTarget(): Vec2 {
    const margin = Math.min(this.bounds.width, this.bounds.height) * 0.18
    return vec(
      this.rng.range(this.bounds.x + margin, this.bounds.x + this.bounds.width - margin),
      this.rng.range(this.bounds.y + margin, this.bounds.y + this.bounds.height - margin),
    )
  }

  /**
   * Blinks are ~160ms, every 3–7 seconds, and the interval is redrawn each time so it never
   * settles into a rhythm. A perfectly regular blink reads as a machine.
   */
  private tickBlink(dt: number): void {
    this.blinkCountdown -= dt
    if (this.blinkCountdown > 0) {
      this.blink = 0
      return
    }
    const through = 1 + this.blinkCountdown / 0.16 // 1 → 0 across the blink
    if (through <= 0) {
      this.blink = 0
      this.blinkCountdown = this.rng.range(3, 7)
      return
    }
    // Shut and open again: a half sine, so it is fastest in the middle.
    this.blink = Math.sin(through * Math.PI)
  }

  /**
   * Tongue flicks come in pairs — out, half back, out again, gone — over about half a second.
   * The double flick is what real snakes do and it is far more convincing than one smooth
   * extension, for about four extra characters of maths.
   */
  private tickTongue(dt: number): void {
    this.tongueCountdown -= dt
    if (this.tongueCountdown > 0) {
      this.tongue = 0
      return
    }
    const duration = 0.55
    const through = 1 + this.tongueCountdown / duration
    if (through <= 0) {
      this.tongue = 0
      this.tongueCountdown = this.rng.range(2.5, 8)
      return
    }
    const envelope = Math.sin(through * Math.PI)
    const doubleFlick = 0.6 + 0.4 * Math.sin(through * Math.PI * 3)
    this.tongue = Math.max(0, envelope * doubleFlick)
  }
}

/**
 * A slow sway concentrated at the head.
 *
 * The body wave is deliberately weakest at the head (see `spine.ts`), which is right for
 * swimming but leaves a resting snake looking switched off. This adds a small, slower motion
 * that fades out down the neck — the animal looking around rather than the animal wobbling.
 * Different frequency from the body wave on purpose; matching them makes the whole snake pulse
 * like one object.
 */
function applyHeadSway(points: Vec2[], time: number, amount: number, phase: number): void {
  const reach = Math.min(10, points.length)
  const swing = Math.sin(time * 0.9 + phase) * amount
  for (let i = 0; i < reach; i++) {
    const falloff = 1 - i / reach
    const t = i === 0 ? { x: points[0].x - points[1].x, y: points[0].y - points[1].y } : { x: points[i - 1].x - points[i].x, y: points[i - 1].y - points[i].y }
    const len = Math.hypot(t.x, t.y) || 1
    const n = perp({ x: t.x / len, y: t.y / len })
    points[i] = add(points[i], scale(n, swing * falloff * falloff))
  }
}

/**
 * A dark edge and a light spine line — the cheapest possible way to make a flat fill look like
 * a rounded tube. Two strokes, no gradients, no per-pixel shading.
 */
function drawRoundness(ctx: CanvasRenderingContext2D, ribbon: Ribbon, phenotype: Phenotype): void {
  ctx.save()
  traceRibbon(ctx, ribbon)
  ctx.clip()

  // Rim: a wide-ish stroke on the inside of the outline, darkening the flanks.
  ctx.lineWidth = Math.max(1.5, Math.max(...ribbon.widths) * 0.16)
  ctx.strokeStyle = toCss(mix(phenotype.baseColour, rgba(20, 14, 24, 1), 0.4))
  ctx.globalAlpha = 0.22
  traceRibbon(ctx, ribbon)
  ctx.stroke()

  // Highlight: a thin light line along the top of the spine.
  ctx.globalAlpha = 0.16
  ctx.lineWidth = Math.max(1, Math.max(...ribbon.widths) * 0.1)
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
