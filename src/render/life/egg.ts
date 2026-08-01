/**
 * The egg.
 *
 * ## An egg is not a tiny snake
 *
 * It would have been much less code to draw a hatchling very small and call it an egg, and it
 * would have been wrong. An egg has to be appealing *on its own*, because in this game it is a
 * thing you look at and wait on, sometimes for a while. It gets its own geometry, its own
 * shading, and its own surface.
 *
 * ## What makes it read as a *snake* egg
 *
 * Not a chicken egg. Four differences, all of them cheap:
 *
 * 1. **Oblong, not tapered.** A bird's egg has a fat end and a pointy end. A snake's is a
 *    rounded oblong, near enough the same at both ends. Getting this wrong is the single most
 *    obvious tell.
 * 2. **Leathery, not glossy.** Colubrid and python eggs are soft-shelled and matte. So: a broad
 *    soft highlight rather than a hard specular dot, and a faint grain over the whole surface.
 * 3. **Dimpled.** Soft shells dent where they rest against each other and against the substrate.
 *    Each dimple is lit backwards from the egg itself — shadowed on the side facing the light,
 *    bright on the far side — which is what makes a dent look concave instead of like a stain.
 * 4. **Slightly translucent.** Held up to a light, a fertile egg glows. Here that shows as a
 *    very faint warm bloom low in the shell.
 *
 * ## What the egg gives away
 *
 * Almost nothing, deliberately. The shell picks up about 6% of the animal's own colour, which
 * is under the threshold at which anyone could reliably call the morph from it — and that is the
 * point. Real keepers cannot tell either. The mystery is the thing the player is here for; an
 * egg that broadcast its contents would delete the best moment in the game.
 *
 * Everything random here comes from the phenotype's seed, so a given egg always looks like
 * itself — the same dimples in the same places, every reload.
 */

import type { Phenotype, Rgba } from '../contract'
import { mix, rgba, toCss } from '../colour'
import type { Vec2 } from '../geometry'
import { makeRng } from '../../lib/rng'

/** One dent in the shell, in the egg's own polar coordinates. */
interface Dimple {
  /** Angle around the egg's long axis, radians. */
  readonly angle: number
  /** Distance from centre, 0..1 of the local radius. */
  readonly radius: number
  /** Dent size, as a fraction of egg length. */
  readonly size: number
  /** 0..1. */
  readonly depth: number
}

/** A faint blotch of discolouration — every real egg has a few. */
interface Blotch {
  readonly angle: number
  readonly radius: number
  readonly size: number
  readonly alpha: number
}

/**
 * Everything about one particular egg's appearance, derived once from its seed.
 *
 * Build it with {@link eggShellFor} and keep it; it is pure data and cheap to hold, and
 * rebuilding it every frame would be wasted work on numbers that never change.
 */
export interface EggShell {
  /** Length ÷ width. Snake eggs run about 1.5–1.9. */
  readonly elongation: number
  /** Low harmonics that push the outline off a perfect ellipse. No real egg is one. */
  readonly bumps: readonly { k: number; amp: number; phase: number }[]
  readonly dimples: readonly Dimple[]
  readonly blotches: readonly Blotch[]
  readonly shellColour: Rgba
  readonly shadowColour: Rgba
  /** The barely-there hint of what is inside. See the file header. */
  readonly innerGlow: Rgba
}

/** Where and how big to draw an egg. */
export interface EggGeometry {
  readonly centre: Vec2
  /** End-to-end length in logical pixels. */
  readonly length: number
  /** Rotation of the long axis, radians. 0 is horizontal. */
  readonly tilt: number
  /** 0 = plump, 1 = fully collapsed after hatching. */
  readonly deflate?: number
}

/** How much of the animal's own colour the shell picks up. Deliberately almost none. */
const HINT_STRENGTH = 0.06

