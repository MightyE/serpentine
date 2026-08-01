/**
 * Tests for exact offspring probability.
 *
 * Every locus and allele here is invented and generic — `variant-a`, not any real trait. The
 * engine must never learn what a snake is, and neither must its tests.
 *
 * These assert *exact* numbers, because that is the claim the module makes. A sampling engine
 * would need `toBeCloseTo(0.25, 2)` and a comment apologising for it. Where `toBeCloseTo` does
 * appear below it is only because thirds are not representable in binary floating point.
 */

import { describe, expect, it } from 'vitest'
import { carrierProbability, conditionOn, punnett } from './distribution'
import { express } from './expression'
import { genotypeKey, makeGenotype } from './genotype'
import type {
  Individual,
  Locus,
  LocusPlacement,
  ModifierRule,
  Sex,
  SexSystem,
  SpeciesDefinition,
  ViabilityRule,
  Weighted,
} from './types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const XY: SexSystem = {
  id: 'XY',
  homogameticChromosome: 'X',
  heterogameticChromosome: 'Y',
  heterogameticSex: 'male',
}

const ZW: SexSystem = {
  id: 'ZW',
  homogameticChromosome: 'Z',
  heterogameticChromosome: 'W',
  heterogameticSex: 'female',
}

/** A phenotype is whatever the species says it is; here, a bag of named appearances. */
type TestPhenotype = Record<string, string>

/**
 * A plain recessive locus: two copies of the variant to show it, one copy to carry it silently.
 *
 * The hemizygous row matters for the sex-linked cases — an animal with a single copy and no
 * second chromosome to mask it *shows* the trait, which is why sex-linked recessives turn up
 * so lopsidedly in one sex.
 */
function recessiveLocus(id: string, variant: string, placement: LocusPlacement): Locus {
  return {
    id,
    label: id,
    placement,
    alleles: [
      { id: 'wild-type', label: 'Wild type', origin: 'wild-type' },
      { id: variant, label: variant, origin: 'authored', invented: true },
    ],
    wildType: 'wild-type',
    expression: {
      kind: 'table',
      entries: {
        [`${variant}/${variant}`]: { [`${id}Look`]: 'affected' },
        [variant]: { [`${id}Look`]: 'affected' },
      },
      otherwise: { [`${id}Look`]: 'normal' },
    },
  }
}

/** Three visibly distinct genotypes at one locus — the shape a lethal super form needs. */
function incompleteDominantLocus(id: string, variant: string): Locus {
  return {
    id,
    label: id,
    placement: { kind: 'autosomal' },
    alleles: [
      { id: 'wild-type', label: 'Wild type', origin: 'wild-type' },
      { id: variant, label: variant, origin: 'authored', invented: true },
    ],
    wildType: 'wild-type',
    expression: {
      kind: 'table',
      entries: {
        [`${variant}/${variant}`]: { [`${id}Look`]: 'double' },
        [`${variant}/wild-type`]: { [`${id}Look`]: 'single' },
      },
      otherwise: { [`${id}Look`]: 'normal' },
    },
  }
}

function makeSpecies(options: {
  id?: string
  loci: readonly Locus[]
  sexSystem?: SexSystem
  viability?: readonly ViabilityRule[]
  modifiers?: readonly ModifierRule<TestPhenotype>[]
}): SpeciesDefinition<TestPhenotype> {
  return {
    id: options.id ?? 'test-organism',
    label: 'Test organism',
    sexSystem: options.sexSystem ?? XY,
    loci: options.loci,
    polygenic: [],
    basePhenotype: () => ({}),
    projections: options.loci.map((locus) => ({
      key: `${locus.id}Look`,
      apply: (draft: TestPhenotype, value: unknown) => {
        draft[locus.id] = String(value)
      },
    })),
    modifiers: options.modifiers ?? [],
    viability: options.viability ?? [],
    phenotypeKey: (p) =>
      Object.keys(p)
        .sort()
        .map((k) => `${k}:${p[k]}`)
        .join(' '),
    phenotypeLabel: (p) =>
      Object.keys(p)
        .sort()
        .map((k) => `${k} ${p[k]}`)
        .join(', '),
  }
}

function animal(
  id: string,
  species: SpeciesDefinition<TestPhenotype>,
  sex: Sex,
  overrides: Record<string, [string | null, string | null]> = {},
): Individual {
  return {
    id,
    species: species.id,
    genotype: makeGenotype(species, sex, overrides),
    parents: null,
    mutations: [],
  }
}

