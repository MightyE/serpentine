/**
 * One animated snake, at an age you can change while it is on screen.
 *
 * ## Why this is not an option on `SnakeView`
 *
 * It nearly could be. What stops it is that age changes three things `SnakeView` treats as
 * constructor-time constants: the width profile (which now needs a {@link LifeShape}), the
 * segment length of the spine (a hatchling is a third as long, so its chain links are a third as
 * long too), and the motion parameters. Retrofitting a settable age onto a class that assumes
 * none of them ever move would have meant changing its public shape, and other code is compiling
 * against it. So: a sibling view that owns growth, and a `SnakeView` that stays simple.
 *
 * ## Growing without teleporting
 *
 * `setAge` is meant to be called every frame if you like — a growth animation is exactly that.
 * When the body length changes, the spine's rest length changes with it, and the naive fix
 * (build a fresh chain) snaps the animal into a straight line. Instead the old path is
 * **resampled** at the new spacing: the snake keeps the curve it was already in and simply has
 * more, or less, of itself. See {@link resamplePath}.
 *
 * ## Three poses
 *
 * `wander` and `rest` match `SnakeView`. `showcase` is the one that earns its place: a fixed,
 * gently curved pose in the middle of the frame. Proportions are genuinely hard to judge on a
 * moving target, and the whole point of the life stages is a proportion you can see. Put four
 * ages in showcase side by side and the comparison is honest.
 */

import type { Phenotype } from '../contract'
import { bodyLength, widthProfile } from '../bodyShape'
import { effectsFor, totalDrift, type EffectDefinition, type EffectDrawContext } from '../effects'
import { add, distance, normalize, perp, scale, sub, vec, type ControlPoint, type Vec2 } from '../geometry'
import { buildRibbon } from '../ribbon'
import { coilPose, visualSpine, DEFAULT_WAVE, Spine, type WaveParams } from '../spine'
import { patternTextureFor, type PatternTexture } from '../texture'
import { hashSeed, makeRng, type Rng } from '../../lib/rng'
import { clamp01 } from '../colour'
import { drawLifeFace } from './face'
import { paintBody } from './paint'
import { lifeShapeAtAge, motionAtAge, ratioMaturity, type LifeMotion } from './stage'

export type LifePose = 'wander' | 'rest' | 'showcase'

export interface Rect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface LifeSnakeOptions {
  readonly bounds: Rect
  /** 0 = newly hatched, 1 = full grown. Changeable later with {@link LifeSnakeView.setAge}. */
  readonly age?: number
  readonly pose?: LifePose
  /** Spine points. Kept constant across ages so growth only changes the spacing. */
  readonly pointCount?: number
  /** Logical pixels per second an *adult* travels at. Younger animals get a fraction of it. */
  readonly speed?: number
}

export class LifeSnakeView {
  readonly phenotype: Phenotype
  pose: LifePose

  private readonly bounds: Rect
  private readonly spine: Spine
  private readonly texture: PatternTexture
  private readonly effects: readonly EffectDefinition[]
  private readonly drift: number
  private readonly seed: number
  private readonly rng: Rng
  private readonly baseSpeed: number
  private readonly count: number
  private readonly waveShape: WaveParams

  private age: number
  private motion: LifeMotion
  private profile: ControlPoint[]
  private segLength: number
  private coil: Vec2[]
  private showcasePose: Vec2[]

  private time = 0
  private target: Vec2
  private blink = 0
  private blinkCountdown: number
  private tongue = 0
  private tongueCountdown: number

  constructor(phenotype: Phenotype, options: LifeSnakeOptions) {
    this.phenotype = phenotype
    this.bounds = options.bounds
    this.pose = options.pose ?? 'wander'
    this.age = clamp01(options.age ?? 1)
    this.seed = hashSeed(phenotype.seed)
    this.rng = makeRng(phenotype.seed).fork('animation')
    this.texture = patternTextureFor(phenotype)
    this.effects = effectsFor(phenotype)
    this.drift = totalDrift(this.effects)
    this.baseSpeed = options.speed ?? 42
    this.count = options.pointCount ?? 46

    // Per-animal variation, drawn once so it survives every age change. Two snakes must never
    // wave in lockstep, and re-rolling this on the growth slider would make the wiggle jump.
    this.waveShape = {
      ...DEFAULT_WAVE,
      amplitude: DEFAULT_WAVE.amplitude * this.rng.range(0.8, 1.25),
      speed: DEFAULT_WAVE.speed * this.rng.range(0.85, 1.2),
      phase: this.rng.range(0, Math.PI * 2),
    }

    this.motion = motionAtAge(this.age)
    this.profile = widthProfile(phenotype.body, lifeShapeAtAge(this.age))
    this.segLength = bodyLength(phenotype.body, lifeShapeAtAge(this.age)) / (this.count - 1)

    const centre = vec(
      options.bounds.x + options.bounds.width / 2,
      options.bounds.y + options.bounds.height / 2,
    )
    this.spine = new Spine(centre, this.count, this.segLength, this.rng.range(0, Math.PI * 2))
    this.coil = coilPose(centre, this.count, this.segLength, 1)
    this.showcasePose = sCurvePose(this.bounds, this.count, this.segLength)

    this.blinkCountdown = this.rng.range(0.5, 5)
    this.tongueCountdown = this.rng.range(0.5, 6)
    this.target = this.pickTarget()
  }

