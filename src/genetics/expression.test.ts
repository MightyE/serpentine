/**
 * Tests for the expression pipeline.
 *
 * Every locus, allele and trait in this file is **invented and generic** — `pigment-a`,
 * `variant-1`, `stripeWidth`. That is not shyness about snakes; it is the rule that keeps
 * `src/genetics/` a genetics engine rather than a simulator for one species. If a real trait name
 * ever appears in this directory, the engine has started to know what a snake is, and adding a
 * new species stops being a matter of writing one data file.
 */

import { describe, expect, it } from 'vitest'
import { makeGenotype } from './genotype'
import { deriveTraits, express } from './expression'
import { validateSpecies } from './validate'
import type {
  AllelePair,
  ExpressionContext,
  Individual,
  Locus,
  PolygenicTrait,
  SexSystem,
  SpeciesDefinition,
  TraitValues,
} from './types'

// ---------------------------------------------------------------------------
// Fixtures — a made-up animal with one locus per inheritance mode
// ---------------------------------------------------------------------------

const XY: SexSystem = {
  id: 'XY',
  homogameticChromosome: 'X',
  heterogameticChromosome: 'Y',
  heterogameticSex: 'male',
}

/** Simple recessive: you need two copies before anything shows. */
const recessiveLocus: Locus = {
  id: 'pigment-a',
  label: 'Pigment A',
  placement: { kind: 'autosomal' },
  alleles: [
    { id: 'wild-type', label: 'Wild type', origin: 'wild-type' },
    { id: 'variant-1', label: 'Variant 1', origin: 'authored', invented: true },
  ],
  wildType: 'wild-type',
  expression: {
    kind: 'table',
    entries: {
      'wild-type/wild-type': { pigmentA: 'full' },
      'variant-1/wild-type': { pigmentA: 'full' },
      'variant-1/variant-1': { pigmentA: 'none' },
    },
    otherwise: { pigmentA: 'full' },
  },
}

/** Dominant with no super form: one copy and two copies look identical. */
const dominantLocus: Locus = {
  id: 'pigment-b',
  label: 'Pigment B',
  placement: { kind: 'autosomal' },
  alleles: [
    { id: 'wild-type', label: 'Wild type', origin: 'wild-type' },
    { id: 'variant-2', label: 'Variant 2', origin: 'authored', invented: true },
  ],
  wildType: 'wild-type',
  expression: {
    kind: 'table',
    entries: {
      'wild-type/wild-type': { pigmentB: 'plain' },
      'variant-2/wild-type': { pigmentB: 'marked' },
      'variant-2/variant-2': { pigmentB: 'marked' },
    },
    otherwise: { pigmentB: 'plain' },
  },
}

/** Incomplete dominance: the homozygote is a third, distinct thing — a "super" form. */
const incompleteLocus: Locus = {
  id: 'pigment-c',
  label: 'Pigment C',
  placement: { kind: 'autosomal' },
  alleles: [
    { id: 'wild-type', label: 'Wild type', origin: 'wild-type' },
    { id: 'variant-3', label: 'Variant 3', origin: 'authored', invented: true },
  ],
  wildType: 'wild-type',
  expression: {
    kind: 'table',
    entries: {
      'wild-type/wild-type': { pigmentC: 0 },
      'variant-3/wild-type': { pigmentC: 1 },
      'variant-3/variant-3': { pigmentC: 2 },
    },
    otherwise: { pigmentC: 0 },
  },
}

/**
 * A multi-allele series. Each variant has its own homozygous look, and any two *different*
 * variants together — a compound heterozygote — produce a fourth thing that is not either parent
 * allele's homozygote. This is the case an enum of dominance modes cannot express at all.
 */
