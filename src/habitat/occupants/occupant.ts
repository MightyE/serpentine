/**
 * One animal, alive inside an enclosure.
 *
 * This is where the two halves of the renderer meet: `src/render/locomotion/` decides where the
 * body *is*, and `src/render/`'s existing ribbon, paint and face code decides what it *looks
 * like*. Nothing about the drawing changed to make this work — an occupant is drawn by exactly
 * the pipeline the life lab uses, handed a different set of spine points.
 *
 * ## Scale, and why it is not the phenotype's own length
 *
 * A full-grown ball python is 300 logical pixels nose to tail in `bodyShape.ts`'s units, and an
 * alcove on the store floor is about two hundred pixels across. Drawn at its own size the animal
 * would be a boa constrictor in a shoebox.
 *
 * So there is one scale factor per enclosure, computed from the *adult* length, and every animal
 * in that enclosure is drawn through it — including the widths, so nothing is stretched. Applying
 * it to the adult length rather than to each animal's own is the detail that matters: a hatchling
 * and its parent in the same box come out at the right sizes **relative to each other**, which is
 * the whole point of the life-stage work. Scale each animal to fit and they would all be the same
 * length and the growth system would be invisible.
 */

// Importing the render barrel is what registers every pattern stage. Without it a phenotype's
// base stage looks unregistered and building its texture throws — the same reason
// `HabitatCanvas` imports the habitat barrel before drawing an enclosure.
import '../../render'
import type { Phenotype } from '../../render/contract'
import { ADULT_SHAPE, bodyLength, widthProfile } from '../../render/bodyShape'
import { effectsFor, totalDrift, type EffectDefinition, type EffectDrawContext } from '../../render/effects'
import type { ControlPoint, Vec2 } from '../../render/geometry'
import { buildRibbon, traceRibbon } from '../../render/ribbon'
import { patternTextureFor, type PatternTexture } from '../../render/texture'
import { drawLifeFace } from '../../render/life/face'
import { paintBody } from '../../render/life/paint'
import { lifeShapeAtAge, motionAtAge } from '../../render/life/stage'
import { drawUpturnedSnout } from '../../render/snout'
import { Locomotor } from '../../render/locomotion'
import type { Bounds, Obstacle } from '../../render/locomotion'
import { hashSeed, makeRng, type Rng } from '../../lib/rng'
import { clamp01 } from '../../render/colour'

/** How long a full-grown animal is drawn, as a multiple of the enclosure's short side. */
const ADULT_LENGTH_OF_SHORT_SIDE = 1.45
/** Travel speed as a fraction of the animal's own length per second. Unhurried on purpose. */
const SPEED_OF_LENGTH = 0.17
/** Points along the body. Fewer than the life lab's 46 — these are drawn small and nine at a time. */
const POINT_COUNT = 40

export interface OccupantSpec {
  /** The snake's individual id. Seeds every decision it makes, so behaviour is reproducible. */
  readonly id: string
  readonly phenotype: Phenotype
  /** 0 newly hatched, 1 full grown. */
  readonly age: number
  readonly name: string
}

export interface OccupantOptions {
  /** The area inside the enclosure the animal may use, in canvas pixels. */
  readonly area: Bounds
  readonly obstacles: readonly Obstacle[]
  /** Pixels per unit of `bodyShape.ts` length. Shared by every animal in one enclosure. */
  readonly scale: number
  /** Where this animal's starting coil sits. Spread them, or a shared enclosure begins as a pile. */
  readonly home?: Vec2
  /** Freeze it — `prefers-reduced-motion`. It is drawn resting in its coil and stays there. */
  readonly still?: boolean
}

export class HabitatOccupant {
  readonly id: string
  readonly name: string
  readonly phenotype: Phenotype

  private readonly rng: Rng
  private readonly seedNumber: number
  private readonly texture: PatternTexture
  private readonly effects: readonly EffectDefinition[]
  private readonly drift: number
  private readonly scale: number
  private profile: ControlPoint[]
  private widest: number
  private age: number
  private readonly move: Locomotor

  private time = 0
  private blink = 0
  private blinkCountdown: number
  private tongue = 0
  private tongueCountdown: number

