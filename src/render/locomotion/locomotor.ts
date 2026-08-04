/**
 * One animal's movement, end to end.
 *
 * ```
 *   Behaviour  ──SteerCommand──▶  HeadDriver  ──head position──▶  HeadPath
 *                                                                     │
 *                                              body points  ◀──sample─┘
 * ```
 *
 * That diagram is the whole design and it only goes one way. The behaviour never touches the
 * body. The driver never touches the body. The body is a **readout** of where the head has been,
 * and there is no code path anywhere that moves a body point for any other reason.
 *
 * The one exception is deliberate and confined: while the animal is `alert` it turns its head to
 * look around, which is something a snake can do without going anywhere. That is applied as a
 * rotation of the leading few points about a pivot in the neck, *after* sampling, and it never
 * enters the path. Nothing behind the neck moves by so much as a pixel.
 *
 * ## What "stationary means still" buys
 *
 * It is not only correctness. It is that the floor can hold nine animals and stay calm, because
 * seven of them are contributing literally nothing to the frame but a redraw of an unchanged
 * shape. It also means `prefers-reduced-motion` is not a special case with its own code — it is
 * the ordinary resting animal with the behaviour clock switched off.
 */

import { vec, type Vec2 } from '../geometry'
import { HeadPath } from './headPath'
import { HeadDriver, type Bounds, type Obstacle } from './driver'
import { Behaviour, type BehaviourName } from './behaviour'

export interface LocomotorOptions {
  /** Seeds every decision this animal will ever make. Use the snake's id. */
  readonly seed: string
  readonly bounds: Bounds
  readonly obstacles?: readonly Obstacle[]
  /** How many points the body is drawn with. */
  readonly pointCount: number
  /** Distance between consecutive body points, in logical pixels. */
  readonly segLength: number
  /**
   * The largest `segLength` this animal will ever be set to — its adult spacing.
   *
   * Only the recorded path's capacity depends on it, and getting it wrong is not a crash: a body
   * longer than the record just extrapolates a straight tail. Defaults to `segLength`.
   */
  readonly maxSegLength?: number
  /** Widest part of the body. Sets how tightly the animal may coil. */
  readonly bodyWidth: number
  /** Travelling speed in logical pixels per second. */
  readonly cruiseSpeed: number
  /**
   * Where the starting coil is centred. Defaults to the middle of `bounds` — override it when
   * several animals share an enclosure, or they all begin the first frame on top of each other.
   */
  readonly home?: Vec2
  /**
   * Freeze the behaviour clock. The animal is drawn in its starting coil and never moves — which
   * is what `prefers-reduced-motion` wants, and is a perfectly ordinary thing for a snake to do.
   */
  readonly still?: boolean
}

export class Locomotor {
  /** The body, head first. The same array every frame; do not hold on to it across frames. */
  readonly points: Vec2[] = []

  private readonly path: HeadPath
  private readonly driver: HeadDriver
  private readonly behaviour: Behaviour
  private readonly distances: number[] = []
  private readonly pointCount: number
  private readonly still: boolean
  private readonly lookReach: number

