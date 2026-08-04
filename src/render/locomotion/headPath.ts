/**
 * A record of everywhere the head has been.
 *
 * ## Why this file exists at all
 *
 * This is the whole trick behind snake locomotion, and it is worth reading before anything else
 * in this directory.
 *
 * The naive way to animate a snake is to take a straight body and add a sine wave across it —
 * `spine.ts`'s `visualSpine` does exactly that, and for a snake that is *always* swimming it
 * looks fine. But it has two failures you cannot tune away. A stationary snake still undulates,
 * because the wave is a function of the clock rather than of movement, and every point of the
 * body wiggles *sideways through space* rather than following the one in front of it. Together
 * they read as an aquatic larva flapping in place, not as an animal.
 *
 * Real serpentine locomotion is the other way round. **Only the head decides anything.** It
 * weaves as it advances, and every other part of the body simply arrives, in turn, at a place the
 * head has already been. That is why a snake's tail traces its head's line, and why a snake at
 * rest is perfectly still: no head movement, no new path, nothing for the body to follow.
 *
 * So: this class stores the head's path as a polyline annotated with arc length, and the body is
 * placed by asking it "where was the head 40 pixels ago? 80? 120?". The body never has a wave
 * applied to it. It *inherits* one.
 *
 * ## The shape of the data
 *
 * A ring buffer of `(x, y, s)` where `s` is cumulative distance travelled by the head since the
 * path began. `s` is monotonically increasing, so finding "40 pixels back" is a walk backwards
 * from the newest sample until the arc length runs out.
 *
 * Two details that are load-bearing:
 *
 * - **Sub-step movements coalesce into the newest sample rather than appending a new one.** The
 *   head must stay exactly where the simulation put it (it is the thing the player's eye tracks),
 *   but a snake creeping at half a pixel a frame would otherwise fill the buffer with two hundred
 *   samples spanning a hundred pixels and the tail would fall off the end of the record.
 * - **Nothing is stored per frame.** A head that has not moved appends nothing, so the body it
 *   samples is bit-for-bit the body it sampled last frame. That is the stationary-snake guarantee,
 *   and it is a property of the data structure rather than something the caller has to remember.
 */

import { vec, type Vec2 } from '../geometry'

/** One recorded head position and how far the head had travelled when it was there. */
export interface PathSample {
  readonly x: number
  readonly y: number
  /** Cumulative arc length travelled by the head, in logical pixels. */
  readonly s: number
}

export class HeadPath {
  private readonly xs: Float64Array
  private readonly ys: Float64Array
  private readonly ss: Float64Array
  private readonly capacity: number
  /** Shortest gap between two stored samples. Below this, a move updates the newest sample. */
  private readonly step: number

  /** How many slots are in use. */
  private size = 0
  /** Ring index of the newest sample. `-1` while the path is empty. */
  private newest = -1
  /**
   * True when the newest slot is a *provisional* sample — the live head position, less than one
   * `step` past the last committed one. It gets rewritten in place until the head has moved far
   * enough to be worth keeping, at which point it is committed and a fresh provisional starts.
   *
   * Without this the buffer either fills with sub-pixel samples (and the tail runs off the end of
   * the record within a second) or the head lags behind where the simulation actually put it.
   */
  private provisional = false

  /**
   * @param arcLength how much of the path must stay available — at least the snake's own length,
   *   or its tail would sample off the end of the record.
   * @param step spacing between stored samples. Smaller is smoother and costs memory linearly.
   */
  constructor(arcLength: number, step: number) {
    this.step = Math.max(0.05, step)
    // Enough samples to cover the required arc, plus slack for the partially-filled newest one.
    this.capacity = Math.max(8, Math.ceil(arcLength / this.step) + 4)
    this.xs = new Float64Array(this.capacity)
    this.ys = new Float64Array(this.capacity)
    this.ss = new Float64Array(this.capacity)
  }

  /** Total distance the head has travelled. Never decreases. */
  get travelled(): number {
    return this.newest < 0 ? 0 : this.ss[this.newest]
  }

  /** How much recorded path is behind the head right now. */
  get span(): number {
    if (this.size === 0) return 0
    return this.ss[this.newest] - this.ss[this.oldestIndex()]
  }

  get headPoint(): Vec2 {
    return this.newest < 0 ? vec(0, 0) : vec(this.xs[this.newest], this.ys[this.newest])
  }

  /**
   * Lay a starting path down, oldest point first.
   *
   * Without this a freshly built snake has a one-point path and every body point piles up on the
   * head. Hand it a pose — a coil, a gentle curve — walked from **tail to head**, and the animal
   * starts out already standing in that pose, as though it had arrived there under its own power.
   */
  seed(pathTailToHead: readonly Vec2[]): void {
    this.size = 0
    this.newest = -1
    this.provisional = false
    if (pathTailToHead.length === 0) return

    // Densified to the buffer's own resolution as it goes in. A pose handed over at one point per
    // body segment would be recorded at that resolution too, and the animal would set off along a
    // visibly faceted version of the curve it was supposed to be standing in.
    let previous = pathTailToHead[0]
    this.push(previous.x, previous.y)
    for (let i = 1; i < pathTailToHead.length; i++) {
      const next = pathTailToHead[i]
      const gap = Math.hypot(next.x - previous.x, next.y - previous.y)
      const pieces = Math.max(1, Math.ceil(gap / this.step))
      for (let p = 1; p <= pieces; p++) {
        const t = p / pieces
        this.push(previous.x + (next.x - previous.x) * t, previous.y + (next.y - previous.y) * t)
      }
      previous = next
    }
  }

