/**
 * Tests for mutation — the arrival of an allele that was not there before.
 *
 * Fixtures are invented and generic, like everywhere else in `src/genetics/`. Rates here are
 * absurd on purpose: `applyMutation` is exercised at rate 1 and at rate 0, because the two
 * things worth pinning down are "it happens when it should" and "it *never* happens when it
 * should not". The in-between is a content tuning decision, not an engine property.
 */

import { afterEach, describe, expect, it } from 'vitest'
import type {
  Allele,
  Individual,
  Locus,
  MutationEvent,
  SexSystem,
  SpeciesDefinition,
  TraitValues,
} from './types'
import { makeGenotype } from './genotype'
import { breed } from './breeding'
import {
  allelesAt,
  applyMutation,
  discoveredAlleleRecords,
  registerNovelAlleleGenerator,
  resetMutationRegistry,
  restoreDiscoveredAlleles,
} from './mutation'
import { makeRng } from '../lib/rng'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface TestPhenotype {
  readonly look: string
}

const SYSTEM: SexSystem = {
  id: 'test-system',
  homogameticChromosome: 'H',
  heterogameticChromosome: 'K',
  heterogameticSex: 'male',
}

const NORMAL: TraitValues = { look: 'normal' }

function locusWith(mutation: Locus['mutation'], alleles?: readonly Allele[]): Locus {
  return {
    id: 'pigment-a',
    label: 'Pigment A',
    placement: { kind: 'autosomal' },
    alleles: alleles ?? [
      { id: 'wild-type', label: 'Wild type', origin: 'wild-type' },
      { id: 'variant-a', label: 'Variant A', origin: 'authored' },
    ],
    wildType: 'wild-type',
    expression: { kind: 'table', entries: {}, otherwise: NORMAL },
    mutation,
  }
}

function speciesWith(locus: Locus): SpeciesDefinition<TestPhenotype> {
  return {
    id: 'test-species',
    label: 'Test species',
    sexSystem: SYSTEM,
    loci: [locus],
    polygenic: [],
    basePhenotype: () => ({ look: 'normal' }),
    projections: [],
    modifiers: [],
    viability: [],
    phenotypeKey: (p) => p.look,
    phenotypeLabel: (p) => p.look,
  }
}

/** A generator that builds an allele purely from its seed — the contract it has to honour. */
const GENERATOR = {
  id: 'test-generator',
  create: (seed: string, locus: Locus): Allele => {
    const rng = makeRng(seed)
    const tag = rng.int(0, 0xffff).toString(16).padStart(4, '0')
    return {
      id: `${locus.id}-novel-${tag}`,
      label: `Unnamed variant ${tag.toUpperCase()}`,
      origin: 'discovered',
      invented: true,
    }
  },
}

afterEach(() => {
  // Module-level registries are process-wide. Leaving one test's discoveries lying around for
  // the next is exactly the trap `resetMutationRegistry` exists to close.
  resetMutationRegistry()
})

// ---------------------------------------------------------------------------
// The roll
// ---------------------------------------------------------------------------

