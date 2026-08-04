/**
 * Small drawing helpers shared by every habitat layer.
 *
 * Nothing here decides what anything looks like — these are the primitives the layers are written
 * in, the same way `render/colour.ts` is the vocabulary the snake stages are written in. If you
 * find yourself writing the same six lines in a third layer file, it belongs here.
 *
 * Everything takes an {@link Rng} or a seed and is a pure function of it. No `Math.random()`: an
 * enclosure's planting is regenerated from its id on every frame and after every reload, so a
 * single unseeded call would make the shrubbery crawl. See `src/lib/rng.ts`.
 */

import type { Rgba } from '../../render/contract'
import { toCss } from '../../render/colour'
import { fbm2D, hash2 } from '../../render/noise'
import type { Rng } from '../../lib/rng'
import type { HabitatRect } from '../contract'

/** A point with a size and its own sub-seed. What every scatter layer iterates over. */
export interface Scattered {
  readonly x: number
  readonly y: number
  /** 0..1 — how big this one is relative to the layer's own scale. */
  readonly size: number
  /** Radians. Meaningless for a circle; load-bearing for a leaf or a blade. */
  readonly angle: number
  /** An integer to seed per-item noise with. */
  readonly seed: number
}

/** Fill a rectangle with a flat colour. */
export function fillRect(ctx: CanvasRenderingContext2D, rect: HabitatRect, colour: Rgba): void {
  ctx.fillStyle = toCss(colour)
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
}

/** Shrink a rectangle by `by` on every edge. Negative grows it. */
export function inset(rect: HabitatRect, by: number): HabitatRect {
  return {
    x: rect.x + by,
    y: rect.y + by,
    width: Math.max(0, rect.width - by * 2),
    height: Math.max(0, rect.height - by * 2),
  }
}

/**
 * `count` points scattered over a rectangle, with a margin so nothing hangs off the edge.
 *
 * Uniform rather than blue-noise on purpose: a rack of enclosures is drawn at postage-stamp size
 * and the clumping uniform sampling produces reads as natural rather than as an artefact.
 */
export function scatter(rng: Rng, rect: HabitatRect, count: number, margin = 0): Scattered[] {
  const out: Scattered[] = []
  const w = Math.max(0, rect.width - margin * 2)
  const h = Math.max(0, rect.height - margin * 2)
  for (let i = 0; i < count; i++) {
    out.push({
      x: rect.x + margin + rng.next() * w,
      y: rect.y + margin + rng.next() * h,
      size: 0.45 + rng.next() * 0.55,
      angle: rng.next() * Math.PI * 2,
      seed: rng.int(0, 0x7fffffff),
    })
  }
  return out
}

/**
 * Trace a closed wobbly blob: a circle whose radius is modulated by noise.
 *
 * This is why a rock reads as a rock and not as a grey dot. `wobble` is the fraction of the
 * radius the outline may wander by; above about 0.4 it stops looking like one object.
 */
export function blobPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  seed: number,
  wobble = 0.22,
  points = 18,
): void {
  ctx.beginPath()
  for (let i = 0; i <= points; i++) {
    const t = (i / points) * Math.PI * 2
    // Sampled around a circle in noise space, so the last point matches the first exactly.
    const n = fbm2D(seed, Math.cos(t) * 1.6 + 4, Math.sin(t) * 1.6 + 4, 2)
    const r = radius * (1 + (n - 0.5) * 2 * wobble)
    const px = x + Math.cos(t) * r
    const py = y + Math.sin(t) * r
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
}

/**
 * Trace a rounded rectangle. `ctx.roundRect` exists in every browser we target but not in the
 * canvas shim a test might hand us, so it is written out.
 */
export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const k = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + k, y)
  ctx.lineTo(x + w - k, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + k)
  ctx.lineTo(x + w, y + h - k)
  ctx.quadraticCurveTo(x + w, y + h, x + w - k, y + h)
  ctx.lineTo(x + k, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - k)
  ctx.lineTo(x, y + k)
  ctx.quadraticCurveTo(x, y, x + k, y)
  ctx.closePath()
}

/**
 * A soft drop shadow under a top-down object.
 *
 * Top-down art has no horizon to sell depth with, so contact shadow is doing all of it: without
 * one, a rock and a stain on the substrate look identical. Offset toward the cool end, because
 * {@link import('../contract').HabitatScene.warmSide} is where the lamp is.
 */
export function contactShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  warmSide: -1 | 1,
  strength = 0.36,
): void {
  const dx = -warmSide * radius * 0.16
  const dy = radius * 0.14
  const gradient = ctx.createRadialGradient(x + dx, y + dy, radius * 0.2, x + dx, y + dy, radius * 1.25)
  gradient.addColorStop(0, `rgba(0, 0, 0, ${strength})`)
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(x + dx, y + dy, radius * 1.25, 0, Math.PI * 2)
  ctx.fill()
}

/** A deterministic 0..1 from a seed and an index. For "should this one be the odd one out?". */
export function roll(seed: number, index: number): number {
  return hash2(seed, index, 0x51ed)
}
