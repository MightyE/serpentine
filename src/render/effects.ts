/**
 * Expressive extras: the things that make an invented trait look magical.
 *
 * ## How these differ from stages
 *
 * A **stage** decides what colour the snake's skin is. It runs once, gets baked into a picture,
 * and never runs again. That is why stages are cheap, and it is also why a stage can never
 * shimmer, pulse, or drift — it has no idea what time it is.
 *
 * An **effect** is the other half: it draws over (or behind) the finished body every frame, and
 * it *does* know what time it is. Glow, sparkle, an oil-slick sheen that slides down the body.
 *
 * ## Adding one
 *
 * Write an `EffectDefinition`, add one line to {@link registerBuiltInEffects}, and give a
 * phenotype the matching tag in its `effects` array. Unknown tags are ignored, so a phenotype
 * can carry a tag for an effect that does not exist yet and nothing breaks.
 *
 * ## The cost rule, learned the hard way
 *
 * Anything that boils down to "draw a shape, fill it, move on" is cheap. Anything that means
 * looping over pixels in JavaScript every frame is not — Canvas 2D has no graphics-card shader
 * step to hide that in. `ctx.shadowBlur` is the sneaky one: fine on a few small things, brutal
 * across twenty full-size bodies. The glow below fakes it with a few wide translucent strokes
 * instead, which looks near-identical and costs almost nothing.
 */

import type { EffectTag, Phenotype } from './contract'
import { toHsl } from './colour'
import { hash2 } from './noise'
import { pointOnBody, traceRibbon, type Ribbon } from './ribbon'

/** Everything an effect gets to look at. */
export interface EffectDrawContext {
  readonly ctx: CanvasRenderingContext2D
  readonly ribbon: Ribbon
  readonly phenotype: Phenotype
  /** Seconds since the page loaded. Animate off this, never off a frame counter. */
  readonly time: number
  /** Stable per-snake number, so two snakes with the same effect do not sparkle in unison. */
  readonly seed: number
}

export interface EffectDefinition {
  /** The tag a phenotype puts in its `effects` array to switch this on. */
  readonly tag: EffectTag
  /** One player-facing sentence. */
  readonly describe: string
  /**
   * Scrolls the baked markings along the body, in `u` per second. This is how you get an
   * animated pattern for free: the texture is not regenerated, it is just slid along.
   */
  readonly uDriftPerSecond?: number
  /** Drawn before the body — halos, shadows, anything that should sit underneath. */
  readonly drawBehind?: (c: EffectDrawContext) => void
  /** Drawn after the body, clipped by the effect itself if it wants to be. */
  readonly drawOver?: (c: EffectDrawContext) => void
}

export interface EffectRegistry {
  register(effect: EffectDefinition): void
  get(tag: EffectTag): EffectDefinition | undefined
  list(): readonly EffectDefinition[]
}

export function createEffectRegistry(): EffectRegistry {
  const entries = new Map<string, EffectDefinition>()
  return {
    register(effect) {
      if (entries.has(effect.tag)) throw new Error(`Effect "${effect.tag}" is already registered.`)
      entries.set(effect.tag, effect)
    },
    get: (tag) => entries.get(tag),
    list: () => [...entries.values()],
  }
}

export const effectRegistry: EffectRegistry = createEffectRegistry()

/** Resolve a phenotype's tags to effects, quietly dropping any the renderer does not know. */
export function effectsFor(phenotype: Phenotype): EffectDefinition[] {
  const out: EffectDefinition[] = []
  for (const tag of phenotype.effects) {
    const effect = effectRegistry.get(tag)
    if (effect) out.push(effect)
  }
  return out
}

// ---------------------------------------------------------------------------
// The built-ins
// ---------------------------------------------------------------------------

/**
 * A hue that slides down the body — beetle shells, oil on water, some very real iridescent
 * snakes (a sunbeam snake in the right light genuinely looks like this).
 *
 * One gradient, one fill, in `overlay` blend mode so it tints what is underneath instead of
 * painting over it. The dark parts of the pattern stay dark; only the hue swims.
 */
