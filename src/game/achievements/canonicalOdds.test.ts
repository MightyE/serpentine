/**
 * Every number in `canonicalOdds.ts`, checked against what `punnett()` says about a real pairing
 * of real animals of a real species.
 *
 * This is the test that makes the reward model something other than a designer's opinion. If it
 * ever fails, an achievement somewhere is being paid for work the genetics does not agree exists.
 */
import { describe, expect, it } from 'vitest'
import { punnett, carrierProbability } from '../../genetics/distribution'
import type { AllelePair, Genotype, Individual, OffspringDistribution, SpeciesDefinition } from '../../genetics/types'
import type { Phenotype } from '../../render/contract'
import { ballPython, cornSnake, hognose } from '../../species'
import {
  makeIndividual,
  sexLinkedPair,
  wildTypeGenotype,
  withLoci,
} from '../../species/testSupport/fixtures'
import { CANONICAL_ODDS, ODDS_KEYS, type OddsKey } from './canonicalOdds'

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function pair(species: SpeciesDefinition<Phenotype>, motherLoci: Record<string, AllelePair>, fatherLoci: Record<string, AllelePair>): OffspringDistribution {
  const mother = individual(species, 'female', motherLoci)
  const father = individual(species, 'male', fatherLoci)
  return punnett(mother, father, species)
}

function individual(
  species: SpeciesDefinition<Phenotype>,
  sex: 'female' | 'male',
  loci: Record<string, AllelePair>,
): Individual {
  const base: Genotype = wildTypeGenotype(species, sex)
  return makeIndividual(species, withLoci(base, loci), `${species.id}-${sex}`)
}

/** Probability the offspring is homozygous for `allele` at `locus`. */
function homozygousProbability(distribution: OffspringDistribution, locus: string, allele: string): number {
  return (distribution.lociMarginals[locus] ?? []).reduce(
    (sum, outcome) => (outcome.value[0] === allele && outcome.value[1] === allele ? sum + outcome.probability : sum),
    0,
  )
}

/** Probability the offspring carries exactly this unordered pair of alleles. */
function pairProbability(distribution: OffspringDistribution, locus: string, a: string, b: string): number {
  return (distribution.lociMarginals[locus] ?? []).reduce((sum, outcome) => {
    const [x, y] = outcome.value
    const match = (x === a && y === b) || (x === b && y === a)
    return match ? sum + outcome.probability : sum
  }, 0)
}

/** Probability over a joint distribution, for a predicate on the offspring's genotype. */
function jointProbability(
  distribution: OffspringDistribution,
  loci: readonly string[],
  predicate: (loci: Readonly<Record<string, AllelePair>>) => boolean,
): number {
  return distribution
    .joint(loci)
    .reduce((sum, row) => (predicate(row.value.loci) ? sum + row.probability : sum), 0)
}

const isHomozygous = (p: AllelePair | undefined, allele: string): boolean =>
  p !== undefined && p[0] === allele && p[1] === allele

const carries = (p: AllelePair | undefined, allele: string): boolean =>
  p !== undefined && (p[0] === allele || p[1] === allele)

const het = (allele: string): AllelePair => [allele, 'wild-type']
const homo = (allele: string): AllelePair => [allele, allele]

// ---------------------------------------------------------------------------
// the verification table
// ---------------------------------------------------------------------------

/**
 * One entry per key in `CANONICAL_ODDS`, each computing the probability from the engine rather
 * than restating it. The `it` blocks below compare the two.
 */
