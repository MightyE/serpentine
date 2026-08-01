import { describe, expect, it } from 'vitest'
import { bodyLength, widthProfile } from '../render/bodyShape'
import { hognose, hognoseRealTraitNotes } from './hognose'
import { cornSnake } from './cornSnake'
import { ballPython } from './ballPython'
import { ReferenceGeneticsEngine } from './testSupport/referenceEngine'
import { makeIndividual, wildTypeGenotype, withLoci } from './testSupport/fixtures'

const engine = new ReferenceGeneticsEngine()

function traitsFor(overrides: Record<string, readonly [string | null, string | null]>) {
  const genotype = withLoci(wildTypeGenotype(hognose, 'male'), overrides)
  return engine.deriveTraits(makeIndividual(hognose, genotype), hognose)
}

describe('hognose: sex determination', () => {
  it('is declared ZW, like the corn snake and unlike the ball python', () => {
    expect(hognose.sexSystem.id).toBe('ZW')
    expect(hognose.sexSystem.heterogameticSex).toBe('female')
    expect(hognose.sexSystem.heterogameticChromosome).toBe('W')
  })
})

describe('hognose: body reads as short and stout next to a corn snake', () => {
  it('is shorter than the corn snake, at the same age', () => {
    expect(bodyLength(hognose.basePhenotype().body)).toBeLessThan(bodyLength(cornSnake.basePhenotype().body))
  })

  it('is thicker relative to its own length than the corn snake is', () => {
    const hognoseProfile = widthProfile(hognose.basePhenotype().body)
    const cornProfile = widthProfile(cornSnake.basePhenotype().body)
    const hognosePeakRatio = hognoseProfile[4].value / bodyLength(hognose.basePhenotype().body)
    const cornPeakRatio = cornProfile[4].value / bodyLength(cornSnake.basePhenotype().body)
    expect(hognosePeakRatio).toBeGreaterThan(cornPeakRatio)
  })

  it('is at least as thick relative to its length as the (already stout) ball python', () => {
    const hognoseProfile = widthProfile(hognose.basePhenotype().body)
    const ballProfile = widthProfile(ballPython.basePhenotype().body)
    const hognosePeakRatio = hognoseProfile[4].value / bodyLength(hognose.basePhenotype().body)
    const ballPeakRatio = ballProfile[4].value / bodyLength(ballPython.basePhenotype().body)
    expect(hognosePeakRatio).toBeGreaterThanOrEqual(ballPeakRatio)
  })

  it('carries the upturned-snout flag every hognose needs, with no trait required to set it', () => {
    expect(hognose.basePhenotype().extra.snoutShape).toBe('hognose-upturned')
  })
})

describe('hognose: albino (simple recessive, T-)', () => {
  it.each([
    [['wild-type', 'wild-type'], false],
    [['wild-type', 'albino'], false],
    [['albino', 'albino'], true],
  ] as const)('albino=%s -> hognoseAlbino=%s', (pair, expected) => {
    expect(traitsFor({ 'hognose-albino': pair }).hognoseAlbino).toBe(expected)
  })

  it('gives red eyes, unlike the T+ forms', () => {
    const affected = engine.express(
      makeIndividual(hognose, withLoci(wildTypeGenotype(hognose, 'male'), { 'hognose-albino': ['albino', 'albino'] })),
      hognose,
    )
    expect(affected.eye.irisColour.r).toBeGreaterThan(affected.eye.irisColour.g + 60)
  })
})

describe('hognose: axanthic (simple recessive)', () => {
  it.each([
    [['wild-type', 'wild-type'], false],
    [['wild-type', 'axanthic'], false],
    [['axanthic', 'axanthic'], true],
  ] as const)('axanthic=%s -> hognoseAxanthic=%s', (pair, expected) => {
    expect(traitsFor({ 'hognose-axanthic': pair }).hognoseAxanthic).toBe(expected)
  })
})

describe('hognose: toffeebelly, lavender, sable, evans hypo (all simple recessive, all independent loci)', () => {
  it.each([
    ['hognose-toffeebelly', 'toffeebelly', 'hognoseToffeebelly'],
    ['hognose-lavender', 'lavender', 'hognoseLavender'],
    ['hognose-sable', 'sable', 'hognoseSable'],
    ['hognose-evans-hypo', 'evans-hypo', 'hognoseEvansHypo'],
  ] as const)('%s is recessive', (locusId, allele, traitKey) => {
    expect(traitsFor({ [locusId]: ['wild-type', 'wild-type'] })[traitKey]).toBe(false)
    expect(traitsFor({ [locusId]: ['wild-type', allele] })[traitKey]).toBe(false)
    expect(traitsFor({ [locusId]: [allele, allele] })[traitKey]).toBe(true)
  })
})

describe('hognose: anaconda / superconda (incomplete dominant, not lethal)', () => {
  it('has three distinct forms: wild-type, one copy, two copies', () => {
    expect(traitsFor({ 'hognose-anaconda': ['wild-type', 'wild-type'] }).hognoseAnacondaForm).toBe('wildType')
    expect(traitsFor({ 'hognose-anaconda': ['wild-type', 'anaconda'] }).hognoseAnacondaForm).toBe('anaconda')
    expect(traitsFor({ 'hognose-anaconda': ['anaconda', 'anaconda'] }).hognoseAnacondaForm).toBe('superconda')
  })

  it('gives the label "Superconda" for the homozygous form, and it stays viable', () => {
    const genotype = withLoci(wildTypeGenotype(hognose, 'male'), {
      'hognose-anaconda': ['anaconda', 'anaconda'],
    })
    const superconda = engine.express(makeIndividual(hognose, genotype), hognose)
    expect(superconda.label).toBe('Superconda')
    expect(engine.checkViability(genotype, hognose).viable).toBe(true)
  })

  it('has no viability rules at all — the model never treats this as lethal', () => {
    expect(hognose.viability).toHaveLength(0)
  })
})

describe('hognose: arctic / superarctic (incomplete dominant, independent of anaconda)', () => {
  it('has three distinct forms: wild-type, one copy, two copies', () => {
    expect(traitsFor({ 'hognose-arctic': ['wild-type', 'wild-type'] }).hognoseArcticForm).toBe('wildType')
    expect(traitsFor({ 'hognose-arctic': ['wild-type', 'arctic'] }).hognoseArcticForm).toBe('arctic')
    expect(traitsFor({ 'hognose-arctic': ['arctic', 'arctic'] }).hognoseArcticForm).toBe('superarctic')
  })

  it('gives the label "Superarctic" for the homozygous form', () => {
    const genotype = withLoci(wildTypeGenotype(hognose, 'male'), { 'hognose-arctic': ['arctic', 'arctic'] })
    expect(engine.express(makeIndividual(hognose, genotype), hognose).label).toBe('Superarctic')
  })
})

describe('every real hognose trait carries a non-empty real-vs-modelled note', () => {
  it('at least five real morphs, each with a note', () => {
    expect(Object.keys(hognoseRealTraitNotes).length).toBeGreaterThanOrEqual(5)
  })

  for (const [locusId, note] of Object.entries(hognoseRealTraitNotes)) {
    it(`${locusId} has a real and a modeled note, both non-empty`, () => {
      expect(note.real.trim().length).toBeGreaterThan(0)
      expect(note.modeled.trim().length).toBeGreaterThan(0)
    })
  }

  it('every note corresponds to an actual locus on the species', () => {
    const locusIds = new Set(hognose.loci.map((l) => l.id))
    for (const locusId of Object.keys(hognoseRealTraitNotes)) {
      expect(locusIds.has(locusId)).toBe(true)
    }
  })
})
