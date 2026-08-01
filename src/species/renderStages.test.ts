/**
 * Every stage name the species content asks for must actually exist in the render registry.
 *
 * This is the one class of bug in this codebase that the compiler cannot see. A phenotype names
 * its stages as strings — deliberately, because a phenotype crosses a serialisation boundary — so
 * a typo in `'patternReduction'` type-checks perfectly and then throws at the moment a player
 * looks at the animal. Worse, it throws *only* for the animals that carry that trait, which are
 * exactly the rare ones nobody has bred yet during development.
 *
 * So: build every single-locus variant of every shipped species, compile its phenotype through the
 * real pipeline, and let a missing stage fail here instead of in front of someone.
 */
import { describe, expect, it } from 'vitest'
import { geneticsEngine } from '../genetics'
import { possiblePairs } from '../genetics/genotype'
import { compilePipeline, stageRegistry } from '../render'
import type { AllelePair, Individual } from '../genetics/types'
import { allSpecies } from './index'
import { sexChromosomesFor, wildTypeGenotype } from './testSupport/fixtures'

describe('species render stages resolve', () => {
  for (const species of allSpecies) {
    it(`${species.label} names only registered stages`, () => {
      const chromosomes = sexChromosomesFor('female', species.sexSystem)
      const base = wildTypeGenotype(species, 'female')
      let compiled = 0

      for (const locus of species.loci) {
        for (const pair of possiblePairs(locus, chromosomes)) {
          const loci: Record<string, AllelePair> = { ...base.loci, [locus.id]: pair }
          const individual: Individual = {
            id: `stages-${species.id}-${locus.id}-${pair.join('-')}`,
            species: species.id,
            genotype: { sexChromosomes: base.sexChromosomes, loci },
            parents: null,
            mutations: [],
          }
          const phenotype = geneticsEngine.express(individual, species)
          for (const stage of phenotype.stages) {
            expect(
              stageRegistry.get(stage.kind, stage.name),
              `${species.label}'s '${locus.id}' asks for a ${stage.kind} stage named '${stage.name}', ` +
                `which is not registered. Check the spelling against src/render/stages/index.ts.`,
            ).toBeDefined()
          }
          // Compiling is the stronger check: it also catches a stage whose parameters the
          // registered definition cannot accept.
          expect(() => compilePipeline(phenotype, stageRegistry)).not.toThrow()
          compiled++
        }
      }

      expect(compiled).toBeGreaterThan(0)
    })
  }
})
