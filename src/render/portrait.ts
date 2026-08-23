/**
 * Still portraits, drawn once and kept.
 *
 * ## What this is for
 *
 * A collection screen might show sixty snakes at once. Animating sixty spines, sixty ribbons,
 * and sixty faces every frame to fill a scrolling list of thumbnails is a great deal of work
 * for something nobody is looking at closely.
 *
 * So: two tiers.
 *
 * - **Live** — the terrarium, the detail view, anything the player is actually watching. Full
 *   {@link SnakeView}, animated, budget about twenty at a time.
 * - **Portrait** — everything else. Rendered once into an offscreen canvas, then every list row
 *   is a single `drawImage`. Costs nothing per frame, because there is no per-frame work at all.
 *
 * The cache key is the phenotype's own content, so a snake whose appearance changes gets a new
 * portrait automatically and nothing has to remember to invalidate anything.
 *
 * ## If this ever needs to get faster
 *
 * The next step would be rendering portraits in a Worker via `OffscreenCanvas`. It is
 * deliberately *not* done here: it moves the drawing code somewhere you cannot step through it
 * in the browser's debugger, and at this scale there is nothing to gain. Revisit only if a
 * profile says portraits are the problem.
 */

import type { Phenotype } from './contract'
import { bodyLength, widthProfile } from './bodyShape'
import { toCss } from './colour'
import { effectsFor, type EffectDrawContext } from './effects'
import { add, scale, sub, vec, type Vec2 } from './geometry'
import { drawFace, tongueOutline } from './head'
import { buildRibbon, traceRibbon, paintRibbon, type Ribbon } from './ribbon'
import { patternTextureFor } from './texture'
import { phenotypeKey } from './texture'

const cache = new Map<string, HTMLCanvasElement>()

export interface PortraitOptions {
  readonly width?: number
  readonly height?: number
  /** Bigger than 1 renders at higher resolution for a crisp thumbnail on dense screens. */
  readonly pixelRatio?: number
}

/**
 * A still image of a snake in a relaxed S-curve.
 *
 * The pose is fixed, which is the point: the same phenotype always produces exactly the same
 * portrait, so a list does not shimmer as you scroll it.
 */
export function renderPortrait(phenotype: Phenotype, options: PortraitOptions = {}): HTMLCanvasElement {
  const width = options.width ?? 220
  const height = options.height ?? 140
  const ratio = options.pixelRatio ?? (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
  const key = `${phenotypeKey(phenotype)}|${width}x${height}@${ratio}`
  const cached = cache.get(key)
  if (cached) return cached

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * ratio)
  canvas.height = Math.round(height * ratio)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get a 2D context for a portrait')
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)

  // The pose is in the renderer's own logical units, so it has to be brought into the box. One
  // uniform scale, applied to the context — see {@link portraitLayout} for why it must not be two.
  const { ribbon, zoom, x, y } = portraitLayout(phenotype, width, height)
  ctx.translate(x, y)
  ctx.scale(zoom, zoom)

  const texture = patternTextureFor(phenotype)
  const effects = effectsFor(phenotype)
  const effectCtx: EffectDrawContext = { ctx, ribbon, phenotype, time: 0, seed: 0 }

  for (const effect of effects) effect.drawBehind?.(effectCtx)

  ctx.save()
  traceRibbon(ctx, ribbon)
  ctx.fillStyle = toCss(phenotype.baseColour)
  ctx.fill()
  ctx.restore()

  paintRibbon(ctx, ribbon, texture.canvas, texture.width, texture.height, 0)
  for (const effect of effects) effect.drawOver?.(effectCtx)
  drawFace(ctx, ribbon, phenotype, { blink: 0, tongue: PORTRAIT_TONGUE })

  cache.set(key, canvas)
  return canvas
}

/** Forget every cached portrait — after editing a stage, say. */
export function clearPortraitCache(): void {
  cache.clear()
}

/**
 * How far the tongue is out in a still portrait.
 *
 * Part way, not all the way. The tongue is the one unmistakably *snake* thing on a face that has
 * otherwise been deliberately rounded off (see `head.ts`), and a silhouette without it reads a
 * little like an eel. But `drawTongue`'s spread grows with the square of the extension, so a
 * fully extended tongue is a wide bright Y that out-shouts the head it belongs to. At 0.6 the
 * whole flick is about nine tenths of a head-width — the proportion it has on a real animal —
 * and the fork is open enough to read as forked rather than as a stick.
 */
const PORTRAIT_TONGUE = 0.6