/**
 * The phenotype key an animal of this exact genotype would have.
 *
 * Tests look their expectations up this way rather than writing the string out, so that a test
 * asserting "two thirds of the normal-looking ones are carriers" cannot accidentally become a
 * test asserting something about a hard-coded string.
 */
function keyOf(
  species: SpeciesDefinition<TestPhenotype>,
  sex: Sex,
  overrides: Record<string, [string | null, string | null]> = {},
): string {
  return species.phenotypeKey(express(animal('probe', species, sex, overrides), species))
}

function probabilityOfKey(outcomes: readonly Weighted<{ key: string }>[], key: string): number {
  return outcomes.find((o) => o.value.key === key)?.probability ?? 0
}

function probabilityOfPair(
  outcomes: readonly Weighted<readonly [string | null, string | null]>[],
  key: string,
): number {
  return outcomes.find((o) => genotypeKey(o.value) === key)?.probability ?? 0
}

const alpha = recessiveLocus('alpha', 'variant-a', { kind: 'autosomal' })
const beta = recessiveLocus('beta', 'variant-b', { kind: 'autosomal' })

const monoSpecies = makeSpecies({ loci: [alpha] })
const diSpecies = makeSpecies({ loci: [alpha, beta] })

// ---------------------------------------------------------------------------

describe('punnett — the textbook cases', () => {
  it('gives a monohybrid cross 1 : 2 : 1 genotypes and 3 : 1 phenotypes', () => {
    const het: Record<string, [string, string]> = { alpha: ['variant-a', 'wild-type'] }
    const distribution = punnett(
      animal('mother', monoSpecies, 'female', het),
      animal('father', monoSpecies, 'male', het),
      monoSpecies,
    )

    const marginal = distribution.lociMarginals['alpha']!
    expect(probabilityOfPair(marginal, 'variant-a/variant-a')).toBe(0.25)
    expect(probabilityOfPair(marginal, 'variant-a/wild-type')).toBe(0.5)
    expect(probabilityOfPair(marginal, 'wild-type/wild-type')).toBe(0.25)
    expect(marginal.reduce((s, o) => s + o.probability, 0)).toBe(1)

    const phenotypes = distribution.phenotypes()
    expect(probabilityOfKey(phenotypes, keyOf(monoSpecies, 'female', het))).toBe(0.75)
    expect(
      probabilityOfKey(
        phenotypes,
        keyOf(monoSpecies, 'female', { alpha: ['variant-a', 'variant-a'] }),
      ),
    ).toBe(0.25)

    // Nothing here is lethal, so nothing is lost between conception and hatching.
    expect(distribution.nonViableProbability).toBe(0)
    expect(distribution.nonViableReasons).toEqual([])
    expect(distribution.sexRatio).toEqual({ male: 0.5, female: 0.5 })
  })

  it('gives a carrier × clear cross a straight 50/50 and nothing visible', () => {
    const distribution = punnett(
      animal('mother', monoSpecies, 'female', { alpha: ['variant-a', 'wild-type'] }),
      animal('father', monoSpecies, 'male'),
      monoSpecies,
    )

    expect(carrierProbability(distribution, 'alpha', 'variant-a')).toBe(0.5)
    expect(
      probabilityOfKey(
        distribution.phenotypes(),
        keyOf(monoSpecies, 'female', { alpha: ['variant-a', 'variant-a'] }),
      ),
    ).toBe(0)
  })

  it('factors a dihybrid cross into independent loci and still gets 9 : 3 : 3 : 1', () => {
    const both: Record<string, [string, string]> = {
      alpha: ['variant-a', 'wild-type'],
      beta: ['variant-b', 'wild-type'],
    }
    const distribution = punnett(
      animal('mother', diSpecies, 'female', both),
      animal('father', diSpecies, 'male', both),
      diSpecies,
    )

    // Unlinked loci are independent, so each marginal is the monohybrid answer, unchanged.
    for (const locus of ['alpha', 'beta']) {
      const marginal = distribution.lociMarginals[locus]!
      expect(marginal.reduce((s, o) => s + o.probability, 0)).toBe(1)
      expect(marginal.find((o) => genotypeKey(o.value).split('/').length === 2)).toBeDefined()
    }
    expect(carrierProbability(distribution, 'alpha', 'variant-a')).toBe(0.75)
    expect(carrierProbability(distribution, 'beta', 'variant-b')).toBe(0.75)

    // ...and "independent" is reported, not just assumed.
    expect(distribution.interactionGroups.map((g) => [...g].sort())).toEqual([['alpha'], ['beta']])

    const phenotypes = distribution.phenotypes()
    expect(probabilityOfKey(phenotypes, keyOf(diSpecies, 'female', both))).toBe(9 / 16)
    expect(
      probabilityOfKey(
        phenotypes,
        keyOf(diSpecies, 'female', { alpha: ['variant-a', 'variant-a'] }),
      ),
    ).toBe(3 / 16)
    expect(
      probabilityOfKey(phenotypes, keyOf(diSpecies, 'female', { beta: ['variant-b', 'variant-b'] })),
    ).toBe(3 / 16)
    expect(
      probabilityOfKey(
        phenotypes,
        keyOf(diSpecies, 'female', {
          alpha: ['variant-a', 'variant-a'],
          beta: ['variant-b', 'variant-b'],
        }),
      ),
    ).toBe(1 / 16)

    // The joint is exact and complete: 3 genotypes × 3 genotypes × 2 sexes.
    const joint = distribution.joint(['alpha', 'beta'])
    expect(joint).toHaveLength(18)
    expect(joint.reduce((s, o) => s + o.probability, 0)).toBeCloseTo(1, 12)
  })

  it('groups loci that a modifier rule reads together', () => {
    const epistatic = makeSpecies({
      loci: [alpha, beta],
      modifiers: [
        {
          id: 'combined',
          label: 'Combined effect',
          describe: 'The two loci together produce one appearance.',
          reads: ['alpha', 'beta'],
          apply: () => {},
        },
      ],
    })
    const distribution = punnett(
      animal('mother', epistatic, 'female'),
      animal('father', epistatic, 'male'),
      epistatic,
    )
    expect(distribution.interactionGroups).toEqual([['alpha', 'beta']])
  })
})