const iridescent: EffectDefinition = {
  tag: 'iridescent',
  describe: 'An oil-slick sheen that slides along the body.',
  drawOver: ({ ctx, ribbon, time }) => {
    const spine = ribbon.spine
    const head = spine[0]
    const tail = spine[spine.length - 1]
    const gradient = ctx.createLinearGradient(head.x, head.y, tail.x, tail.y)
    const stops = 6
    for (let i = 0; i <= stops; i++) {
      const t = i / stops
      const hue = (t * 300 + time * 45) % 360
      gradient.addColorStop(t, `hsla(${hue.toFixed(1)}, 95%, 62%, 0.75)`)
    }
    ctx.save()
    traceRibbon(ctx, ribbon)
    ctx.clip()
    ctx.globalCompositeOperation = 'overlay'
    ctx.globalAlpha = 0.5
    ctx.fillStyle = gradient
    ctx.fill()
    ctx.restore()
  },
}

/**
 * A soft halo. Faked with three wide, very translucent strokes down the spine instead of
 * `shadowBlur`, which would cost more than the entire rest of the frame.
 */
const glow: EffectDefinition = {
  tag: 'glow',
  describe: 'A soft light around the whole animal.',
  drawBehind: ({ ctx, ribbon, phenotype, time }) => {
    const hsl = toHsl(phenotype.patternColour)
    const widest = Math.max(...ribbon.widths)
    const pulse = 0.8 + 0.2 * Math.sin(time * 1.6)
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    for (let pass = 0; pass < 3; pass++) {
      ctx.beginPath()
      ctx.moveTo(ribbon.spine[0].x, ribbon.spine[0].y)
      for (let i = 1; i < ribbon.spine.length; i++) ctx.lineTo(ribbon.spine[i].x, ribbon.spine[i].y)
      ctx.lineWidth = widest * (2.6 - pass * 0.7)
      ctx.strokeStyle = `hsla(${hsl.h.toFixed(1)}, 90%, 65%, ${(0.05 + pass * 0.035) * pulse})`
      ctx.stroke()
    }
    ctx.restore()
  },
}

/**
 * Scattered specks that catch the light one at a time.
 *
 * Positions come from {@link hash2}, so they are fixed to the animal rather than crawling
 * around, and each speck twinkles on its own clock.
 */
const glitter: EffectDefinition = {
  tag: 'glitter',
  describe: 'Flecks that catch the light as it moves.',
  drawOver: ({ ctx, ribbon, time, seed }) => {
    const count = 34
    ctx.save()
    traceRibbon(ctx, ribbon)
    ctx.clip()
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < count; i++) {
      const u = hash2(seed, i, 1)
      const v = hash2(seed, i, 2) * 2 - 1
      const phase = hash2(seed, i, 3) * Math.PI * 2
      const twinkle = Math.max(0, Math.sin(time * 2.4 + phase))
      if (twinkle < 0.05) continue
      const p = pointOnBody(ribbon, u, v)
      const r = 1.1 + twinkle * 2.2
      ctx.fillStyle = `rgba(255, 253, 240, ${0.15 + twinkle * 0.55})`
      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  },
}

/**
 * Markings that crawl slowly along the body.
 *
 * Costs nothing at all: the baked texture is simply read from a sliding offset. Nothing is
 * recomputed. Useful for anything that should look less like an animal and more like weather.
 */
const drift: EffectDefinition = {
  tag: 'drift',
  describe: 'Markings that slowly travel along the body.',
  uDriftPerSecond: 0.045,
}

let registered = false

/** Put the built-in effects into the shared registry. Idempotent. */
export function registerBuiltInEffects(): void {
  if (registered) return
  registered = true

  // ---- the list. Add your line here. -------------------------------------------------------
  effectRegistry.register(iridescent)
  effectRegistry.register(glow)
  effectRegistry.register(glitter)
  effectRegistry.register(drift)
  // ------------------------------------------------------------------------------------------
}

/** Combined drift from every effect a phenotype carries. */
export function totalDrift(effects: readonly EffectDefinition[]): number {
  let sum = 0
  for (const e of effects) sum += e.uDriftPerSecond ?? 0
  return sum
}

/** Exported so a debug overlay can show what an effect is without a lookup table. */
export function describeEffects(phenotype: Phenotype): string {
  return effectsFor(phenotype)
    .map((e) => e.describe)
    .join(' ')
}
