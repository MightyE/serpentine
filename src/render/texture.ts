/**
 * Baking a phenotype's markings into a picture.
 *
 * ## Why bake at all
 *
 * Running the stage pipeline is cheap for one point and ruinous for a million. A snake on
 * screen at 60fps covers roughly 8,000 pixels; twenty snakes is 160,000 pattern evaluations
 * *per frame*, each one running several noise functions. Canvas 2D has no graphics-card shader
 * step to hide that in — it would be a plain JavaScript loop, and it would not keep up.
 *
 * But the markings never change. A snake bends; its blotches do not rearrange themselves. So we
 * evaluate the pipeline once into a flat rectangle — the snake unrolled and ironed flat, `u`
 * across, `v` down — and from then on drawing is just moving that picture around.
 *
 * ## The cache
 *
 * Keyed by the phenotype's own content, so two snakes with identical looks share one texture,
 * and changing a phenotype automatically produces a new one. Nothing has to remember to
 * invalidate anything.
 */

import type { Phenotype, PatternSampler, StageRegistry } from './contract'
import { clamp } from './colour'
import { compilePipeline } from './pipeline'
import { stageRegistry } from './registry'

/**
 * Texture size. Resolution along the body matters more than across it, because bands and
 * saddles are the fine detail and they run *across* the animal — so they are packed along `u`.
 * These are cheap to raise if a pattern ever looks blocky; 256×64 is ~16k pipeline calls,
 * a few milliseconds, once per look.
 */
export const TEXTURE_WIDTH = 256
export const TEXTURE_HEIGHT = 64

export interface PatternTexture {
  readonly canvas: HTMLCanvasElement
  readonly width: number
  readonly height: number
}

/**
 * Evaluate a sampler across the whole `(u, v)` rectangle.
 *
 * `v` is −1 at the top edge of the image and +1 at the bottom, with the dorsal midline running
 * through the middle row — so the image genuinely looks like a flattened snake, which makes it
 * worth dumping to a page and staring at when a pattern comes out wrong.
 */
export function bakePatternTexture(
  sampler: PatternSampler,
  width = TEXTURE_WIDTH,
  height = TEXTURE_HEIGHT,
): PatternTexture {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get a 2D context for the pattern texture')

  const image = ctx.createImageData(width, height)
  const data = image.data
  for (let y = 0; y < height; y++) {
    const v = ((y + 0.5) / height) * 2 - 1
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width
      const colour = sampler.sample(u, v)
      const i = (y * width + x) * 4
      data[i] = clamp(colour.r, 0, 255)
      data[i + 1] = clamp(colour.g, 0, 255)
      data[i + 2] = clamp(colour.b, 0, 255)
      data[i + 3] = clamp(colour.a * 255, 0, 255)
    }
  }
  ctx.putImageData(image, 0, 0)
  return { canvas, width, height }
}

/** Everything about a phenotype that changes what its markings look like. */
export function phenotypeKey(phenotype: Phenotype): string {
  return JSON.stringify([
    phenotype.seed,
    phenotype.baseColour,
    phenotype.patternColour,
    phenotype.bellyColour,
    phenotype.stages,
  ])
}

const cache = new Map<string, PatternTexture>()

/**
 * The baked markings for a phenotype, made on first use and kept.
 *
 * If you are experimenting and want to force a rebake, call {@link clearTextureCache}.
 */
export function patternTextureFor(phenotype: Phenotype, registry: StageRegistry = stageRegistry): PatternTexture {
  const key = phenotypeKey(phenotype)
  const existing = cache.get(key)
  if (existing) return existing
  const baked = bakePatternTexture(compilePipeline(phenotype, registry))
  cache.set(key, baked)
  return baked
}

/** Throw away every baked texture. Useful after editing a stage while the page is open. */
export function clearTextureCache(): void {
  cache.clear()
}
