/**
 * What these tests are actually protecting: **the portrait is uniformly scaled**.
 *
 * The bug they were written against drew the animal squashed. `poseSCurve` laid the spine out
 * directly in the destination box's pixels, so the along-body axis was squeezed to fit the box —
 * while `widthProfile` kept handing back girth in the renderer's fixed logical units, unscaled.
 * A 217x197 art window drew a 300-unit snake over a 217-unit arc at full girth: a 1.38x stretch,
 * and worse, a stretch that *changed with the size of the window*, so the same animal came out a
 * different shape in a binder thumbnail than in an opened card.
 *
 * None of that throws, and none of it shows up in a snapshot of a canvas nobody diffs. So the
 * properties are asserted directly on {@link portraitLayout}, which is the geometry seam pulled
 * out of `renderPortrait` for exactly this reason:
 *
 * 1. The spine's arc length is the animal's own body length — no compression along the body.
 * 2. The body's drawn *shape* is identical in every box, whatever that box's aspect ratio.
 *    This is the regression. A per-axis scale fails it immediately.
 * 3. It lands centred, and inside the box.
 *
 * Runs under vitest's `node` environment, so nothing here may touch `document` — which is why it
 * tests the layout rather than calling `renderPortrait`, whose whole job is to make a canvas.
 */

import { describe, expect, it } from 'vitest'
import { bodyLength, widthProfile } from './bodyShape'
import { rgba } from './colour'
import { distance } from './geometry'
import { outlineBounds, portraitLayout } from './portrait'
import type { Phenotype } from './contract'

const SUBJECT: Phenotype = {
  seed: 'portrait-subject',
  label: 'Test snake',
  baseColour: rgba(206, 122, 68),
  patternColour: rgba(140, 44, 38),
  bellyColour: rgba(240, 228, 205),
  eye: { irisColour: rgba(196, 120, 60), pupilColour: rgba(28, 20, 26), sizeScale: 1.3, highlight: true },
  body: { lengthScale: 1, girthScale: 1, headScale: 1.15, taperExponent: 1 },
  effects: [],
  stages: [{ kind: 'base', name: 'solid', params: { colour: '@baseColour' } }],
  extra: {},
}

const longer: Phenotype = { ...SUBJECT, body: { ...SUBJECT.body, lengthScale: 1.3 } }
const stout: Phenotype = { ...SUBJECT, body: { ...SUBJECT.body, girthScale: 1.4 } }

/** Every box the card system actually draws into, plus two deliberately extreme shapes. */
const BOXES: ReadonlyArray<readonly [string, number, number]> = [
  ['default', 220, 140],
  ['binder thumbnail', 217.94, 196.95],
  ['opened card', 350.7, 208.5],
  ['very wide', 480, 90],
  ['very tall', 120, 300],
  ['square', 200, 200],
]

const spineArcLength = (spine: readonly { x: number; y: number }[]): number => {
  let total = 0
  for (let i = 1; i < spine.length; i++) total += distance(spine[i], spine[i - 1])
  return total
}

describe('portrait layout', () => {
  it('poses the spine at the animal’s own body length, not the box’s', () => {
    for (const subject of [SUBJECT, longer, stout]) {
      const expected = bodyLength(subject.body)
      for (const [name, w, h] of BOXES) {
        const arc = spineArcLength(portraitLayout(subject, w, h).ribbon.spine)
        // A 46-point polyline slightly under-measures the curve it samples; 0.5% covers that.
        expect(Math.abs(arc / expected - 1), `${name} @ lengthScale ${subject.body.lengthScale}`).toBeLessThan(0.005)
      }
    }
  })

  it('draws the same shape in every box — one scale factor, not one per axis', () => {
    for (const subject of [SUBJECT, longer, stout]) {
      const shapes = BOXES.map(([, w, h]) => {
        const { ribbon } = portraitLayout(subject, w, h)
        const b = outlineBounds(ribbon)
        return b.width / b.height
      })
      // The pose is size-independent, so every box must produce the identical outline aspect.
      for (const aspect of shapes) expect(aspect).toBeCloseTo(shapes[0], 10)
    }
  })

  it('keeps the animal’s girth-to-length ratio whatever the box', () => {
    for (const subject of [SUBJECT, longer, stout]) {
      const peak = Math.max(...widthProfile(subject.body).map((p) => p.value))
      const intended = peak / bodyLength(subject.body)
      for (const [name, w, h] of BOXES) {
        const { ribbon, zoom } = portraitLayout(subject, w, h)
        // Both measured *as drawn*: girth and length must be multiplied by the same number.
        const drawn = (Math.max(...ribbon.widths) * zoom) / (spineArcLength(ribbon.spine) * zoom)
        expect(drawn, `${name} @ girthScale ${subject.body.girthScale}`).toBeCloseTo(intended, 3)
      }
    }
  })

  it('centres the body in the box and keeps it inside', () => {
    for (const [name, w, h] of BOXES) {
      const { ribbon, zoom, x, y } = portraitLayout(SUBJECT, w, h)
      const b = outlineBounds(ribbon)
      const left = x + b.x * zoom
      const top = y + b.y * zoom
      const right = left + b.width * zoom
      const bottom = top + b.height * zoom

      expect((left + right) / 2, `${name} horizontal centre`).toBeCloseTo(w / 2, 6)
      expect((top + bottom) / 2, `${name} vertical centre`).toBeCloseTo(h / 2, 6)
      expect(left, `${name} left edge`).toBeGreaterThan(0)
      expect(top, `${name} top edge`).toBeGreaterThan(0)
      expect(right, `${name} right edge`).toBeLessThan(w)
      expect(bottom, `${name} bottom edge`).toBeLessThan(h)
    }
  })

  it('scales a bigger animal up, not the box down', () => {
    const small = portraitLayout(SUBJECT, 220, 140)
    const big = portraitLayout(longer, 220, 140)
    // A longer snake in the same box must be drawn at a smaller zoom, and end up the same size
    // on screen — that is what "fit" means. What it must never do is keep its zoom and get fat.
    expect(big.zoom).toBeLessThan(small.zoom)
    expect(outlineBounds(big.ribbon).width * big.zoom).toBeCloseTo(outlineBounds(small.ribbon).width * small.zoom, 6)
  })
})