/** Build the fixed appearance of this animal's egg. Same phenotype, same egg, forever. */
export function eggShellFor(phenotype: Phenotype): EggShell {
  const rng = makeRng(phenotype.seed).fork('egg')

  const bumps = [1, 2, 3].map((k) => ({
    k: k + 1,
    amp: rng.range(0.008, 0.028) / k,
    phase: rng.range(0, Math.PI * 2),
  }))

  const dimples: Dimple[] = []
  for (let i = 0, n = rng.int(3, 6); i < n; i++) {
    dimples.push({
      angle: rng.range(0, Math.PI * 2),
      radius: rng.range(0.1, 0.62),
      size: rng.range(0.1, 0.2),
      depth: rng.range(0.35, 0.9),
    })
  }

  const blotches: Blotch[] = []
  for (let i = 0, n = rng.int(2, 5); i < n; i++) {
    blotches.push({
      angle: rng.range(0, Math.PI * 2),
      radius: rng.range(0, 0.7),
      size: rng.range(0.09, 0.24),
      alpha: rng.range(0.03, 0.09),
    })
  }

  // Cream, with a little variation per clutch-mate so a nest of them is not a row of clones.
  const base = rgba(rng.range(238, 248), rng.range(230, 240), rng.range(212, 224))
  return {
    elongation: rng.range(1.5, 1.9),
    bumps,
    dimples,
    blotches,
    shellColour: mix(base, phenotype.baseColour, HINT_STRENGTH),
    shadowColour: rgba(150, 132, 112),
    innerGlow: mix(rgba(255, 208, 168), phenotype.baseColour, HINT_STRENGTH * 2),
  }
}

/**
 * The nest: a shallow depression in the substrate with the egg's shadow in it.
 *
 * Drawn before the egg. Without it the egg floats, and a floating egg reads as an icon rather
 * than as an animal's egg sitting somewhere warm.
 */
export function drawNest(ctx: CanvasRenderingContext2D, geom: EggGeometry): void {
  const { centre, length } = geom
  const rx = length * 0.86
  const ry = length * 0.42

  ctx.save()
  ctx.translate(centre.x, centre.y + length * 0.2)

  // The depression: dark in the middle, fading out — a dip, not a disc.
  const dip = ctx.createRadialGradient(0, 0, length * 0.06, 0, 0, rx)
  dip.addColorStop(0, 'rgba(28, 22, 18, 0.42)')
  dip.addColorStop(0.55, 'rgba(34, 27, 21, 0.2)')
  dip.addColorStop(1, 'rgba(40, 32, 25, 0)')
  ctx.fillStyle = dip
  ctx.beginPath()
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()

  // A rim of pushed-up substrate on the far side, catching the light.
  ctx.strokeStyle = 'rgba(255, 244, 224, 0.07)'
  ctx.lineWidth = Math.max(1, length * 0.03)
  ctx.beginPath()
  ctx.ellipse(0, -ry * 0.16, rx * 0.82, ry * 0.86, 0, Math.PI * 1.08, Math.PI * 1.92)
  ctx.stroke()
  ctx.restore()
}

/**
 * Trace the egg's outline into the current path, in world coordinates.
 *
 * Exported because the hatching sequence needs to clip to it — the emerging hatchling has to be
 * hidden by the shell it has not come out of yet.
 */
export function traceEgg(ctx: CanvasRenderingContext2D, shell: EggShell, geom: EggGeometry): void {
  const half = geom.length / 2
  const squash = 1 - 0.34 * (geom.deflate ?? 0)
  const b = (half / shell.elongation) * squash
  const steps = 72

  ctx.beginPath()
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2
    const wobble = shellWobble(shell, t)
    const local = { x: Math.cos(t) * half * wobble, y: Math.sin(t) * b * wobble }
    const p = toWorld(local, geom)
    if (i === 0) ctx.moveTo(p.x, p.y)
    else ctx.lineTo(p.x, p.y)
  }
  ctx.closePath()
}

/**
 * Draw the egg.
 *
 * Light comes from the upper left, matching the rest of the renderer's shading, so an egg and a
 * snake in the same frame agree about where the sun is.
 */
