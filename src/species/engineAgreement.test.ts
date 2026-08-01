/**
 * The two engines must agree.
 *
 * `testSupport/referenceEngine.ts` is a self-contained second implementation of the genetics
 * contract, written before the real engine existed so that species content could be tested
 * against the *contract* rather than against whatever the engine happened to do. It is still used
 * by every species test, which is a genuinely good property — a bug shared between the content and
 * the engine cannot hide, because the content is being checked by an independent implementation.
 *
 * It is also the one arrangement that goes bad silently. Two engines that quietly disagree are
 * worse than either alone: the content tests would be passing against a model of the rules while
 * the game runs on the rules. This file is the tripwire. It crosses every shipped species with a
 * spread of genotypes and asserts the two produce the same sex, the same phenotype, and the same
 * viability verdict.
 *
 * If it fails, do not "fix" whichever one differs. Work out which is right first — the reference
 * engine is a reading of the contract, and it has been right before.
 */
import { describe, expect, it } from 'vitest'
import { geneticsEngine } from '../genetics'
import { possiblePairs } from '../genetics/genotype'
import { makeRng } from '../lib/rng'
import type { AllelePair, Genotype, Individual, Sex, SpeciesDefinition } from '../genetics/types'
import type { Phenotype } from '../render/contract'
import { allSpecies } from './index'
import { ReferenceGeneticsEngine } from './testSupport/referenceEngine'
import { sexChromosomesFor, wildTypeGenotype } from './testSupport/fixtures'

const reference = new ReferenceGeneticsEngine()

/** A spread of genotypes: wild-type, every single-locus variant, and some seeded combinations. */
function sampleGenotypes(species: SpeciesDefinition<Phenotype>, sex: Sex): Genotype[] {
  const chromosomes = sexChromosomesFor(sex, species.sexSystem)
  const base = wildTypeGenotype(species, sex)
  const out: Genotype[] = [base]

  for (const locus of species.loci) {
    for (const pair of possiblePairs(locus, chromosomes)) {
      out.push({ sexChromosomes: base.sexChromosomes, loci: { ...base.loci, [locus.id]: pair } })
    }
  }

  const rng = makeRng(`agreement:${species.id}:${sex}`)
  for (let i = 0; i < 25; i++) {
    const loci: Record<string, AllelePair> = { ...base.loci }
    for (const locus of species.loci) {
      if (rng.chance(0.4)) loci[locus.id] = rng.pick(possiblePairs(locus, chromosomes))
    }
    out.push({ sexChromosomes: base.sexChromosomes, loci })
  }

  return out
}

describe('the real engine and the reference engine agree', () => {
  for (const species of allSpecies) {
    for (const sex of ['female', 'male'] as const) {
      it(`${species.label}, ${sex}`, () => {
        const genotypes = sampleGenotypes(species, sex)
        expect(genotypes.length).toBeGreaterThan(10)

        genotypes.forEach((genotype, index) => {
          const individual: Individual = {
            id: `agreement-${species.id}-${sex}-${index}`,
            species: species.id,
            genotype,
            parents: null,
            mutations: [],
          }

          expect(geneticsEngine.sexOf(genotype, species.sexSystem)).toBe(
            reference.sexOf(genotype, species.sexSystem),
          )

          const real = geneticsEngine.checkViability(genotype, species)
          const model = reference.checkViability(genotype, species)
          expect(real.viable).toBe(model.viable)
          if (!real.viable) expect(real.ruleId).toBe(model.ruleId)

          // Compared through `phenotypeKey` rather than by deep-equalling two phenotypes: the key
          // is the species' own statement of what counts as visibly the same animal, which is the
          // question worth asking. Two phenotypes differing only in a rounded colour channel are
          // the same snake, and a test that says otherwise is testing the renderer's arithmetic.
          expect(species.phenotypeKey(geneticsEngine.express(individual, species))).toBe(
            species.phenotypeKey(reference.express(individual, species)),
          )
        })
      })
    }
  }
})
