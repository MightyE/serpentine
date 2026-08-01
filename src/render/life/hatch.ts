/**
 * Hatching.
 *
 * ## Why this file gets more care than its line count suggests
 *
 * This is the moment the whole game is pointed at. A player who has waited on an egg is going to
 * watch this once and remember it, and someone who has seen a lot of real hatching videos will
 * know immediately if it is wrong. So the sequence is built around what actually happens rather
 * than around what is easy to draw:
 *
 * 1. **Nothing.** An egg, sitting there. Long enough that you start to doubt.
 * 2. **A stir.** The shell twitches. Something inside moved. No opening yet — the anticipation
 *    is the part people describe when they talk about watching a hatch.
 * 3. **The pip.** One small slit, cut by the egg tooth. This is the event with a name, and it is
 *    tiny — resisting the urge to make it big is what makes it read as real.
 * 4. **The tear.** The slit lengthens and branches. A snout appears in it and withdraws.
 * 5. **Emergence.** Head out, then the body — *in surges*, not smoothly. See
 *    {@link staircase}. Hatchlings push, rest, push. A smooth slide reads as an object being
 *    extruded; a stuttering one reads as an animal working.
 * 6. **Out.** Curled beside a spent shell, eyes opening, first tongue flick.
 *
 * ## Short and replayable, on purpose
 *
 * Under seven seconds end to end. She has watched hundreds of these and will watch this one
 * several times in a row; a long cinematic would be watched once. {@link HatchAnimation.replay}
 * restarts it from scratch with no state to reset.
 *
 * ## Everything comes from the seed
 *
 * The shell, the dimples, which way the egg rocks. Replay the same egg and you get the same
 * hatch; a different animal gets a different one.
 */

import type { Phenotype } from '../contract'
import { bodyLength, widthProfile } from '../bodyShape'
import { clamp01, mix, rgba, smoothstep, toCss } from '../colour'
import { add, distance, perp, scale, sub, vec, type ControlPoint, type Vec2 } from '../geometry'
import { tangentAt } from '../spine'
import type { Ribbon } from '../ribbon'
import { patternTextureFor, type PatternTexture } from '../texture'
import { makeRng, type Rng } from '../../lib/rng'
import { drawEgg, drawNest, eggShellFor, type EggGeometry, type EggShell } from './egg'
import { drawLifeFace } from './face'
import { paintBody } from './paint'
import { eyePlacementAtAge, lifeShapeAtAge } from './stage'

export type HatchPhase = 'waiting' | 'stirring' | 'pipping' | 'tearing' | 'emerging' | 'out'

interface PhaseSpan {
  readonly phase: HatchPhase
  readonly duration: number
}

/**
 * The timeline. Edit these six numbers to re-pace the whole thing; nothing else depends on the
 * absolute times.
 */
const TIMELINE: readonly PhaseSpan[] = [
  { phase: 'waiting', duration: 0.7 },
  { phase: 'stirring', duration: 1.2 },
  { phase: 'pipping', duration: 0.7 },
  { phase: 'tearing', duration: 0.9 },
  { phase: 'emerging', duration: 1.9 },
  { phase: 'out', duration: 1.5 },
]

/** Total run time in seconds. After this the animation holds on its last frame. */
export const HATCH_DURATION = TIMELINE.reduce((sum, span) => sum + span.duration, 0)

/** Which phase a time lands in, and how far through it (0..1). */
export function phaseAt(time: number): { phase: HatchPhase; through: number } {
  let t = time
  for (const span of TIMELINE) {
    if (t < span.duration) return { phase: span.phase, through: t / span.duration }
    t -= span.duration
  }
  return { phase: 'out', through: 1 }
}

/** Seconds from the start at which a phase begins. */
function startOf(phase: HatchPhase): number {
  let t = 0
  for (const span of TIMELINE) {
    if (span.phase === phase) return t
    t += span.duration
  }
  return t
}

const PIP_AT = startOf('pipping')
const TEAR_AT = startOf('tearing')
const EMERGE_AT = startOf('emerging')
const OUT_AT = startOf('out')

/**
 * One replayable hatch of one particular animal.
 *
 * Owns only a clock. Everything else is derived, so `replay()` is a single assignment and there
 * is no way for a second run to differ from the first.
 */
export class HatchAnimation {
  readonly phenotype: Phenotype
  readonly shell: EggShell

  private readonly rng: Rng
  private readonly texture: PatternTexture
  private readonly profile: ControlPoint[]
  private readonly bodyLen: number
  /** Which way the egg rocks, and how hard. Fixed per animal. */
  private readonly rockPhase: number
  private readonly rockAmount: number

