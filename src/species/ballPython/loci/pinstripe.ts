import type { Locus, TraitProjection } from '../../../genetics/types'
import type { Phenotype } from '../../../render/contract'
import { withLabel } from '../../support/phenotypeKey'
import type { RealVsModeledNote } from '../../support/traitNotes'
import { key } from '../../support/genotypeKey'

/**
 * Pinstripe: **dominant, no super form**. One copy is enough; two copies look identical to
 * one, because dominance means there is nothing left for a second copy to add. The only way
 * to prove an animal homozygous is to breed it to non-carriers and see that 100% of offspring
 * show the trait — a real, distinct "proving" mechanic from the recessive het-test.
 */
export const pinstripeLocus: Locus = {
  id: 'pinstripe',
  label: 'Pinstripe',
  placement: { kind: 'autosomal' },
  wildType: 'wild-type',
  alleles: [
    { id: 'wild-type', label: 'wild-type', origin: 'wild-type', invented: false },
    { id: 'pinstripe', label: 'Pinstripe', origin: 'authored', invented: false },
  ],
  expression: {
    kind: 'table',
    entries: {
      [key('wild-type', 'wild-type')]: { pinstripe: false },
      [key('wild-type', 'pinstripe')]: { pinstripe: true },
      [key('pinstripe', 'pinstripe')]: { pinstripe: true },
    },
    otherwise: { pinstripe: false },
  },
}

export const pinstripeProjection: TraitProjection<Phenotype> = {
  key: 'pinstripe',
  apply: (draft, value) => {
    if (value !== true) return
    Object.assign(draft, {
      label: withLabel(draft.label, 'Pinstripe'),
      // The real `patternReduction` modifier (`render/stages/patternReduction.ts`) pulls
      // markings in toward the spine and clears the flanks — pushed almost all the way, this
      // is exactly a pinstripe.
      stages: [
        ...draft.stages,
        {
          kind: 'modifier' as const,
          name: 'patternReduction',
          params: { amount: 0.97, keepDorsal: 0.06, softness: 0.05, towards: '@baseColour' },
        },
      ],
    })
  },
}

export const pinstripeNote: RealVsModeledNote = {
  real:
    'One copy reduces the whole body pattern to a thin spinal stripe; a second copy looks the ' +
    "same, because dominant means there is no additional phenotype for it to produce. " +
    'Homozygosity can only be inferred by test-breeding to non-carriers.',
  modeled:
    "wild-type/pinstripe and pinstripe/pinstripe map to the same table row on purpose — that's " +
    'the entire point of "dominant, no super form," not a simplification.',
}