  /**
   * Record where the head is now.
   *
   * ## The provisional sample, and why the obvious version is wrong
   *
   * A snake cruising at 34 px/s covers about half a pixel per frame. The obvious rule — "append
   * every position, drop anything older than a body length" — gives a buffer of six hundred
   * near-identical samples; the obvious fix — "ignore moves smaller than a step" — makes the head
   * *lag* behind the simulation, and at half a pixel a frame it never appends anything at all.
   *
   * So the newest slot is provisional: it is rewritten in place, holding the exact live head
   * position, until the head has drifted a whole `step` from the last committed sample. Then it is
   * committed and the next frame opens a new provisional. The head is always exactly right, and
   * the stored path is always about one sample per `step`.
   *
   * Arc length is recomputed from the committed anchor rather than accumulated, so a head that
   * jitters within one step does not inflate the distance travelled.
   *
   * A move of exactly zero does nothing, which is what keeps a resting snake motionless.
   */
  push(x: number, y: number): void {
    if (this.newest < 0) {
      this.newest = 0
      this.size = 1
      this.provisional = false
      this.xs[0] = x
      this.ys[0] = y
      this.ss[0] = 0
      return
    }

    const anchor = this.provisional ? this.indexBefore(this.newest) : this.newest
    const moved = Math.hypot(x - this.xs[anchor], y - this.ys[anchor])

    if (moved === 0) {
      // Back exactly where the last committed sample is. Drop the provisional rather than keeping
      // a zero-length segment, which would give the tangent code a direction of (0, 0).
      if (this.provisional) {
        this.newest = anchor
        this.size--
        this.provisional = false
      }
      return
    }

    if (!this.provisional) {
      this.newest = (this.newest + 1) % this.capacity
      if (this.size < this.capacity) this.size++
    }
    this.xs[this.newest] = x
    this.ys[this.newest] = y
    this.ss[this.newest] = this.ss[anchor] + moved
    // Far enough from the anchor to be worth keeping: the slot stops being rewritable.
    this.provisional = moved < this.step
  }

  /**
   * Where the head was, `distances[k]` pixels back along the path it actually travelled.
   *
   * `distances` must be ascending and `out` must be at least as long — both are true for a body,
   * whose points sit at fixed multiples of the segment length. Walking the buffer once for the
   * whole body rather than once per point is the difference between O(n) and O(n²) per frame.
   *
   * Asking for more path than has been recorded extrapolates straight back along the oldest
   * segment. That only happens in the first moments of a snake's life or after a teleport, and a
   * straight tail for a few frames is the least surprising possible answer.
   */
  sampleBack(distances: readonly number[], out: Vec2[]): void {
    if (this.newest < 0) return
    if (this.size === 1) {
      // Nothing to walk. Everything piles onto the head, which is what a one-point path means.
      for (let k = 0; k < distances.length; k++) place(out, k, this.xs[this.newest], this.ys[this.newest])
      return
    }
    const head = this.ss[this.newest]
    let i = this.newest
    let stepsLeft = this.size - 1

    for (let k = 0; k < distances.length; k++) {
      const target = head - distances[k]

      while (stepsLeft > 0 && this.ss[this.indexBefore(i)] > target) {
        i = this.indexBefore(i)
        stepsLeft--
      }

      if (stepsLeft === 0 && this.ss[i] > target) {
        // Off the recorded end: continue straight along the oldest segment's direction.
        const after = this.indexAfter(i)
        const dx = this.xs[i] - this.xs[after]
        const dy = this.ys[i] - this.ys[after]
        const len = Math.hypot(dx, dy) || 1
        const overshoot = this.ss[i] - target
        place(out, k, this.xs[i] + (dx / len) * overshoot, this.ys[i] + (dy / len) * overshoot)
        continue
      }

      const before = this.indexBefore(i)
      const a = stepsLeft > 0 ? before : i
      const span = this.ss[i] - this.ss[a]
      const t = span <= 0 ? 0 : (this.ss[i] - target) / span
      place(
        out,
        k,
        this.xs[i] + (this.xs[a] - this.xs[i]) * t,
        this.ys[i] + (this.ys[a] - this.ys[i]) * t,
      )
    }
  }

  /** The whole recorded path, oldest first. For tests and for the debug overlay; not per frame. */
  samples(): PathSample[] {
    const out: PathSample[] = []
    let i = this.oldestIndex()
    for (let n = 0; n < this.size; n++) {
      out.push({ x: this.xs[i], y: this.ys[i], s: this.ss[i] })
      i = this.indexAfter(i)
    }
    return out
  }

  private oldestIndex(): number {
    return (this.newest - (this.size - 1) + this.capacity * 2) % this.capacity
  }

  private indexBefore(i: number): number {
    return (i - 1 + this.capacity) % this.capacity
  }

  private indexAfter(i: number): number {
    return (i + 1) % this.capacity
  }
}

/**
 * Write into `out[k]`, reusing the object that is already there.
 *
 * A body is sampled every frame for every animal on the floor. Allocating a fresh `{x, y}` per
 * point per snake per frame is a few hundred short-lived objects a second, which is not slow but
 * is pure garbage-collector pressure for no reason — the caller hands the same array back next
 * frame and never keeps a reference to the points.
 */
function place(out: Vec2[], k: number, x: number, y: number): void {
  const existing = out[k]
  if (existing) {
    existing.x = x
    existing.y = y
    return
  }
  out[k] = vec(x, y)
}