  constructor(spec: OccupantSpec, options: OccupantOptions) {
    this.id = spec.id
    this.name = spec.name
    this.phenotype = spec.phenotype
    this.age = clamp01(spec.age)
    this.rng = makeRng(spec.id).fork('occupant')
    this.seedNumber = hashSeed(spec.phenotype.seed)
    this.texture = patternTextureFor(spec.phenotype)
    this.effects = effectsFor(spec.phenotype)
    this.drift = totalDrift(this.effects)

    this.scale = options.scale
    const shape = lifeShapeAtAge(this.age)
    const drawnLength = bodyLength(spec.phenotype.body, shape) * options.scale
    this.profile = widthProfile(spec.phenotype.body, shape).map((point) => ({
      u: point.u,
      value: point.value * options.scale,
    }))
    this.widest = this.profile.reduce((most, point) => Math.max(most, point.value), 0)

    const motion = motionAtAge(this.age)
    this.move = new Locomotor({
      seed: spec.id,
      bounds: options.area,
      obstacles: options.obstacles,
      pointCount: POINT_COUNT,
      segLength: drawnLength / (POINT_COUNT - 1),
      maxSegLength: (bodyLength(spec.phenotype.body, ADULT_SHAPE) * options.scale) / (POINT_COUNT - 1),
      bodyWidth: this.widest,
      cruiseSpeed: drawnLength * SPEED_OF_LENGTH * motion.speedMul,
      home: options.home,
      still: options.still,
    })

    this.blinkCountdown = this.rng.range(0.5, 6)
    this.tongueCountdown = this.rng.range(0.5, 7)
  }

  /** Where the head is, in canvas pixels. The selection hotspot is parked here. */
  get headPosition(): Vec2 {
    return this.move.points[0]
  }

  /** Roughly how big a target the animal is, for hit testing and for the hotspot's size. */
  get girth(): number {
    return this.widest
  }

  update(dt: number): void {
    this.time += dt
    this.move.update(dt)
    this.tickBlink(dt)
    this.tickTongue(dt)
  }

  reframe(area: Bounds, obstacles: readonly Obstacle[]): void {
    this.move.reframe(area, obstacles)
  }

  /**
   * The animal is a week older.
   *
   * Cheap enough to call whenever the game's clock moves. The body keeps the exact curve it was
   * lying in and simply has more of itself — see `Locomotor.setSegLength` for why growth is free
   * here and is not free in `life/view.ts`.
   */
  setAge(age: number): void {
    const next = clamp01(age)
    if (Math.abs(next - this.age) < 1e-4) return
    this.age = next
    const shape = lifeShapeAtAge(next)
    const drawnLength = bodyLength(this.phenotype.body, shape) * this.scale
    this.profile = widthProfile(this.phenotype.body, shape).map((point) => ({
      u: point.u,
      value: point.value * this.scale,
    }))
    this.widest = this.profile.reduce((most, point) => Math.max(most, point.value), 0)
    this.move.setSegLength(
      drawnLength / (POINT_COUNT - 1),
      this.widest,
      drawnLength * SPEED_OF_LENGTH * motionAtAge(next).speedMul,
    )
  }

  /**
   * Draw the animal.
   *
   * `selected` draws a cel-shaded border *on* the body, last, after every stage that could paint
   * over it. Not a glow behind: a soft halo bleeds into the planting, changes weight with the
   * animal's size, and disappears entirely against a pale sand biome. A flat keyline of constant
   * width is the same mark on wet moss and on sand, at hatchling scale and at adult scale — which
   * is what "this one is selected" has to mean on a floor of nine enclosures.
   */
  draw(ctx: CanvasRenderingContext2D, selected = false): void {
    const ribbon = buildRibbon(this.move.points, this.profile)

    drawContactShadow(ctx, ribbon, this.widest)

    const effectCtx: EffectDrawContext = {
      ctx,
      ribbon,
      phenotype: this.phenotype,
      time: this.time,
      seed: this.seedNumber,
    }
    for (const effect of this.effects) effect.drawBehind?.(effectCtx)
    paintBody(ctx, ribbon, this.phenotype, this.texture, this.drift * this.time)
    for (const effect of this.effects) effect.drawOver?.(effectCtx)
    drawLifeFace(ctx, ribbon, this.phenotype, { blink: this.blink, tongue: this.tongue }, this.age)
    drawUpturnedSnout(ctx, ribbon, this.phenotype)
    if (selected) drawSelectionOutline(ctx, ribbon)
  }