/**
 * How much of the art window the animal is allowed to fill, leaving the rest as breathing room.
 * Slightly generous rather than tight, because a glow or an outer-edge effect draws a little
 * past the body outline that {@link outlineBounds} measures.
 */
const FILL = 0.9

/**
 * Peak heading deviation, in radians — how far off straight the body ever points.
 *
 * This is the pose's whole character. 1.15 rad is 66°, so the runs between loops lean steeply
 * without ever doubling back on themselves.
 */
const BEND = 1.5

/** Total phase swept nose to tail. 3.6π is 1.8 full S-bends. */
const WAVE_PHASE = Math.PI * 3.6

/**
 * Fraction of the body, measured from the snout, over which the bend ramps up to full strength.
 *
 * The head has to leave the last loop and run out *straight*, or the silhouette's most
 * recognisable feature — a head pointing somewhere — is swallowed by the curve it sits on. Same
 * reasoning as `spine.ts`'s `headDamp`, and the same underlying fact: real snakes move their
 * heads least.
 */
const HEAD_CALM = 0.17

/** Where the tail starts easing out of the wave, and how much of the bend survives at the tip. */
const TAIL_EASE_FROM = 0.72
const TAIL_EASE_TO = 0.62

/**
 * Spine points in a portrait pose.
 *
 * Deliberately denser than the 46 this used when the pose was a lazy ripple. `buildRibbon` tiles
 * the body with one rhomboid per segment (see `ribbon.ts`), and the residual texture shear at a
 * joint grows with the turn taken *per segment* — so nearly doubling the bend count without
 * shortening the segments would hand that shear straight back. Portraits are cached, so the
 * extra cost is paid once per animal and never per frame.
 */
const POSE_POINTS = 96

/**
 * The animal at rest, in its own length, head at the left.
 *
 * ## Why the heading waves, and not the body
 *
 * The obvious way to draw a wavy snake is to plot `y = A·sin(x)`. It is also wrong, and visibly
 * so once the waves get deep enough to read as a snake rather than a ripple: steepening a sine
 * **sharpens its peaks**, so the animal comes out as a zigzag with corners at the top of every
 * bend. A snake lying on a flat surface does the opposite — round loops joined by straight,
 * steeply-leaning runs.
 *
 * So this is a **serpenoid** (Hirose's curve, and the shape real snakes hold): the body's
 * *heading* is what varies sinusoidally with distance along the body,
 *
 *     θ(s) = BEND · envelope(s) · cos(WAVE_PHASE · s)
 *
 * and the outline is that heading integrated. Curvature is `dθ/ds`, so it is **zero** where θ is
 * at its extremes — the steep connectors are straight — and **greatest** where θ passes through
 * zero, which is the top and bottom of each loop. Exactly inverted from the sine graph, and
 * exactly what the eye is looking for.
 *
 * ## Logical units, not destination pixels
 *
 * This is the part that has to stay true. `widthProfile` measures girth in the renderer's
 * **logical** units — an adult is 300 logical pixels nose to tail — and nothing downstream
 * rescales it. So if the spine were laid out in the destination box's pixels instead, the
 * along-body axis would be squeezed to fit the box while the across-body axis stayed at full
 * logical size, and the animal would come out fat and short. It did: a 217x197 art window drew a
 * 300-unit snake over a 217-unit arc with its girth untouched, a 1.38x stretch, and the same
 * animal came out a *different* fatness in a binder thumbnail than in an opened card.
 *
 * Posing in logical units and letting {@link portraitLayout} apply one uniform scale is the same
 * arrangement `SnakeCanvas` and `reveal.ts` already use for the live renderer, and for the same
 * reason: scaling the context rather than the animal keeps every proportion honest.
 *
 * Integrating along arc length gives that for free — every step is exactly `length / (count - 1)`
 * long, so the returned polyline measures the body length by construction, at any bend depth,
 * with no arc-length formula to re-derive when the curve changes.
 */
function poseSCurve(length: number, count: number): Vec2[] {
  const ds = length / (count - 1)
  const points: Vec2[] = [vec(0, 0)]
  let x = 0
  let y = 0
  for (let i = 1; i < count; i++) {
    // Sampled at the midpoint of the step, so the polyline straddles the true curve rather than
    // cutting every corner off it.
    const s = (i - 0.5) / (count - 1)
    const theta = BEND * poseEnvelope(s) * Math.cos(s * WAVE_PHASE)
    x += Math.cos(theta) * ds
    y += Math.sin(theta) * ds
    points.push(vec(x, y))
  }
  return levelled(points)
}

/**
 * How much of the bend is allowed at `s`: nothing at the snout, full through the body, eased off
 * again toward the tail so the tip trails away instead of flicking.
 */