describe('punnett — sex-linkage', () => {
  const gamma = recessiveLocus('gamma', 'variant-g', { kind: 'sexLinked', chromosome: 'X' })
  const xySpecies = makeSpecies({ loci: [gamma], sexSystem: XY })

  it('produces different probabilities for sons and daughters', () => {
    // A carrier mother, a clear father. Her sons get their only copy from her.
    const distribution = punnett(
      animal('mother', xySpecies, 'female', { gamma: ['variant-g', 'wild-type'] }),
      animal('father', xySpecies, 'male'),
      xySpecies,
    )

    expect(distribution.sexRatio).toEqual({ male: 0.5, female: 0.5 })

    const affectedMale = keyOf(xySpecies, 'male', { gamma: ['variant-g', null] })
    const sons = conditionOn(distribution, { kind: 'sex', sex: 'male' })
    const daughters = conditionOn(distribution, { kind: 'sex', sex: 'female' })

    expect(probabilityOfKey(sons.phenotypes(), affectedMale)).toBe(0.5)
    expect(probabilityOfKey(daughters.phenotypes(), affectedMale)).toBe(0)

    // Half the daughters carry it invisibly — the same 50%, expressed differently.
    expect(carrierProbability(daughters, 'gamma', 'variant-g')).toBe(0.5)
    expect(carrierProbability(sons, 'gamma', 'variant-g')).toBe(0.5)
  })

  it('mirrors itself under ZW, with the sexes swapped and no code that knows which is which', () => {
    const zLinked = recessiveLocus('gammaZ', 'variant-g', { kind: 'sexLinked', chromosome: 'Z' })
    const zwSpecies = makeSpecies({ loci: [zLinked], sexSystem: ZW })

    // The heterogametic parent is the *mother* here, and she has a single copy of the variant.
    const distribution = punnett(
      animal('mother', zwSpecies, 'female', { gammaZ: ['variant-g', null] }),
      animal('father', zwSpecies, 'male'),
      zwSpecies,
    )

    // Every son inherits her Z; no daughter does. Exactly the XY case with the sexes exchanged.
    expect(carrierProbability(conditionOn(distribution, { kind: 'sex', sex: 'male' }), 'gammaZ', 'variant-g')).toBe(1)
    expect(
      carrierProbability(conditionOn(distribution, { kind: 'sex', sex: 'female' }), 'gammaZ', 'variant-g'),
    ).toBe(0)
  })
})