  /** Is this point on the animal? Generous by a few pixels — these are small targets. */
  hits(x: number, y: number): boolean {
    const points = this.move.points
    const reach = this.widest * 0.6 + 5
    for (let i = 1; i < points.length; i++) {
      if (distanceToSegment(x, y, points[i - 1], points[i]) <= reach) return true
    }
    return false
  }

  /** ~160ms blinks at an interval redrawn each time, so it never settles into a rhythm. */
  private tickBlink(dt: number): void {
    this.blinkCountdown -= dt
    if (this.blinkCountdown > 0) {
      this.blink = 0
      return
    }
    const through = 1 + this.blinkCountdown / 0.16
    if (through <= 0) {
      this.blink = 0
      this.blinkCountdown = this.rng.range(3, 8)
      return
    }
    this.blink = Math.sin(through * Math.PI)
  }

  /**
   * Tongue flicks, in pairs, and far more often while the animal is alert.
   *
   * The tongue is the whole of what makes `alert` read as *alert* rather than as a snake that
   * happens to have its head at an angle. It is doing more work here than the head movement is.
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
      const eager = 1 - 0.65 * this.move.alertness
      this.tongueCountdown = this.rng.range(3 * eager, 11 * eager)
      return
    }
    this.tongue = Math.max(0, Math.sin(through * Math.PI) * (0.6 + 0.4 * Math.sin(through * Math.PI * 3)))
  }
}

/**
 * Work out the one scale factor an enclosure draws its animals through.
 *
 * Measured against the *whole* enclosure rather than the smaller rectangle the animal walks
 * around in: an animal is sized against the box a player sees, and the walkable inset exists only
 * to keep destinations out from under the tile's caption.
 *
 * Exported because the pickup view wants the same arithmetic in reverse — a held snake is the
 * same animal at a different magnification, and the two numbers should be derivable from each
 * other rather than tuned apart.
 */
export function occupantScale(enclosure: Bounds, phenotype: Phenotype): number {
  const short = Math.min(enclosure.width, enclosure.height)
  return (short * ADULT_LENGTH_OF_SHORT_SIDE) / bodyLength(phenotype.body, ADULT_SHAPE)
}

/** A soft dark shape under the body. Two pixels of offset is the whole of "it is on the ground". */
function drawContactShadow(
  ctx: CanvasRenderingContext2D,
  ribbon: ReturnType<typeof buildRibbon>,
  widest: number,
): void {
  ctx.save()
  ctx.translate(widest * 0.16, widest * 0.24)
  ctx.fillStyle = 'rgba(4, 2, 8, 0.3)'
  traceRibbon(ctx, ribbon)
  ctx.fill()
  ctx.restore()
}

/**
 * The selection glow: the body's own line, stroked twice, wide and soft then narrow and bright.
 *
 * Two strokes rather than a `shadowBlur`, because canvas shadows are re-rasterised on every fill
 * and this one would be paid on every frame of every selected animal.
 */
function drawHalo(ctx: CanvasRenderingContext2D, spine: readonly Vec2[], widest: number): void {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(spine[0].x, spine[0].y)
  for (let i = 1; i < spine.length; i++) ctx.lineTo(spine[i].x, spine[i].y)

  ctx.globalAlpha = 0.28
  ctx.lineWidth = widest * 2.1
  ctx.strokeStyle = selectionColour()
  ctx.stroke()

  ctx.globalAlpha = 0.65
  ctx.lineWidth = widest * 1.35
  ctx.stroke()
  ctx.restore()
}

/**
 * The highlight colour, read off the stylesheet rather than written here.
 *
 * `theme.css` owns every colour in this app and a canvas cannot use a custom property directly,
 * so it is resolved once and cached. Outside a browser — a test, a screenshot harness — it falls
 * back to the token's own literal value.
 */
let cachedSelection: string | null = null
function selectionColour(): string {
  if (cachedSelection) return cachedSelection
  // The literal behind `--accent` → `--jewel-amethyst` in `theme.css`, for headless contexts only.
  const fallback = '#b14dff'
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  cachedSelection = value || fallback
  return cachedSelection
}

function distanceToSegment(x: number, y: number, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lenSq))
  return Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t))
}