const VERIFIED: Record<OddsKey, () => number> = {
  dominantHetXWildType: () => {
    // Pinstripe is a simple dominant on ball python.
    const d = pair(ballPython, { pinstripe: het('pinstripe') }, {})
    return carrierProbability(d, 'pinstripe', 'pinstripe')
  },

  dominantHetXHet: () => {
    const d = pair(ballPython, { pinstripe: het('pinstripe') }, { pinstripe: het('pinstripe') })
    return carrierProbability(d, 'pinstripe', 'pinstripe')
  },

  incompleteDomSuperFromHetXHet: () => {
    // Pastel is incomplete-dominant; the homozygote is Super Pastel.
    const d = pair(ballPython, { pastel: het('pastel') }, { pastel: het('pastel') })
    return homozygousProbability(d, 'pastel', 'pastel')
  },

  recessiveFromCarrierXCarrier: () => {
    const d = pair(ballPython, { piebald: het('piebald') }, { piebald: het('piebald') })
    return homozygousProbability(d, 'piebald', 'piebald')
  },

  recessiveFromCarrierXHomozygote: () => {
    const d = pair(ballPython, { piebald: het('piebald') }, { piebald: homo('piebald') })
    return homozygousProbability(d, 'piebald', 'piebald')
  },

  doubleRecessiveFromDoubleCarriers: () => {
    // Corn snake: amelanistic and anerythristic are independent recessives. Both together is Snow.
    const parent = { amel: het('amel'), anery: het('anery') }
    const d = pair(cornSnake, parent, parent)
    return jointProbability(d, ['amel', 'anery'], (loci) =>
      isHomozygous(loci['amel'], 'amel') && isHomozygous(loci['anery'], 'anery'),
    )
  },

  tripleRecessiveFromTripleCarriers: () => {
    // Hognose: albino, axanthic and lavender are three independent recessives.
    const parent = {
      'hognose-albino': het('albino'),
      'hognose-axanthic': het('axanthic'),
      'hognose-lavender': het('lavender'),
    }
    const d = pair(hognose, parent, parent)
    return jointProbability(d, ['hognose-albino', 'hognose-axanthic', 'hognose-lavender'], (loci) =>
      isHomozygous(loci['hognose-albino'], 'albino') &&
      isHomozygous(loci['hognose-axanthic'], 'axanthic') &&
      isHomozygous(loci['hognose-lavender'], 'lavender'),
    )
  },

  superAndRecessiveFromDoubleHets: () => {
    // Hognose: anaconda is incomplete-dominant (the homozygote is Superconda, and it hatches);
    // albino is a simple recessive. Both homozygous at once.
    const parent = { 'hognose-anaconda': het('anaconda'), 'hognose-albino': het('albino') }
    const d = pair(hognose, parent, parent)
    return jointProbability(d, ['hognose-anaconda', 'hognose-albino'], (loci) =>
      isHomozygous(loci['hognose-anaconda'], 'anaconda') && isHomozygous(loci['hognose-albino'], 'albino'),
    )
  },

  recessiveOnDominantBackground: () => {
    // A piebald that is also pinstripe: one recessive quarter times three dominant quarters.
    const parent = { piebald: het('piebald'), pinstripe: het('pinstripe') }
    const d = pair(ballPython, parent, parent)
    return jointProbability(d, ['piebald', 'pinstripe'], (loci) =>
      isHomozygous(loci['piebald'], 'piebald') && carries(loci['pinstripe'], 'pinstripe'),
    )
  },

  ultramelFromTwoHomozygotes: () => {
    // Albino and candy are alleles of one series. Homozygote × homozygote gives only the compound.
    const d = pair(ballPython, { albino: homo('albino') }, { albino: homo('candy') })
    return pairProbability(d, 'albino', 'albino', 'candy')
  },

  compoundFromTwoHeterozygotes: () => {
    // Lesser and mojave are alleles of the BEL series; any two of them together is leucistic.
    const d = pair(ballPython, { bel: het('lesser') }, { bel: het('mojave') })
    return pairProbability(d, 'bel', 'lesser', 'mojave')
  },

  champagneHetXHet: () => {
    const d = pair(ballPython, { champagne: het('champagne') }, { champagne: het('champagne') })
    return pairProbability(d, 'champagne', 'champagne', 'wild-type')
  },

  wildTypeFromChampagneHetXHet: () => {
    const d = pair(ballPython, { champagne: het('champagne') }, { champagne: het('champagne') })
    return homozygousProbability(d, 'champagne', 'wild-type')
  },

  yLinkedFromCarrierFather: () => {
    // Coral glow sits on the Y, so every son has it and no daughter can.
    const d = pair(ballPython, {}, { 'coral-glow': sexLinkedPair(ballPython, 'male', 'coral-glow', 'coral-glow') })
    return carrierProbability(d, 'coral-glow', 'coral-glow')
  },

  maskedTraitRevealed: () => {
    // Umbra masks amelanistic. An amel you can actually see is one that did not also get umbra.
    const parent = { amel: het('amel'), umbra: het('umbra') }
    const d = pair(cornSnake, parent, parent)
    return jointProbability(d, ['amel', 'umbra'], (loci) =>
      isHomozygous(loci['amel'], 'amel') && !isHomozygous(loci['umbra'], 'umbra'),
    )
  },
}

// ---------------------------------------------------------------------------

describe('canonical odds', () => {
  it('verifies every entry — an unverified one is a failure, not an omission', () => {
    expect(Object.keys(VERIFIED).sort()).toEqual([...ODDS_KEYS].sort())
  })

  for (const key of ODDS_KEYS) {
    it(`${key}: ${CANONICAL_ODDS[key].pairing}`, () => {
      expect(VERIFIED[key]()).toBeCloseTo(CANONICAL_ODDS[key].probabilityPerHatchling, 10)
    })
  }

  it('champagne het × het loses exactly a quarter of the clutch to the super', () => {
    const d = pair(ballPython, { champagne: het('champagne') }, { champagne: het('champagne') })
    expect(d.nonViableProbability).toBeCloseTo(1 / 4, 10)
    // And the two surviving outcomes are the 1:2 the odds table claims, summing to one.
    expect(
      CANONICAL_ODDS.champagneHetXHet.probabilityPerHatchling +
        CANONICAL_ODDS.wildTypeFromChampagneHetXHet.probabilityPerHatchling,
    ).toBeCloseTo(1, 10)
  })

  it('a Y-linked trait never reaches a daughter, so half the clutch is unreachable by design', () => {
    const d = pair(ballPython, {}, { 'coral-glow': sexLinkedPair(ballPython, 'male', 'coral-glow', 'coral-glow') })
    expect(d.sexRatio.male).toBeCloseTo(1 / 2, 10)
    const daughtersCarrying = jointProbability(d, ['coral-glow'], (loci) => carries(loci['coral-glow'], 'coral-glow'))
    // Every carrier is a son: the carrier probability equals the male share exactly.
    expect(daughtersCarrying).toBeCloseTo(d.sexRatio.male, 10)
  })
})
