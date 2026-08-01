/**
 * `modifier` stage — remove the dark pigment.
 *
 * ## What it actually models
 *
 * Amelanism ("albino" in the hobby) is a broken step in the pathway that makes melanin, the
 * black-brown pigment. Nothing else is affected: the reds and yellows are made by a different
 * pigment and stay exactly where they were. The pattern is still there — you can still see the
 * saddles — it is just rendered in what is left once you take the black out.
 *
 * That is why this is a `modifier` and not a pattern. It is an operation performed on whatever
 * colour it is handed, so it works on stripes, blotches, speckles, and anything anyone adds
 * later, without any of them knowing it exists. One stage, every combination.
 *
 * ## How it is done here
 *
 * In HSL, "how much melanin" is mostly darkness, and "which non-melanin pigment" is mostly hue.
 * So: lift the darks a long way toward light, pull the hue toward the warm yellow-orange band,
 * and keep the saturation up. Dark browns become butter and coral; a colour that was already
 * pale barely moves — which is correct, because there was not much melanin in it to remove.
 */

import type { StageDefinition } from '../contract'
import { clamp01, fromHsl, lerp, smoothstep, toHsl } from '../colour'

type AlbinoParams = {
  /** 0 changes nothing, 1 is full amelanism. Between the two is a reasonable stand-in for
   *  "hypomelanistic" — reduced, not absent. */
  readonly amount: number
  /** Where the remaining pigment sits on the colour wheel. ~45° is butter/amber; ~15° is coral. */
  readonly warmHue: number
}

export const albinoStage: StageDefinition<AlbinoParams> = {
  kind: 'modifier',
  name: 'albino',
  describe: 'Removes the black-brown pigment, leaving only the warm colours underneath.',
  defaults: {
    amount: 1,
    warmHue: 45,
  },
  render: (_u, _v, incoming, params) => {
    const hsl = toHsl(incoming)

    // Skip anything that is already near-white. A piebald patch has no pigment cells in it at
    // all, so there is no melanin there to remove — an albino piebald has exactly the same
    // white patches as a normal piebald. Without this line the modifier tints them, which looks
    // wrong and, worse, teaches something false about what the two mutations are doing.
    const pigment = 1 - smoothstep(0.82, 0.97, hsl.l)
    const amount = clamp01(params.amount) * pigment
    if (amount <= 0.001) return incoming

    // Hue: rotate the short way around the wheel toward the warm band.
    let delta = params.warmHue - hsl.h
    while (delta > 180) delta -= 360
    while (delta < -180) delta += 360
    const h = hsl.h + delta * amount * 0.85

    // Lightness: darks lift a long way, things that were already pale barely move.
    const l = lerp(hsl.l, 0.55 + 0.4 * hsl.l, amount)

    // Saturation: amelanistic animals are famously vivid, not washed out.
    const s = lerp(hsl.s, clamp01(0.35 + hsl.s * 0.7), amount)

    return fromHsl({ h, s, l, a: hsl.a })
  },
}
