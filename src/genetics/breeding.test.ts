/**
 * Tests for meiosis and breeding.
 *
 * Every fixture in here is invented and generic — `pigment-a`, `marker-h`, `variant-a`. No real
 * trait name appears anywhere in `src/genetics/`, because the engine must not know what a snake
 * is. Real morphs live in `src/species/`, which is data.
 *
 * ## The fixture trick that makes the XY-vs-ZW proof airtight
 *
 * Both test species use the *same* chromosome letters: `'H'` for the one that appears twice and
 * `'K'` for the one that appears at most once. The two systems therefore differ in **exactly one
 * field** — `heterogameticSex` — and the locus definitions are literally the same objects.
 *
 * That is what makes the sex-linkage tests below a proof rather than a demonstration. If the
 * engine contained a hidden `if (system.id === 'ZW')`, or keyed anything off the letters X/Y/Z/W,
 * these tests could not both pass: the engine has nothing to branch on. The only thing that
 * changes is which sex is heterogametic, and the inheritance flips accordingly — which is the
 * claim §3 of the spec makes about the whole design.
 */

import { describe, expect, it } from 'vitest'
import type {
  Genotype,
  Individual,
  Locus,
  Sex,
  SexSystem,
  SpeciesDefinition,
  TraitValues,
  ViabilityRule,
} from './types'
import { genotypeKey, makeGenotype, otherSex, sexOf } from './genotype'
import { breed, makeGamete } from './breeding'
import { makeRng } from '../lib/rng'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface TestPhenotype {
  readonly look: string
}

/** Same letters, same everything — except which sex carries one of each. */
const HETEROGAMETIC_MALE: SexSystem = {
  id: 'hetero-male',
  homogameticChromosome: 'H',
  heterogameticChromosome: 'K',
  heterogameticSex: 'male',
}

const HETEROGAMETIC_FEMALE: SexSystem = {
  id: 'hetero-female',
  homogameticChromosome: 'H',
  heterogameticChromosome: 'K',
  heterogameticSex: 'female',
}

/** A recessive-looking table. The tests assert on genotypes, so this only has to typecheck. */
function recessiveTable(): Locus['expression'] {
  const affected: TraitValues = { look: 'affected' }
  const normal: TraitValues = { look: 'normal' }
  return {
    kind: 'table',
    entries: {
      'variant-a/variant-a': affected,
      'variant-a': affected, // hemizygous: one chromosome, one allele, nothing to mask it
      'variant-a/wild-type': normal,
      'wild-type/wild-type': normal,
      'wild-type': normal,
    },
    otherwise: normal,
  }
}

function twoAlleleLocus(id: string, placement: Locus['placement']): Locus {
  return {
    id,
    label: id,
    placement,
    alleles: [
      { id: 'wild-type', label: 'Wild type', origin: 'wild-type' },
      { id: 'variant-a', label: 'Variant A', origin: 'authored' },
    ],
    wildType: 'wild-type',
    expression: recessiveTable(),
  }
}

const AUTOSOMAL = twoAlleleLocus('pigment-a', { kind: 'autosomal' })
/** On the chromosome that appears twice in the homogametic sex — the X-like / Z-like case. */
const ON_HOMOGAMETIC = twoAlleleLocus('marker-h', { kind: 'sexLinked', chromosome: 'H' })
/** On the chromosome that only the heterogametic sex has — the Y-like / W-like case. */
const ON_HETEROGAMETIC = twoAlleleLocus('marker-k', { kind: 'sexLinked', chromosome: 'K' })

function makeSpecies(
  id: string,
  sexSystem: SexSystem,
  loci: readonly Locus[],
  viability: readonly ViabilityRule[] = [],
): SpeciesDefinition<TestPhenotype> {
  return {
    id,
    label: id,
    sexSystem,
    loci,
    polygenic: [],
    basePhenotype: () => ({ look: 'normal' }),
    projections: [],
    modifiers: [],
    viability,
    phenotypeKey: (p) => p.look,
    phenotypeLabel: (p) => p.look,
  }
}

