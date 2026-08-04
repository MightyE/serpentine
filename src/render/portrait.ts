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
import { add, scale, vec, type Vec2 } from './geometry'
import { drawFace } from './head'
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
  drawFace(ctx, ribbon, phenotype, { blink: 0, tongue: 0 })

  cache.set(key, canvas)
  return canvas
}

/** Forget every cached portrait — after editing a stage, say. */
export function clearPortraitCache(): void {
  cache.clear()
}

/**
 * How much of the art window the animal is allowed to fill, leaving the rest as breathing room.
 * Slightly generous rather than tight, because a glow or an outer-edge effect draws a little
 * past the body outline that {@link outlineBounds} measures.
 */
const FILL = 0.9

/** Amplitude of the S as a fraction of its horizontal span. This is the pose's whole character. */
const WAVE_DEPTH = 0.16

/** Total phase swept by the sine — a little over one period, which reads as a relaxed S. */
const WAVE_PHASE = Math.PI * 2.1

/**
 * A gentle S of the animal's own length, head at the left.
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
 * The arc length of the returned spine is the body length, so the snake is neither stretched nor
 * compressed along itself — the sine's horizontal span is solved backwards from that.
 */
function poseSCurve(length: number, count: number): Vec2[] {
  const span = length / sineArcFactor(WAVE_DEPTH)
  const amplitude = span * WAVE_DEPTH
  const points: Vec2[] = []
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1)
    points.push(vec(t * span, Math.sin(t * WAVE_PHASE) * amplitude))
  }
  return points
}

/**
 * Arc length of `y = depth * span * sin(phase * t)` over `x = span * t`, as a multiple of `span`.
 *
 * Wanted so {@link poseSCurve} can pick the span that makes the curve exactly as long as the
 * animal. There is no closed form (it is an elliptic integral), and it is a handful of samples
 * once per cached portrait, so it is integrated numerically.
 */
function sineArcFactor(depth: number, steps = 512): number {
  let total = 0
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps
    const slope = depth * WAVE_PHASE * Math.cos(t * WAVE_PHASE)
    total += Math.hypot(1, slope)
  }
  return total / steps
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
  const ribbon = buildRibbon(poseSCurve(bodyLength(phenotype.body), 46), widthProfile(phenotype.body))
  const b = outlineBounds(ribbon)
  const zoom = Math.min((width * FILL) / b.width, (height * FILL) / b.height)
  return {
    ribbon,
    zoom,
    x: width / 2 - (b.x + b.width / 2) * zoom,
    y: height / 2 - (b.y + b.height / 2) * zoom,
  }
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
