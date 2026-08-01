/**
 * Tests for belief — what the player can work out, as opposed to what is true.
 *
 * Every locus and allele here is invented and generic. No trait in this file is a real trait,
 * and the engine must never learn what a snake is.
 *
 * The numbers asserted below are all worked by hand in the comments, because that is the point
 * of the module: a player should be able to follow the arithmetic. If a test here disagrees
 * with the comment above it, the comment is the specification.
 */

import { describe, expect, it } from 'vitest'
import { inferKnowledge } from './knowledge'
import { express } from './expression'
import { makeGenotype } from './genotype'
import type {
  Evidence,
  GeneticKnowledge,
  Individual,
  Locus,
  LocusBelief,
  LocusPlacement,
  Sex,
  SexSystem,
  SpeciesDefinition,
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

type TestPhenotype = Record<string, string>

/** Two copies to show it, one copy to carry it invisibly. The reason "possible het" exists. */
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

function makeSpecies(loci: readonly Locus[], id = 'test-organism'): SpeciesDefinition<TestPhenotype> {
  return {
    id,
    label: 'Test organism',
    sexSystem: XY,
    loci,
    polygenic: [],
    basePhenotype: () => ({}),
    projections: loci.map((locus) => ({
      key: `${locus.id}Look`,
      apply: (draft: TestPhenotype, value: unknown) => {
        draft[locus.id] = String(value)
      },
    })),
    modifiers: [],
    viability: [],
    phenotypeKey: (p) =>
      Object.keys(p)
        .sort()
        .map((k) => `${k}:${p[k]}`)
        .join(' '),
    phenotypeLabel: (p) => Object.keys(p).sort().map((k) => `${k} ${p[k]}`).join(', '),
  }
}

const alpha = recessiveLocus('alpha', 'variant-a', { kind: 'autosomal' })
const beta = recessiveLocus('beta', 'variant-b', { kind: 'autosomal' })
const species = makeSpecies([alpha])
const twoLocusSpecies = makeSpecies([alpha, beta])

function animal(
  id: string,
  of: SpeciesDefinition<TestPhenotype>,
  sex: Sex,
  overrides: Record<string, [string | null, string | null]> = {},
): Individual {
  return {
    id,
    species: of.id,
    genotype: makeGenotype(of, sex, overrides),
    parents: null,
    mutations: [],
  }
}

/** Looked up rather than written out, so no test can drift onto a stale hard-coded string. */
function keyOf(
  of: SpeciesDefinition<TestPhenotype>,
  overrides: Record<string, [string | null, string | null]> = {},
): string {
  return of.phenotypeKey(express(animal('probe', of, 'female', overrides), of))
}

/** Belief that an animal carries at least one copy — read off whichever shape the belief has. */
function carrierBelief(belief: LocusBelief, allele: string): number {
  if (belief.kind === 'unknown') {
    throw new Error('carrierBelief: nothing is believed about this locus at all.')
  }
  if (belief.kind === 'certain') {
    return belief.pair.includes(allele) ? 1 : 0
  }
  return Object.entries(belief.distribution).reduce(
    (sum, [key, probability]) => (key.split('/').includes(allele) ? sum + probability : sum),
    0,
  )
}

function certainly(
  individual: string,
  locus: string,
  pair: [string | null, string | null],
): GeneticKnowledge {
  return { individual, loci: { [locus]: { kind: 'certain', pair } } }
}

const looksNormal = keyOf(species)
const looksAffected = keyOf(species, { alpha: ['variant-a', 'variant-a'] })

// ---------------------------------------------------------------------------

describe('inferKnowledge — the shapes belief comes in', () => {
  it('knows nothing when it has been told nothing', () => {
    const knowledge = inferKnowledge('hatchling', [], twoLocusSpecies, {})
    expect(knowledge.individual).toBe('hatchling')
    expect(knowledge.loci['alpha']).toEqual({ kind: 'unknown' })
    expect(knowledge.loci['beta']).toEqual({ kind: 'unknown' })
  })

  it('collapses to certainty on a gene test', () => {
    const evidence: Evidence[] = [
      { kind: 'geneTest', locus: 'alpha', pair: ['variant-a', 'wild-type'] },
    ]
    const belief = inferKnowledge('tested', evidence, twoLocusSpecies, {}).loci['alpha']!

    expect(belief.kind).toBe('certain')
    expect(carrierBelief(belief, 'variant-a')).toBe(1)
  })

  it('leaves a locus the evidence never touched alone', () => {
    const evidence: Evidence[] = [
      { kind: 'geneTest', locus: 'alpha', pair: ['variant-a', 'wild-type'] },
    ]
    // Testing one gene tells you nothing about another gene. Belief should say so, rather than
    // reporting a flat posterior that looks like a computation happened.
    expect(inferKnowledge('tested', evidence, twoLocusSpecies, {}).loci['beta']).toEqual({
      kind: 'unknown',
    })
  })

  it('overrules a prior with a gene test, which is what makes the test worth paying for', () => {
    const parents = {
      mother: certainly('mother', 'alpha', ['variant-a', 'wild-type']),
      father: certainly('father', 'alpha', ['variant-a', 'wild-type']),
    }
    const evidence: Evidence[] = [
      { kind: 'parentage', mother: 'mother', father: 'father' },
      { kind: 'observedPhenotype', phenotypeKey: looksNormal },
      { kind: 'geneTest', locus: 'alpha', pair: ['wild-type', 'wild-type'] },
    ]
    const belief = inferKnowledge('tested', evidence, species, parents).loci['alpha']!
    expect(belief.kind).toBe('certain')
    expect(carrierBelief(belief, 'variant-a')).toBe(0)
  })

  it('rejects evidence that contradicts itself', () => {
    const evidence: Evidence[] = [
      { kind: 'geneTest', locus: 'alpha', pair: ['wild-type', 'wild-type'] },
      { kind: 'observedPhenotype', phenotypeKey: looksAffected },
    ]
    expect(() => inferKnowledge('impossible', evidence, species, {})).toThrow(/inconsistent/)
  })
})

describe('inferKnowledge — parentage as a prior', () => {
  const parents = {
    mother: certainly('mother', 'alpha', ['variant-a', 'wild-type']),
    father: certainly('father', 'alpha', ['variant-a', 'wild-type']),
  }

  it('reproduces the parents’ Punnett square when nothing else is known', () => {
    const evidence: Evidence[] = [{ kind: 'parentage', mother: 'mother', father: 'father' }]
    const belief = inferKnowledge('egg', evidence, species, parents).loci['alpha']!

    expect(belief.kind).toBe('posterior')
    if (belief.kind !== 'posterior') return
    expect(belief.distribution['variant-a/variant-a']).toBe(0.25)
    expect(belief.distribution['variant-a/wild-type']).toBe(0.5)
    expect(belief.distribution['wild-type/wild-type']).toBe(0.25)
  })

  it('makes a normal-looking hatchling of two carriers exactly two thirds likely to carry', () => {
    const evidence: Evidence[] = [
      { kind: 'parentage', mother: 'mother', father: 'father' },
      { kind: 'observedPhenotype', phenotypeKey: looksNormal },
    ]
    const belief = inferKnowledge('hatchling', evidence, species, parents).loci['alpha']!

    // The same 2/3 the distribution module produces by conditioning, arrived at from the other
    // direction: prior ¼ : ½ : ¼, the visibly affected quarter eliminated by looking at the
    // animal, the rest renormalised. Two of the three survivors carry a copy.
    expect(carrierBelief(belief, 'variant-a')).toBeCloseTo(2 / 3, 12)
    expect(belief.kind).toBe('posterior')
    if (belief.kind !== 'posterior') return
    expect(belief.distribution['variant-a/variant-a'] ?? 0).toBe(0)
  })

  it('weakens the prior when the parents themselves are only probably carriers', () => {
    const unsure: Record<string, GeneticKnowledge> = {
      mother: {
        individual: 'mother',
        loci: {
          alpha: {
            kind: 'posterior',
            distribution: { 'variant-a/wild-type': 2 / 3, 'wild-type/wild-type': 1 / 3 },
          },
        },
      },
      father: {
        individual: 'father',
        loci: {
          alpha: {
            kind: 'posterior',
            distribution: { 'variant-a/wild-type': 2 / 3, 'wild-type/wild-type': 1 / 3 },
          },
        },
      },
    }
    const evidence: Evidence[] = [
      { kind: 'parentage', mother: 'mother', father: 'father' },
      { kind: 'observedPhenotype', phenotypeKey: looksNormal },
    ]

    const fromProven = inferKnowledge('a', evidence, species, parents).loci['alpha']!
    const fromSuspected = inferKnowledge('b', evidence, species, unsure).loci['alpha']!

    // Two "66% het" parents are weaker evidence than two proven carriers, and belief should say
    // so without anybody having to remember to say it.
    expect(carrierBelief(fromSuspected, 'variant-a')).toBeLessThan(
      carrierBelief(fromProven, 'variant-a'),
    )
    expect(carrierBelief(fromSuspected, 'variant-a')).toBeGreaterThan(0)
  })
})

describe('inferKnowledge — proving it out by test breeding', () => {
  const provenCarrier = { mate: certainly('mate', 'alpha', ['variant-a', 'wild-type']) }

  it('proves a carrier outright the moment one visibly affected offspring appears', () => {
    const evidence: Evidence[] = [
      { kind: 'observedPhenotype', phenotypeKey: looksNormal },
      { kind: 'offspring', mate: 'mate', offspringPhenotypeKeys: [looksAffected] },
    ]
    const belief = inferKnowledge('suspect', evidence, species, provenCarrier).loci['alpha']!

    // An affected offspring needs a copy from each parent. There is no other way for it to
    // exist, so one animal settles what any number of normal-looking ones could not.
    expect(belief.kind).toBe('certain')
    expect(carrierBelief(belief, 'variant-a')).toBe(1)
  })

  it('reduces carrier probability with each normal-looking offspring, but never to zero', () => {
    const carrierAfter = (clutch: number): number => {
      const evidence: Evidence[] = [
        { kind: 'observedPhenotype', phenotypeKey: looksNormal },
        {
          kind: 'offspring',
          mate: 'mate',
          offspringPhenotypeKeys: Array.from({ length: clutch }, () => looksNormal),
        },
      ]
      return carrierBelief(
        inferKnowledge('suspect', evidence, species, provenCarrier).loci['alpha']!,
        'variant-a',
      )
    }

    // Worked by hand. The suspect looks normal, so it is a carrier or it is clear, 50/50 to
    // start. A carrier bred to a carrier produces a normal-looking offspring ¾ of the time; a
    // clear animal produces one every time. After n normal-looking offspring:
    //
    //     P(carrier) = (¾)ⁿ / ((¾)ⁿ + 1)
    const expected = (n: number): number => 0.75 ** n / (0.75 ** n + 1)

    expect(carrierAfter(0)).toBeCloseTo(0.5, 12)
    expect(carrierAfter(1)).toBeCloseTo(expected(1), 12)
    expect(carrierAfter(4)).toBeCloseTo(expected(4), 12)
    expect(carrierAfter(10)).toBeCloseTo(expected(10), 12)

    // Each clutch moves belief further, and each one moves it less than the last.
    const series = [0, 1, 2, 3, 4, 6, 10].map(carrierAfter)
    for (let i = 1; i < series.length; i++) {
      expect(series[i]!).toBeLessThan(series[i - 1]!)
    }

    // The counter-intuitive part, asserted deliberately: a negative can never be proved. Ten
    // clean clutches make a hidden copy unlikely, not impossible — a carrier really can produce
    // ten normal-looking offspring in a row, and a player who is told "clear" after ten would
    // have been told something false.
    expect(series[series.length - 1]!).toBeGreaterThan(0)
    expect(carrierAfter(30)).toBeGreaterThan(0)
  })

  it('learns less from a test breeding to a mate that is itself unproven', () => {
    const evidence = (mate: string): Evidence[] => [
      { kind: 'observedPhenotype', phenotypeKey: looksNormal },
      {
        kind: 'offspring',
        mate,
        offspringPhenotypeKeys: [looksNormal, looksNormal, looksNormal, looksNormal],
      },
    ]
    const mates: Record<string, GeneticKnowledge> = {
      proven: certainly('proven', 'alpha', ['variant-a', 'wild-type']),
      suspected: {
        individual: 'suspected',
        loci: {
          alpha: {
            kind: 'posterior',
            distribution: { 'variant-a/wild-type': 2 / 3, 'wild-type/wild-type': 1 / 3 },
          },
        },
      },
    }

    const againstProven = carrierBelief(
      inferKnowledge('suspect', evidence('proven'), species, mates).loci['alpha']!,
      'variant-a',
    )
    const againstSuspected = carrierBelief(
      inferKnowledge('suspect', evidence('suspected'), species, mates).loci['alpha']!,
      'variant-a',
    )

    // If the mate might not carry anything, its normal-looking offspring prove less — so belief
    // about the suspect moves less. This is why breeders test against a *known* animal.
    expect(againstSuspected).toBeGreaterThan(againstProven)
  })
})

describe('inferKnowledge — sex-linked loci', () => {
  const gamma = recessiveLocus('gamma', 'variant-g', { kind: 'sexLinked', chromosome: 'X' })
  const sexLinkedSpecies = makeSpecies([gamma], 'sex-linked-organism')

  it('spans both sexes, and an affected animal is more likely to be the hemizygous one', () => {
    const affected = sexLinkedSpecies.phenotypeKey(
      express(animal('probe', sexLinkedSpecies, 'male', { gamma: ['variant-g', null] }), sexLinkedSpecies),
    )
    const belief = inferKnowledge(
      'found',
      [{ kind: 'observedPhenotype', phenotypeKey: affected }],
      sexLinkedSpecies,
      {},
    ).loci['gamma']!

    expect(belief.kind).toBe('posterior')
    if (belief.kind !== 'posterior') return

    // Knowing nothing, the animal is equally likely to be either sex. A male shows the trait
    // with a single copy — one of his two possible genotypes, so ¼ of all animals. A female
    // needs two copies — one of her three, so ⅙. Of the affected animals, 0.25 / (0.25 + ⅙) of
    // them are male. Hemizygosity is why sex-linked recessives cluster in one sex, and nothing
    // in the engine had to be told that.
    expect(belief.distribution['variant-g']).toBeCloseTo(0.6, 12)
    expect(belief.distribution['variant-g/variant-g']).toBeCloseTo(0.4, 12)
    expect(carrierBelief(belief, 'variant-g')).toBeCloseTo(1, 12)
  })
})