const seriesLocus: Locus = {
  id: 'pigment-d',
  label: 'Pigment D',
  placement: { kind: 'autosomal' },
  alleles: [
    { id: 'wild-type', label: 'Wild type', origin: 'wild-type' },
    { id: 'variant-x', label: 'Variant X', origin: 'authored', invented: true },
    { id: 'variant-y', label: 'Variant Y', origin: 'authored', invented: true },
  ],
  wildType: 'wild-type',
  expression: {
    kind: 'table',
    entries: {
      'wild-type/wild-type': { pigmentD: 'normal' },
      'variant-x/wild-type': { pigmentD: 'normal' },
      'variant-y/wild-type': { pigmentD: 'normal' },
      'variant-x/variant-x': { pigmentD: 'x-form' },
      'variant-y/variant-y': { pigmentD: 'y-form' },
      'variant-x/variant-y': { pigmentD: 'compound' },
    },
    otherwise: { pigmentD: 'normal' },
  },
}

/** A custom rule, for the shape a table cannot say: a value computed from copy count. */
const dosageLocus: Locus = {
  id: 'pigment-e',
  label: 'Pigment E',
  placement: { kind: 'autosomal' },
  alleles: [
    { id: 'wild-type', label: 'Wild type', origin: 'wild-type' },
    { id: 'variant-d', label: 'Variant D', origin: 'authored', invented: true },
  ],
  wildType: 'wild-type',
  expression: {
    kind: 'custom',
    describe: 'Each copy of Variant D adds 10 to the dosage value.',
    resolve: (pair: AllelePair, _ctx: ExpressionContext): TraitValues => {
      const copies = pair.filter((a) => a === 'variant-d').length
      return { dosage: copies * 10 }
    },
  },
}

/** Loci feeding a continuous trait. Two loci, so it is genuinely poly-genic. */
const sizeLocusA: Locus = {
  id: 'size-a',
  label: 'Size A',
  placement: { kind: 'autosomal' },
  alleles: [
    { id: 'wild-type', label: 'Wild type', origin: 'wild-type' },
    { id: 'big-a', label: 'Big A', origin: 'authored', invented: true },
  ],
  wildType: 'wild-type',
  expression: { kind: 'table', entries: {}, otherwise: {} },
}

const sizeLocusB: Locus = {
  id: 'size-b',
  label: 'Size B',
  placement: { kind: 'autosomal' },
  alleles: [
    { id: 'wild-type', label: 'Wild type', origin: 'wild-type' },
    { id: 'big-b', label: 'Big B', origin: 'authored', invented: true },
  ],
  wildType: 'wild-type',
  expression: { kind: 'table', entries: {}, otherwise: {} },
}

const spread: PolygenicTrait = {
  key: 'spread',
  label: 'Spread',
  baseline: 20,
  contributions: [
    { locus: 'size-a', perAllele: { 'big-a': 8 } },
    { locus: 'size-b', perAllele: { 'big-b': 8 } },
  ],
  environmentSd: 3,
  clamp: [0, 100],
}

/** A purely additive twin of `spread`, for the clean case with no weather in it. */
const spreadNoNoise: PolygenicTrait = { ...spread, key: 'spreadClean', environmentSd: 0 }

interface TestPhenotype {
  base: string
  markings: string[]
  intensity: number
  notes: string[]
}

function makeSpecies(
  overrides: Partial<SpeciesDefinition<TestPhenotype>> = {},
): SpeciesDefinition<TestPhenotype> {
  return {
    id: 'test-animal',
    label: 'Test Animal',
    sexSystem: XY,
    loci: [
      recessiveLocus,
      dominantLocus,
      incompleteLocus,
      seriesLocus,
      dosageLocus,
      sizeLocusA,
      sizeLocusB,
    ],
    polygenic: [spread, spreadNoNoise],
    basePhenotype: () => ({ base: 'default', markings: [], intensity: 0, notes: [] }),
    projections: [
      {
        key: 'pigmentA',
        apply: (draft, value) => {
          draft.base = value === 'none' ? 'pale' : 'dark'
        },
      },
      {
        key: 'pigmentB',
        apply: (draft, value) => {
          if (value === 'marked') draft.markings.push('bands')
        },
      },
      {
        key: 'pigmentC',
        apply: (draft, value) => {
          draft.intensity = typeof value === 'number' ? value : 0
        },
      },
    ],
    modifiers: [],
    viability: [],
    phenotypeKey: (p) => `${p.base}|${p.markings.join(',')}|${p.intensity}`,
    phenotypeLabel: (p) => `${p.base} ${p.markings.join(' ')}`.trim(),
    ...overrides,
  }
}