describe('applyMutation()', () => {
  it('never fires at a rate of zero, however many times you ask', () => {
    const locus = locusWith({ ratePerAllele: 0, outcomes: [{ value: 'variant-a', probability: 1 }] })
    for (let i = 0; i < 5000; i++) {
      expect(applyMutation(locus, 'wild-type', 'parent-1', makeRng(`zero:${i}`))).toBeNull()
    }
  })

  it('never fires for a locus that declares no mutation at all', () => {
    const locus = locusWith(undefined)
    for (let i = 0; i < 1000; i++) {
      expect(applyMutation(locus, 'wild-type', 'parent-1', makeRng(`none:${i}`))).toBeNull()
    }
  })

  it('records where the mutation came from, where it went, and who it happened to', () => {
    const locus = locusWith({ ratePerAllele: 1, outcomes: [{ value: 'variant-a', probability: 1 }] })
    const event = applyMutation(locus, 'wild-type', 'parent-1', makeRng('certain'))
    expect(event).toEqual<MutationEvent>({
      locus: 'pigment-a',
      from: 'wild-type',
      to: 'variant-a',
      parent: 'parent-1',
    })
  })

  it('does not count turning into the allele you already had as a mutation', () => {
    // The only declared outcome is the allele we started from, so there is nowhere to go.
    const locus = locusWith({ ratePerAllele: 1, outcomes: [{ value: 'variant-a', probability: 1 }] })
    expect(applyMutation(locus, 'variant-a', 'parent-1', makeRng('self'))).toBeNull()
  })

  it('is deterministic in its rng', () => {
    const locus = locusWith({
      ratePerAllele: 0.5,
      outcomes: [{ value: 'variant-a', probability: 1 }],
      novel: { generatorId: 'test-generator', weight: 1 },
    })
    registerNovelAlleleGenerator(GENERATOR)
    for (let i = 0; i < 50; i++) {
      const a = applyMutation(locus, 'wild-type', 'p', makeRng(`det:${i}`))
      const b = applyMutation(locus, 'wild-type', 'p', makeRng(`det:${i}`))
      expect(a).toEqual(b)
    }
  })

  it('respects the relative weights of its declared outcomes', () => {
    const locus = locusWith(
      {
        ratePerAllele: 1,
        outcomes: [
          { value: 'variant-a', probability: 3 },
          { value: 'variant-b', probability: 1 },
        ],
      },
      [
        { id: 'wild-type', label: 'Wild type', origin: 'wild-type' },
        { id: 'variant-a', label: 'Variant A', origin: 'authored' },
        { id: 'variant-b', label: 'Variant B', origin: 'authored' },
      ],
    )
    let a = 0
    const n = 4000
    for (let i = 0; i < n; i++) {
      if (applyMutation(locus, 'wild-type', 'p', makeRng(`weights:${i}`))?.to === 'variant-a') a++
    }
    // Seeded, so this is a constant; the window is ~2 sd of the true binomial (sd ≈ 27).
    expect(a / n).toBeGreaterThan(0.735)
    expect(a / n).toBeLessThan(0.765)
  })
})

// ---------------------------------------------------------------------------
// Novel alleles
// ---------------------------------------------------------------------------

describe('novel alleles', () => {
  const novelLocus = locusWith({
    ratePerAllele: 1,
    outcomes: [],
    novel: { generatorId: 'test-generator', weight: 1 },
  })

  it('invents an allele that the locus did not previously declare', () => {
    registerNovelAlleleGenerator(GENERATOR)
    const event = applyMutation(novelLocus, 'wild-type', 'p', makeRng('novel-1'))!
    expect(event).not.toBeNull()
    expect(event.to).toMatch(/^pigment-a-novel-[0-9a-f]{4}$/)
    expect(novelLocus.alleles.some((a) => a.id === event.to)).toBe(false)
    expect(allelesAt(novelLocus).some((a) => a.id === event.to)).toBe(true)
  })

  it('labels the invented allele as discovered and fictional', () => {
    registerNovelAlleleGenerator(GENERATOR)
    const event = applyMutation(novelLocus, 'wild-type', 'p', makeRng('novel-2'))!
    const allele = allelesAt(novelLocus).find((a) => a.id === event.to)!
    expect(allele.origin).toBe('discovered')
    expect(allele.invented).toBe(true)
  })

  it('throws if the locus names a generator nobody registered', () => {
    expect(() => applyMutation(novelLocus, 'wild-type', 'p', makeRng('missing'))).toThrow(
      /test-generator/,
    )
  })

  it('refuses two different generators sharing one id, because saves store the id', () => {
    registerNovelAlleleGenerator(GENERATOR)
    expect(() =>
      registerNovelAlleleGenerator({ id: 'test-generator', create: GENERATOR.create.bind(null) }),
    ).toThrow(/already registered/)
  })

  /**
   * The save-file round trip, which is the entire reason `DiscoveredAllele` stores
   * `{ generatorId, seed }` instead of the allele itself: a fresh process with nothing in
   * memory rebuilds a byte-identical allele from three strings.
   */
  it('rebuilds discovered alleles exactly from a save file', () => {
    registerNovelAlleleGenerator(GENERATOR)
    const event = applyMutation(novelLocus, 'wild-type', 'p', makeRng('round-trip'))!
    const before = allelesAt(novelLocus).find((a) => a.id === event.to)!
    const saved = discoveredAlleleRecords()
    expect(saved).toHaveLength(1)
    expect(saved[0]).toEqual({
      locus: 'pigment-a',
      generatorId: 'test-generator',
      seed: expect.stringMatching(/^pigment-a:/),
    })

    // Simulate quitting and reloading: everything gone, generators re-registered, save applied.
    resetMutationRegistry()
    expect(allelesAt(novelLocus)).toEqual(novelLocus.alleles)
    registerNovelAlleleGenerator(GENERATOR)
    restoreDiscoveredAlleles(saved)

    const after = allelesAt(novelLocus).find((a) => a.id === event.to)
    expect(after).toEqual(before)
  })

  it('refuses to restore an allele whose generator is missing, rather than dropping it', () => {
    // Dropping it would leave saved animals holding an allele id that resolves to nothing.
    registerNovelAlleleGenerator(GENERATOR)
    applyMutation(novelLocus, 'wild-type', 'p', makeRng('orphan'))
    const saved = discoveredAlleleRecords()
    resetMutationRegistry()
    expect(() => restoreDiscoveredAlleles(saved)).toThrow(/no generator is registered/)
  })
})

