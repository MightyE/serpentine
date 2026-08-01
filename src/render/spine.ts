/**
 * The snake's skeleton, in two layers.
 *
 * ## Why two
 *
 * **The logical spine** is a chain of points where the head moves and every other point is
 * dragged along behind it at a fixed distance — "follow the leader". It is about fifteen lines,
 * you can print the positions and understand exactly what happened, and it is the thing the
 * rest of the game would use for position, collisions, or "is this snake in the hide box".
 *
 * On its own it does not slither. It just trails.
 *
 * **The visual spine** is the logical spine with a wave added sideways, computed fresh at draw
 * time and thrown away. Nothing else in the game ever sees it.
 *
 * Splitting them is what keeps the animation honest. If the wave were baked into the logical
 * spine, every wiggle would move the snake's real position, and the head would end up being
 * dragged around by its own tail. Here the head leads, and the wiggle is makeup.
 *
 * ## The rule that makes it look alive
 *
 * The wave amplitude is near zero at the head and grows down the body. Real snakes move their
 * heads least — that is what lets them aim at anything. Give the head as much sideways swing as
 * the mid-body and the animal instantly reads as a noodle being shaken, not as a creature
 * deciding where to go.
 */

import { add, angleOf, distance, lerpVec, normalize, perp, scale, sub, vec, type Vec2 } from './geometry'

/** How the slither wave is shaped. All of these are safe to fiddle with. */
export interface WaveParams {
  /** Peak sideways offset in logical pixels, at the widest part of the wave. */
  amplitude: number
  /** Distance along the body for one full S. Smaller = tighter, busier wiggle. */
  wavelength: number
  /** Waves per second travelling down the body. Negative sends them the other way. */
  speed: number
  /**
   * Fraction of the body over which the wave ramps up from the head. 0.25 means the head and
   * neck are calm and the wave is at full strength by a quarter of the way down.
   */
  headDamp: number
  /** Phase offset, so two snakes on screen are never in lockstep. Seed this per snake. */
  phase: number
}

export const DEFAULT_WAVE: WaveParams = {
  amplitude: 9,
  wavelength: 150,
  speed: 0.85,
  headDamp: 0.28,
  phase: 0,
}

/**
 * A chain of points, head first.
 *
 * `points[0]` is the snout. Each following point is pulled to sit exactly `segLength` behind
 * the one in front of it, which is the entire simulation.
 */
export class Spine {
  readonly points: Vec2[]
  readonly segLength: number
  /** Direction the head is facing, in radians. Driven by the head's own motion, never by the tail. */
  heading: number

  constructor(head: Vec2, count: number, segLength: number, heading = 0) {
    this.segLength = segLength
    this.heading = heading
    this.points = []
    const back = vec(-Math.cos(heading), -Math.sin(heading))
    for (let i = 0; i < count; i++) {
      this.points.push(add(head, scale(back, i * segLength)))
    }
  }

  get head(): Vec2 {
    return this.points[0]
  }

  /**
   * Swim toward `target`.
   *
   * The head turns at a limited rate rather than snapping to face the target — an instant turn
   * looks like a glitch, a limited one looks like an animal changing its mind.
   *
   * @param turnRate radians per second the head is allowed to rotate. Turning radius is
   *   roughly `speed / turnRate`, so this number is small on purpose — let it get large and the
   *   snake pivots on the spot and ties itself in knots instead of swimming in long curves.
   */
  update(target: Vec2, speed: number, dt: number, turnRate = 1.1): void {
    const toTarget = sub(target, this.points[0])
    const want = angleOf(toTarget)
    let delta = want - this.heading
    // Wrap into (-pi, pi] so turning "left past 180°" doesn't take the long way round.
    while (delta > Math.PI) delta -= Math.PI * 2
    while (delta < -Math.PI) delta += Math.PI * 2
    const maxTurn = turnRate * dt
    this.heading += Math.max(-maxTurn, Math.min(maxTurn, delta))

    const step = speed * dt
    this.points[0] = add(this.points[0], vec(Math.cos(this.heading) * step, Math.sin(this.heading) * step))
    this.constrain()
  }