function individual(
  species: SpeciesDefinition<TestPhenotype>,
  id: string,
  sex: 'male' | 'female',
  overrides: Readonly<Record<string, AllelePair>> = {},
): Individual {
  return {
    id,
    species: species.id,
    genotype: makeGenotype(species, sex, overrides),
    parents: null,
    mutations: [],
  }
}

// ---------------------------------------------------------------------------
// Stage 1 — every inheritance mode resolves through the same table lookup
// ---------------------------------------------------------------------------

describe('deriveTraits — inheritance modes', () => {
  const species = makeSpecies()

  it('simple recessive: one copy shows nothing, two copies show', () => {
    const het = deriveTraits(
      individual(species, 'a', 'female', { 'pigment-a': ['variant-1', 'wild-type'] }),
      species,
    )
    const homo = deriveTraits(
      individual(species, 'b', 'female', { 'pigment-a': ['variant-1', 'variant-1'] }),
      species,
    )
    expect(het.pigmentA).toBe('full')
    expect(homo.pigmentA).toBe('none')
  })

  it('slot order does not matter — the key is sorted', () => {
    const one = deriveTraits(
      individual(species, 'a', 'female', { 'pigment-a': ['variant-1', 'wild-type'] }),
      species,
    )
    const other = deriveTraits(
      individual(species, 'b', 'female', { 'pigment-a': ['wild-type', 'variant-1'] }),
      species,
    )
    expect(one.pigmentA).toBe(other.pigmentA)
  })

  it('dominant with no super form: one copy and two copies look identical', () => {
    const het = deriveTraits(
      individual(species, 'a', 'female', { 'pigment-b': ['variant-2', 'wild-type'] }),
      species,
    )
    const homo = deriveTraits(
      individual(species, 'b', 'female', { 'pigment-b': ['variant-2', 'variant-2'] }),
      species,
    )
    expect(het.pigmentB).toBe('marked')
    expect(homo.pigmentB).toBe('marked')
  })

  it('incomplete dominance: the homozygote is a distinct third form', () => {
    const values = (pair: AllelePair, id: string) =>
      deriveTraits(individual(species, id, 'female', { 'pigment-c': pair }), species).pigmentC

    expect(values(['wild-type', 'wild-type'], 'a')).toBe(0)
    expect(values(['variant-3', 'wild-type'], 'b')).toBe(1)
    expect(values(['variant-3', 'variant-3'], 'c')).toBe(2)
  })

  it('multi-allele series: a compound heterozygote is its own phenotype', () => {
    const values = (pair: AllelePair, id: string) =>
      deriveTraits(individual(species, id, 'female', { 'pigment-d': pair }), species).pigmentD

    expect(values(['variant-x', 'variant-x'], 'a')).toBe('x-form')
    expect(values(['variant-y', 'variant-y'], 'b')).toBe('y-form')
    expect(values(['variant-x', 'variant-y'], 'c')).toBe('compound')
    // Neither single copy shows anything on its own — which is why a compound het surprises people.
    expect(values(['variant-x', 'wild-type'], 'd')).toBe('normal')
    expect(values(['variant-y', 'wild-type'], 'e')).toBe('normal')
  })

  it('a custom rule runs, and scales with copy number', () => {
    const values = (pair: AllelePair, id: string) =>
      deriveTraits(individual(species, id, 'female', { 'pigment-e': pair }), species).dosage

    expect(values(['wild-type', 'wild-type'], 'a')).toBe(0)
    expect(values(['variant-d', 'wild-type'], 'b')).toBe(10)
    expect(values(['variant-d', 'variant-d'], 'c')).toBe(20)
  })

  it('falls through to `otherwise` for a pair with no row of its own', () => {
    const sparse = makeSpecies({
      loci: [
        {
          ...seriesLocus,
          expression: {
            kind: 'table',
            entries: { 'variant-x/variant-x': { pigmentD: 'x-form' } },
            otherwise: { pigmentD: 'anything-else' },
          },
        },
      ],
      polygenic: [],
      projections: [],
    })
    const traits = deriveTraits(
      individual(sparse, 'a', 'female', { 'pigment-d': ['variant-x', 'variant-y'] }),
      sparse,
    )
    expect(traits.pigmentD).toBe('anything-else')
  })
})