describe('punnett — eggs that do not hatch', () => {
  const delta = incompleteDominantLocus('delta', 'variant-d')
  const lethalRule: ViabilityRule = {
    id: 'double-delta',
    label: 'Double delta',
    involves: ['delta'],
    explanation: 'Two copies of variant-d together stop development, so the egg does not hatch.',
    isNonViable: (genotype) => genotypeKey(genotype.loci['delta']!) === 'variant-d/variant-d',
  }
  const lethalSpecies = makeSpecies({ loci: [delta], viability: [lethalRule] })

  it('removes them from the hatched ratios, reports them separately, and renormalises to 1', () => {
    const single: Record<string, [string, string]> = { delta: ['variant-d', 'wild-type'] }
    const distribution = punnett(
      animal('mother', lethalSpecies, 'female', single),
      animal('father', lethalSpecies, 'male', single),
      lethalSpecies,
    )

    expect(distribution.nonViableProbability).toBe(0.25)
    expect(distribution.nonViableReasons).toEqual([
      { value: lethalRule.explanation, probability: 0.25 },
    ])

    // The Punnett square says 1 : 2 : 1. The nest box says 2 : 1, because a quarter of the eggs
    // are not in it. Noticing that gap is historically how breeders inferred a lethal form
    // exists at all, so both numbers have to be available at once.
    const marginal = distribution.lociMarginals['delta']!
    expect(probabilityOfPair(marginal, 'variant-d/variant-d')).toBe(0)
    expect(probabilityOfPair(marginal, 'variant-d/wild-type')).toBeCloseTo(2 / 3, 12)
    expect(probabilityOfPair(marginal, 'wild-type/wild-type')).toBeCloseTo(1 / 3, 12)
    expect(marginal.reduce((s, o) => s + o.probability, 0)).toBeCloseTo(1, 12)

    const phenotypes = distribution.phenotypes()
    expect(phenotypes.reduce((s, o) => s + o.probability, 0)).toBeCloseTo(1, 12)
    expect(probabilityOfKey(phenotypes, keyOf(lethalSpecies, 'female', single))).toBeCloseTo(
      2 / 3,
      12,
    )
  })

  it('couples a lethal locus to the sex draw, so the ratios stay honest', () => {
    // A viability rule is handed the animal's sex, so its locus and the sex draw are computed
    // jointly whether or not the rule turns out to use it.
    const distribution = punnett(
      animal('mother', lethalSpecies, 'female', { delta: ['variant-d', 'wild-type'] }),
      animal('father', lethalSpecies, 'male', { delta: ['variant-d', 'wild-type'] }),
      lethalSpecies,
    )
    expect(distribution.interactionGroups).toEqual([['delta']])
    expect(distribution.sexRatio.male + distribution.sexRatio.female).toBeCloseTo(1, 12)
  })
})

