/**
 * The genetics engine's public door.
 *
 * Everything in `src/genetics/` is written as free functions, which is the right shape for
 * testing them and the wrong shape for handing to the game — `GeneticsEngine` in `types.ts` is
 * declared as one object you can read top to bottom and pass around. This file is that object,
 * assembled from the free functions with no logic of its own.
 *
 * There is deliberately **one** engine. A second implementation was used while the real one was
 * being built, and two engines that silently disagree is worse than either alone: content would
 * be validated against a model of the rules rather than against the rules.
 *
 * Import the engine from here; import types from `./types`.
 */

import { breed, makeGamete } from './breeding'
import { carrierProbability, conditionOn, punnett } from './distribution'
import { deriveTraits, express } from './expression'
import { sexOf } from './genotype'
import { inferKnowledge } from './knowledge'
import { registerNovelAlleleGenerator, restoreDiscoveredAlleles } from './mutation'
import { checkViability } from './viability'
import type { GeneticsEngine } from './types'

export const geneticsEngine: GeneticsEngine = {
  sexOf,
  deriveTraits,
  express,
  checkViability,
  punnett,
  conditionOn,
  carrierProbability,
  inferKnowledge,
  makeGamete,
  breed,
  registerNovelAlleleGenerator,
  restoreDiscoveredAlleles,
}

export * from './types'
export { breed, makeGamete } from './breeding'
export { carrierProbability, conditionOn, punnett } from './distribution'
export { deriveTraits, express, resolveLocus } from './expression'
export {
  alleleCopies,
  alleleOf,
  genotypeKey,
  lociById,
  makeGenotype,
  otherSex,
  pairCarries,
  possiblePairs,
  sexChromosomesFor,
  sexOf,
  wildTypePair,
} from './genotype'
export { inferKnowledge } from './knowledge'
export {
  ancestors,
  inbreedingCoefficient,
  kinship,
  pedigreeDepth,
  DEFAULT_PEDIGREE_DEPTH,
  type PedigreeLookup,
} from './pedigree'
export {
  expressedLoad,
  loadLocus,
  loadViabilityRules,
  seedFounderLoad,
  FOUNDER_LOAD_ALLELES,
  LOAD_POOL_SIZE,
  type GeneticLoadPool,
  type LoadAllele,
  type LoadOutcome,
} from './load'
// `load.ts`'s display readout is deliberately NOT re-exported here: `load.test.ts` asserts that
// no file under `src/genetics/`, `src/species/` or `src/render/` so much as names it, so that it
// can never quietly acquire an engine-side caller. The UI imports it from `@/genetics/load`.
export {
  allelesAt,
  applyMutation,
  discoveredAlleleRecords,
  registerNovelAlleleGenerator,
  resetMutationRegistry,
  restoreDiscoveredAlleles,
} from './mutation'
export { validateSpecies } from './validate'
export { checkViability } from './viability'
