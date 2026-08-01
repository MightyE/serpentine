import type { Locus, TraitProjection } from '../../../genetics/types'
import type { Phenotype } from '../../../render/contract'
import type { RealVsModeledNote } from '../../support/traitNotes'
import { key } from '../../support/genotypeKey'
import { withLabel } from '../../support/phenotypeKey'
import { rgb } from '../phenotype'

/**
 * Axanthic: **simple recessive**, independent locus from albino. Removes yellow (xanthophore)
 * and red (erythrophore) pigment, leaving a grey/black/white animal with the wild-type pattern
 * intact — a hognose analogue of the corn snake's anerythristic, though a different pigment
 * pathway is implicated. Corroborated across MorphMarket Morphpedia, the Hognose Wiki, and
 * multiple independent hobbyist references, all describing a plain recessive with no pattern
 * change, only colour loss.
 */
export const hognoseAxanthicLocus: Locus = {
  id: 'hognose-axanthic',
  label: 'Axanthic',
  placement: { kind: 'autosomal' },
  wildType: 'wild-type',
  alleles: [
    { id: 'wild-type', label: 'wild-type', origin: 'wild-type', invented: false },
    { id: 'axanthic', label: 'Axanthic', origin: 'authored', invented: false },
  ],
  expression: {
    kind: 'table',
    entries: {
      [key('wild-type', 'wild-type')]: { hognoseAxanthic: false },
      [key('wild-type', 'axanthic')]: { hognoseAxanthic: false },
      [key('axanthic', 'axanthic')]: { hognoseAxanthic: true },
    },
    otherwise: { hognoseAxanthic: false },
  },
}

export const hognoseAxanthicProjection: TraitProjection<Phenotype> = {
  key: 'hognoseAxanthic',
  apply: (draft, value) => {
    if (value !== true) return
    Object.assign(draft, {
      label: withLabel(draft.label, 'Axanthic'),
      baseColour: rgb(150, 148, 144),
      patternColour: rgb(56, 54, 52),
      bellyColour: rgb(214, 214, 210),
    })
  },
}

export const hognoseAxanthicNote: RealVsModeledNote = {
  real:
    'Removes yellow and red pigment (xanthophores/erythrophores) while leaving the wild-type ' +
    'pattern shape untouched, producing a grey/black/white animal. Simple recessive.',
  modeled: 'Direct match — a plain recessive locus with no simplification worth naming.',
}