describe('conditionOn and carrierProbability — where "66% het" comes from', () => {
  const het: Record<string, [string, string]> = { alpha: ['variant-a', 'wild-type'] }

  it('makes a normal-looking offspring of two carriers exactly two thirds likely to carry', () => {
    const distribution = punnett(
      animal('mother', monoSpecies, 'female', het),
      animal('father', monoSpecies, 'male', het),
      monoSpecies,
    )

    // Look at the hatchling: it looks normal. That is the whole observation.
    const looksNormal = keyOf(monoSpecies, 'female')
    const observed = conditionOn(distribution, { kind: 'phenotype', phenotypeKey: looksNormal })
    const carrier = carrierProbability(observed, 'alpha', 'variant-a')

    // Of four equally likely outcomes, one was visibly affected and is eliminated by looking at
    // the animal. Two of the three that remain carry a copy. 2/3 — arithmetic, not a constant.
    expect(carrier).toBeCloseTo(2 / 3, 12)
    expect(carrier).toBe((1 / 2) / (3 / 4))
    expect(carrier).not.toBe(0.66)

    // And the posterior it came from is a real distribution, not a label.
    const marginal = observed.lociMarginals['alpha']!
    expect(probabilityOfPair(marginal, 'variant-a/variant-a')).toBe(0)
    expect(probabilityOfPair(marginal, 'variant-a/wild-type')).toBeCloseTo(2 / 3, 12)
    expect(probabilityOfPair(marginal, 'wild-type/wild-type')).toBeCloseTo(1 / 3, 12)
    expect(marginal.reduce((s, o) => s + o.probability, 0)).toBeCloseTo(1, 12)
  })

  it('gives "50% het" out of the same function, with no second rule', () => {
    const distribution = punnett(
      animal('mother', monoSpecies, 'female', het),
      animal('father', monoSpecies, 'male'),
      monoSpecies,
    )
    const observed = conditionOn(distribution, {
      kind: 'phenotype',
      phenotypeKey: keyOf(monoSpecies, 'female'),
    })
    // Every offspring of this pairing looks normal, so looking at one teaches you nothing —
    // and the number stays where it started.
    expect(carrierProbability(observed, 'alpha', 'variant-a')).toBe(0.5)
  })

  it('makes a visibly affected offspring a certain carrier', () => {
    const distribution = punnett(
      animal('mother', monoSpecies, 'female', het),
      animal('father', monoSpecies, 'male', het),
      monoSpecies,
    )
    const observed = conditionOn(distribution, {
      kind: 'phenotype',
      phenotypeKey: keyOf(monoSpecies, 'female', { alpha: ['variant-a', 'variant-a'] }),
    })
    expect(carrierProbability(observed, 'alpha', 'variant-a')).toBe(1)
  })

  it('reports that observing a phenotype has coupled the loci', () => {
    const both: Record<string, [string, string]> = {
      alpha: ['variant-a', 'wild-type'],
      beta: ['variant-b', 'wild-type'],
    }
    const distribution = punnett(
      animal('mother', diSpecies, 'female', both),
      animal('father', diSpecies, 'male', both),
      diSpecies,
    )
    const observed = conditionOn(distribution, {
      kind: 'phenotype',
      phenotypeKey: keyOf(diSpecies, 'female'),
    })
    expect(observed.interactionGroups).toEqual([['alpha', 'beta']])
    // Conditioning on how the animal looks does not change how often an egg fails to hatch.
    expect(observed.nonViableProbability).toBe(distribution.nonViableProbability)
    expect(carrierProbability(observed, 'alpha', 'variant-a')).toBeCloseTo(2 / 3, 12)
  })

  it('refuses an observation nothing could have produced', () => {
    const distribution = punnett(
      animal('mother', monoSpecies, 'female'),
      animal('father', monoSpecies, 'male'),
      monoSpecies,
    )
    expect(() =>
      conditionOn(distribution, { kind: 'phenotype', phenotypeKey: 'alpha:affected' }),
    ).toThrow(/nothing to condition on/)
  })
})

describe('punnett — the things it refuses to do', () => {
  it('throws on two parents of the same sex', () => {
    expect(() =>
      punnett(
        animal('one', monoSpecies, 'female'),
        animal('two', monoSpecies, 'female'),
        monoSpecies,
      ),
    ).toThrow(/both female/)
  })

  it('throws when the arguments are the wrong way round', () => {
    expect(() =>
      punnett(animal('m', monoSpecies, 'male'), animal('f', monoSpecies, 'female'), monoSpecies),
    ).toThrow(/swap them/)
  })

  it('throws on two different species', () => {
    const other = makeSpecies({ id: 'other-organism', loci: [alpha] })
    const stranger = { ...animal('stranger', other, 'male'), species: other.id }
    expect(() =>
      punnett(animal('mother', monoSpecies, 'female'), stranger, monoSpecies),
    ).toThrow(/do not interbreed/)
  })

  it('throws rather than truncating when a joint would blow up, and names the loci', () => {
    const distribution = punnett(
      animal('mother', diSpecies, 'female', { alpha: ['variant-a', 'wild-type'] }),
      animal('father', diSpecies, 'male', { beta: ['variant-b', 'wild-type'] }),
      diSpecies,
      { maxJointOutcomes: 3 },
    )
    expect(() => distribution.joint(['alpha', 'beta'])).toThrow(/alpha, beta/)
  })

  it('only reports the loci it was asked for', () => {
    const distribution = punnett(
      animal('mother', diSpecies, 'female'),
      animal('father', diSpecies, 'male'),
      diSpecies,
      { loci: ['alpha'] },
    )
    expect(Object.keys(distribution.lociMarginals)).toEqual(['alpha'])
    expect(() => distribution.joint(['beta'])).toThrow(/does not cover locus 'beta'/)
    // A phenotype is a statement about a whole animal, so a narrowed distribution cannot make one.
    expect(() => distribution.phenotypes()).toThrow(/depends on every locus/)
  })
})