  private time = 0

  constructor(phenotype: Phenotype) {
    this.phenotype = phenotype
    this.shell = eggShellFor(phenotype)
    this.rng = makeRng(phenotype.seed).fork('hatch')
    this.texture = patternTextureFor(phenotype)
    const shape = lifeShapeAtAge(0)
    this.profile = widthProfile(phenotype.body, shape)
    this.bodyLen = bodyLength(phenotype.body, shape)
    this.rockPhase = this.rng.range(0, Math.PI * 2)
    this.rockAmount = this.rng.range(0.8, 1.3) * (this.rng.chance(0.5) ? 1 : -1)
  }

  /** Start again from the beginning. */
  replay(): void {
    this.time = 0
  }

  update(dt: number): void {
    this.time = Math.min(this.time + dt, HATCH_DURATION)
  }

  get elapsed(): number {
    return this.time
  }

  get finished(): boolean {
    return this.time >= HATCH_DURATION
  }

  get phase(): HatchPhase {
    return phaseAt(this.time).phase
  }

  /** How much of the hatchling is out of the shell, 0..1. */
  get emerged(): number {
    return revealedAt(this.time)
  }

  /**
   * Draw the whole scene: nest, egg, and whatever is out of it.
   *
   * `geom` is where the *unhatched* egg would sit. The rocking and the collapse are applied on
   * top of it here, so a caller only ever has to say where the egg is.
   */
  draw(ctx: CanvasRenderingContext2D, geom: EggGeometry): void {
    const t = this.time
    const live = this.rockedGeometry(geom, t)

    drawNest(ctx, geom)
    drawEgg(ctx, this.shell, live)

    const revealed = revealedAt(t)
    if (revealed > 0.001) this.drawEmerging(ctx, live, revealed, t)

    if (t >= PIP_AT) drawTear(ctx, this.shell, live, tearOpenAt(t))
  }

  /**
   * The egg's own motion.
   *
   * Two ingredients: a slow settling wobble during the stir, and a sharp jolt on each push once
   * the animal is actually working. The jolt is what makes the shell feel like it has something
   * alive shoving at it.
   */
  private rockedGeometry(geom: EggGeometry, t: number): EggGeometry {
    let tilt = geom.tilt
    let nudge = 0

    if (t > 0.7 && t < EMERGE_AT) {
      const into = t - 0.7
      // Three separate twitches rather than a continuous wobble — a continuous one reads as the
      // egg being shaken from outside, discrete ones read as something inside changing position.
      const twitch = Math.exp(-((into % 0.85) * 4.5)) * Math.sin(into * 26 + this.rockPhase)
      tilt += twitch * 0.055 * this.rockAmount
      nudge = twitch * geom.length * 0.02
    }
    if (t >= EMERGE_AT && t < OUT_AT) {
      const push = pushImpulse((t - EMERGE_AT) / (OUT_AT - EMERGE_AT))
      tilt += push * 0.045 * this.rockAmount
      nudge = push * geom.length * 0.018
    }

    // The shell gives up its shape as the animal leaves it.
    const deflate = smoothstep(0.55, 1, revealedAt(t)) * 0.9

    return { ...geom, tilt, centre: vec(geom.centre.x + nudge, geom.centre.y), deflate }
  }

  /** The part of the hatchling that is out of the shell. */
  private drawEmerging(ctx: CanvasRenderingContext2D, geom: EggGeometry, revealed: number, t: number): void {
    const path = emergePath(geom, this.shell, this.bodyLen, revealed)
    if (path.length < 2) return

    const us = path.map((_, i) => (i / (path.length - 1)) * revealed)
    const ribbon = ribbonWithUs(path, this.profile, us)

    paintBody(ctx, ribbon, this.phenotype, this.texture)

    // The eyes stay shut until the head is properly clear, then open. A hatchling that emerges
    // already looking at you is uncanny; one that opens its eyes once it is out is a moment.
    const place = eyePlacementAtAge(0)
    if (revealed > place.u * 2.2) {
      const blink = 1 - smoothstep(0.45, 0.8, revealed)
      const tongue = t < OUT_AT + 0.55 ? 0 : Math.max(0, Math.sin((t - OUT_AT - 0.55) * 4.4))
      drawLifeFace(ctx, ribbon, this.phenotype, { blink, tongue }, 0)
    }
  }
}

// ---------------------------------------------------------------------------
// Timing curves
// ---------------------------------------------------------------------------

