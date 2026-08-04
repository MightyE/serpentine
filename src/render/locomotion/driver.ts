/**
 * The head, and the only thing in the animal that decides anything.
 *
 * ## What a head does per frame
 *
 * 1. Works out the direction it *wants* to go — toward its target, pushed away from walls and
 *    furniture it is about to run into.
 * 2. Turns its **course** toward that direction at a limited rate. An instant turn reads as a
 *    glitch; a limited one reads as an animal changing its mind.
 * 3. Adds a lateral weave to the course and steps forward along the result.
 *
 * ## The weave advances with distance, not with time
 *
 * This is the single most important line in the file:
 *
 * ```
 * this.weave += moved / wavelength * TAU
 * ```
 *
 * `moved`, not `dt`. A head that is not moving does not accumulate weave phase, so it does not
 * move, so nothing behind it moves either — a resting snake is *exactly* still, and it is still
 * because of arithmetic rather than because somebody remembered to switch the animation off.
 *
 * It also means the S-shapes are laid down at a fixed spacing **in the enclosure** rather than at
 * a fixed rate in seconds. Speed up or slow down and the track keeps the same shape, which is
 * what real snakes do and what makes a slow snake read as deliberate rather than as the same
 * animation played back at half speed.
 *
 * ## The weave is a heading offset, not a sideways shove
 *
 * The head is always travelling *forwards along its own nose*. Displacing it sideways would be
 * the sine-wave-on-a-body mistake wearing a different hat. Steering it a few degrees to either
 * side of its course is what an animal with a spine can actually do, and it produces a sinuous
 * track through space for free.
 */

import { angleOf, normalize, vec, type Vec2 } from '../geometry'

const TAU = Math.PI * 2

/** Something the animal would rather not swim through. Circles are enough for furniture. */
export interface Obstacle {
  readonly x: number
  readonly y: number
  /** How far from the centre the animal starts avoiding it. */
  readonly radius: number
}

/** A rectangle the animal must stay inside. */
export interface Bounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** What the behaviour state machine asks the head to do this frame. */
export interface SteerCommand {
  /** Where to go. `null` means "hold this course" — used while spiralling and while resting. */
  readonly target: Vec2 | null
  /** Logical pixels per second. Zero means genuinely stationary. */
  readonly speed: number
  /** Radians per second the course may rotate. Small is purposeful; large ties knots. */
  readonly turnRate: number
  /** Peak lateral weave, in radians off the course. Zero draws a perfectly straight track. */
  readonly weaveAmplitude: number
  /** Pixels of travel per full left-right-left weave cycle. */
  readonly weaveWavelength: number
}

export interface HeadDriverOptions {
  readonly position: Vec2
  readonly heading: number
  readonly bounds: Bounds
  readonly obstacles?: readonly Obstacle[]
  /** Weave phase at birth. Seed it per animal so two snakes are never in step. */
  readonly weavePhase?: number
  /** How close to a wall before the head starts turning away, in pixels. */
  readonly wallMargin?: number
}

export class HeadDriver {
  position: Vec2
  /** The direction the animal is *heading*, before the weave. Radians. */
  course: number
  bounds: Bounds
  obstacles: readonly Obstacle[]

  private weave: number
  private readonly wallMargin: number
  /** Distance covered on the last `step()`. The path recorder and the behaviours both read it. */
  private lastMoved = 0

  constructor(options: HeadDriverOptions) {
    this.position = { ...options.position }
    this.course = options.heading
    this.bounds = options.bounds
    this.obstacles = options.obstacles ?? []
    this.weave = options.weavePhase ?? 0
    this.wallMargin = options.wallMargin ?? 18
  }

  get moved(): number {
    return this.lastMoved
  }

  /** The direction the snout is actually pointing — course plus the current weave. */
  get facing(): number {
    return this.course
  }

  /** Advance one frame. Returns the new head position (the same object it stores). */
  step(command: SteerCommand, dt: number): Vec2 {
    const desired = this.desiredDirection(command.target)
    if (desired) {
      let delta = angleOf(desired) - this.course
      while (delta > Math.PI) delta -= TAU
      while (delta < -Math.PI) delta += TAU
      const most = command.turnRate * dt
      this.course += Math.max(-most, Math.min(most, delta))
    }

    const distance = command.speed * dt
    if (distance <= 0) {
      this.lastMoved = 0
      return this.position
    }

    const swing = Math.sin(this.weave) * command.weaveAmplitude
    const aim = this.course + swing
    this.position = vec(
      this.position.x + Math.cos(aim) * distance,
      this.position.y + Math.sin(aim) * distance,
    )
    this.lastMoved = distance

    // Distance, not time. See the file header.
    if (command.weaveWavelength > 0) {
      this.weave += (distance / command.weaveWavelength) * TAU
      if (this.weave > TAU) this.weave -= TAU
    }

    return this.position
  }

  /**
   * Where the head would like to point: toward the target, bent away from anything close.
   *
   * Avoidance is a *steering* term rather than a hard collision response. A snake that bounces
   * off a rock reads as a physics bug; one that curves around it reads as an animal that saw the
   * rock. Returns `null` when there is nothing to steer toward and nothing to avoid, which leaves
   * the course exactly where it was.
   */
  private desiredDirection(target: Vec2 | null): Vec2 | null {
    let x = 0
    let y = 0

    if (target) {
      const toward = normalize(vec(target.x - this.position.x, target.y - this.position.y))
      x += toward.x
      y += toward.y
    }

    for (const obstacle of this.obstacles) {
      const dx = this.position.x - obstacle.x
      const dy = this.position.y - obstacle.y
      const gap = Math.hypot(dx, dy)
      if (gap >= obstacle.radius || gap === 0) continue
      // Strongest at the centre, nothing at the rim. Squared so it stays gentle until it matters.
      const push = (1 - gap / obstacle.radius) ** 2 * 1.8
      x += (dx / gap) * push
      y += (dy / gap) * push
    }

    const { bounds } = this
    const margin = this.wallMargin
    const left = this.position.x - bounds.x
    const right = bounds.x + bounds.width - this.position.x
    const top = this.position.y - bounds.y
    const bottom = bounds.y + bounds.height - this.position.y
    if (left < margin) x += (1 - Math.max(0, left) / margin) * 2.4
    if (right < margin) x -= (1 - Math.max(0, right) / margin) * 2.4
    if (top < margin) y += (1 - Math.max(0, top) / margin) * 2.4
    if (bottom < margin) y -= (1 - Math.max(0, bottom) / margin) * 2.4

    if (x === 0 && y === 0) return null
    return vec(x, y)
  }
}