// ---------------------------------------------------------------------------
// Sex-linkage — hemizygous loci express off a single copy
// ---------------------------------------------------------------------------

describe('deriveTraits — sex-linked loci', () => {
  const linkedLocus: Locus = {
    id: 'pigment-x',
    label: 'Pigment X',
    placement: { kind: 'sexLinked', chromosome: 'X' },
    alleles: [
      { id: 'wild-type', label: 'Wild type', origin: 'wild-type' },
      { id: 'variant-l', label: 'Variant L', origin: 'authored', invented: true },
    ],
    wildType: 'wild-type',
    expression: {
      kind: 'table',
      entries: {
        'wild-type/wild-type': { linked: 'normal' },
        'variant-l/wild-type': { linked: 'normal' },
        'variant-l/variant-l': { linked: 'affected' },
        // Hemizygous: one chromosome, so one allele, so a one-part key.
        'wild-type': { linked: 'normal' },
        'variant-l': { linked: 'affected' },
      },
      otherwise: { linked: 'normal' },
    },
  }

  const species = makeSpecies({
    loci: [linkedLocus],
    polygenic: [],
    projections: [],
  })

  it('a single copy in the heterogametic sex is enough to show', () => {
    const male = individual(species, 'm', 'male', { 'pigment-x': ['variant-l', null] })
    expect(deriveTraits(male, species).linked).toBe('affected')
  })

  it('the same single copy in the homogametic sex is masked by the other copy', () => {
    const female = individual(species, 'f', 'female', { 'pigment-x': ['variant-l', 'wild-type'] })
    expect(deriveTraits(female, species).linked).toBe('normal')
  })
})

// ---------------------------------------------------------------------------
// Polygenic traits
// ---------------------------------------------------------------------------

describe('deriveTraits — polygenic', () => {
  const species = makeSpecies()

  it('produces a continuous value, not a category', () => {
    const values = new Set<number>()
    for (let i = 0; i < 20; i++) {
      const value = deriveTraits(individual(species, `id-${i}`, 'female'), species).spread
      expect(typeof value).toBe('number')
      values.add(value as number)
    }
    // Same genotype every time, so any variety at all comes from the environmental term.
    expect(values.size).toBeGreaterThan(10)
  })

  it('is additive per copy, not per genotype', () => {
    const none = deriveTraits(individual(species, 'a', 'female'), species).spreadClean
    const one = deriveTraits(
      individual(species, 'b', 'female', { 'size-a': ['big-a', 'wild-type'] }),
      species,
    ).spreadClean
    const two = deriveTraits(
      individual(species, 'c', 'female', { 'size-a': ['big-a', 'big-a'] }),
      species,
    ).spreadClean

    expect(none).toBe(20)
    expect(one).toBe(28)
    expect(two).toBe(36) // +8 per copy, so a homozygote gets double.
  })

  it('clamps into range', () => {
    const narrow = makeSpecies({
      polygenic: [{ ...spreadNoNoise, clamp: [0, 30] }],
      projections: [],
    })
    const maxed = deriveTraits(
      individual(narrow, 'a', 'female', {
        'size-a': ['big-a', 'big-a'],
        'size-b': ['big-b', 'big-b'],
      }),
      narrow,
    ).spreadClean
    expect(maxed).toBe(30) // 20 + 32 = 52, clamped.
  })

  it('two high-value parents trend high compared with two baseline parents', () => {
    const high: Readonly<Record<string, AllelePair>> = {
      'size-a': ['big-a', 'big-a'],
      'size-b': ['big-b', 'big-b'],
    }
    const average = (overrides: Readonly<Record<string, AllelePair>>, tag: string) => {
      let total = 0
      const n = 200
      for (let i = 0; i < n; i++) {
        total += deriveTraits(individual(species, `${tag}-${i}`, 'female', overrides), species)
          .spread as number
      }
      return total / n
    }

    const baseline = average({}, 'base')
    const selected = average(high, 'sel')

    // 20 vs 52 before noise, and the noise has sd 3, so this gap is not close.
    expect(selected).toBeGreaterThan(baseline + 25)
  })

  it('the environmental term is not heritable — it depends only on the animal’s id', () => {
    const one = deriveTraits(individual(species, 'same-id', 'female'), species).spread
    const other = deriveTraits(
      // Different genotype at a locus that contributes nothing to `spread`.
      individual(species, 'same-id', 'female', { 'pigment-a': ['variant-1', 'variant-1'] }),
      species,
    ).spread
    expect(one).toBe(other)
  })

  it('environmentSd: 0 gives the clean, purely additive case', () => {
    const a = deriveTraits(individual(species, 'a', 'female'), species).spreadClean
    const b = deriveTraits(individual(species, 'b', 'female'), species).spreadClean
    expect(a).toBe(b)
  })
})