export function drawEgg(ctx: CanvasRenderingContext2D, shell: EggShell, geom: EggGeometry): void {
  const half = geom.length / 2
  const squash = 1 - 0.34 * (geom.deflate ?? 0)
  const b = (half / shell.elongation) * squash

  ctx.save()
  traceEgg(ctx, shell, geom)
  ctx.clip()

  // Form shading. Offset toward the light, so the far edge falls away — this is what turns an
  // outline into a solid object, and it is doing more work here than any other single line.
  const lit = toWorld({ x: -half * 0.34, y: -b * 0.42 }, geom)
  const form = ctx.createRadialGradient(lit.x, lit.y, geom.length * 0.04, geom.centre.x, geom.centre.y, geom.length * 0.78)
  form.addColorStop(0, toCss(mix(shell.shellColour, rgba(255, 255, 255, 1), 0.45)))
  form.addColorStop(0.42, toCss(shell.shellColour))
  form.addColorStop(1, toCss(mix(shell.shellColour, shell.shadowColour, 0.72)))
  ctx.fillStyle = form
  ctx.fillRect(
    geom.centre.x - geom.length,
    geom.centre.y - geom.length,
    geom.length * 2,
    geom.length * 2,
  )

  // Translucency: light coming *through* the shell from below, pooling low and warm. Faint on
  // purpose — an egg that glows brightly reads as magic, not as biology.
  const deep = toWorld({ x: half * 0.1, y: b * 0.5 }, geom)
  const glow = ctx.createRadialGradient(deep.x, deep.y, 0, deep.x, deep.y, geom.length * 0.5)
  glow.addColorStop(0, toCss({ ...shell.innerGlow, a: 0.3 }))
  glow.addColorStop(1, toCss({ ...shell.innerGlow, a: 0 }))
  ctx.fillStyle = glow
  ctx.fillRect(
    geom.centre.x - geom.length,
    geom.centre.y - geom.length,
    geom.length * 2,
    geom.length * 2,
  )

  for (const blotch of shell.blotches) drawBlotch(ctx, shell, geom, blotch, b, half)
  for (const dimple of shell.dimples) drawDimple(ctx, shell, geom, dimple, b, half)
  drawGrain(ctx, shell, geom)

  // Soft, broad highlight — leather, not porcelain. A hard specular dot here would read as a
  // plastic prop; this is the one place the difference between matte and glossy is decided.
  const spec = toWorld({ x: -half * 0.36, y: -b * 0.46 }, geom)
  const sheen = ctx.createRadialGradient(spec.x, spec.y, 0, spec.x, spec.y, geom.length * 0.3)
  sheen.addColorStop(0, 'rgba(255, 255, 252, 0.4)')
  sheen.addColorStop(0.5, 'rgba(255, 255, 252, 0.12)')
  sheen.addColorStop(1, 'rgba(255, 255, 252, 0)')
  ctx.fillStyle = sheen
  ctx.fillRect(
    geom.centre.x - geom.length,
    geom.centre.y - geom.length,
    geom.length * 2,
    geom.length * 2,
  )

  if (geom.deflate) drawCollapse(ctx, shell, geom)

  ctx.restore()

  // A thin darker edge, drawn outside the clip so it is not half eaten by it.
  ctx.save()
  traceEgg(ctx, shell, geom)
  ctx.lineWidth = Math.max(0.8, geom.length * 0.012)
  ctx.strokeStyle = toCss({ ...mix(shell.shellColour, shell.shadowColour, 0.6), a: 0.5 })
  ctx.stroke()
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Surface detail
// ---------------------------------------------------------------------------

/** Radius multiplier at angle `t` — the low-harmonic lumpiness. */
function shellWobble(shell: EggShell, t: number): number {
  let w = 1
  for (const bump of shell.bumps) w += bump.amp * Math.cos(bump.k * t + bump.phase)
  return w
}

/** Egg-local (x along the long axis, y across) to world. */
function toWorld(local: Vec2, geom: EggGeometry): Vec2 {
  const cos = Math.cos(geom.tilt)
  const sin = Math.sin(geom.tilt)
  return {
    x: geom.centre.x + local.x * cos - local.y * sin,
    y: geom.centre.y + local.x * sin + local.y * cos,
  }
}

/**
 * One dent.
 *
 * Lit **backwards** from the egg as a whole: the side of the dent facing the light is the side
 * that is shadowed, because a concave surface turns away from the light exactly where a convex
 * one turns toward it. Draw both blobs the same way round as the egg's own shading and the
 * dimple pops outward into a blister, which looks unwell rather than characterful.
 */
function drawDimple(
  ctx: CanvasRenderingContext2D,
  shell: EggShell,
  geom: EggGeometry,
  dimple: Dimple,
  b: number,
  half: number,
): void {
  const local = {
    x: Math.cos(dimple.angle) * half * dimple.radius,
    y: Math.sin(dimple.angle) * b * dimple.radius,
  }
  const centre = toWorld(local, geom)
  const r = geom.length * dimple.size
  const off = r * 0.3

  // Shadow on the lit side.
  const shade = ctx.createRadialGradient(centre.x - off, centre.y - off, 0, centre.x - off, centre.y - off, r)
  shade.addColorStop(0, toCss({ ...shell.shadowColour, a: 0.24 * dimple.depth }))
  shade.addColorStop(1, toCss({ ...shell.shadowColour, a: 0 }))
  ctx.fillStyle = shade
  ctx.beginPath()
  ctx.arc(centre.x - off, centre.y - off, r, 0, Math.PI * 2)
  ctx.fill()

  // Catch of light on the far side.
  const catchLight = ctx.createRadialGradient(centre.x + off, centre.y + off, 0, centre.x + off, centre.y + off, r * 0.9)
  catchLight.addColorStop(0, `rgba(255, 253, 244, ${0.2 * dimple.depth})`)
  catchLight.addColorStop(1, 'rgba(255, 253, 244, 0)')
  ctx.fillStyle = catchLight
  ctx.beginPath()
  ctx.arc(centre.x + off, centre.y + off, r * 0.9, 0, Math.PI * 2)
  ctx.fill()
}

/** A soft patch of discolouration. */
function drawBlotch(
  ctx: CanvasRenderingContext2D,
  shell: EggShell,
  geom: EggGeometry,
  blotch: Blotch,
  b: number,
  half: number,
): void {
  const local = {
    x: Math.cos(blotch.angle) * half * blotch.radius,
    y: Math.sin(blotch.angle) * b * blotch.radius,
  }
  const centre = toWorld(local, geom)
  const r = geom.length * blotch.size
  const grad = ctx.createRadialGradient(centre.x, centre.y, 0, centre.x, centre.y, r)
  grad.addColorStop(0, toCss({ ...shell.shadowColour, a: blotch.alpha }))
  grad.addColorStop(1, toCss({ ...shell.shadowColour, a: 0 }))
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(centre.x, centre.y, r, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * Fine grain over the whole shell.
 *
 * Drawn as short strokes rather than dots: a leathery surface has direction to it, and dots
 * read as dirt. Cheap — a few dozen 1px lines inside an existing clip.
 */
function drawGrain(ctx: CanvasRenderingContext2D, shell: EggShell, geom: EggGeometry): void {
  const rng = makeRng(`${shell.elongation}`).fork('grain')
  const half = geom.length / 2
  ctx.save()
  ctx.lineWidth = Math.max(0.5, geom.length * 0.006)
  ctx.strokeStyle = toCss({ ...shell.shadowColour, a: 0.07 })
  ctx.beginPath()
  for (let i = 0; i < 46; i++) {
    const a = rng.range(0, Math.PI * 2)
    const rad = Math.sqrt(rng.next()) * 0.92
    const p = toWorld(
      { x: Math.cos(a) * half * rad, y: (Math.sin(a) * half * rad) / shell.elongation },
      geom,
    )
    const len = geom.length * rng.range(0.02, 0.06)
    const dir = geom.tilt + rng.range(-0.5, 0.5)
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(p.x + Math.cos(dir) * len, p.y + Math.sin(dir) * len)
  }
  ctx.stroke()
  ctx.restore()
}

/**
 * The creases of a spent shell.
 *
 * After a hatchling leaves, the shell does not stay egg-shaped — it slumps, and the slump is
 * most of what makes a finished hatch read as finished.
 */
function drawCollapse(ctx: CanvasRenderingContext2D, shell: EggShell, geom: EggGeometry): void {
  const amount = geom.deflate ?? 0
  const half = geom.length / 2
  const b = half / shell.elongation
  ctx.save()
  ctx.globalAlpha = 0.3 * amount
  ctx.strokeStyle = toCss(mix(shell.shellColour, shell.shadowColour, 0.85))
  ctx.lineWidth = Math.max(0.8, geom.length * 0.014)
  ctx.beginPath()
  for (const at of [-0.42, -0.05, 0.36]) {
    const top = toWorld({ x: half * at, y: -b * 0.9 }, geom)
    const mid = toWorld({ x: half * (at + 0.12), y: 0 }, geom)
    const low = toWorld({ x: half * (at - 0.06), y: b * 0.9 }, geom)
    ctx.moveTo(top.x, top.y)
    ctx.quadraticCurveTo(mid.x, mid.y, low.x, low.y)
  }
  ctx.stroke()
  ctx.restore()
}
