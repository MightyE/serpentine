/**
 * Colour arithmetic.
 *
 * Every stage in the render pipeline takes a colour in and hands a colour out, so this file is
 * the vocabulary the whole pipeline is written in. Nothing here knows about snakes.
 *
 * `Rgba` (from the contract) is deliberately the same units Canvas speaks: r/g/b are 0–255,
 * a is 0–1. HSL shows up here because *pigment* questions are hue/lightness questions —
 * "remove the dark pigment", "wash the contrast out" are one line in HSL and a mess in RGB.
 */

import type { Rgba } from './contract'

/** Clamp to the 0–1 range. Used constantly; worth a name. */
export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

/** Clamp to an arbitrary range. */
export function clamp(x: number, min: number, max: number): number {
  return x < min ? min : x > max ? max : x
}

/** Straight-line blend. `t = 0` gives `a`, `t = 1` gives `b`. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Hermite fade between two edges — 0 below `edge0`, 1 above `edge1`, an S-curve between.
 *
 * This is the single most useful function in procedural graphics: it is how you get a soft
 * boundary instead of a jagged one. Every pattern in `stages/` uses it to soften its edges.
 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

/** Build a colour. `a` defaults to fully opaque, which is what you want ~always. */
export function rgba(r: number, g: number, b: number, a = 1): Rgba {
  return { r, g, b, a }
}

/** Something Canvas will accept for `fillStyle` / `strokeStyle`. */
export function toCss(c: Rgba): string {
  return `rgba(${Math.round(clamp(c.r, 0, 255))}, ${Math.round(clamp(c.g, 0, 255))}, ${Math.round(
    clamp(c.b, 0, 255),
  )}, ${clamp01(c.a)})`
}

/** Blend two colours. `t = 0` is all `a`, `t = 1` is all `b`. */
export function mix(a: Rgba, b: Rgba, t: number): Rgba {
  const k = clamp01(t)
  return {
    r: lerp(a.r, b.r, k),
    g: lerp(a.g, b.g, k),
    b: lerp(a.b, b.b, k),
    a: lerp(a.a, b.a, k),
  }
}

/**
 * Perceived brightness, 0–1.
 *
 * The weights are not equal because your eye is not: green looks much brighter than blue at
 * the same numeric value. Using a plain average here makes "lighten this" look wrong on
 * greens and blues.
 */
export function luminance(c: Rgba): number {
  return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255
}

export interface Hsla {
  /** Degrees, 0–360. */
  h: number
  /** 0–1. */
  s: number
  /** 0–1. */
  l: number
  /** 0–1. */
  a: number
}

/** RGB → HSL. */
export function toHsl(c: Rgba): Hsla {
  const r = c.r / 255
  const g = c.g / 255
  const b = c.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l, a: c.a }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
  else if (max === g) h = ((b - r) / d + 2) * 60
  else h = ((r - g) / d + 4) * 60
  return { h, s, l, a: c.a }
}

/** HSL → RGB. */
export function fromHsl(hsl: Hsla): Rgba {
  const h = ((hsl.h % 360) + 360) % 360
  const s = clamp01(hsl.s)
  const l = clamp01(hsl.l)
  if (s === 0) {
    const v = l * 255
    return { r: v, g: v, b: v, a: hsl.a }
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const channel = (tRaw: number): number => {
    let t = tRaw
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const hk = h / 360
  return {
    r: channel(hk + 1 / 3) * 255,
    g: channel(hk) * 255,
    b: channel(hk - 1 / 3) * 255,
    a: hsl.a,
  }
}

/** Rotate the hue by `degrees`, keeping saturation and lightness. The iridescence trick. */
export function shiftHue(c: Rgba, degrees: number): Rgba {
  const hsl = toHsl(c)
  hsl.h += degrees
  return fromHsl(hsl)
}

/** Move a colour toward (positive) or away from (negative) white. */
export function lighten(c: Rgba, amount: number): Rgba {
  const hsl = toHsl(c)
  hsl.l = clamp01(hsl.l + amount)
  return fromHsl(hsl)
}

/** Multiply saturation. `0` gives grey, `1` changes nothing, `>1` intensifies. */
export function saturate(c: Rgba, factor: number): Rgba {
  const hsl = toHsl(c)
  hsl.s = clamp01(hsl.s * factor)
  return fromHsl(hsl)
}