  get currentAge(): number {
    return this.age
  }

  /**
   * Set the age. Cheap enough to call every frame — a growth animation is `setAge(a + dt * r)`.
   *
   * Recomputes the width profile, the spine spacing, and the motion feel, and resamples the
   * existing curve onto the new spacing so the animal grows rather than jumping.
   */
  setAge(age: number): void {
    const next = clamp01(age)
    if (next === this.age) return
    this.age = next
    const shape = lifeShapeAtAge(next)
    this.motion = motionAtAge(next)
    this.profile = widthProfile(this.phenotype.body, shape)

    const seg = bodyLength(this.phenotype.body, shape) / (this.count - 1)
    if (Math.abs(seg - this.segLength) > 1e-6) {
      const resampled = resamplePath(this.spine.points, this.count, seg)
      for (let i = 0; i < this.count; i++) this.spine.points[i] = resampled[i]
      this.segLength = seg
      const centre = vec(
        this.bounds.x + this.bounds.width / 2,
        this.bounds.y + this.bounds.height / 2,
      )
      this.coil = coilPose(centre, this.count, seg, 1)
      this.showcasePose = sCurvePose(this.bounds, this.count, seg)
    }
  }

  update(dt: number): void {
    this.time += dt

    if (this.pose === 'wander') {
      // A young snake is not just slower — it gives up on where it was going sooner and turns
      // more sharply when it does. That is most of what "less confident" looks like in motion.
      const arrive = 26 * (0.5 + 0.5 * ratioMaturity(this.age))
      if (distance(this.spine.head, this.target) < arrive) this.target = this.pickTarget()
      this.spine.update(this.target, this.baseSpeed * this.motion.speedMul, dt, 1.1 * this.motion.turnMul)
    } else if (this.pose === 'rest') {
      this.spine.easeToPose(this.coil, 1.4, dt)
    } else {
      this.spine.easeToPose(this.showcasePose, 3.2, dt)
    }

    this.tickBlink(dt)
    this.tickTongue(dt)
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const wave = this.waveFor(this.pose)
    const points = visualSpine(this.spine, this.time, wave)
    // Showcase is meant to be *comparable*, so the extra head sway is left off — a wobbling head
    // is charming and it makes two silhouettes impossible to line up by eye.
    if (this.pose !== 'showcase') {
      const sway = (this.pose === 'rest' ? 2.6 : 1.2) * this.motion.swayMul
      applyHeadSway(points, this.time, sway, wave.phase)
    }
    const ribbon = buildRibbon(points, this.profile)

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
    drawLifeFace(ctx, ribbon, this.phenotype, { blink: this.blink, tongue: this.tongue }, this.age)
  }

  get headPosition(): Vec2 {
    return this.spine.head
  }

  private waveFor(pose: LifePose): WaveParams {
    const calm = pose === 'rest' ? 0.2 : pose === 'showcase' ? 0.45 : 1
    return {
      ...this.waveShape,
      amplitude: this.waveShape.amplitude * this.motion.waveMul * calm,
      speed: this.waveShape.speed * this.motion.waveSpeedMul * (pose === 'rest' ? 0.45 : 1),
      // The wave is measured in pixels of body, so a short animal must have a short wavelength
      // or it shows less than one S and reads as a stiff bent stick.
      wavelength: this.waveShape.wavelength * (this.segLength * (this.count - 1)) / 300,
    }
  }

  private pickTarget(): Vec2 {
    const margin = Math.min(this.bounds.width, this.bounds.height) * 0.18
    return vec(
      this.rng.range(this.bounds.x + margin, this.bounds.x + this.bounds.width - margin),
      this.rng.range(this.bounds.y + margin, this.bounds.y + this.bounds.height - margin),
    )
  }

