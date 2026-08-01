import type { Locus, TraitProjection } from '../../../genetics/types'
import type { Phenotype } from '../../../render/contract'
import type { RealVsModeledNote } from '../../support/traitNotes'
import { key } from '../../support/genotypeKey'
import { withLabel } from '../../support/phenotypeKey'
import { rgb } from '../phenotype'

/** Amelanistic: **simple recessive**, removes black pigment only. Pairs with anerythristic. */
export const amelanisticLocus: Locus = {
  id: 'amel',
  label: 'Amelanistic',
  placement: { kind: 'autosomal' },
  wildType: 'wild-type',
  alleles: [
    { id: 'wild-type', label: 'wild-type', origin: 'wild-type', invented: false },
    { id: 'amel', label: 'Amelanistic', origin: 'authored', invented: false },
  ],
  expression: {
    kind: 'table',
    entries: {
      [key('wild-type', 'wild-type')]: { amelanistic: false },
      [key('wild-type', 'amel')]: { amelanistic: false },
      [key('amel', 'amel')]: { amelanistic: true },
    },
    otherwise: { amelanistic: false },
  },
}

export const amelanisticProjection: TraitProjection<Phenotype> = {
  key: 'amelanistic',
  apply: (draft, value) => {
    if (value !== true) return
    Object.assign(draft, {
      label: withLabel(draft.label, 'Amelanistic'),
      baseColour: rgb(255, 150, 60),
      patternColour: rgb(230, 90, 20),
    })
  },
}

export const amelanisticNote: RealVsModeledNote = {
  real: 'Removes black pigment only; the red/orange pattern stays vivid with no black outlining.',
  modeled: 'Direct match — a plain recessive locus with no simplification worth naming.',
}
