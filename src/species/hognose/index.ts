/**
 * Western hognose (*Heterodon nasicus*) — `SpeciesDefinition<Phenotype>`. See
 * `../cornSnake/index.ts` (this species' closer relative — both are colubrids, both ZW) and
 * `../ballPython/index.ts` (the file to copy for a whole new species) for what this file's shape
 * means.
 *
 * This species was added to give the game a body plan the corn snake and ball python do not
 * have: **short and stout**, with the upturned, keeled rostral scale — the "hog nose" — that is
 * this animal's whole visual identity. See `phenotype.ts` for the body numbers and
 * `../../render/snout/index.ts` for the snout render module.
 *
 * **Not registered in `src/species/index.ts` (`allSpecies`).** That file is outside this
 * dispatch's owned paths this cycle — see the hognose execution deposit
 * (`~/.team-brain/projects/snake-genetics-game/cycles/2026-07-31_1618_design-scaffold/execution/engineer-hognose.md`)
 * for the exact two-line wiring another agent needs to make hognose breedable in the actual game
 * rather than just visible in the render lab.
 */
import type { SpeciesDefinition } from '../../genetics/types'
import type { Phenotype } from '../../render/contract'
import type { RealTraitNotes } from '../support/traitNotes'
import { phenotypeKeyFor } from '../support/phenotypeKey'
import { hognoseSexSystem } from './sexSystem'
import { hognoseBasePhenotype } from './phenotype'

import { hognoseAlbinoLocus, hognoseAlbinoProjection, hognoseAlbinoNote } from './loci/albino'
import { hognoseAxanthicLocus, hognoseAxanthicProjection, hognoseAxanthicNote } from './loci/axanthic'
import {
  hognoseToffeebellyLocus,
  hognoseToffeebellyProjection,
  hognoseToffeebellyNote,
} from './loci/toffeebelly'
import { hognoseLavenderLocus, hognoseLavenderProjection, hognoseLavenderNote } from './loci/lavender'
import { hognoseSableLocus, hognoseSableProjection, hognoseSableNote } from './loci/sable'
import {
  hognoseEvansHypoLocus,
  hognoseEvansHypoProjection,
  hognoseEvansHypoNote,
} from './loci/evansHypo'
import { hognoseAnacondaLocus, hognoseAnacondaProjection, hognoseAnacondaNote } from './loci/anaconda'
import { hognoseArcticLocus, hognoseArcticProjection, hognoseArcticNote } from './loci/arctic'

/** Real traits only. Every entry here is asserted in `hognose.test.ts`. */
export const hognoseRealTraitNotes: RealTraitNotes = {
  'hognose-albino': hognoseAlbinoNote,
  'hognose-axanthic': hognoseAxanthicNote,
  'hognose-toffeebelly': hognoseToffeebellyNote,
  'hognose-lavender': hognoseLavenderNote,
  'hognose-sable': hognoseSableNote,
  'hognose-evans-hypo': hognoseEvansHypoNote,
  'hognose-anaconda': hognoseAnacondaNote,
  'hognose-arctic': hognoseArcticNote,
}

export const hognose: SpeciesDefinition<Phenotype> = {
  id: 'hognose',
  label: 'Western Hognose',
  sexSystem: hognoseSexSystem,
  loci: [
    hognoseAlbinoLocus,
    hognoseAxanthicLocus,
    hognoseToffeebellyLocus,
    hognoseLavenderLocus,
    hognoseSableLocus,
    hognoseEvansHypoLocus,
    hognoseAnacondaLocus,
    hognoseArcticLocus,
  ],
  polygenic: [],
  basePhenotype: hognoseBasePhenotype,
  projections: [
    hognoseAlbinoProjection,
    hognoseAxanthicProjection,
    hognoseToffeebellyProjection,
    hognoseLavenderProjection,
    hognoseSableProjection,
    hognoseEvansHypoProjection,
    hognoseAnacondaProjection,
    hognoseArcticProjection,
  ],
  modifiers: [],
  // Anaconda/Superconda is explicitly not lethal — see `loci/anaconda.ts`. No viability rules.
  viability: [],
  phenotypeKey: phenotypeKeyFor,
  phenotypeLabel: (p) => p.label,
}