// ---------------------------------------------------------------------------
// Stage 4 — modifiers, where a combo becomes more than the sum of its parts
// ---------------------------------------------------------------------------

describe('express — modifiers', () => {
  /**
   * Two variants that each do something mild on their own. A modifier watches for both at once
   * and replaces the result entirely. Nothing in stage 3 could produce this, because stage 3
   * only ever sees one trait at a time.
   */
  const comboSpecies = makeSpecies({
    loci: [dominantLocus, incompleteLocus],
    polygenic: [],
    projections: [
      {
        key: 'pigmentB',
        apply: (draft, value) => {
          if (value === 'marked') draft.markings.push('bands')
        },
      },
      {
        key: 'pigmentC',
        apply: (draft, value) => {
          draft.intensity = typeof value === 'number' ? value : 0
          if (draft.intensity > 0) draft.markings.push('blush')
        },
      },
    ],
    modifiers: [
      {
        id: 'combination-effect',
        label: 'Combination effect',
        describe:
          'When Variant 2 and Variant 3 are both present, the two patterns fuse into a form ' +
          'neither produces on its own.',
        reads: ['pigment-b', 'pigment-c'],
        apply: (draft, ctx) => {
          if (ctx.traits.pigmentB === 'marked' && (ctx.traits.pigmentC as number) > 0) {
            draft.markings = ['fused']
            draft.base = 'silver'
          }
        },
      },
      {
        id: 'late-wash',
        label: 'Late wash',
        describe: 'Runs after everything else and removes all markings when intensity is maximal.',
        reads: ['pigment-c'],
        apply: (draft, ctx) => {
          if (ctx.traits.pigmentC === 2) draft.markings = []
        },
      },
    ],
  })

  it('a combo phenotype is not the sum of its parts', () => {
    const onlyB = express(
      individual(comboSpecies, 'a', 'female', { 'pigment-b': ['variant-2', 'wild-type'] }),
      comboSpecies,
    )
    const onlyC = express(
      individual(comboSpecies, 'b', 'female', { 'pigment-c': ['variant-3', 'wild-type'] }),
      comboSpecies,
    )
    const both = express(
      individual(comboSpecies, 'c', 'female', {
        'pigment-b': ['variant-2', 'wild-type'],
        'pigment-c': ['variant-3', 'wild-type'],
      }),
      comboSpecies,
    )

    expect(onlyB.markings).toEqual(['bands'])
    expect(onlyC.markings).toEqual(['blush'])
    // Not ['bands', 'blush'] — the union you would get if modifiers did not exist.
    expect(both.markings).toEqual(['fused'])
    expect(both.base).toBe('silver')
  })

  it('a later modifier sees and overrides an earlier one — order is the biology', () => {
    const superForm = express(
      individual(comboSpecies, 'd', 'female', {
        'pigment-b': ['variant-2', 'wild-type'],
        'pigment-c': ['variant-3', 'variant-3'],
      }),
      comboSpecies,
    )
    // `combination-effect` set ['fused']; `late-wash` runs after it and wins.
    expect(superForm.markings).toEqual([])
    expect(superForm.base).toBe('silver')
  })

  it('reordering the modifier array changes the result', () => {
    const reordered = makeSpecies({
      ...comboSpecies,
      modifiers: [...comboSpecies.modifiers].reverse(),
    })
    const animal = { 'pigment-b': ['variant-2', 'wild-type'] as AllelePair, 'pigment-c': ['variant-3', 'variant-3'] as AllelePair }

    expect(express(individual(comboSpecies, 'x', 'female', animal), comboSpecies).markings).toEqual([])
    // With `late-wash` first, `combination-effect` runs afterwards and puts 'fused' back.
    expect(express(individual(reordered, 'x', 'female', animal), reordered).markings).toEqual(['fused'])
  })
})

