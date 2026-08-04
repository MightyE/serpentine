/**
 * What these tests are protecting: **the rim shade has a sign, and the sign follows the animal**.
 *
 * The bug they were written against was an absolute rim — 40% of the way toward `rgba(20, 14, 24)`
 * at 22%, whatever the base colour was. On a dark morph that made the outline the darkest part of
 * the animal, which is the opposite of the tube-rounding illusion it exists to produce, and on a
 * dark substrate it left the silhouette with no contrast in it. The animal read as see-through
 * while being a provably opaque fill. The full measurements are in the devlog entry for
 * 2026-08-04 and in `edge-contrast-probe.html`.
 *
 * Nothing here draws. `drawRoundness` needs a canvas and vitest runs under the `node`
 * environment, so the decision it makes is tested at the seam it was pulled out to —
 * {@link rimStroke} — which is also the only part `snake.ts` and the life views have to agree on.
 */

import { describe, expect, it } from 'vitest'
import { luminance, rgba } from '../colour'
import { FIXTURES } from '../lab/fixtures'
import { RIM_SHADE, rimStroke } from './paint'

/** Where the rim actually lands once its alpha is composited over the body it is stroked onto. */
function rimAgainst(base: ReturnType<typeof rgba>): number {
  const rim = rimStroke(base)
  return luminance(base) * (1 - rim.alpha) + luminance(rim.colour) * rim.alpha
}

describe('rimStroke', () => {
  it('lightens a dark base and darkens a pale one', () => {
    const dark = rgba(38, 34, 66)
    const pale = rgba(232, 226, 220)
    expect(rimAgainst(dark)).toBeGreaterThan(luminance(dark))
    expect(rimAgainst(pale)).toBeLessThan(luminance(pale))
  })

  it('shades every shipped fixture by enough to see', () => {
    // Not a threshold anyone tuned — it is well under the ~0.04 the weakest fixture gets, and it
    // fails the moment an `amount` or an `alpha` is zeroed and the rim quietly stops existing.
    for (const fixture of FIXTURES) {
      const shift = Math.abs(rimAgainst(fixture.baseColour) - luminance(fixture.baseColour))
      expect(shift, `${fixture.label} has no rim`).toBeGreaterThan(0.01)
    }
  })

  it('puts no shipped base colour near the flip, where the sign is arbitrary', () => {
    // The direction is a step, deliberately (see RIM_SHADE). A step is only safe while nothing
    // authored sits on it: two fixtures either side of a hair-thin margin would shade oppositely
    // for no reason a player could see. If a new fixture trips this, move the flip, don't widen it.
    for (const fixture of FIXTURES) {
      const gap = Math.abs(luminance(fixture.baseColour) - RIM_SHADE.flip)
      expect(gap, `${fixture.label} sits on the flip`).toBeGreaterThan(0.05)
    }
  })

  it('is a pure function of the base colour', () => {
    // `drawRoundness` is called once per animal per frame; anything stateful here would show up as
    // a rim that changes while you watch it.
    const base = rgba(58, 84, 66)
    expect(rimStroke(base)).toEqual(rimStroke(base))
  })
})