  /** ~160ms blinks, at an interval redrawn each time so it never settles into a rhythm. */
  private tickBlink(dt: number): void {
    this.blinkCountdown -= dt
    if (this.blinkCountdown > 0) {
      this.blink = 0
      return
    }
    const through = 1 + this.blinkCountdown / 0.16
    if (through <= 0) {
      this.blink = 0
      this.blinkCountdown = this.rng.range(3, 7)
      return
    }
    this.blink = Math.sin(through * Math.PI)
  }

  /**
   * Tongue flicks, in pairs. Young animals flick far more often — everything is new and they
   * are tasting all of it, which is both true of real hatchlings and reads as curiosity.
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
      const eager = 0.45 + 0.55 * ratioMaturity(this.age)
      this.tongueCountdown = this.rng.range(2.5 * eager, 8 * eager)
      return
    }
    const envelope = Math.sin(through * Math.PI)
    const doubleFlick = 0.6 + 0.4 * Math.sin(through * Math.PI * 3)
    this.tongue = Math.max(0, envelope * doubleFlick)
  }
}

/**
 * Lay `count` points along an existing path at a new spacing, head first.
 *
 * Walks the old polyline accumulating arc length. If the new chain is longer than the old path
 * (the animal just grew), the remainder continues straight along the old tail's direction — so
 * the new body appears out of the tail tip rather than shoving the head forward.
 */
export function resamplePath(path: readonly Vec2[], count: number, segLength: number): Vec2[] {
  const out: Vec2[] = [{ ...path[0] }]
  let i = 0
  let carried = 0

  for (let k = 1; k < count; k++) {
    let need = segLength
    while (need > 0 && i < path.length - 1) {
      const remaining = distance(path[i], path[i + 1]) - carried
      if (remaining > need) {
        carried += need
        need = 0
      } else {
        need -= remaining
        carried = 0
        i++
      }
    }
    if (need > 0) {
      // Ran off the end of the old path: extend straight back from the last point.
      const last = out[out.length - 1]
      const tail = path[path.length - 1]
      const before = path[Math.max(0, path.length - 2)]
      const back = normalize(sub(tail, before))
      const dir = back.x === 0 && back.y === 0 ? vec(-1, 0) : back
      out.push(add(last, scale(dir, need)))
      continue
    }
    const a = path[i]
    const b = path[Math.min(i + 1, path.length - 1)]
    const span = distance(a, b) || 1
    const t = carried / span
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  }
  return out
}

/**
 * A gentle S laid out to fit the box, head at the left — the showcase pose.
 *
 * Sampled by arc length rather than by `x`, so a hatchling and an adult are posed with the same
 * *curvature* and only differ in length. Sampling by `x` would stretch the adult's S flatter and
 * quietly flatter its proportions.
 */
export function sCurvePose(bounds: Rect, count: number, segLength: number): Vec2[] {
  const total = segLength * (count - 1)
  const amplitude = Math.min(bounds.height * 0.2, total * 0.13)
  const period = total / 1.6
  const out: Vec2[] = []

  // Walk a sine curve, stepping in x by whatever keeps the arc-length step at segLength.
  let x = 0
  for (let i = 0; i < count; i++) {
    out.push(vec(x, Math.sin((x / period) * Math.PI * 2) * amplitude))
    const slope = ((amplitude * Math.PI * 2) / period) * Math.cos((x / period) * Math.PI * 2)
    x += segLength / Math.hypot(1, slope)
  }

  // Centre the result in the box, head to the left.
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of out) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  const dx = bounds.x + (bounds.width - (maxX - minX)) / 2 - minX
  const dy = bounds.y + (bounds.height - (maxY - minY)) / 2 - minY
  return out.map((p) => vec(p.x + dx, p.y + dy))
}

/**
 * A slow sway concentrated at the head — the animal looking around rather than wobbling.
 *
 * Copied in spirit from `snake.ts`; kept here because the amount is age-driven.
 */
function applyHeadSway(points: Vec2[], time: number, amount: number, phase: number): void {
  const reach = Math.min(10, points.length)
  const swing = Math.sin(time * 0.9 + phase) * amount
  for (let i = 0; i < reach; i++) {
    const falloff = 1 - i / reach
    const t =
      i === 0
        ? sub(points[0], points[1])
        : sub(points[i - 1], points[i])
    const len = Math.hypot(t.x, t.y) || 1
    const n = perp({ x: t.x / len, y: t.y / len })
    points[i] = add(points[i], scale(n, swing * falloff * falloff))
  }
}
