/**
 * Ball python — `SpeciesDefinition<Phenotype>`. This file is the one place genetics
 * (`src/genetics/`) and rendering (`src/render/`) become aware of each other: everything above
 * it is either pure inheritance data or pure pixels, and this is the single line of glue.
 *
 * **This is the file to copy when adding a whole new species.** Adding a single new trait to
 * *this* species is smaller than that — see the cookbook steps in
 * `~/.team-brain/projects/snake-genetics-game/cycles/2026-07-31_1618_design-scaffold/execution/engineer-species-game.md`.
 */
import type { SpeciesDefinition } from '../../genetics/types'
import type { Phenotype } from '../../render/contract'
import type { RealTraitNotes } from '../support/traitNotes'
import { phenotypeKeyFor } from '../support/phenotypeKey'
import { ballPythonSexSystem } from './sexSystem'
import { ballPythonBasePhenotype } from './phenotype'

import { albinoLocus, albinoProjection, albinoNote } from './loci/albinoComplex'
import {
  piebaldLocus,
  piebaldWhitePercentage,
  piebaldProjection,
  piebaldNote,
} from './loci/piebald'
import { pinstripeLocus, pinstripeProjection, pinstripeNote } from './loci/pinstripe'
import { pastelLocus, pastelProjection, pastelNote } from './loci/pastel'
import {
  champagneLocus,
  champagneLethalRule,
  champagneProjection,
  champagneNote,
} from './loci/champagne'
import { belLocus, belProjection, belNote } from './loci/belComplex'
import { coralGlowLocus, coralGlowProjection, coralGlowNote } from './loci/coralGlow'

// Fictional — invented traits, kept in their own subdirectory and every allele flagged
// `invented: true`, so nobody ever mistakes one of these for a real, citable morph.
import { glimmerLocus, glimmerIntensity, glimmerProjection } from './fictional/glimmer'
import { empathLocus, empathProjection } from './fictional/empath'
import { prismBellyLocus, prismBellyProjection } from './fictional/prismBelly'
import { sparkleEyesLocus, sparkleEyesProjection } from './fictional/sparkleEyes'

/** Real traits only. Every entry here is asserted in `species.realTraitNotes.test.ts`. */
export const ballPythonRealTraitNotes: RealTraitNotes = {
  albino: albinoNote,
  piebald: piebaldNote,
  pinstripe: pinstripeNote,
  pastel: pastelNote,
  champagne: champagneNote,
  bel: belNote,
  'coral-glow': coralGlowNote,
}

export const ballPython: SpeciesDefinition<Phenotype> = {
  id: 'ball-python',
  label: 'Ball Python',
  sexSystem: ballPythonSexSystem,
  loci: [
    // Real.
    albinoLocus,
    piebaldLocus,
    pinstripeLocus,
    pastelLocus,
    champagneLocus,
    belLocus,
    coralGlowLocus,
    // Fictional.
    glimmerLocus,
    empathLocus,
    prismBellyLocus,
    sparkleEyesLocus,
  ],
  polygenic: [piebaldWhitePercentage, glimmerIntensity],
  basePhenotype: ballPythonBasePhenotype,
  projections: [
    albinoProjection,
    piebaldProjection,
    pinstripeProjection,
    pastelProjection,
    champagneProjection,
    belProjection,
    coralGlowProjection,
    glimmerProjection,
    empathProjection,
    prismBellyProjection,
    sparkleEyesProjection,
  ],
  modifiers: [],
  viability: [champagneLethalRule],
  phenotypeKey: phenotypeKeyFor,
  phenotypeLabel: (p) => p.label,
}