function individual(
  id: string,
  species: SpeciesDefinition<TestPhenotype>,
  sex: Sex,
  overrides: Record<string, Genotype['loci'][string]> = {},
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
 * Sort two animals into mother and father by reading their sex off their chromosomes.
 *
 * The tests never say "the male is the father" — they let the engine derive it. That keeps the
 * test bodies identical across the two systems, which is the point: the *same* test code runs
 * under both, and only the outcome differs.
 */
function asParents(
  species: SpeciesDefinition<TestPhenotype>,
  animals: readonly Individual[],
): { mother: Individual; father: Individual } {
  const bySex = (want: Sex) =>
    animals.find((a) => sexOf(a.genotype, species.sexSystem) === want)!
  return { mother: bySex('female'), father: bySex('male') }
}

const BOTH_SYSTEMS: readonly [string, SexSystem][] = [
  ['heterogametic male (the XY pattern)', HETEROGAMETIC_MALE],
  ['heterogametic female (the ZW pattern)', HETEROGAMETIC_FEMALE],
]

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('breed() is deterministic', () => {
  const species = makeSpecies('det', HETEROGAMETIC_MALE, [AUTOSOMAL, ON_HOMOGAMETIC])
  const { mother, father } = asParents(species, [
    individual('m', species, 'female', { 'pigment-a': ['variant-a', 'wild-type'] }),
    individual('f', species, 'male', { 'pigment-a': ['variant-a', 'wild-type'] }),
  ])

  it('produces a deep-equal clutch from the same request, twice', () => {
    const request = { mother, father, clutchSize: 12, seed: 'world-7:clutch:m:f:0' }
    expect(breed(request, species)).toEqual(breed(request, species))
  })

  it('gives each egg an identity that does not depend on the eggs around it', () => {
    // Egg 5 is egg 5 whether or not eggs 0-4 were ever computed. This is what lets the UI
    // reveal a clutch one egg at a time, and what stops a viability rule change from
    // renumbering — and so re-rolling the markings of — every animal after it.
    const base = { mother, father, seed: 'world-7:clutch:m:f:1' }
    const short = breed({ ...base, clutchSize: 3 }, species)
    const long = breed({ ...base, clutchSize: 20 }, species)
    expect(long.hatched.slice(0, short.hatched.length)).toEqual(short.hatched)
  })

  it('changes completely when the seed changes', () => {
    const a = breed({ mother, father, clutchSize: 8, seed: 'seed-a' }, species)
    const b = breed({ mother, father, clutchSize: 8, seed: 'seed-b' }, species)
    expect(a).not.toEqual(b)
  })
})

// ---------------------------------------------------------------------------
// Mendel
// ---------------------------------------------------------------------------

describe('Mendelian ratios', () => {
  const species = makeSpecies('mendel', HETEROGAMETIC_MALE, [AUTOSOMAL])
  const { mother, father } = asParents(species, [
    individual('m', species, 'female', { 'pigment-a': ['variant-a', 'wild-type'] }),
    individual('f', species, 'male', { 'pigment-a': ['variant-a', 'wild-type'] }),
  ])

  /**
   * **Why this test cannot flake.**
   *
   * There is no `Math.random()` under it. The clutch is generated from the fixed string seed
   * below, through a seeded mulberry32, so the counts asserted here are *constants* — this
   * test computes the same three numbers on every machine, on every run, forever. It would
   * only ever change if the engine's use of the RNG changed, which is precisely the thing
   * worth being told about.
   *
   * The tolerance is nonetheless set at roughly two standard deviations of the true binomial
   * (n = 4000, p = 1/4 ⇒ sd ≈ 27), not padded out to something meaningless. A window that
   * tight would fail for a *biased* generator, so the test still does real work: it says both
   * "this is reproducible" and "this is actually 3:1", and it can say the second only because
   * of the first.
   */
  it('lands a monohybrid cross on 3:1 within a tight, non-flaky tolerance', () => {
    const n = 4000
    const clutch = breed({ mother, father, clutchSize: n, seed: 'ratio-check-1' }, species)
    expect(clutch.hatched).toHaveLength(n)

    const counts = { 'variant-a/variant-a': 0, 'variant-a/wild-type': 0, 'wild-type/wild-type': 0 }
    for (const child of clutch.hatched) {
      const key = genotypeKey(child.genotype.loci['pigment-a']!)
      counts[key as keyof typeof counts]++
    }

    // 1 : 2 : 1 genotypes, which is the 3 : 1 phenotype ratio for a recessive trait.
    expect(counts['variant-a/variant-a']).toBeCloseTo(n / 4, -2)
    expect(counts['variant-a/variant-a']).toBeGreaterThan(n / 4 - 55)
    expect(counts['variant-a/variant-a']).toBeLessThan(n / 4 + 55)
    expect(counts['variant-a/wild-type']).toBeGreaterThan(n / 2 - 80)
    expect(counts['variant-a/wild-type']).toBeLessThan(n / 2 + 80)
    expect(counts['wild-type/wild-type']).toBeGreaterThan(n / 4 - 55)
    expect(counts['wild-type/wild-type']).toBeLessThan(n / 4 + 55)

    // 3 : 1 stated the way the player would: how many look affected.
    const affected = counts['variant-a/variant-a']
    expect(affected / n).toBeGreaterThan(0.235)
    expect(affected / n).toBeLessThan(0.265)
  })

  it('produces roughly even sexes, because the sex chromosome segregates like anything else', () => {
    const n = 2000
    const clutch = breed({ mother, father, clutchSize: n, seed: 'sex-ratio-1' }, species)
    const males = clutch.hatched.filter(
      (c) => sexOf(c.genotype, species.sexSystem) === 'male',
    ).length
    expect(males).toBeGreaterThan(n / 2 - 70)
    expect(males).toBeLessThan(n / 2 + 70)
  })
})

// ---------------------------------------------------------------------------
// The proof: sex-linkage falls out of the declared system
// ---------------------------------------------------------------------------

describe('sex-linkage is emergent, not special-cased', () => {
  /**
   * A locus on the chromosome only the heterogametic sex carries — the Y-linked case in an XY
   * species, the W-linked case in a ZW species.
   *
   * The setup and the assertions below are written entirely in terms of "the heterogametic
   * parent" and never in terms of male or female. Run the identical test under both systems and
   * the *general* rule holds both times, while the *concrete* answer flips: father-to-son under
   * one system, mother-to-daughter under the other. Nothing in `breeding.ts` was told this.
   */
  describe.each(BOTH_SYSTEMS)('%s', (_label, system) => {
    const species = makeSpecies(`k-linked-${system.id}`, system, [ON_HETEROGAMETIC])
    const hetero = individual('carrier', species, system.heterogameticSex, {
      'marker-k': ['variant-a', null],
    })
    const homo = individual('plain', species, otherSex(system.heterogameticSex), {})
    const { mother, father } = asParents(species, [hetero, homo])

    const clutch = breed({ mother, father, clutchSize: 60, seed: `k-linked:${system.id}` }, species)

    it('passes the variant to every offspring of the heterogametic sex, and to no other', () => {
      expect(clutch.hatched.length).toBe(60)
      for (const child of clutch.hatched) {
        const carries = genotypeKey(child.genotype.loci['marker-k']!) === 'variant-a'
        const isHeterogametic = sexOf(child.genotype, species.sexSystem) === system.heterogameticSex
        expect(carries).toBe(isHeterogametic)
      }
      // Both kinds of offspring actually occurred, so the assertion above was not vacuous.
      const carriers = clutch.hatched.filter(
        (c) => genotypeKey(c.genotype.loci['marker-k']!) === 'variant-a',
      )
      expect(carriers.length).toBeGreaterThan(10)
      expect(carriers.length).toBeLessThan(50)
    })

    it('gives offspring of the homogametic sex no copy of the locus at all', () => {
      const homogametic = clutch.hatched.filter(
        (c) => sexOf(c.genotype, species.sexSystem) !== system.heterogameticSex,
      )
      expect(homogametic.length).toBeGreaterThan(0)
      for (const child of homogametic) {
        // Not "wild-type" — *absent*. There is no chromosome here to carry an allele, which is
        // hemizygosity's other half and the reason `AlleleSlot` allows null.
        expect(child.genotype.loci['marker-k']).toEqual([null, null])
      }
    })
  })

  /**
   * The same locus definition, the same two systems, and the answer flips sex. This is the
   * single assertion that proves the engine is general: `ON_HETEROGAMETIC` is one object, used
   * by both species, and the only difference between the species is `heterogameticSex`.
   */
  it('flips which sex inherits a K-linked variant when only heterogameticSex changes', () => {
    const carrierSexes = BOTH_SYSTEMS.map(([, system]) => {
      const species = makeSpecies(`flip-${system.id}`, system, [ON_HETEROGAMETIC])
      const hetero = individual('carrier', species, system.heterogameticSex, {
        'marker-k': ['variant-a', null],
      })
      const homo = individual('plain', species, otherSex(system.heterogameticSex), {})
      const { mother, father } = asParents(species, [hetero, homo])
      const clutch = breed({ mother, father, clutchSize: 40, seed: 'flip' }, species)
      const sexes = new Set(
        clutch.hatched
          .filter((c) => genotypeKey(c.genotype.loci['marker-k']!) === 'variant-a')
          .map((c) => sexOf(c.genotype, species.sexSystem)),
      )
      return [...sexes]
    })

    // Heterogametic-male species: the variant goes father → sons, and only sons.
    expect(carrierSexes[0]).toEqual(['male'])
    // Heterogametic-female species: the same locus goes mother → daughters, and only daughters.
    expect(carrierSexes[1]).toEqual(['female'])
  })

  /**
   * A locus on the chromosome that appears twice in the homogametic sex — X-linked or Z-linked.
   *
   * This is the criss-cross cross out of every genetics textbook: a homozygous-variant
   * homogametic parent × a wild-type heterogametic parent gives offspring where *only the
   * heterogametic sex* shows the recessive trait, because they have no second copy to mask it.
   * Under one system those are the sons; under the other, the daughters.
   */
  it('produces the criss-cross pattern under both systems, showing it in opposite sexes', () => {
    const affectedSexes = BOTH_SYSTEMS.map(([, system]) => {
      const species = makeSpecies(`cross-${system.id}`, system, [ON_HOMOGAMETIC])
      const homo = individual('homozygous', species, otherSex(system.heterogameticSex), {
        'marker-h': ['variant-a', 'variant-a'],
      })
      const hetero = individual('plain', species, system.heterogameticSex, {})
      const { mother, father } = asParents(species, [homo, hetero])
      const clutch = breed({ mother, father, clutchSize: 60, seed: 'criss-cross' }, species)

      const affected = clutch.hatched.filter(
        (c) => genotypeKey(c.genotype.loci['marker-h']!) === 'variant-a',
      )
      const carriers = clutch.hatched.filter(
        (c) => genotypeKey(c.genotype.loci['marker-h']!) === 'variant-a/wild-type',
      )
      // Every offspring is one or the other: hemizygous-affected, or a masked carrier.
      expect(affected.length + carriers.length).toBe(clutch.hatched.length)
      expect(affected.length).toBeGreaterThan(10)
      expect(carriers.length).toBeGreaterThan(10)
      // The affected ones are exactly the heterogametic sex — nothing masked their single copy.
      for (const c of affected) {
        expect(sexOf(c.genotype, species.sexSystem)).toBe(system.heterogameticSex)
      }
      return [...new Set(affected.map((c) => sexOf(c.genotype, species.sexSystem)))]
    })

    expect(affectedSexes[0]).toEqual(['male'])
    expect(affectedSexes[1]).toEqual(['female'])
  })

  it('leaves an autosomal locus completely unaffected by the sex system', () => {
    // The control. If the two systems differed here, the sex-linkage results above could be an
    // artifact of the fixtures rather than of placement.
    const keys = BOTH_SYSTEMS.map(([, system]) => {
      const species = makeSpecies(`auto-${system.id}`, system, [AUTOSOMAL])
      const { mother, father } = asParents(species, [
        individual('a', species, 'female', { 'pigment-a': ['variant-a', 'wild-type'] }),
        individual('b', species, 'male', { 'pigment-a': ['variant-a', 'wild-type'] }),
      ])
      const clutch = breed({ mother, father, clutchSize: 40, seed: 'autosomal-control' }, species)
      return clutch.hatched.map((c) => genotypeKey(c.genotype.loci['pigment-a']!))
    })
    expect(keys[0]).toEqual(keys[1])
  })
})

// ---------------------------------------------------------------------------
// makeGamete directly
// ---------------------------------------------------------------------------

describe('makeGamete()', () => {
  const species = makeSpecies('gametes', HETEROGAMETIC_MALE, [AUTOSOMAL, ON_HOMOGAMETIC])

  it('carries exactly one sex chromosome, always one the parent actually has', () => {
    const parent = individual('p', species, 'male', {})
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) {
      const g = makeGamete(parent, species, makeRng(`gamete:${i}`))
      seen.add(g.sexChromosome)
    }
    expect([...seen].sort()).toEqual(['H', 'K'])
  })

  it('omits a homogametic-chromosome locus from gametes carrying the other chromosome', () => {
    const parent = individual('p', species, 'male', { 'marker-h': ['variant-a', null] })
    for (let i = 0; i < 100; i++) {
      const g = makeGamete(parent, species, makeRng(`omit:${i}`))
      // The locus lives on H. A K-bearing gamete has nowhere to put it, and says so with null.
      expect(g.alleles['marker-h']).toBe(g.sexChromosome === 'H' ? 'variant-a' : null)
    }
  })

  it('is deterministic in its rng', () => {
    const parent = individual('p', species, 'female', {
      'pigment-a': ['variant-a', 'wild-type'],
      'marker-h': ['variant-a', 'wild-type'],
    })
    expect(makeGamete(parent, species, makeRng('same'))).toEqual(
      makeGamete(parent, species, makeRng('same')),
    )
  })

  it('throws rather than silently ignoring a linkage declaration', () => {
    const linked: Locus = {
      ...AUTOSOMAL,
      placement: { kind: 'autosomal', linkage: { group: 'group-1', centimorgans: 5 } },
    }
    const linkedSpecies = makeSpecies('linked', HETEROGAMETIC_MALE, [linked])
    const parent: Individual = {
      id: 'p',
      species: 'linked',
      genotype: { sexChromosomes: ['H', 'H'], loci: { 'pigment-a': ['wild-type', 'wild-type'] } },
      parents: null,
      mutations: [],
    }
    expect(() => makeGamete(parent, linkedSpecies, makeRng('linked'))).toThrow(/linkage/i)
  })
})

