/**
 * The face. This file is where "cute" actually happens.
 *
 * ## Why this gets its own file and a lot of care
 *
 * A snake drawn accurately reads as *dangerous* to most people, and Serpentine is a game about
 * looking after animals, not being frightened of them. Almost none of the difference is in the
 * body — it is four decisions about the head:
 *
 * 1. **Eyes bigger than they should be.** Oversized eyes on a rounded head is the single most
 *    reliable cuteness signal there is; it is the same cue that makes kittens and human babies
 *    work, and it holds across species. `EyeAppearance.sizeScale` defaults above 1 for exactly
 *    this reason.
 * 2. **A catchlight.** One small off-centre white dot. It costs one `arc()` and it is the
 *    difference between "alive" and "taxidermy". Turning it off is a genuinely useful tool if
 *    you ever want a snake to look eerie.
 * 3. **A round pupil, not a slit.** Slit pupils are a real feature of many snakes and they read
 *    as predatory to almost everyone. Round pupils read as friendly. This is a deliberate
 *    departure from accuracy; the game says so out loud rather than pretending otherwise.
 * 4. **Blinking.** Real snakes have no eyelids — they cannot blink at all. We do it anyway,
 *    because a face that never changes reads as dead, and because a blink is what makes a
 *    player feel noticed. Another deliberate, declared departure.
 *
 * The tongue is the counterweight: it is the one unmistakably snake thing on the face, and its
 * timing does more for "this animal is alive and interested" than any amount of body motion.
 */

import type { EyeAppearance, Phenotype } from './contract'
import { lighten, mix, rgba, toCss } from './colour'
import { perp, scale, add, type Vec2 } from './geometry'
import { pointOnBody, type Ribbon } from './ribbon'

/** Where along the body the eyes sit. Just behind the snout, on the widest part of the head. */
const EYE_U = 0.062
/** How far out toward the side of the head. Snake eyes really are set high and wide. */
const EYE_V = 0.46

/** Animation state the face needs, computed by {@link SnakeView} and handed in. */
export interface FaceState {
  /** 0 = wide open, 1 = fully shut. */
  readonly blink: number
  /** 0 = tongue hidden, 1 = fully extended. */
  readonly tongue: number
}

/**
 * Draw the eyes and, if it is out, the tongue.
 *
 * Call this after the body, so the face sits on top of the markings.
 */
export function drawFace(
  ctx: CanvasRenderingContext2D,
  ribbon: Ribbon,
  phenotype: Phenotype,
  state: FaceState,
): void {
  if (state.tongue > 0.001) drawTongue(ctx, ribbon, phenotype, state.tongue)
  drawEye(ctx, ribbon, phenotype.eye, EYE_V, state.blink)
  drawEye(ctx, ribbon, phenotype.eye, -EYE_V, state.blink)
}

function headWidth(ribbon: Ribbon): number {
  // The width where the eyes are, which is very nearly the widest part of the head.
  let i = 0
  while (i < ribbon.us.length - 1 && ribbon.us[i] < EYE_U) i++
  return ribbon.widths[i]
}

function drawEye(
  ctx: CanvasRenderingContext2D,
  ribbon: Ribbon,
  eye: EyeAppearance,
  v: number,
  blink: number,
): void {
  const centre = pointOnBody(ribbon, EYE_U, v * 0.72)
  // Sized so a default `sizeScale` eye just about fills the side of the head and bulges very
  // slightly past the outline — which is both what a real snake's eye does and what reads as
  // "big eyes". Push `sizeScale` higher for hatchlings.
  const radius = headWidth(ribbon) * 0.23 * eye.sizeScale
  if (radius < 0.4) return

  // The eye squashes vertically as it closes, in the head's own frame — so a blink still looks
  // right when the snake is facing any direction.
  const along = ribbon.tangents[0]
  const angle = Math.atan2(along.y, along.x)
  const open = Math.max(0.06, 1 - blink)

  ctx.save()
  ctx.translate(centre.x, centre.y)
  ctx.rotate(angle)
  ctx.scale(1, open)

  // A dark rim gives the eye an edge against a light-coloured head.
  ctx.fillStyle = toCss(mix(eye.pupilColour, rgba(0, 0, 0, 1), 0.25))
  ctx.beginPath()
  ctx.arc(0, 0, radius * 1.16, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = toCss(eye.irisColour)
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, Math.PI * 2)
  ctx.fill()

  // Round, not slit. See the note at the top of the file.
  ctx.fillStyle = toCss(eye.pupilColour)
  ctx.beginPath()
  ctx.arc(0, 0, radius * 0.52, 0, Math.PI * 2)
  ctx.fill()

  if (eye.highlight) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)'
    ctx.beginPath()
    ctx.arc(radius * 0.34, -radius * 0.34, radius * 0.3, 0, Math.PI * 2)
    ctx.fill()
    // A second, smaller catchlight opposite the first. Two lights read as a wet, rounded
    // surface; one alone can look like a painted dot.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)'
    ctx.beginPath()
    ctx.arc(-radius * 0.36, radius * 0.3, radius * 0.15, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}

/**
 * The forked tongue, flicking out from the tip of the snout.
 *
 * Drawn as three short lines: a stem and two tips that spread as it extends. The spread is what
 * sells it — a fork that is already open when it appears looks like a drawing, whereas one that
 * opens as it comes out looks like something the animal is doing.
 */
function drawTongue(ctx: CanvasRenderingContext2D, ribbon: Ribbon, phenotype: Phenotype, extend: number): void {
  const snout = ribbon.spine[0]
  const dir = ribbon.tangents[0]
  const side = perp(dir)
  const w = headWidth(ribbon)

  const stemLen = w * 0.55 * extend
  const forkLen = w * 0.5 * extend
  const spread = w * 0.3 * extend * extend

  const start: Vec2 = add(snout, scale(dir, w * 0.28))
  const knee: Vec2 = add(start, scale(dir, stemLen))
  const tipA: Vec2 = add(add(knee, scale(dir, forkLen)), scale(side, spread))
  const tipB: Vec2 = add(add(knee, scale(dir, forkLen)), scale(side, -spread))

  ctx.save()
  ctx.strokeStyle = toCss(lighten(mix(phenotype.patternColour, rgba(220, 60, 90, 1), 0.75), 0.05))
  ctx.lineWidth = Math.max(1, w * 0.09)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(start.x, start.y)
  ctx.lineTo(knee.x, knee.y)
  ctx.moveTo(knee.x, knee.y)
  ctx.lineTo(tipA.x, tipA.y)
  ctx.moveTo(knee.x, knee.y)
  ctx.lineTo(tipB.x, tipB.y)
  ctx.stroke()
  ctx.restore()
}
