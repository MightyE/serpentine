/**
 * Two-dimensional vector helpers, and the curve used for the body's width profile.
 *
 * Kept as plain `{ x, y }` objects rather than a class: they are created by the thousand every
 * frame, they get logged and diffed constantly while debugging, and `{x: 12, y: 40}` in the
 * console is far easier to read than `Vec2 {}`.
 */

export interface Vec2 {
  x: number
  y: number
}

export function vec(x: number, y: number): Vec2 {
  return { x, y }
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y }
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y }
}

export function scale(a: Vec2, k: number): Vec2 {
  return { x: a.x * k, y: a.y * k }
}

export function length(a: Vec2): number {
  return Math.hypot(a.x, a.y)
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Unit-length version. A zero vector stays zero rather than becoming `NaN`. */
export function normalize(a: Vec2): Vec2 {
  const len = Math.hypot(a.x, a.y)
  return len === 0 ? { x: 0, y: 0 } : { x: a.x / len, y: a.y / len }
}

/**
 * Rotated a quarter turn. If `t` points along the body, `perp(t)` points across it — which is
 * how the ribbon finds its two edges, and how the slither wave knows which way "sideways" is.
 */
export function perp(a: Vec2): Vec2 {
  return { x: -a.y, y: a.x }
}

export function lerpVec(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

export function angleOf(a: Vec2): number {
  return Math.atan2(a.y, a.x)
}

/** A point on a curve given as a list of `(u, value)` control points. */
export interface ControlPoint {
  readonly u: number
  readonly value: number
}

/**
 * Smoothly read a value off a list of control points.
 *
 * Straight lines between the points would show as visible kinks in the snake's outline, so
 * each span is eased with the same S-curve the noise uses. Deliberately *not* Catmull-Rom:
 * a spline overshoots between control points, and an overshoot here means a negative body
 * width, which draws as a self-intersecting mess. This can never overshoot.
 *
 * Control points must be sorted by `u`.
 */
export function sampleProfile(points: readonly ControlPoint[], u: number): number {
  if (points.length === 0) return 0
  const first = points[0]
  if (u <= first.u) return first.value
  const last = points[points.length - 1]
  if (u >= last.u) return last.value
  for (let i = 1; i < points.length; i++) {
    const b = points[i]
    if (u <= b.u) {
      const a = points[i - 1]
      const span = b.u - a.u
      const t = span === 0 ? 0 : (u - a.u) / span
      const eased = t * t * (3 - 2 * t)
      return a.value + (b.value - a.value) * eased
    }
  }
  return last.value
}
