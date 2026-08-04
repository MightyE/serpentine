/**
 * How a snake looks when somebody is holding it.
 *
 * ## The pose, and why it is this one
 *
 * Eric's description, which this file implements literally: *"their tail should dangle underneath
 * them like a noodle. Their head should be level with a short curve down to the dangling tail."*
 *
 * So, front to back: **a level run of head and neck, a short quarter-turn down, and then the rest
 * of the animal hanging.** Three pieces, laid out by arc length, which is what keeps the
 * proportions honest — a hatchling and an adult get the same *shape* and differ only in how much
 * body there is.
 *
 * The hand is at the bend. Nothing draws it, but it is where the animal is supported, and every
 * decision here follows from that: the head is calm and level because it is resting on a palm, the
 * tail hangs because nothing is holding it, and the sway is a **pendulum** rather than a wiggle
 * because a hanging rope swings, it does not undulate.
 *
 * ## The sway lags down the body
 *
 * `sin(t·ω − u·lag)`, where `u` runs 0 at the bend to 1 at the tail tip. Without the lag the whole
 * hanging length swings as one rigid stick; with it, the motion travels down the animal and the
 * tail tip arrives late. That single term is the difference between a pendulum and a metronome,
 * and it is the whole of what "weight, not wiggle" means here.
 *
 * ## This is not cruelty, and the geometry is where that is decided
 *
 * A snake held by the neck, gripped, or hanging in a straight vertical line reads as distressed.
 * The animal here is *supported at its middle* with its head level and unrestrained — which is
 * both how you are actually supposed to hold one and the only version this game would ship. If
 * you change these numbers, that is the property to keep.
 */

import { vec, type Vec2 } from '../geometry'

/** Fraction of the body that lies level, from the snout back. */
const HEAD_RUN = 0.26
/** Radius of the turn down, as a fraction of body length. Short: it is a bend, not a loop. */
const BEND_RADIUS = 0.11
/** Peak sway of the hanging tail, as a fraction of body length. */
const SWAY_REACH = 0.055
/** How far the swing lags between the bend and the tail tip, in radians. */
const SWAY_LAG = 1.15
/** Swings per second. Slow — this is weight settling, not an animal moving. */
const SWAY_RATE = 0.62

/** Arc length of the quarter-turn, as a fraction of body length. */
const BEND_ARC = (Math.PI * BEND_RADIUS) / 2

/**
 * The pose's footprint, in fractions of body length. Used to work out how large the animal can be
 * drawn in a given canvas without the sway carrying its tail off the edge.
 */
export const HELD_EXTENT = {
  width: HEAD_RUN + BEND_RADIUS + SWAY_REACH * 2,
  height: BEND_RADIUS + (1 - HEAD_RUN - BEND_ARC),
}

export interface HeldPoseOptions {
  /** Number of body points. */
  readonly count: number
  /** Distance between them, in logical pixels. */
  readonly segLength: number
  /** Seconds. Drives the sway. */
  readonly time: number
  /** Where the bend — the supported point — sits on the canvas. */
  readonly anchor: Vec2
  /** 0 disables the sway entirely, for `prefers-reduced-motion`. */
  readonly sway?: number
  /** Per-animal offset so two held snakes are never in step. */
  readonly phase?: number
}

/**
 * Build the held body, head first.
 *
 * Pure: the same options give the same points, which means a still screenshot of a held snake is
 * reproducible and the pose can be unit-tested with no canvas.
 */
export function heldPose(options: HeldPoseOptions): Vec2[] {
  const { count, segLength, time, anchor } = options
  const total = segLength * (count - 1)
  const swayScale = options.sway ?? 1
  const phase = options.phase ?? 0

  const run = HEAD_RUN * total
  const radius = BEND_RADIUS * total
  const arc = BEND_ARC * total
  const hang = Math.max(1e-6, total - run - arc)
  const reach = SWAY_REACH * total * swayScale

  const out: Vec2[] = []
  for (let i = 0; i < count; i++) {
    const s = i * segLength
    let x: number
    let y: number

    if (s <= run) {
      // Level. The snout is the far end, so the head points away from the bend.
      x = s - run
      y = -radius
    } else if (s <= run + arc) {
      // The quarter turn: from travelling along the body to travelling straight down.
      const theta = (s - run) / radius
      x = radius * Math.sin(theta) - radius
      y = -radius * Math.cos(theta)
    } else {
      // Hanging, with the pendulum lag. `u` is 0 at the bend and 1 at the tail tip.
      const u = (s - run - arc) / hang
      x = 0
      y = u * hang
      x += Math.sin(time * SWAY_RATE * Math.PI * 2 - u * SWAY_LAG + phase) * reach * Math.pow(u, 1.3)
    }

    out.push(vec(anchor.x + x, anchor.y + y))
  }
  return out
}

/**
 * How dilated the eyes are, `seconds` after being picked up. 1 is wide, 0 is normal.
 *
 * Eric: *"their eyes get big for a few seconds to indicate surprise, then the eyes settle to a
 * normal state."* So: full for a beat, then eased back over a couple of seconds. The hold is what
 * makes it read as a reaction rather than as a fade — an expression that starts decaying the
 * instant it appears never lands.
 */
export function pickupDilation(seconds: number, hold = 0.7, settle = 2): number {
  if (seconds <= 0) return 1
  if (seconds <= hold) return 1
  const t = Math.min(1, (seconds - hold) / settle)
  return 1 - t * t * (3 - 2 * t)
}