function poseEnvelope(s: number): number {
  const head = smoothstep(s / HEAD_CALM)
  const tail = 1 - (1 - TAIL_EASE_TO) * smoothstep((s - TAIL_EASE_FROM) / (1 - TAIL_EASE_FROM))
  return head * tail
}

/** Hermite ease, clamped at both ends. */
function smoothstep(x: number): number {
  const t = Math.max(0, Math.min(1, x))
  return t * t * (3 - 2 * t)
}

/**
 * Rotate the posed body so nose and tail tip sit on the same horizontal.
 *
 * An integrated heading does not have to come back to where it started — a non-whole number of
 * bends leaves the animal walking off at an angle, which costs it size in a wide art window for
 * no reason, since {@link portraitLayout} fits the bounding box. Levelling is one rotation and
 * changes no proportion.
 */
function levelled(points: readonly Vec2[]): Vec2[] {
  const span = sub(points[points.length - 1], points[0])
  const angle = -Math.atan2(span.y, span.x)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return points.map((p) => vec(p.x * cos - p.y * sin, p.x * sin + p.y * cos))
}

/** Where a posed animal goes in its box. Separated from the drawing so it can be checked. */
export interface PortraitLayout {
  /** The body, posed in logical units. */
  readonly ribbon: Ribbon
  /** Logical units per destination pixel. **One** number, applied to both axes. */
  readonly zoom: number
  /** Destination-pixel offset that centres the posed body in the box. */
  readonly x: number
  readonly y: number
}

/**
 * Pose the animal and place it in the box: **one** scale factor, both axes, centred.
 *
 * Two factors — one per axis — is what "fill the window" would want, and doing it accidentally is
 * exactly the bug this replaces. A snake drawn 1.4x wider than it is tall does not read as a snake
 * in a small window; it reads as a snake squashed into one. So `zoom` is deliberately a single
 * number, and the leftover space on the other axis is left as space.
 */
export function portraitLayout(phenotype: Phenotype, width: number, height: number): PortraitLayout {
  const ribbon = buildRibbon(poseSCurve(bodyLength(phenotype.body), POSE_POINTS), widthProfile(phenotype.body))
  const b = paintedBounds(ribbon)
  const zoom = Math.min((width * FILL) / b.width, (height * FILL) / b.height)
  return {
    ribbon,
    zoom,
    x: width / 2 - (b.x + b.width / 2) * zoom,
    y: height / 2 - (b.y + b.height / 2) * zoom,
  }
}

/**
 * Everything {@link renderPortrait} puts on the canvas, in logical units — the body **and** the
 * tongue.
 *
 * Fitting to {@link outlineBounds} alone is not enough, and was the bug the moment portraits
 * started flicking a tongue: the tongue reaches about 1.3 head-widths past the snout, which is
 * further than the {@link FILL} margin, so the fork was drawn off the edge of the canvas and the
 * animal appeared to be biting the frame. The body outline is still the right thing for
 * *proportion* questions — see {@link outlineBounds} — but the thing you fit a window to is the
 * thing you draw.
 *
 * The eyes are deliberately left out. They bulge about 2.5% of a head-width past the outline by
 * design (see `head.ts`), which the {@link FILL} margin already covers several times over, and
 * folding them in here would tie the art window's size to a per-animal `sizeScale`.
 */
export function paintedBounds(ribbon: Ribbon): { x: number; y: number; width: number; height: number } {
  const body = outlineBounds(ribbon)
  let minX = body.x
  let minY = body.y
  let maxX = body.x + body.width
  let maxY = body.y + body.height
  for (const p of tongueOutline(ribbon, PORTRAIT_TONGUE)) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { x: minX, y: minY, width: Math.max(1e-6, maxX - minX), height: Math.max(1e-6, maxY - minY) }
}

/**
 * The bounding box of what {@link traceRibbon} will actually draw, in logical units.
 *
 * Both rails, plus the control point of the curve that rounds off the snout — a quadratic stays
 * inside the hull of its control points, so including it bounds the nose without having to
 * evaluate the curve.
 */
export function outlineBounds(ribbon: Ribbon): { x: number; y: number; width: number; height: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const track = (p: Vec2): void => {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  for (const p of ribbon.left) track(p)
  for (const p of ribbon.right) track(p)
  track(add(ribbon.spine[0], scale(ribbon.tangents[0], ribbon.widths[0] * 0.75)))
  return { x: minX, y: minY, width: Math.max(1e-6, maxX - minX), height: Math.max(1e-6, maxY - minY) }
}