/**
 * A staircase: rise, pause, rise, pause, rise.
 *
 * The single most important function in this file. Hatchlings do not slide out — they brace,
 * shove, and rest. Replacing this with a plain `smoothstep` makes the emergence look like an
 * animation curve, which is precisely what a viewer who has watched real hatches will notice
 * without being able to say why.
 */
export function staircase(p: number, steps = 3): number {
  const clamped = clamp01(p)
  if (clamped >= 1) return 1
  const step = Math.floor(clamped * steps)
  const local = clamped * steps - step
  // 65% of each step is the push, the rest is the animal getting its breath back.
  return (step + smoothstep(0, 0.65, local)) / steps
}

/** How hard the animal is shoving right now, 0..1 — the derivative of the staircase, roughly. */
function pushImpulse(p: number): number {
  const steps = 3
  const local = clamp01(p) * steps - Math.floor(clamp01(p) * steps)
  return local < 0.65 ? Math.sin((local / 0.65) * Math.PI) : 0
}

/** Fraction of the body out of the shell at time `t`. */
function revealedAt(t: number): number {
  if (t < TEAR_AT) return 0
  if (t < EMERGE_AT) {
    // Just the snout, in and out of the slit — a look at the world, then second thoughts.
    const p = (t - TEAR_AT) / (EMERGE_AT - TEAR_AT)
    return 0.05 * Math.sin(p * Math.PI) * Math.sin(p * Math.PI)
  }
  if (t < OUT_AT) return 0.05 + 0.95 * staircase((t - EMERGE_AT) / (OUT_AT - EMERGE_AT))
  return 1
}