// ---------------------------------------------------------------------------
// Eggs that do not hatch
// ---------------------------------------------------------------------------

describe('non-viable genotypes', () => {
  /** Two copies of the variant produce an egg that does not complete development. */
  const rule: ViabilityRule = {
    id: 'double-variant',
    label: 'Two copies of Variant A',
    involves: ['pigment-a'],
    explanation:
      'An egg with two copies of Variant A does not finish developing, so it never hatches. ' +
      'Both parents carry one copy, which is why this pairing produces fewer hatchlings than eggs.',
    isNonViable: (genotype) => genotypeKey(genotype.loci['pigment-a']!) === 'variant-a/variant-a',
  }

  const species = makeSpecies('viability', HETEROGAMETIC_MALE, [AUTOSOMAL], [rule])
  const { mother, father } = asParents(species, [
    individual('m', species, 'female', { 'pigment-a': ['variant-a', 'wild-type'] }),
    individual('f', species, 'male', { 'pigment-a': ['variant-a', 'wild-type'] }),
  ])
  // Sized so the sampling error on the 1-in-4 rate is small (sd ≈ 19 eggs), rather than sized
  // small and then given a loose tolerance to hide the noise.
  const EGGS = 2000
  const clutch = breed({ mother, father, clutchSize: EGGS, seed: 'viability-1' }, species)

  it('reports them as unhatched eggs, with the rule’s own explanation', () => {
    expect(clutch.unhatched.length).toBeGreaterThan(0)
    for (const egg of clutch.unhatched) {
      expect(egg.ruleId).toBe('double-variant')
      expect(egg.explanation).toBe(rule.explanation)
      expect(genotypeKey(egg.genotype.loci['pigment-a']!)).toBe('variant-a/variant-a')
    }
  })

  it('keeps them out of the hatchlings entirely', () => {
    for (const child of clutch.hatched) {
      expect(genotypeKey(child.genotype.loci['pigment-a']!)).not.toBe('variant-a/variant-a')
    }
  })

  it('accounts for every egg — nothing is quietly dropped', () => {
    expect(clutch.hatched.length + clutch.unhatched.length).toBe(EGGS)
    // A quarter of the eggs do not hatch, so what a breeder actually counts among the
    // hatchlings from this pairing is 2 : 1, not the 3 : 1 the Punnett square shows. That gap
    // between "eggs laid" and "animals on the ground" is the whole teaching point of the rule.
    expect(clutch.unhatched.length / EGGS).toBeGreaterThan(0.225)
    expect(clutch.unhatched.length / EGGS).toBeLessThan(0.275)
  })
})

