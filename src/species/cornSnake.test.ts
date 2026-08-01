import { describe, expect, it } from 'vitest'
import { cornSnake } from './cornSnake'
import { ReferenceGeneticsEngine } from './testSupport/referenceEngine'
import { makeIndividual, wildTypeGenotype, withLoci } from './testSupport/fixtures'

const engine = new ReferenceGeneticsEngine()

function traitsFor(overrides: Record<string, readonly [string | null, string | null]>) {
  const genotype = withLoci(wildTypeGenotype(cornSnake, 'male'), overrides)
  return engine.deriveTraits(makeIndividual(cornSnake, genotype), cornSnake)
}

describe('corn snake: amelanistic (simple recessive)', () => {
  it.each([
    [['wild-type', 'wild-type'], false],
    [['wild-type', 'amel'], false],
    [['amel', 'amel'], true],
  ] as const)('amel=%s -> amelanistic=%s', (pair, expected) => {
    expect(traitsFor({ amel: pair }).amelanistic).toBe(expected)
  })
})

describe('corn snake: anerythristic (simple recessive, independent locus)', () => {
  it.each([
    [['wild-type', 'wild-type'], false],
    [['wild-type', 'anery'], false],
    [['anery', 'anery'], true],
  ] as const)('anery=%s -> anerythristic=%s', (pair, expected) => {
    expect(traitsFor({ anery: pair }).anerythristic).toBe(expected)
  })
})

describe('corn snake: snow (amel + anery double recessive, independent assortment)', () => {
  it('single recessive alone does not produce snow', () => {
    const amelOnly = engine.express(
      makeIndividual(cornSnake, withLoci(wildTypeGenotype(cornSnake, 'male'), { amel: ['amel', 'amel'] })),
      cornSnake,
    )
    expect(amelOnly.label).not.toBe('Snow')
  })

  it('both recessives together produce the distinct "Snow" phenotype', () => {
    const snow = engine.express(
      makeIndividual(
        cornSnake,
        withLoci(wildTypeGenotype(cornSnake, 'male'), { amel: ['amel', 'amel'], anery: ['anery', 'anery'] }),
      ),
      cornSnake,
    )
    expect(snow.label).toBe('Snow')
  })

  it('a het x het x het x het cross produces snow in 1/16 of offspring (independent assortment)', () => {
    const mother = makeIndividual(
      cornSnake,
      withLoci(wildTypeGenotype(cornSnake, 'female'), {
        amel: ['wild-type', 'amel'],
        anery: ['wild-type', 'anery'],
      }),
      'mother',
    )
    const father = makeIndividual(
      cornSnake,
      withLoci(wildTypeGenotype(cornSnake, 'male'), {
        amel: ['wild-type', 'amel'],
        anery: ['wild-type', 'anery'],
      }),
      'father',
    )
    const distribution = engine.punnett(mother, father, cornSnake, { loci: ['amel', 'anery'] })
    // `joint()` returns full genotypes, which include sex — so "snow" shows up as two entries
    // (a snow son and a snow daughter) that must be summed, not one. Sum over both rather than
    // asserting on a single entry.
    const snowProbability = distribution
      .joint(['amel', 'anery'])
      .filter((w) => {
        const amelPair = w.value.loci.amel
        const aneryPair = w.value.loci.anery
        return (
          amelPair?.[0] === 'amel' && amelPair?.[1] === 'amel' && aneryPair?.[0] === 'anery' && aneryPair?.[1] === 'anery'
        )
      })
      .reduce((sum, w) => sum + w.probability, 0)
    expect(snowProbability).toBeCloseTo(1 / 16, 5)
  })
})
