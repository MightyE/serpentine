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
import { vec, type Vec2 } from './geometry'
import { drawFace } from './head'
import { buildRibbon, traceRibbon, paintRibbon } from './ribbon'
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

  const profile = widthProfile(phenotype.body)
  const points = poseSCurve(width, height, bodyLength(phenotype.body), 46)
  const ribbon = buildRibbon(points, profile)
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
 * A gentle S laid out to fill the given box, head at the left.
 *
 * Nothing clever: sample a sine wave, squeeze it to fit, and stop when the body runs out. The
 * amplitude is what stops it looking like a stick; the fit-to-box scaling is what stops a long
 * snake from running off the edge of a thumbnail.
 */
function poseSCurve(width: number, height: number, length: number, count: number): Vec2[] {
  const margin = width * 0.1
  const span = Math.min(width - margin * 2, length * 0.78)
  const amplitude = Math.min(height * 0.24, span * 0.16)
  const points: Vec2[] = []
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1)
    points.push(vec(margin + t * span, height / 2 + Math.sin(t * Math.PI * 2.1) * amplitude))
  }
  return points
}