  /**
   * Blend the whole chain toward a fixed pose — used to settle into a resting coil.
   *
   * `rate` is roughly "fraction of the remaining distance closed per second", so it eases in
   * and never overshoots regardless of frame rate.
   */
  easeToPose(pose: readonly Vec2[], rate: number, dt: number): void {
    const t = 1 - Math.exp(-rate * dt)
    const n = Math.min(pose.length, this.points.length)
    for (let i = 0; i < n; i++) {
      this.points[i] = lerpVec(this.points[i], pose[i], t)
    }
    this.constrain()
    this.heading = angleOf(sub(this.points[0], this.points[1]))
  }

  /** Pull every point back to exactly `segLength` behind its predecessor. */
  private constrain(): void {
    for (let i = 1; i < this.points.length; i++) {
      const back = sub(this.points[i], this.points[i - 1])
      const d = Math.hypot(back.x, back.y)
      if (d === 0) {
        // Degenerate: two points landed on top of each other. Push one straight back.
        this.points[i] = add(this.points[i - 1], vec(-this.segLength, 0))
        continue
      }
      this.points[i] = add(this.points[i - 1], scale(back, this.segLength / d))
    }
  }
}

/** Distance from the head to each point, and the total. */
export function arcLengths(points: readonly Vec2[]): { arc: number[]; total: number } {
  const arc: number[] = [0]
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += distance(points[i], points[i - 1])
    arc.push(total)
  }
  return { arc, total }
}

/**
 * The logical spine plus a wave travelling down it — what actually gets drawn.
 *
 * Pure: give it the same spine and the same `time` and you get the same points back. It never
 * touches the spine it was handed.
 *
 * @param time seconds since the app started.
 */
export function visualSpine(spine: Spine, time: number, wave: WaveParams): Vec2[] {
  const pts = spine.points
  const { arc, total } = arcLengths(pts)
  if (total === 0) return pts.map((p) => ({ ...p }))

  const out: Vec2[] = []
  for (let i = 0; i < pts.length; i++) {
    const s = arc[i]
    const u = s / total
    // Ramp up from the head, then fade slightly toward the tail tip so it doesn't flick.
    const envelope = smoothRamp(u, wave.headDamp) * (1 - 0.2 * u * u)
    const lateral =
      wave.amplitude * envelope * Math.sin((s / wave.wavelength) * Math.PI * 2 - time * wave.speed * Math.PI * 2 + wave.phase)
    const tangent = tangentAt(pts, i)
    out.push(add(pts[i], scale(perp(tangent), lateral)))
  }
  return out
}

/** 0 at u = 0, easing to 1 by u = width. */
function smoothRamp(u: number, width: number): number {
  if (width <= 0) return 1
  const t = Math.min(1, u / width)
  return t * t * (3 - 2 * t)
}

/**
 * Which way the body is pointing at point `i`.
 *
 * Uses the neighbours on both sides where it can — a one-sided difference makes the direction
 * jump around at the joints, which shows up as the outline shimmering.
 */
export function tangentAt(points: readonly Vec2[], i: number): Vec2 {
  if (points.length < 2) return vec(1, 0)
  if (i === 0) return normalize(sub(points[0], points[1]))
  if (i === points.length - 1) return normalize(sub(points[i - 1], points[i]))
  return normalize(sub(points[i - 1], points[i + 1]))
}

/**
 * Points along an Archimedean spiral, spaced roughly `segLength` apart — a resting coil.
 *
 * Snakes at rest coil. It is the pose that reads as calm and content rather than "sitting in a
 * straight line waiting for something to happen", and it also happens to be what a healthy,
 * unstressed animal actually does in a hide box.
 *
 * The head ends up at the *centre* of the coil, tucked in the middle, which is both correct and
 * the cutest available arrangement.
 */
export function coilPose(center: Vec2, count: number, segLength: number, tightness = 1): Vec2[] {
  const out: Vec2[] = []
  const growth = (segLength * 0.62) / tightness // radius gained per radian
  let theta = 1.6
  let radius = growth * theta
  for (let i = 0; i < count; i++) {
    out.push(vec(center.x + Math.cos(theta) * radius, center.y + Math.sin(theta) * radius))
    // Step far enough around the spiral to advance one segment length along the curve.
    const dTheta = segLength / Math.max(radius, segLength * 0.5)
    theta += dTheta
    radius = growth * theta
  }
  return out
}
