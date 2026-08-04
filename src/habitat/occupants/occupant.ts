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
   * One animal is drawn *completely* — its shadow, its selection mark, its body, its effects, its
   * face — before the next one starts. Nothing here may be split into a per-floor pass: the moment
   * one snake's overlay is drawn after another snake's body, it paints over an animal it does not
   * belong to, and the result looks exactly like a translucent snake.
   *
   * `selected` is drawn *under* the body, not over it. See {@link drawSelectionUnderlay}.
   *
   * ## The order of the three under-layers is measured, not arbitrary
   *
   * Everything below the body has to happen in the order `glow → shadow → selection mark`, and
   * each arrow is there because the other order was measured and failed:
   *
   * - **Glow before the shadow.** `effects.ts`'s halo draws with `globalCompositeOperation =
   *   'lighter'`. Drawn *after* the contact shadow it brightens the exact ring the shadow just
   *   darkened and erases it outright — measured at zero pixels darker than the substrate for a
   *   glowing animal on a dark biome, i.e. the shadow was doing nothing at all.
   * - **Shadow before the selection mark.** The mark is bright ink; a shadow pass over it mutes
   *   the one thing that has to stay legible.
   *
   * All three still land before `paintBody`, so the body covers their inward halves exactly.
   */
  draw(ctx: CanvasRenderingContext2D, selected = false): void {
    const ribbon = buildRibbon(this.move.points, this.profile)

    const effectCtx: EffectDrawContext = {
      ctx,
      ribbon,
      phenotype: this.phenotype,
      time: this.time,
      seed: this.seedNumber,
    }
    for (const effect of this.effects) effect.drawBehind?.(effectCtx)
    drawContactShadow(ctx, ribbon, this.widest)
    if (selected) drawSelectionUnderlay(ctx, ribbon)

    paintBody(ctx, ribbon, this.phenotype, this.texture, this.drift * this.time)
    for (const effect of this.effects) effect.drawOver?.(effectCtx)
    drawLifeFace(ctx, ribbon, this.phenotype, { blink: this.blink, tongue: this.tongue }, this.age)
    drawUpturnedSnout(ctx, ribbon, this.phenotype)
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

/**
 * `[down, across, reach, alpha]` per pass, offsets and reach as fractions of body width.
 *
 * The alphas are the tuned part, and they are a compromise rather than a maximum. A shadow can
 * only darken, and darkening helps only while the surround stays clear of the animal's own rim:
 * push it further and the surround comes down *through* a dark animal's rim luminance and the
 * silhouette dissolves a second time, on the mid-tone biome instead of the dark one. Because the
 * drop a wash produces scales with the surround's own brightness, the pale biomes constrain this
 * from above and the dark ones from below.
 *
 * These two numbers are the pair that maximises the *worst* edge contrast across substrates, swept
 * in `edge-contrast-probe.html`. The surface is genuinely opposed — at the extremes, no shadow at
 * all scores 0.320 on cypress and 0.077 on cypress-dark, and a heavy one scores 0.039 and 0.334 —
 * so this is a saddle, not a knob that wants turning up. Worst case here measures 0.205.
 *
 * Exported mutable so a probe page can sweep the alphas and re-measure without editing this file;
 * nothing in the game writes to it.
 */
export const CONTACT_SHADOW_PASSES: [number, number, number, number][] = [
  [0.34, 0.22, 0.1, 0.06],
  [0.22, 0.15, 0, 0.3],
]

/**
 * A dark shape under the body: offset, so the animal reads as resting *on* the substrate.
 *
 * ## Why one wash is not enough, measured
 *
 * This used to be a single `rgba(4, 2, 8, 0.3)` fill at one offset, which works on sand and does
 * nothing on the biome that needs it most. The arithmetic is unforgiving: the darkest real
 * substrate is cypress margin's `rgba(38, 34, 28)` at luminance 34, and 30% of the way from there
 * toward near-black is luminance 25 — a drop of nine. Against that, a dark-based animal's own rim
 * (`drawRoundness` shades it 22% toward `rgba(20, 14, 24)`) measured at luminance 59 beside a
 * surround at 54: a Weber contrast of **0.083**, under the ~0.10 where a boundary stops being one.
 * The animal did not look translucent because anything was translucent — the body is a provably
 * opaque fill — it looked translucent because its edge and the ground it sat on were the same
 * brightness, so there was no silhouette to see.
 *
 * So the shadow is what supplies the missing edge, and it needs two passes to do it:
 *
 * - a **skirt**, grown outward past the silhouette and faint, which is the only part visible on a
 *   pale substrate and the part that separates the body from a dark one;
 * - a **core**, tight and much darker, offset further, which is the actual contact.
 *
 * Growing a pass outward uses the same stroke-and-fill trick as {@link drawSelectionUnderlay}:
 * stroking the traced outline at `2 × reach` and filling it under the nonzero rule widens the
 * silhouette by `reach` without a second path and without `shadowBlur`, which would be
 * re-rasterised for every animal on every frame.
 *
 * Offsets and reach are fractions of the body's own width, so a hatchling gets a hatchling's
 * shadow. The alphas are not: they are contrast, and contrast does not scale with size — see
 * {@link CONTACT_SHADOW_PASSES}.
 */
function drawContactShadow(
  ctx: CanvasRenderingContext2D,
  ribbon: ReturnType<typeof buildRibbon>,
  widest: number,
): void {
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  for (const [down, across, reach, alpha] of CONTACT_SHADOW_PASSES) {
    const colour = `rgba(4, 2, 8, ${alpha})`
    ctx.save()
    ctx.translate(widest * across, widest * down)
    traceRibbon(ctx, ribbon)
    ctx.fillStyle = colour
    if (reach > 0) {
      ctx.strokeStyle = colour
      ctx.lineWidth = widest * reach * 2
      ctx.stroke()
    }
    ctx.fill()
    ctx.restore()
  }
  ctx.restore()
}

/**
 * The selection mark: the body's own silhouette, worn outward, and painted *underneath*.
 *
 * The renderer has already computed where the edge of this animal is — `traceRibbon` lays down
 * exactly the outline `paintBody` fills — so the border is that same path, not an approximation
 * of it. Two bands: a bright ink hugging the body and a dark keyline outside it, the way a
 * cel-shaded sticker carries a black edge. The ink is what keeps the mark legible on a pale sand
 * biome, the keyline is what keeps it legible on wet moss. Between them there is no biome this
 * fails on, and no `shadowBlur` re-rasterised on every frame of every selected animal.
 *
 * ## Why under the body, and why fill as well as stroke
 *
 * A coiled snake's outline is one *self-intersecting* path, and the parts of it that run over the
 * animal's own back are interior lines, not silhouette. Any attempt to keep the mark outward-only
 * by clipping fails on exactly those parts: under `evenodd` a doubly-covered coil counts as
 * outside the body, so the keyline is let through and draws straight across the animal — which is
 * what a selected coiled adult used to look like.
 *
 * Painting the mark first and the body over it needs no clip at all. Stroke at **double** width
 * and fill the same path with the default nonzero rule: the fill is the union of every coil, so
 * self-overlaps merge instead of cancelling, and every inward half and every interior crossing
 * line lands inside that union. `paintBody` then covers the union exactly — it fills the same path
 * with the same rule — leaving only the outward half on screen. Full girth, pattern untouched.
 *
 * Both widths are constants in CSS pixels, not multiples of the body. The canvas transform is
 * `setTransform(dpr, …)` and nothing else (`floor.ts`), so a constant here is a constant on the
 * screen: the same crisp mark around a hatchling and around its mother, at `dpr` 1 and 2 alike.
 */
/** How far the mark reaches outward from the edge, in CSS pixels: the bright band, then the dark. */
const SELECT_INK_WIDTH = 1.1
const SELECT_KEYLINE_WIDTH = 2.1

function drawSelectionUnderlay(
  ctx: CanvasRenderingContext2D,
  ribbon: ReturnType<typeof buildRibbon>,
): void {
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.globalAlpha = 1

  for (const [token, fallback, reach] of [
    ['--select-keyline', 'rgba(6, 4, 10, 0.78)', SELECT_KEYLINE_WIDTH],
    ['--select-ink', '#2fd2ff', SELECT_INK_WIDTH],
  ] as const) {
    const colour = themeColour(token, fallback)
    traceRibbon(ctx, ribbon)
    ctx.lineWidth = reach * 2
    ctx.strokeStyle = colour
    ctx.stroke()
    // The fill is not decoration: without it the stroke's inner edge and the body's outer edge
    // are two independently antialiased boundaries, and a hairline of biome shows between them.
    ctx.fillStyle = colour
    ctx.fill()
  }
  ctx.restore()
}

/**
 * A theme colour, read off the stylesheet rather than written here.
 *
 * `theme.css` owns every colour in this app and a canvas cannot use a custom property directly,
 * so each one is resolved once and cached. Outside a browser — a test, a screenshot harness — it
 * falls back to the token's own literal value.
 */
const cachedColours = new Map<string, string>()
function themeColour(token: string, fallback: string): string {
  const cached = cachedColours.get(token)
  if (cached) return cached
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  // An unresolved `var(…)` means the stylesheet has not landed yet; don't cache a broken colour.
  const resolved = value && !value.startsWith('var(') ? value : fallback
  cachedColours.set(token, resolved)
  return resolved
}

function distanceToSegment(x: number, y: number, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lenSq))
  return Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t))
}