// ---------------------------------------------------------------------------
// Mutation as it actually reaches the player: through breeding
// ---------------------------------------------------------------------------

describe('mutation during breeding', () => {
  function parentsFor(locus: Locus) {
    const species = speciesWith(locus)
    const make = (id: string, sex: 'male' | 'female'): Individual => ({
      id,
      species: species.id,
      genotype: makeGenotype(species, sex),
      parents: null,
      mutations: [],
    })
    return { species, mother: make('m', 'female'), father: make('f', 'male') }
  }

  it('produces no mutation events at all when every rate is zero', () => {
    const { species, mother, father } = parentsFor(
      locusWith({ ratePerAllele: 0, outcomes: [{ value: 'variant-a', probability: 1 }] }),
    )
    const clutch = breed({ mother, father, clutchSize: 500, seed: 'no-mutation' }, species)
    expect(clutch.hatched).toHaveLength(500)
    for (const child of clutch.hatched) {
      expect(child.mutations).toEqual([])
      expect(child.genotype.loci['pigment-a']).toEqual(['wild-type', 'wild-type'])
    }
  })

  it('carries a forced mutation into the hatchling and records it on the animal', () => {
    const { species, mother, father } = parentsFor(
      locusWith({ ratePerAllele: 1, outcomes: [{ value: 'variant-a', probability: 1 }] }),
    )
    const clutch = breed({ mother, father, clutchSize: 20, seed: 'all-mutation' }, species)
    for (const child of clutch.hatched) {
      // Both parents' gametes mutated, so the animal is homozygous for a brand-new allele.
      expect(child.genotype.loci['pigment-a']).toEqual(['variant-a', 'variant-a'])
      expect(child.mutations).toHaveLength(2)
      expect(child.mutations.map((m) => m.parent).sort()).toEqual(['f', 'm'])
      for (const event of child.mutations) {
        expect(event).toMatchObject({ locus: 'pigment-a', from: 'wild-type', to: 'variant-a' })
      }
    }
  })

  it('introduces a novel allele into a clutch, reproducibly', () => {
    registerNovelAlleleGenerator(GENERATOR)
    const { species, mother, father } = parentsFor(
      locusWith({
        ratePerAllele: 0.02,
        outcomes: [],
        novel: { generatorId: 'test-generator', weight: 1 },
      }),
    )
    const request = { mother, father, clutchSize: 300, seed: 'discovery-run' }
    const clutch = breed(request, species)

    const mutants = clutch.hatched.filter((c) => c.mutations.length > 0)
    expect(mutants.length).toBeGreaterThan(0)
    for (const mutant of mutants) {
      const event = mutant.mutations[0]!
      expect(event.from).toBe('wild-type')
      expect(event.to).not.toBe('wild-type')
      // The engine knows the truth. The player does not — they will have to breed it out.
      expect(allelesAt(species.loci[0]!).some((a) => a.id === event.to)).toBe(true)
    }

    // Replaying the same request yields the same discovery, which is what makes a mutant
    // hatchling shareable and a bug report about one replayable.
    const again = breed(request, species)
    expect(again).toEqual(clutch)
  })

  it('keeps the mutation stream from disturbing which alleles segregate', () => {
    // The same cross, run with mutation off and with mutation on but impossible to satisfy
    // (its only declared outcome is the allele already present). Inheritance must be identical:
    // meiosis and mutation draw from forked, independent streams, so adding mutation rolls to
    // the engine can never quietly change what every existing save inherited.
    const inert = { ratePerAllele: 0.5, outcomes: [{ value: 'wild-type', probability: 1 }] }
    const off = parentsFor(locusWith(undefined))
    const on = parentsFor(locusWith(inert))
    const seed = 'stream-isolation'
    const a = breed({ mother: off.mother, father: off.father, clutchSize: 200, seed }, off.species)
    const b = breed({ mother: on.mother, father: on.father, clutchSize: 200, seed }, on.species)
    expect(b.hatched.map((c) => c.genotype)).toEqual(a.hatched.map((c) => c.genotype))
  })
})
