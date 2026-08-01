/**
 * Turning a line into a body.
 *
 * ## Why this is not just a thick line
 *
 * Canvas 2D cannot draw a stroke that changes width. `ctx.lineWidth` is one number for the
 * whole path — there is no way to say "thick here, thin there". You could stroke fifty short
 * separate paths at fifty different widths, but the joins show as visible steps and it is
 * fifty draw calls instead of one.
 *
 * So instead we build the outline ourselves. At each point on the spine, look sideways (the
 * normal), step half the body width in each direction, and you have two *rails*. Walk the left
 * rail from nose to tail, come back along the right rail, close the loop — that is a polygon
 * shaped exactly like a snake, and it fills in one call.
 *
 * The same walk hands us `u` (how far along the body we are) for free, which is precisely the
 * coordinate the pattern texture is indexed by. Shape and markings stay in step automatically.
 */

import { angleOf, distance, perp, scale, add, sub, type Vec2 } from './geometry'
import { tangentAt } from './spine'
import { widthAt } from './bodyShape'
import type { ControlPoint } from './geometry'

/** The body outline, plus everything else that walk computed along the way. */
export interface Ribbon {
  /** The (visual) spine points this was built from. */
  readonly spine: readonly Vec2[]
  /** One edge of the body. */
  readonly left: Vec2[]
  /** The other edge. */
  readonly right: Vec2[]
  /** Normalised distance along the body, 0 at the snout, 1 at the tail tip. */
  readonly us: number[]
  /** Full body width at each point, in logical pixels. */
  readonly widths: number[]
  /** Unit direction of travel at each point. */
  readonly tangents: Vec2[]
  /** Total nose-to-tail length actually measured on these points. */
  readonly length: number
}

/** Walk the spine and work out the two edges of the body. */
export function buildRibbon(spine: readonly Vec2[], profile: readonly ControlPoint[]): Ribbon {
  const n = spine.length
  const arc: number[] = [0]
  let total = 0
  for (let i = 1; i < n; i++) {
    total += distance(spine[i], spine[i - 1])
    arc.push(total)
  }

  const left: Vec2[] = []
  const right: Vec2[] = []
  const us: number[] = []
  const widths: number[] = []
  const tangents: Vec2[] = []

  for (let i = 0; i < n; i++) {
    const u = total === 0 ? i / Math.max(1, n - 1) : arc[i] / total
    const t = tangentAt(spine, i)
    const nrm = perp(t)
    const w = widthAt(profile, u)
    us.push(u)
    widths.push(w)
    tangents.push(t)
    left.push(add(spine[i], scale(nrm, w / 2)))
    right.push(sub(spine[i], scale(nrm, w / 2)))
  }

  return { spine, left, right, us, widths, tangents, length: total }
}

/**
 * Trace the body outline into the current path (does not fill or stroke it).
 *
 * The nose is closed with a curve rather than a straight edge. That one curve is doing real
 * work: a real snake's snout is a wedge, and a wedge reads as "venomous" to almost everyone,
 * whether or not they could tell you why. Rounding it is most of the difference between a pet
 * and a threat.
 */
export function traceRibbon(ctx: CanvasRenderingContext2D, ribbon: Ribbon): void {
  const { left, right, tangents, widths } = ribbon
  const n = left.length
  ctx.beginPath()
  ctx.moveTo(left[0].x, left[0].y)
  for (let i = 1; i < n; i++) ctx.lineTo(left[i].x, left[i].y)
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y)
  // Round the snout: bulge the closing edge forward along the head's own direction.
  const noseOut = scale(tangents[0], widths[0] * 0.75)
  const ctrl = add(ribbon.spine[0], noseOut)
  ctx.quadraticCurveTo(ctrl.x, ctrl.y, left[0].x, left[0].y)
  ctx.closePath()
}

