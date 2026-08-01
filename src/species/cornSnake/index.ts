/**
 * Corn snake — `SpeciesDefinition<Phenotype>`. See `ballPython/index.ts` for what this file's
 * shape means and why it is the only place genetics and rendering meet.
 */
import type { SpeciesDefinition } from '../../genetics/types'
import type { Phenotype } from '../../render/contract'
import type { RealTraitNotes } from '../support/traitNotes'
import { phenotypeKeyFor } from '../support/phenotypeKey'
import { cornSnakeSexSystem } from './sexSystem'
import { cornSnakeBasePhenotype } from './phenotype'

import { amelanisticLocus, amelanisticProjection, amelanisticNote } from './loci/amelanistic'
import {
  anerythristicLocus,
  anerythristicProjection,
  anerythristicNote,
  snowModifier,
} from './loci/anerythristic'

// Fictional.
import { pulseGlowLocus, pulseGlowProjection } from './fictional/pulseGlow'
import { umbraLocus, umbraEpistasis } from './fictional/umbra'
import { partyConfettiLocus, partyConfettiProjection } from './fictional/partyConfetti'

export const cornSnakeRealTraitNotes: RealTraitNotes = {
  amel: amelanisticNote,
  anery: anerythristicNote,
}

export const cornSnake: SpeciesDefinition<Phenotype> = {
  id: 'corn-snake',
  label: 'Corn Snake',
  sexSystem: cornSnakeSexSystem,
  loci: [
    // Real.
    amelanisticLocus,
    anerythristicLocus,
    // Fictional.
    pulseGlowLocus,
    umbraLocus,
    partyConfettiLocus,
  ],
  polygenic: [],
  basePhenotype: cornSnakeBasePhenotype,
  projections: [
    amelanisticProjection,
    anerythristicProjection,
    pulseGlowProjection,
    partyConfettiProjection,
  ],
  // Ordered: umbra must run after amel's projection has had its say, so it has something to
  // mask. Modifiers run after every projection regardless of array position (stage 4 always
  // follows stage 3), so this array's order only matters relative to `snowModifier` below.
  modifiers: [snowModifier, umbraEpistasis],
  viability: [],
  phenotypeKey: phenotypeKeyFor,
  phenotypeLabel: (p) => p.label,
}
