/**
 * What the animal is doing, and for how long.
 *
 * ## Resting is the default and almost everything else is a brief exception
 *
 * A room of nine enclosures where every animal is touring its floor is exhausting to look at, and
 * it is also wrong: a healthy snake in a good enclosure spends the overwhelming majority of its
 * day not moving. So the weights here are deliberately lopsided. Rest is long (a fifth of a minute
 * to half a minute), everything else is short, and two of the four non-resting states are
 * themselves stationary.
 *
 * The test of this file is not "does the snake do interesting things" — it is "can you look at
 * the floor for a minute without wanting to look away".
 *
 * ## The five states
 *
 * | state | moving | what it is |
 * |---|---|---|
 * | `rest` | no | the default. Nothing happens. |
 * | `alert` | no | head up, looking around, tongue going. The animal noticed you. |
 * | `travel` | yes | somewhere else in the enclosure looked better. Unhurried. |
 * | `coil` | yes | spiral inward in place until wound up. |
 * | `settle` | slowing | the beat between arriving and resting. |
 *
 * ## Coiling is steering, not a pose
 *
 * The obvious way to coil a snake is to interpolate its body toward a precomputed spiral. That
 * is what `spine.ts`'s `coilPose` is for, and it is fine for a still image — but a body being
 * dragged into a shape it did not travel through is exactly the mistake this whole directory
 * exists to avoid, and it looks like it.
 *
 * So `coil` steers the *head* along an inward spiral and lets the body arrive behind it, one
 * segment at a time, the way it does for everything else. Because the body follows the head's
 * actual path, and because the spiral's turn spacing is set to the animal's own width, the coil
 * comes out neatly stacked without a single line of collision code. This is the nicest thing in
 * the file and it fell out of the model rather than being built.
 *
 * ## Nothing here calls `Math.random()`
 *
 * Every draw goes through a generator seeded from the animal's id, so the same snake makes the
 * same decisions in the same order every time the page is loaded. Phases are seeded too, which is
 * what stops nine animals from breathing in unison.
 */

import { angleOf, vec, type Vec2 } from '../geometry'
import { makeRng, type Rng } from '../../lib/rng'
import type { Bounds, Obstacle, SteerCommand } from './driver'

const TAU = Math.PI * 2

export type BehaviourName = 'rest' | 'alert' | 'travel' | 'coil' | 'settle'

/** How long each state lasts, in seconds. `coil` ends when it is wound, not on a clock. */
const DURATION: Readonly<Record<BehaviourName, readonly [number, number]>> = {
  rest: [11, 30],
  alert: [2.6, 5.4],
  travel: [5, 13],
  coil: [4, 11],
  settle: [1.2, 2.6],
}

/**
 * Where each state goes next, as weights.
 *
 * Read down the `rest` row: more than half the time a resting animal only lifts its head, and
 * `alert` sends it back to rest half the time again. That double discount is what keeps the
 * floor calm without making any single animal look broken.
 */
const NEXT: Readonly<Record<BehaviourName, readonly (readonly [BehaviourName, number])[]>> = {
  rest: [
    ['alert', 0.56],
    ['travel', 0.29],
    ['coil', 0.15],
  ],
  alert: [
    ['rest', 0.5],
    ['travel', 0.42],
    ['coil', 0.08],
  ],
  travel: [
    ['settle', 0.5],
    ['alert', 0.3],
    ['coil', 0.2],
  ],
  coil: [['settle', 1]],
  settle: [['rest', 1]],
}

/** The state an animal is most likely to be found in when the screen first appears. */
const INITIAL: readonly (readonly [BehaviourName, number])[] = [
  ['rest', 0.74],
  ['alert', 0.14],
  ['travel', 0.12],
]

export interface BehaviourWorld {
  readonly bounds: Bounds
  readonly obstacles: readonly Obstacle[]
  /** Nose to tail, in logical pixels. Sets the weave's wavelength and the coil's radius. */
  readonly bodyLength: number
  /** Widest part of the body. The coil's turn spacing, so the loops stack rather than overlap. */
  readonly bodyWidth: number
  /** Comfortable travelling speed in logical pixels per second. */
  readonly cruiseSpeed: number
}

/** What the head is doing right now, as the behaviour needs to see it. */
export interface HeadReading {
  readonly position: Vec2
  readonly course: number
  /** Distance covered on the previous frame. Drives the spiral rather than the clock does. */
  readonly moved: number
}

export class Behaviour {
  private readonly rng: Rng
  private world: BehaviourWorld
  private readonly phase: number

  private state: BehaviourName = 'rest'
  private remaining = 0
  private elapsed = 0

  /** Smoothed travel speed, so nothing starts or stops with a jerk. */
  private speed = 0
  private target: Vec2 | null = null