/**
 * Paint the pattern texture onto the body.
 *
 * The texture is a flat rectangle in `(u, v)` space — imagine the snake unrolled and ironed
 * flat. To get it back onto a curved body we cut it into vertical strips and draw each strip
 * rotated to match its bit of spine. Twenty-ish strips is enough that the curve looks smooth;
 * the whole thing is clipped to the outline so nothing spills over the edges.
 *
 * This is the step that keeps the cost sane. The markings are computed **once** when the
 * phenotype is made, not per pixel per frame — the only per-frame work is moving the strips.
 *
 * @param uOffset scrolls the texture along the body. Used by the animated-drift effect;
 *   leave at 0 and the markings stay put.
 */
export function paintRibbon(
  ctx: CanvasRenderingContext2D,
  ribbon: Ribbon,
  texture: CanvasImageSource,
  textureWidth: number,
  textureHeight: number,
  uOffset = 0,
): void {
  const { spine, us, widths } = ribbon
  const n = spine.length

  ctx.save()
  traceRibbon(ctx, ribbon)
  ctx.clip()

  for (let i = 0; i < n - 1; i++) {
    const p0 = spine[i]
    const p1 = spine[i + 1]
    const segLen = distance(p0, p1)
    if (segLen < 0.01) continue
    // A hair of overlap, or antialiasing leaves hairline gaps between the strips.
    const drawLen = segLen + 1
    const w = Math.max(widths[i], widths[i + 1]) + 1.5
    const angle = angleOf(sub(p1, p0))

    ctx.save()
    ctx.translate(p0.x, p0.y)
    ctx.rotate(angle)
    drawTextureColumn(ctx, texture, textureWidth, textureHeight, us[i] + uOffset, us[i + 1] + uOffset, drawLen, w)
    ctx.restore()
  }

  ctx.restore()
}

/**
 * One strip, in the local frame where +x runs along the body and +y across it.
 *
 * Wrapping is handled by splitting into two draws when the strip straddles the end of the
 * texture. Without that, scrolling markings would smear at the seam.
 */
function drawTextureColumn(
  ctx: CanvasRenderingContext2D,
  texture: CanvasImageSource,
  texW: number,
  texH: number,
  uStart: number,
  uEnd: number,
  destLen: number,
  destWidth: number,
): void {
  const wrap = (x: number): number => x - Math.floor(x)
  const a = wrap(uStart)
  const span = uEnd - uStart
  if (span <= 0) return
  const b = a + span

  if (b <= 1) {
    ctx.drawImage(texture, a * texW, 0, span * texW, texH, 0, -destWidth / 2, destLen, destWidth)
    return
  }
  // Straddles the seam: first piece to the end of the texture, second from the start.
  const firstSpan = 1 - a
  const frac = firstSpan / span
  ctx.drawImage(texture, a * texW, 0, firstSpan * texW, texH, 0, -destWidth / 2, destLen * frac, destWidth)
  ctx.drawImage(
    texture,
    0,
    0,
    (span - firstSpan) * texW,
    texH,
    destLen * frac,
    -destWidth / 2,
    destLen * (1 - frac),
    destWidth,
  )
}

/**
 * Find a point on (or beside) the body from `(u, v)` coordinates.
 *
 * `v` is 0 on the midline and ±1 at the edges, exactly as in the pattern stages — so the eyes
 * can be placed at "5% of the way along, 55% of the way out to the side" and stay put no matter
 * how the body bends.
 */
export function pointOnBody(ribbon: Ribbon, u: number, v: number): Vec2 {
  const { spine, us, widths } = ribbon
  const n = spine.length
  let i = 0
  while (i < n - 2 && us[i + 1] < u) i++
  const span = us[i + 1] - us[i]
  const t = span <= 0 ? 0 : (u - us[i]) / span
  const p = {
    x: spine[i].x + (spine[i + 1].x - spine[i].x) * t,
    y: spine[i].y + (spine[i + 1].y - spine[i].y) * t,
  }
  const w = widths[i] + (widths[i + 1] - widths[i]) * t
  const nrm = perp(ribbon.tangents[i])
  return { x: p.x + nrm.x * (w / 2) * v, y: p.y + nrm.y * (w / 2) * v }
}