// ---------------------------------------------------------------------------
// Refusing impossible requests
// ---------------------------------------------------------------------------

describe('breed() refuses pairings that cannot happen', () => {
  const species = makeSpecies('guards', HETEROGAMETIC_MALE, [AUTOSOMAL])
  const female = individual('f1', species, 'female', {})
  const male = individual('m1', species, 'male', {})

  it('throws when both parents are the same sex', () => {
    expect(() =>
      breed({ mother: female, father: female, clutchSize: 2, seed: 's' }, species),
    ).toThrow(/female mother and a male father/)
  })

  it('throws when the parents are swapped', () => {
    expect(() => breed({ mother: male, father: female, clutchSize: 2, seed: 's' }, species)).toThrow(
      /female mother and a male father/,
    )
  })

  it('throws when a parent belongs to another species', () => {
    const alien = { ...male, species: 'something-else' }
    expect(() => breed({ mother: female, father: alien, clutchSize: 2, seed: 's' }, species)).toThrow(
      /something-else/,
    )
  })

  it('returns an empty clutch for a clutch size of zero, rather than anything clever', () => {
    const clutch = breed({ mother: female, father: male, clutchSize: 0, seed: 's' }, species)
    expect(clutch.hatched).toEqual([])
    expect(clutch.unhatched).toEqual([])
  })
})