  // Spiral state, only meaningful during `coil`.
  private spiralCentre: Vec2 = vec(0, 0)
  private spiralAngle = 0
  private spiralRadius = 0
  private spiralTurn: 1 | -1 = 1

  constructor(seed: string, world: BehaviourWorld, start?: BehaviourName) {
    this.rng = makeRng(seed).fork('behaviour')
    this.world = world
    this.phase = this.rng.range(0, TAU)

    this.state = start ?? this.rng.pick(weightedNames(INITIAL, this.rng.next()))
    this.remaining = this.durationOf(this.state)
    // Start partway through, so nine animals loaded at the same instant are not all one second
    // into a rest and do not all come out of it together.
    this.elapsed = this.rng.range(0, this.remaining)
    this.remaining -= this.elapsed
  }

  /**
   * The animal grew, so the numbers derived from its size have to move with it.
   *
   * A hatchling reaching adulthood nearly triples in length, and the weave's wavelength and the
   * coil's radius are both fractions of that. Left fixed, a grown animal would weave at its
   * hatchling's frequency — visibly busier than its neighbours for no reason anyone could name.
   */
  resize(world: BehaviourWorld): void {
    this.world = world
  }

  get name(): BehaviourName {
    return this.state
  }

  /** True while the animal is stationary by design, which is most of the time. */
  get resting(): boolean {
    return this.state === 'rest' || this.state === 'alert'
  }

  /**
   * How far the head is turned aside to look around, in radians.
   *
   * Only `alert` produces one, and it is applied to the head and neck as a pose overlay rather
   * than fed into the path — a snake looking around does not walk anywhere, so nothing behind its
   * neck may move. See `Locomotor.points`.
   */
  get lookAngle(): number {
    if (this.state !== 'alert') return 0
    const ramp = Math.min(1, this.elapsed / 0.8) * Math.min(1, Math.max(0, this.remaining) / 0.8)
    const t = this.elapsed
    const swing = Math.sin(t * 0.72 + this.phase) * 0.62 + Math.sin(t * 0.29 + this.phase * 2) * 0.22
    return swing * ramp
  }

  /** 0 while resting, 1 while alert. The occupant flicks the tongue more when this is up. */
  get alertness(): number {
    return this.state === 'alert' ? Math.min(1, this.elapsed / 0.6) : 0
  }

  /** Advance the clock, run transitions, and say what the head should do this frame. */
  update(dt: number, head: HeadReading): SteerCommand {
    this.elapsed += dt
    this.remaining -= dt

    // The starting state is drawn before there is a head to read, so its setup happens on the
    // first frame instead of in the constructor.
    if (this.state === 'travel' && !this.target) this.target = this.pickDestination(head.position)
    if (this.state === 'coil' && this.spiralRadius <= 0) this.beginSpiral(head)

    if (this.state === 'coil') this.advanceSpiral(head)
    if (this.state === 'travel' && this.target) {
      const reach = this.world.bodyLength * 0.12 + 6
      if (Math.hypot(head.position.x - this.target.x, head.position.y - this.target.y) < reach) {
        this.remaining = Math.min(this.remaining, 0)
      }
    }
    if (this.remaining <= 0) this.transition(head)

    const wanted = this.targetSpeed()
    // Exponential approach: frame-rate independent, and it never overshoots into a reverse.
    this.speed += (wanted - this.speed) * (1 - Math.exp(-2.4 * dt))
    if (this.speed < 0.05) this.speed = wanted === 0 ? 0 : this.speed

    return {
      target: this.state === 'coil' ? this.spiralTarget() : this.target,
      speed: this.speed,
      turnRate: this.state === 'coil' ? 2.6 : 0.95,
      weaveAmplitude: this.weaveAmplitude(),
      weaveWavelength: this.world.bodyLength * (this.state === 'coil' ? 0.9 : 0.52),
    }
  }

  // -------------------------------------------------------------------------

  private targetSpeed(): number {
    switch (this.state) {
      case 'travel':
        return this.world.cruiseSpeed
      case 'coil':
        return this.world.cruiseSpeed * 0.8
      default:
        return 0
    }
  }

  /**
   * How hard the head weaves.
   *
   * Zero while stationary, because a weave is a thing a moving animal does — but note that even
   * a non-zero amplitude produces no movement at zero speed, since the weave only ever tilts the
   * direction of a step that is being taken. This is belt and braces, and it is cheap.
   */
  private weaveAmplitude(): number {
    switch (this.state) {
      case 'travel':
        return 0.42
      case 'coil':
        return 0.07
      default:
        return 0
    }
  }

  private durationOf(state: BehaviourName): number {
    const [low, high] = DURATION[state]
    return this.rng.range(low, high)
  }

