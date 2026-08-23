/**
 * Bug eyes: the one deleterious recessive in the pool that the game draws.
 *
 * Two things are under test, and the second matters more than the first.
 *
 * 1. **What it does.** Homozygous animals get doubled eyes; some go blind as adults; the market
 *    pays less. Carriers show nothing at all, which is what makes it a trap worth avoiding.
 * 2. **What it did not disturb.** It is one of the existing sixty recessives, not a sixty-first,
 *    and it is drawn at exactly the same rate as any other. `LOAD_POOL_SIZE`'s doc comment
 *    derives the whole inbreeding-depression signal from `P = 60, k = 3`, and every hatch-rate
 *    invariant in `tuning.test.ts` sits downstream of that. Naming a slot must move no
 *    probability anywhere, and the pool tests below say so directly rather than trusting it.
 */
import { describe, expect, it } from 'vitest'
import { LOAD_POOL_SIZE } from '../genetics/load'
import { estimateValue } from './market'
import { BUG_EYES_LOCUS, isLoadLocus, makeLoadPool } from './loadPool'
import { BLINDNESS_RATE, BUG_EYE_SCALE, applyCongenitalOverlay, hasBugEyes, isBlind } from './congenital'
import { rgba } from '../render/colour'
import type { Phenotype } from '../render/contract'

const SUBJECT: Phenotype = {
  seed: 'congenital-subject',
  label: 'Normal',
  colourMorph: 'Normal',
  patternMorph: 'Normal',
  baseColour: rgba(176, 146, 96),
  patternColour: rgba(92, 62, 40),
  bellyColour: rgba(238, 222, 182),
  eye: { irisColour: rgba(112, 84, 50), pupilColour: rgba(28, 20, 26), sizeScale: 1.3, highlight: true },
  body: { lengthScale: 1, girthScale: 1, headScale: 1.15, taperExponent: 1 },
  effects: [],
  stages: [{ kind: 'base', name: 'solid', params: { colour: '@baseColour' } }],
  extra: {},
}

const AFFECTED = [BUG_EYES_LOCUS]
const CLEAR: readonly string[] = []
const ADULT = 1
const HATCHLING = 0

describe('the bug-eyes recessive sits inside the existing pool', () => {
  const pool = makeLoadPool()

  it('takes one of the sixty slots rather than adding a sixty-first', () => {
    expect(pool.entries).toHaveLength(LOAD_POOL_SIZE)
    expect(pool.entries.filter((e) => e.locus === BUG_EYES_LOCUS)).toHaveLength(1)
  })

  it('is drawn at the same rate as any other recessive — it has no special weighting', () => {
    // Every entry is one entry. `seedFounderLoad` shuffles and takes the first k, so equal
    // representation is equal probability; there is nowhere else a weighting could hide.
    const counts = new Map<string, number>()
    for (const e of pool.entries) counts.set(e.locus, (counts.get(e.locus) ?? 0) + 1)
    expect([...counts.values()].every((n) => n === 1)).toBe(true)
  })

  it('hatches rather than blocking the egg, and reads as a load locus like the rest', () => {
    const entry = pool.entries.find((e) => e.locus === BUG_EYES_LOCUS)!
    expect(entry.outcome).toBe('needsExtraCare')
    expect(isLoadLocus(entry.locus)).toBe(true)
    expect(entry.explanation.length).toBeGreaterThan(40)
  })

  it('leaves the extra-care / egg-does-not-hatch split where it was', () => {
    const care = pool.entries.filter((e) => e.outcome === 'needsExtraCare').length
    // The named slot replaced an extra-care slot, so the split is untouched: half and half.
    expect(care).toBe(LOAD_POOL_SIZE / 2)
  })
})

describe('what bug eyes does to an animal', () => {
  it('does nothing at all to a carrier', () => {
    expect(hasBugEyes(CLEAR)).toBe(false)
    expect(applyCongenitalOverlay(SUBJECT, 'x', CLEAR, ADULT)).toBe(SUBJECT)
  })

  it('doubles the eyes of an affected animal, at any age', () => {
    for (const age of [HATCHLING, 0.5, ADULT]) {
      const shown = applyCongenitalOverlay(SUBJECT, 'quiet-one', AFFECTED, age)
      expect(shown.eye.sizeScale).toBeCloseTo(SUBJECT.eye.sizeScale * BUG_EYE_SCALE, 10)
    }
  })

  it('changes nothing about the animal except its eyes', () => {
    const shown = applyCongenitalOverlay(SUBJECT, 'quiet-one', AFFECTED, ADULT)
    expect({ ...shown, eye: SUBJECT.eye }).toEqual(SUBJECT)
  })

  it('never blinds a hatchling — sight goes as the animal matures, if it goes', () => {
    for (let i = 0; i < 200; i++) {
      expect(isBlind(`hatchling-${i}`, AFFECTED, HATCHLING)).toBe(false)
    }
  })

  it('blinds some adults and not others, near the declared rate', () => {
    const ids = Array.from({ length: 600 }, (_, i) => `adult-${i}`)
    const blind = ids.filter((id) => isBlind(id, AFFECTED, ADULT)).length
    expect(blind / ids.length).toBeGreaterThan(BLINDNESS_RATE - 0.08)
    expect(blind / ids.length).toBeLessThan(BLINDNESS_RATE + 0.08)
  })

  it('gives the same answer every time it is asked about the same animal', () => {
    // Derived from the individual's id, so it needs no save-file field and reloading cannot
    // re-roll it. Two callers asking about one snake must never disagree about whether it sees.
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      const first = isBlind(id, AFFECTED, ADULT)
      for (let i = 0; i < 20; i++) expect(isBlind(id, AFFECTED, ADULT)).toBe(first)
    }
  })

  it('clouds a blind animal’s eyes and takes the catchlight out of them', () => {
    const id = Array.from({ length: 400 }, (_, i) => `s-${i}`).find((x) => isBlind(x, AFFECTED, ADULT))!
    const shown = applyCongenitalOverlay(SUBJECT, id, AFFECTED, ADULT)
    expect(shown.eye.highlight).toBe(false)
    expect(shown.eye.irisColour).not.toEqual(SUBJECT.eye.irisColour)
    // Pale and desaturated, not merely a different hue.
    const { r, g, b } = shown.eye.irisColour
    expect(Math.min(r, g, b)).toBeGreaterThan(140)
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(30)
    // A sighted affected animal keeps its own eye colour and its catchlight.
    const sighted = Array.from({ length: 400 }, (_, i) => `t-${i}`).find((x) => !isBlind(x, AFFECTED, ADULT))!
    expect(applyCongenitalOverlay(SUBJECT, sighted, AFFECTED, ADULT).eye.highlight).toBe(true)
  })
})

describe('the market pays less for it', () => {
  it('prices an affected animal below an unaffected one', () => {
    // Depreciation is not a second lever bolted onto valuation — it falls out of `vigor`, which
    // `estimateValue` already scales by and which already drops per expressed load allele. One
    // expressed recessive is one step down; that is the existing model doing its job.
    const healthy = estimateValue(SUBJECT, { vigor: 1 })
    const affected = estimateValue(SUBJECT, { vigor: 0.75 })
    expect(affected).toBeLessThan(healthy)
  })
})