  constructor(options: LocomotorOptions) {
    const { bounds, pointCount, segLength, bodyWidth } = options
    const bodyLength = segLength * (pointCount - 1)
    this.still = options.still ?? false
    this.pointCount = pointCount
    // The head and neck turn together; further back than about a sixth of the body and it stops
    // reading as a head turn and starts reading as the whole animal being bent.
    this.lookReach = Math.max(2, Math.round(pointCount * 0.16))

    for (let i = 0; i < pointCount; i++) {
      this.distances.push(i * segLength)
      this.points.push(vec(0, 0))
    }

    // A little more history than the body needs, so the tail is never sampling right at the edge
    // of the record where a rounding error would push it off the end.
    const longest = Math.max(segLength, options.maxSegLength ?? segLength) * (pointCount - 1)
    this.path = new HeadPath(longest * 1.2, Math.max(0.4, segLength / 6))
    const centre = options.home ?? vec(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    const seed = coilPath(centre, bodyLength, bodyWidth * 1.15, options.seed, bounds)
    this.path.seed(seed)

    const head = this.path.headPoint
    const before = seed[seed.length - 2] ?? head
    this.driver = new HeadDriver({
      position: head,
      heading: Math.atan2(head.y - before.y, head.x - before.x),
      bounds,
      obstacles: options.obstacles,
      wallMargin: Math.min(bounds.width, bounds.height) * 0.14 + bodyWidth,
    })
    this.behaviour = new Behaviour(options.seed, {
      bounds,
      obstacles: options.obstacles ?? [],
      bodyLength,
      bodyWidth,
      cruiseSpeed: options.cruiseSpeed,
    })

    this.readBody()
  }

  get state(): BehaviourName {
    return this.behaviour.name
  }

  /** 0 while resting, up to 1 while alert. The caller uses it to flick the tongue more. */
  get alertness(): number {
    return this.behaviour.alertness
  }

  get headPosition(): Vec2 {
    return this.driver.position
  }

  /** True when nothing moved this frame — the caller may skip its redraw. */
  get idle(): boolean {
    return this.driver.moved === 0 && this.behaviour.lookAngle === 0
  }

  update(dt: number): void {
    if (this.still) return
    const command = this.behaviour.update(dt, {
      position: this.driver.position,
      course: this.driver.course,
      moved: this.driver.moved,
    })
    const head = this.driver.step(command, dt)
    if (this.driver.moved > 0) this.path.push(head.x, head.y)
    this.readBody()
  }

  /**
   * The animal grew (or shrank, on a debug slider).
   *
   * This is the one place the path model pays a dividend that would otherwise be real work. The
   * body is *defined* as a set of arc-length offsets behind the head, so growing it is changing
   * the offsets — the animal keeps the exact curve it was standing in and simply has more of
   * itself. Compare `life/view.ts`, which has to resample its whole chain and build a new spine
   * because the constraint solver there owns the spacing.
   */
  setSegLength(segLength: number, bodyWidth: number, cruiseSpeed: number): void {
    for (let i = 0; i < this.pointCount; i++) this.distances[i] = i * segLength
    this.behaviour.resize({
      bounds: this.driver.bounds,
      obstacles: this.driver.obstacles,
      bodyLength: segLength * (this.pointCount - 1),
      bodyWidth,
      cruiseSpeed,
    })
    this.readBody()
  }

  /** Move the whole animal — the enclosure was resized, or it was put down somewhere else. */
  reframe(bounds: Bounds, obstacles: readonly Obstacle[]): void {
    this.driver.bounds = bounds
    this.driver.obstacles = obstacles
  }

  private readBody(): void {
    this.path.sampleBack(this.distances, this.points)
    const look = this.behaviour.lookAngle
    if (look !== 0) applyHeadLook(this.points, look, this.lookReach)
  }
}

/**
 * Turn the leading points about a pivot in the neck — the animal looking around.
 *
 * The pivot is the last point that moves, so the neck stays attached to a body that has not
 * shifted. The rotation eases in from the pivot to the snout rather than being applied flat,
 * because a rigid swing of the whole head reads as a hinge and a graded one reads as a spine.
 */
export function applyHeadLook(points: Vec2[], angle: number, reach: number): void {
  const pivot = points[Math.min(reach, points.length - 1)]
  if (!pivot) return
  for (let i = 0; i < reach && i < points.length; i++) {
    const share = 1 - i / reach
    const a = angle * share * share
    const cos = Math.cos(a)
    const sin = Math.sin(a)
    const dx = points[i].x - pivot.x
    const dy = points[i].y - pivot.y
    points[i].x = pivot.x + dx * cos - dy * sin
    points[i].y = pivot.y + dx * sin + dy * cos
  }
}

/**
 * An Archimedean spiral, from the outer tail to the head at the middle — the pose an animal is
 * found in when the screen first opens.
 *
 * Handed to `HeadPath.seed`, so the snake starts life having "already travelled" this curve. The
 * alternative — starting every animal in a straight line and letting it unwind — means a floor
 * that looks like a rack of sticks for the first ten seconds after a page load.
 *
 * `spacing` is the gap between successive turns and should be about the animal's own width, which
 * is what makes the loops stack neatly instead of overlapping.
 */
export function coilPath(
  centre: Vec2,
  totalLength: number,
  spacing: number,
  seed: string,
  bounds?: Bounds,
): Vec2[] {
  // A deterministic starting angle per animal, so nine coils on one floor are not nine copies of
  // the same picture rotated to the same degree.
  let angle = 0
  for (let i = 0; i < seed.length; i++) angle = (angle * 31 + seed.charCodeAt(i)) % 6283
  const start = angle / 1000
  const turn = seed.length % 2 === 0 ? 1 : -1

  const growth = spacing / (Math.PI * 2)
  const stride = Math.max(0.6, spacing / 4)
  const headFirst: Vec2[] = []
  let theta = 1.9
  let travelled = 0

  while (travelled <= totalLength) {
    const radius = growth * theta
    headFirst.push(vec(
      centre.x + Math.cos(start + turn * theta) * radius,
      centre.y + Math.sin(start + turn * theta) * radius,
    ))
    theta += stride / Math.max(radius, spacing * 0.5)
    travelled += stride
  }

  const out = headFirst.reverse()
  if (!bounds) return out
  // Keep the starting pose inside the glass. A snake lying along a wall is a thing snakes do; a
  // snake hanging out of the enclosure is not.
  const inset = spacing * 0.5
  return out.map((p) =>
    vec(
      Math.min(Math.max(p.x, bounds.x + inset), bounds.x + bounds.width - inset),
      Math.min(Math.max(p.y, bounds.y + inset), bounds.y + bounds.height - inset),
    ),
  )
}
