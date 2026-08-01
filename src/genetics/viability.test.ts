/**
 * Tests for viability and for species validation.
 *
 * As in `expression.test.ts`, every locus and allele here is invented and generic. The engine
 * must never learn what a snake is.
 *
 * On viability: the thing being tested is "this egg does not hatch, and here is the sentence
 * explaining why". That is the entire feature. There is no health, no death, no cull — the
 * `explanation` string is the whole player-facing surface, and these tests assert that it comes
 * back attached to the rule that produced it.
 */

import { describe, expect, it } from 'vitest'
import { checkViability } from './viability'
import { makeGenotype } from './genotype'
import { validateSpecies } from './validate'
import type { Locus, SexSystem, SpeciesDefinition, ViabilityRule } from './types'

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

const locusA: Locus = {
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
      'wild-type/wild-type': { pigmentA: 0 },
      'variant-1/wild-type': { pigmentA: 1 },
      'variant-1/variant-1': { pigmentA: 2 },
    },
    otherwise: { pigmentA: 0 },
  },
}

const locusB: Locus = {
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

interface TestPhenotype {
  base: string
  markings: string[]
}

/**
 * The classic shape: the *homozygous* form of an otherwise ordinary variant does not hatch.
 * This is what turns an expected 1 : 2 : 1 into an observed 2 : 1 — the discrepancy a breeder
 * notices and reasons backwards from.
 */
const superFormRule: ViabilityRule = {
  id: 'pigment-a-super',
  label: 'Two copies of Variant 1',
  involves: ['pigment-a'],
  explanation:
    'Two copies of Variant 1 stop the embryo developing, so an egg with this combination does ' +
    'not hatch. It is why pairing two Variant 1 animals gives about a third fewer hatchlings ' +
    'than the Punnett square alone predicts.',
  isNonViable: (genotype) => {
    const pair = genotype.loci['pigment-a']
    return pair?.[0] === 'variant-1' && pair[1] === 'variant-1'
  },
}

function makeSpecies(
  overrides: Partial<SpeciesDefinition<TestPhenotype>> = {},
): SpeciesDefinition<TestPhenotype> {
  return {
    id: 'test-animal',
    label: 'Test Animal',
    sexSystem: XY,
    loci: [locusA, locusB],
    polygenic: [],
    basePhenotype: () => ({ base: 'default', markings: [] }),
    projections: [],
    modifiers: [],
    viability: [superFormRule],
    phenotypeKey: (p) => `${p.base}|${p.markings.join(',')}`,
    phenotypeLabel: (p) => p.base,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// checkViability
// ---------------------------------------------------------------------------

describe('checkViability', () => {
  const species = makeSpecies()

  it('passes a viable genotype and says nothing more', () => {
    const result = checkViability(makeGenotype(species, 'female'), species)
    expect(result.viable).toBe(true)
    expect(result.ruleId).toBeUndefined()
    expect(result.explanation).toBeUndefined()
  })

  it('passes a heterozygote — one copy is fine', () => {
    const het = makeGenotype(species, 'male', { 'pigment-a': ['variant-1', 'wild-type'] })
    expect(checkViability(het, species).viable).toBe(true)
  })

  it('flags the declared non-viable genotype, with the rule id and the explanation', () => {
    const homo = makeGenotype(species, 'female', { 'pigment-a': ['variant-1', 'variant-1'] })
    const result = checkViability(homo, species)

    expect(result.viable).toBe(false)
    expect(result.ruleId).toBe('pigment-a-super')
    expect(result.explanation).toBe(superFormRule.explanation)
  })

  it('is fast and permissive when a species declares no rules at all', () => {
    const plain = makeSpecies({ viability: [] })
    const homo = makeGenotype(plain, 'female', { 'pigment-a': ['variant-1', 'variant-1'] })
    expect(checkViability(homo, plain)).toEqual({ viable: true })
  })

  it('the first matching rule wins, so authors control which explanation is shown', () => {
    const second: ViabilityRule = {
      ...superFormRule,
      id: 'also-matches',
      explanation: 'A less useful way of saying the same thing.',
    }
    const ordered = makeSpecies({ viability: [superFormRule, second] })
    const homo = makeGenotype(ordered, 'female', { 'pigment-a': ['variant-1', 'variant-1'] })
    expect(checkViability(homo, ordered).ruleId).toBe('pigment-a-super')
  })

  it('a rule may depend on sex, and sex comes from the chromosomes', () => {
    const sexDependent: ViabilityRule = {
      id: 'males-only',
      label: 'Males only',
      involves: ['pigment-b'],
      explanation:
        'This combination only fails to develop in males; female eggs with the same genotype ' +
        'hatch normally.',
      isNonViable: (genotype, sex) =>
        sex === 'male' && genotype.loci['pigment-b']?.[0] === 'variant-2',
    }
    const species = makeSpecies({ viability: [sexDependent] })

    const male = makeGenotype(species, 'male', { 'pigment-b': ['variant-2', 'variant-2'] })
    const female = makeGenotype(species, 'female', { 'pigment-b': ['variant-2', 'variant-2'] })

    expect(checkViability(male, species).viable).toBe(false)
    expect(checkViability(female, species).viable).toBe(true)
  })

  it('works the same way in a ZW species, with nothing special-cased', () => {
    const zwSpecies = makeSpecies({ sexSystem: ZW })
    const homo = makeGenotype(zwSpecies, 'female', { 'pigment-a': ['variant-1', 'variant-1'] })
    expect(checkViability(homo, zwSpecies).viable).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// validateSpecies
// ---------------------------------------------------------------------------

describe('validateSpecies', () => {
  const errorsOf = (species: SpeciesDefinition<TestPhenotype>) =>
    validateSpecies(species).filter((i) => i.severity === 'error')

  it('accepts clean data', () => {
    expect(errorsOf(makeSpecies())).toEqual([])
  })

  it('catches a wildType that is not in the allele list', () => {
    const broken = makeSpecies({
      loci: [{ ...locusA, wildType: 'wlid-type' }, locusB],
    })
    const errors = errorsOf(broken)
    expect(errors.some((i) => i.path === 'loci.pigment-a.wildType')).toBe(true)
    expect(errors[0]?.message).toMatch(/wlid-type/)
  })

  it('catches an expression-table key naming an allele that does not exist', () => {
    const broken = makeSpecies({
      loci: [
        {
          ...locusA,
          expression: {
            kind: 'table',
            entries: {
              'wild-type/wild-type': { pigmentA: 0 },
              // Typo: `varaint-1`. Without this check the row silently never matches.
              'varaint-1/wild-type': { pigmentA: 1 },
            },
            otherwise: { pigmentA: 0 },
          },
        },
        locusB,
      ],
    })
    const errors = errorsOf(broken)
    expect(errors.some((i) => i.message.includes('varaint-1'))).toBe(true)
  })

  it('catches an unsorted expression-table key, which would never match', () => {
    const broken = makeSpecies({
      loci: [
        {
          ...locusA,
          expression: {
            kind: 'table',
            // 'wild-type/variant-1' — right alleles, wrong order. Lookups sort first.
            entries: { 'wild-type/variant-1': { pigmentA: 1 } },
            otherwise: { pigmentA: 0 },
          },
        },
        locusB,
      ],
    })
    const errors = errorsOf(broken)
    expect(errors.some((i) => /canonical|sorted/i.test(i.message))).toBe(true)
  })

  it('catches a sex-linked locus naming a chromosome the sex system does not have', () => {
    // A ZW species with a locus placed on 'X'. No animal could carry it.
    const broken = makeSpecies({
      sexSystem: ZW,
      loci: [{ ...locusA, placement: { kind: 'sexLinked', chromosome: 'X' } }, locusB],
    })
    const errors = errorsOf(broken)
    expect(errors.some((i) => i.path === 'loci.pigment-a.placement.chromosome')).toBe(true)
  })

  it('throws — does not merely report — on a linkage block', () => {
    const broken = makeSpecies({
      loci: [
        { ...locusA, placement: { kind: 'autosomal', linkage: { group: 'g1', centimorgans: 12 } } },
        locusB,
      ],
    })
    expect(() => validateSpecies(broken)).toThrow(/linkage/i)
  })

  it('catches a modifier whose `reads` omits a locus it touches', () => {
    const broken = makeSpecies({
      modifiers: [
        {
          id: 'forgot-one',
          label: 'Forgot one',
          describe: 'Reads two loci but only admits to one.',
          reads: ['pigment-a'],
          apply: (draft, ctx) => {
            const a = ctx.genotype.loci['pigment-a']
            const b = ctx.genotype.loci['pigment-b'] // undeclared
            if (a?.[0] === 'variant-1' && b?.[0] === 'variant-2') draft.base = 'combined'
          },
        },
      ],
    })
    const warnings = validateSpecies(broken).filter((i) => i.severity === 'warning')
    expect(
      warnings.some((i) => i.path === 'modifiers.forgot-one.reads' && i.message.includes('pigment-b')),
    ).toBe(true)
  })

  it('counts reading a *trait* as reading the locus that produced it', () => {
    const broken = makeSpecies({
      modifiers: [
        {
          id: 'via-traits',
          label: 'Via traits',
          describe: 'Reads a trait value without declaring the locus behind it.',
          reads: [],
          apply: (draft, ctx) => {
            if (ctx.traits.pigmentB === 'marked') draft.markings.push('extra')
          },
        },
      ],
    })
    const warnings = validateSpecies(broken).filter((i) => i.severity === 'warning')
    expect(
      warnings.some((i) => i.path === 'modifiers.via-traits.reads' && i.message.includes('pigment-b')),
    ).toBe(true)
  })

  it('catches a viability rule whose `involves` omits a locus it reads', () => {
    const broken = makeSpecies({
      viability: [
        {
          id: 'under-declared',
          label: 'Under-declared',
          involves: [],
          explanation: 'An egg with this combination does not hatch.',
          isNonViable: (genotype) => genotype.loci['pigment-a']?.[0] === 'variant-1',
        },
      ],
    })
    const warnings = validateSpecies(broken).filter((i) => i.severity === 'warning')
    expect(
      warnings.some(
        (i) => i.path === 'viability.under-declared.involves' && i.message.includes('pigment-a'),
      ),
    ).toBe(true)
  })

  it('catches `reads` naming a locus the species does not have', () => {
    const broken = makeSpecies({
      modifiers: [
        {
          id: 'ghost-locus',
          label: 'Ghost locus',
          describe: 'Declares a locus that was renamed away.',
          reads: ['pigment-z'],
          apply: () => {},
        },
      ],
    })
    expect(errorsOf(broken).some((i) => i.message.includes('pigment-z'))).toBe(true)
  })

  it('catches a duplicate allele id and a locus with fewer than two alleles', () => {
    const broken = makeSpecies({
      loci: [
        {
          ...locusA,
          alleles: [
            { id: 'wild-type', label: 'Wild type', origin: 'wild-type' },
            { id: 'wild-type', label: 'Duplicate', origin: 'wild-type' },
          ],
        },
        { ...locusB, alleles: [{ id: 'wild-type', label: 'Wild type', origin: 'wild-type' }] },
      ],
    })
    const errors = errorsOf(broken)
    expect(errors.some((i) => i.message.includes('declared twice'))).toBe(true)
    expect(errors.some((i) => i.message.includes('at least two'))).toBe(true)
  })

  it('catches a polygenic contribution pointing at a locus or allele that does not exist', () => {
    const broken = makeSpecies({
      polygenic: [
        {
          key: 'spread',
          label: 'Spread',
          baseline: 0,
          contributions: [
            { locus: 'nowhere', perAllele: { 'variant-1': 2 } },
            { locus: 'pigment-a', perAllele: { 'not-an-allele': 2 } },
          ],
          environmentSd: 0,
          clamp: [0, 10],
        },
      ],
    })
    const errors = errorsOf(broken)
    expect(errors.some((i) => i.message.includes('nowhere'))).toBe(true)
    expect(errors.some((i) => i.message.includes('not-an-allele'))).toBe(true)
  })

  it('warns when an authored allele does not say whether it is invented', () => {
    const broken = makeSpecies({
      loci: [
        {
          ...locusA,
          alleles: [
            { id: 'wild-type', label: 'Wild type', origin: 'wild-type' },
            { id: 'variant-1', label: 'Variant 1', origin: 'authored' },
          ],
        },
        locusB,
      ],
    })
    const warnings = validateSpecies(broken).filter((i) => i.severity === 'warning')
    expect(warnings.some((i) => i.path.endsWith('.invented'))).toBe(true)
  })

  it('warns when two loci fight over the same trait key', () => {
    const broken = makeSpecies({
      loci: [
        locusA,
        {
          ...locusB,
          expression: {
            kind: 'table',
            entries: { 'wild-type/wild-type': { pigmentA: 99 } },
            otherwise: { pigmentA: 99 },
          },
        },
      ],
    })
    const warnings = validateSpecies(broken).filter((i) => i.severity === 'warning')
    expect(warnings.some((i) => i.message.includes('pigmentA'))).toBe(true)
  })
})
