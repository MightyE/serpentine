import { describe, expect, it } from 'vitest'
import { rgba } from '../colour'
import type { Phenotype } from '../contract'
import type { Ribbon } from '../ribbon'
import { HOGNOSE_SNOUT_SHAPE, drawUpturnedSnout, hasUpturnedSnout, upturnedSnoutOutline } from './index'

function fixtureRibbon(): Ribbon {
  return {
    spine: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ],
    left: [
      { x: 0, y: 5 },
      { x: 10, y: 5 },
      { x: 20, y: 5 },
    ],
    right: [
      { x: 0, y: -5 },
      { x: 10, y: -5 },
      { x: 20, y: -5 },
    ],
    us: [0, 0.5, 1],
    widths: [8, 10, 6],
    tangents: [
      { x: 1, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 0 },
    ],
    length: 20,
  }
}

function fixturePhenotype(extra: Phenotype['extra'] = {}): Phenotype {
  return {
    seed: 'test-hognose',
    label: 'Test',
    baseColour: rgba(180, 150, 100),
    patternColour: rgba(90, 60, 40),
    bellyColour: rgba(230, 220, 200),
    eye: { irisColour: rgba(100, 80, 50), pupilColour: rgba(10, 10, 10), sizeScale: 1.3, highlight: true },
    body: { lengthScale: 1, girthScale: 1, headScale: 1, taperExponent: 1 },
    effects: [],
    stages: [],
    extra,
  }
}

describe('hasUpturnedSnout', () => {
  it('is false for a phenotype that never set snoutShape', () => {
    expect(hasUpturnedSnout(fixturePhenotype())).toBe(false)
  })

  it('is true only for the hognose snout shape, not an arbitrary string', () => {
    expect(hasUpturnedSnout(fixturePhenotype({ snoutShape: HOGNOSE_SNOUT_SHAPE }))).toBe(true)
    expect(hasUpturnedSnout(fixturePhenotype({ snoutShape: 'something-else' }))).toBe(false)
  })
})

describe('upturnedSnoutOutline', () => {
  it('pokes past the ribbon nose tip, in the direction of travel', () => {
    const ribbon = fixtureRibbon()
    const outline = upturnedSnoutOutline(ribbon)
    expect(outline.tip.x).toBeGreaterThan(ribbon.spine[0].x)
    // Forward of the rounded-nose bulge `traceRibbon` already draws (0.75 * width), not short of it.
    expect(outline.tip.x - ribbon.spine[0].x).toBeGreaterThan(ribbon.widths[0] * 0.75)
  })

  it('is centred on the spine, tip and back both on the midline', () => {
    const ribbon = fixtureRibbon()
    const outline = upturnedSnoutOutline(ribbon)
    expect(outline.tip.y).toBeCloseTo(0, 6)
    expect(outline.back.y).toBeCloseTo(0, 6)
    expect(outline.centre.y).toBeCloseTo(0, 6)
  })

  it("overlaps the ribbon's own rounded nose rather than sitting flush against it", () => {
    const ribbon = fixtureRibbon()
    const outline = upturnedSnoutOutline(ribbon)
    // The back of the bump should land behind the nose tip (or right at it) so the two fills
    // overlap; only the front half is meant to actually poke out past the existing silhouette.
    expect(outline.back.x).toBeLessThan(ribbon.spine[0].x + ribbon.widths[0] * 0.75)
  })
})

describe('drawUpturnedSnout', () => {
  it('never touches the canvas for a phenotype without the hognose snout shape', () => {
    let calls = 0
    const ctx = new Proxy(
      {},
      {
        get: () => {
          calls++
          return () => undefined
        },
      },
    ) as unknown as CanvasRenderingContext2D
    drawUpturnedSnout(ctx, fixtureRibbon(), fixturePhenotype())
    expect(calls).toBe(0)
  })
})
