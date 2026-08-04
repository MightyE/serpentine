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

import { angleOf, distance, dot, perp, scale, add, sub, type Vec2 } from './geometry'
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

/**
 * Walk the spine and work out the two edges of the body.
 *
 * ## The edge points are shared, and that is what makes the segments rhomboids
 *
 * There is exactly one `left` and one `right` point per spine point, each offset half the body
 * width along the *smoothed* normal at that point. The smoothing matters: `tangentAt` averages
 * across both neighbours, so a spine that zigzags at the segment scale — which the slither wave
 * does on a short-segmented, fat-bodied animal — produces a smooth pair of rails instead of a row
 * of spikes.
 *
 * Because there is one point per spine point, segment `i` and segment `i + 1` already *share* the
 * edge points at the joint between them. So the quad `left[i] → left[i+1] → right[i+1] → right[i]`
 * is a rhomboid whose end edges are shared exactly with its neighbours, and consecutive rhomboids
 * tile the body with no wedge between them and no overlap.
 *
 * Deliberately **not** mitred to `width / (2·cos(θ/2))` along the angle bisector. That is the
 * textbook stroke join, and it does keep the body's nominal width through a turn — but it derives
 * each edge point from the two raw segment directions rather than the smoothed tangent, so it
 * reproduces every segment-scale kink in the animated spine as a spike. Measured on the render
 * lab, the fat hognose fixtures (body width 3.8× the segment length) turned into sawblades. The
 * gap this file exists to close comes from the edge points being *shared*, which they already are;
 * the miter length only affects how faithfully the body holds its width, and it is not worth a
 * visible sawtooth to buy it. `CLAUDE.md`'s known-limitations entry has the measurements, and
 * `/miter-probe.html` is where the sawtooth shows up — but only in the render lab's *animated*
 * modes, not on the probe's static coil, which is why the probe alone would not have caught it.
 */
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
 * ## Why each strip is clipped to a rhomboid
 *
 * A strip is a rectangle, and rectangles cannot tile a curve. Where two of them met at an angle
 * they overlapped on the inside of the bend and left a **wedge** uncovered on the outside of it,
 * `(w/2)·tan(Δθ/2)` deep. That wedge showed the flat undercoat, and its total area is
 * `≈ ½·(w/2)²·(total turn)` — independent of how many strips there are, so adding spine points
 * never helped.
 *
 * It mattered far more than its size suggests, because a wedge is a slice *across* the body: it
 * leaves a crosswise band merely ragged at one edge, but it cuts a *lengthwise* stripe into
 * dashes with undercoat showing between them. On a dark substrate a dashed stripe reads as a
 * see-through snake.
 *
 * The rectangle was never the shape available, though. {@link buildRibbon} keeps one edge point
 * per spine point, so segment `i` and segment `i + 1` already share the two points at the joint
 * between them: segment `i` owns the rhomboid `left[i] → left[i+1] → right[i+1] → right[i]`, and
 * consecutive rhomboids share an edge *exactly*. So each strip is now **clipped to its own
 * rhomboid** and drawn large enough to fill it. The rhomboids tile the body, so there is nothing
 * left for a wedge to be, and no strip paints over its neighbour's territory either.
 *
 * The texture inside one strip is still mapped affinely — rotated to the segment and scaled — so
 * a constant-`u` line in the texture stays square to its segment rather than following the shared
 * edge, which is the residual shear noted in `CLAUDE.md`. What has gone is the missing area and
 * the double-drawn overlap, not the per-facet approximation. Measured against a ground-truth
 * `(u, v)` ramp, worst-case misregistration on a resting coil drops from 1.7 body-widths — a
 * stripe landing on the wrong side of the animal — to under 0.6, and stops growing with curvature.
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
  const { spine, left, right, us } = ribbon
  const n = spine.length

  ctx.save()
  traceRibbon(ctx, ribbon)
  ctx.clip()

  for (let i = 0; i < n - 1; i++) {
    const p0 = spine[i]
    const p1 = spine[i + 1]
    const segLen = distance(p0, p1)
    if (segLen < 0.01) continue
    // The segment's own direction, which is what the strip is rotated to — not `tangents`, which
    // is smoothed across neighbours and so does not describe this segment's actual heading.
    const dir = scale(sub(p1, p0), 1 / segLen)
    const nrm = perp(dir)

    // The rhomboid this segment owns, nudged a hair past the shared edges at both ends. Two
    // abutting antialiased clip edges do not compose back to full coverage, so exact tiling would
    // leave a faint seam; letting neighbours overlap by a fraction of a pixel does not, and the
    // overlap is covered by texture that is correct to well under a pixel.
    const bleed = scale(dir, EDGE_BLEED)
    const corners = [sub(left[i], bleed), add(left[i + 1], bleed), add(right[i + 1], bleed), sub(right[i], bleed)]

    // How big a rectangle has to be, in the segment's own frame, to cover that rhomboid.
    let minX = 0
    let maxX = segLen
    let halfW = 0
    for (const c of corners) {
      const r = sub(c, p0)
      const x = dot(r, dir)
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      halfW = Math.max(halfW, Math.abs(dot(r, nrm)))
    }
    minX -= 0.5
    maxX += 0.5

    // `u` runs linearly with distance along the segment, so extending the rectangle extends the
    // `u` range by the same rule — the markings stay continuous instead of stretching.
    const uPerPixel = (us[i + 1] - us[i]) / segLen

    ctx.save()
    ctx.beginPath()
    ctx.moveTo(corners[0].x, corners[0].y)
    for (let c = 1; c < corners.length; c++) ctx.lineTo(corners[c].x, corners[c].y)
    ctx.closePath()
    ctx.clip()

    ctx.translate(p0.x, p0.y)
    ctx.rotate(angleOf(dir))
    ctx.translate(minX, 0)
    drawTextureColumn(
      ctx,
      texture,
      textureWidth,
      textureHeight,
      us[i] + minX * uPerPixel + uOffset,
      us[i] + maxX * uPerPixel + uOffset,
      maxX - minX,
      halfW * 2 + 1,
    )
    ctx.restore()
  }

  ctx.restore()
}

/** How far each strip reaches past its shared edges, in logical pixels. See {@link paintRibbon}. */
const EDGE_BLEED = 0.4

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