  private transition(head: HeadReading): void {
    const next = this.rng.pick(weightedNames(NEXT[this.state], this.rng.next()))
    this.state = next
    this.elapsed = 0
    this.remaining = this.durationOf(next)
    this.target = null

    if (next === 'travel') this.target = this.pickDestination(head.position)
    if (next === 'coil') this.beginSpiral(head)
  }

  /**
   * Somewhere in the enclosure worth going, clear of the furniture.
   *
   * Ten tries and then it takes what it has. A crowded enclosure should make an animal shuffle
   * about a bit awkwardly, which is honest; it should never make it stand still forever because
   * the destination picker could not satisfy itself.
   */
  private pickDestination(from: Vec2): Vec2 {
    const { bounds, obstacles, bodyLength } = this.world
    const margin = Math.min(bounds.width, bounds.height) * 0.16 + 4
    let fallback = vec(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)

    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = vec(
        this.rng.range(bounds.x + margin, bounds.x + bounds.width - margin),
        this.rng.range(bounds.y + margin, bounds.y + bounds.height - margin),
      )
      if (attempt === 0) fallback = candidate
      const blocked = obstacles.some(
        (o) => Math.hypot(candidate.x - o.x, candidate.y - o.y) < o.radius * 0.85,
      )
      // A destination the animal is already standing on is not a journey.
      const near = Math.hypot(candidate.x - from.x, candidate.y - from.y) < bodyLength * 0.28
      if (!blocked && !near) return candidate
    }
    return fallback
  }

  /**
   * Set up the inward spiral.
   *
   * The centre is put off to one side of the head so the animal curls *from where it is* rather
   * than teleporting its intent to the middle of the room, and it is nudged back inside the walls
   * so a snake resting in a corner does not try to coil through the glass.
   */
  private beginSpiral(head: HeadReading): void {
    const { bounds, bodyLength, bodyWidth } = this.world
    const short = Math.min(bounds.width, bounds.height)
    // Radius chosen so the body makes roughly two and a bit turns before it runs out — a coil
    // with one turn reads as a doughnut, and one with five reads as a cinnamon bun.
    const radius = Math.max(
      bodyWidth * 1.7,
      Math.min(bodyLength / (TAU * 2.2), short * 0.3),
    )

    this.spiralTurn = this.rng.chance(0.5) ? 1 : -1
    const side = head.course + (Math.PI / 2) * this.spiralTurn
    const centre = vec(
      head.position.x + Math.cos(side) * radius,
      head.position.y + Math.sin(side) * radius,
    )
    const inset = radius + bodyWidth
    this.spiralCentre = vec(
      Math.min(Math.max(centre.x, bounds.x + inset), bounds.x + bounds.width - inset),
      Math.min(Math.max(centre.y, bounds.y + inset), bounds.y + bounds.height - inset),
    )
    this.spiralRadius = radius
    this.spiralAngle = angleOf(vec(head.position.x - this.spiralCentre.x, head.position.y - this.spiralCentre.y))
  }

  /**
   * Wind the spiral in by however far the head actually travelled.
   *
   * Driven by `head.moved` rather than by `dt` for the same reason the weave is: a coil that
   * tightened on a clock would keep tightening while the animal was blocked, and the head would
   * end up chasing a target it had been left behind by.
   */
  private advanceSpiral(head: HeadReading): void {
    if (this.spiralRadius <= 0 || head.moved <= 0) return
    this.spiralAngle += this.spiralTurn * (head.moved / Math.max(this.spiralRadius, 1))
    // One body width lost per full turn, so successive loops sit against each other.
    const spacing = this.world.bodyWidth * 1.02
    this.spiralRadius -= (head.moved * spacing) / (TAU * Math.max(this.spiralRadius, 1))
    if (this.spiralRadius < this.world.bodyWidth * 0.75) this.remaining = Math.min(this.remaining, 0)
  }

  /** The point on the spiral the head is currently chasing, a little way ahead of itself. */
  private spiralTarget(): Vec2 {
    const lead = this.spiralAngle + this.spiralTurn * 0.55
    return vec(
      this.spiralCentre.x + Math.cos(lead) * this.spiralRadius,
      this.spiralCentre.y + Math.sin(lead) * this.spiralRadius,
    )
  }
}

/**
 * Turn a weight table into the single name a roll of `u` selects.
 *
 * Returned as a one-element array so the caller can hand it to `rng.pick`, which keeps every
 * random draw in this file going through the same seeded generator rather than some of them
 * through comparisons on a raw `next()`.
 */
function weightedNames(
  table: readonly (readonly [BehaviourName, number])[],
  u: number,
): readonly BehaviourName[] {
  let total = 0
  for (const [, weight] of table) total += weight
  let roll = u * total
  for (const [name, weight] of table) {
    roll -= weight
    if (roll <= 0) return [name]
  }
  return [table[table.length - 1][0]]
}