/** How far the shell is cut open at time `t`, 0..1. */
function tearOpenAt(t: number): number {
  if (t < PIP_AT) return 0
  if (t < TEAR_AT) return 0.14 * smoothstep(0, 1, (t - PIP_AT) / (TEAR_AT - PIP_AT))
  return 0.14 + 0.86 * smoothstep(0, 1, clamp01((t - TEAR_AT) / (OUT_AT - TEAR_AT)))
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** Where the shell is cut, in egg-local coordinates (x along the long axis). */
function tearLocal(geom: EggGeometry, shell: EggShell): Vec2 {
  const half = geom.length / 2
  return { x: half * 0.42, y: -half / shell.elongation / 1.9 }
}

function eggToWorld(local: Vec2, geom: EggGeometry): Vec2 {
  const cos = Math.cos(geom.tilt)
  const sin = Math.sin(geom.tilt)
  return {
    x: geom.centre.x + local.x * cos - local.y * sin,
    y: geom.centre.y + local.x * sin + local.y * cos,
  }
}

/**
 * The path the emerging hatchling lies along, head **first** in the returned array.
 *
 * A **fixed** curve that the head travels down, with the body lying along behind it — which is
 * what a follow-the-leader spine does anyway, without needing a simulation for a six-second
 * clip. Fixed is load-bearing: parameterising the curve by the *revealed* fraction instead of by
 * absolute arc length makes the shape rewrite itself every frame, and the animal appears to
 * writhe rather than to emerge.
 *
 * Curvature is concentrated **near the shell** and dies away toward the head. That is the right
 * way round and it took getting wrong to see why: put the curvature at the head end and the
 * animal comes out spiralling nose-first, like something being wound onto a reel. Put it at the
 * shell end and you get the hook that hatchlings actually make — body draped over the torn edge,
 * head out and pointed away from the egg.
 */
export function emergePath(
  geom: EggGeometry,
  shell: EggShell,
  fullLength: number,
  revealed: number,
): Vec2[] {
  const out = eggToWorld({ x: geom.length * 0.5, y: -geom.length * 0.32 }, geom)
  const start = eggToWorld(tearLocal(geom, shell), geom)
  const heading = Math.atan2(out.y - start.y, out.x - start.x)

  const arc = fullLength * clamp01(revealed)
  if (arc < 1) return []
  const steps = Math.max(6, Math.round(48 * clamp01(revealed)))
  const ds = arc / steps
  // Just under half a turn, spent over the first 60% of the body. Tuned by looking: a full
  // revolution puts the coil radius below the body's own width, the animal overlaps itself, and
  // a newborn snake reads as a cinnamon bun.
  const totalTurn = Math.PI * 2 * 0.45

  // Walk from the tear outward, then reverse so the head (the far end) comes first. `s` is a
  // fraction of the *whole* body, not of what is out so far — that is what keeps the curve
  // still in space while the animal slides along it.
  const forward: Vec2[] = [start]
  let p = start
  for (let i = 1; i <= steps; i++) {
    const s = ((i - 0.5) * ds) / fullLength
    const theta = heading + totalTurn * smoothstep(0, 0.6, s)
    p = add(p, vec(Math.cos(theta) * ds, Math.sin(theta) * ds))
    forward.push(p)
  }
  return forward.reverse()
}

/**
 * A ribbon whose `u` coordinates are supplied rather than derived from arc length.
 *
 * `buildRibbon` assumes the points it is given are the whole animal, so a half-emerged
 * hatchling would come out with a full-length width profile squeezed into the visible part —
 * a complete snake with a tail, poking out of an egg. Here the caller says which slice of the
 * body these points are, and the width profile is read at those `u`s. The blunt cut at the tail
 * end is hidden by the shell, which is drawn over it.
 */
export function ribbonWithUs(
  spine: readonly Vec2[],
  profile: readonly ControlPoint[],
  us: readonly number[],
): Ribbon {
  const n = spine.length
  const left: Vec2[] = []
  const right: Vec2[] = []
  const widths: number[] = []
  const tangents: Vec2[] = []
  let total = 0
  for (let i = 1; i < n; i++) total += distance(spine[i], spine[i - 1])

  for (let i = 0; i < n; i++) {
    const t = tangentAt(spine, i)
    const nrm = perp(t)
    const w = sampleWidth(profile, us[i])
    widths.push(w)
    tangents.push(t)
    left.push(add(spine[i], scale(nrm, w / 2)))
    right.push(sub(spine[i], scale(nrm, w / 2)))
  }
  return { spine, left, right, us: [...us], widths, tangents, length: total }
}

/** Same interpolation `bodyShape` uses, inlined so this file does not depend on its internals. */
function sampleWidth(profile: readonly ControlPoint[], u: number): number {
  if (profile.length === 0) return 0
  if (u <= profile[0].u) return profile[0].value
  const last = profile[profile.length - 1]
  if (u >= last.u) return last.value
  for (let i = 1; i < profile.length; i++) {
    const b = profile[i]
    if (u <= b.u) {
      const a = profile[i - 1]
      const span = b.u - a.u
      const k = span === 0 ? 0 : (u - a.u) / span
      return a.value + (b.value - a.value) * (k * k * (3 - 2 * k))
    }
  }
  return last.value
}

/**
 * The cut in the shell.
 *
 * Starts as one short slit — the pip — and grows two branches into the ragged Y that soft shells
 * actually tear into. The pale line along one edge is the curled-back shell, and it is what
 * makes the opening read as a hole through something rather than a mark drawn on it.
 */
export function drawTear(
  ctx: CanvasRenderingContext2D,
  shell: EggShell,
  geom: EggGeometry,
  open: number,
): void {
  if (open <= 0) return
  const origin = tearLocal(geom, shell)
  const len = geom.length * (0.06 + 0.42 * open)
  const width = geom.length * (0.006 + 0.075 * open * open)

  const slits: { angle: number; scale: number }[] = [
    { angle: 0.35, scale: 1 },
    { angle: -0.75, scale: open > 0.35 ? 0.72 : 0 },
    { angle: 1.25, scale: open > 0.55 ? 0.55 : 0 },
  ]

  ctx.save()
  for (const slit of slits) {
    if (slit.scale <= 0) continue
    const l = len * slit.scale
    const w = width * slit.scale
    const dir = vec(Math.cos(slit.angle), Math.sin(slit.angle))
    const side = perp(dir)
    const a = eggToWorld(origin, geom)
    const b = eggToWorld(add(origin, scale(dir, l)), geom)
    const ma = eggToWorld(add(origin, scale(side, w)), geom)
    const mb = eggToWorld(add(add(origin, scale(dir, l * 0.5)), scale(side, -w)), geom)

    // The opening itself: dark, because you are looking into a shell.
    ctx.fillStyle = toCss(mix(shell.shadowColour, rgba(24, 16, 14, 1), 0.7))
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.quadraticCurveTo(ma.x, ma.y, b.x, b.y)
    ctx.quadraticCurveTo(mb.x, mb.y, a.x, a.y)
    ctx.closePath()
    ctx.fill()

    // Curled-back shell along the upper edge.
    ctx.strokeStyle = toCss({ ...mix(shell.shellColour, rgba(255, 255, 255, 1), 0.4), a: 0.75 })
    ctx.lineWidth = Math.max(0.6, geom.length * 0.012)
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.quadraticCurveTo(ma.x, ma.y, b.x, b.y)
    ctx.stroke()
  }
  ctx.restore()
}