// ---------------------------------------------------------------------------
// Purity
// ---------------------------------------------------------------------------

describe('express — determinism and purity', () => {
  const species = makeSpecies()

  it('the same individual and species give a deep-equal phenotype every time', () => {
    const animal = individual(species, 'repeat-me', 'female', {
      'pigment-a': ['variant-1', 'variant-1'],
      'pigment-c': ['variant-3', 'wild-type'],
      'size-a': ['big-a', 'wild-type'],
    })
    expect(express(animal, species)).toEqual(express(animal, species))
  })

  it('returns a fresh object each call, so a caller cannot corrupt the next one', () => {
    const animal = individual(species, 'fresh', 'female')
    const first = express(animal, species)
    first.markings.push('scribbled-on')
    expect(express(animal, species).markings).toEqual([])
  })

  it('expressing one animal does not change another', () => {
    const a = individual(species, 'a', 'female', { 'pigment-c': ['variant-3', 'variant-3'] })
    const b = individual(species, 'b', 'female')
    const bBefore = express(b, species)
    express(a, species)
    expect(express(b, species)).toEqual(bBefore)
  })

  it('a projection still runs for a trait nobody expressed, with null', () => {
    const seen: unknown[] = []
    const sparse = makeSpecies({
      loci: [recessiveLocus],
      polygenic: [],
      projections: [
        {
          key: 'nobody-writes-this',
          apply: (draft, value) => {
            seen.push(value)
            draft.notes.push(String(value))
          },
        },
      ],
    })
    const result = express(individual(sparse, 'a', 'female'), sparse)
    expect(seen).toEqual([null])
    expect(result.notes).toEqual(['null'])
  })
})

// ---------------------------------------------------------------------------
// Guard rails
// ---------------------------------------------------------------------------

describe('deriveTraits — guard rails', () => {
  it('throws rather than expressing a locus that declares linkage', () => {
    const linked = makeSpecies({
      loci: [{ ...recessiveLocus, placement: { kind: 'autosomal', linkage: { group: 'g1', centimorgans: 5 } } }],
      polygenic: [],
      projections: [],
    })
    const animal: Individual = {
      id: 'a',
      species: linked.id,
      genotype: { sexChromosomes: ['X', 'X'], loci: { 'pigment-a': ['wild-type', 'wild-type'] } },
      parents: null,
      mutations: [],
    }
    expect(() => deriveTraits(animal, linked)).toThrow(/linkage/i)
  })

  it('throws with the locus named when a genotype is missing one', () => {
    const species = makeSpecies({ loci: [recessiveLocus], polygenic: [], projections: [] })
    const animal: Individual = {
      id: 'a',
      species: species.id,
      genotype: { sexChromosomes: ['X', 'X'], loci: {} },
      parents: null,
      mutations: [],
    }
    expect(() => deriveTraits(animal, species)).toThrow(/pigment-a/)
  })
})

// ---------------------------------------------------------------------------
// The fixtures themselves should be clean data
// ---------------------------------------------------------------------------

describe('validateSpecies — the fixtures in this file are valid', () => {
  it('reports no errors for the full test species', () => {
    const errors = validateSpecies(makeSpecies()).filter((i) => i.severity === 'error')
    expect(errors).toEqual([])
  })
})
