import type { Locus, TraitProjection } from '../../../genetics/types'
import type { Phenotype } from '../../../render/contract'
import type { RealVsModeledNote } from '../../support/traitNotes'
import { key } from '../../support/genotypeKey'
import { withLabel } from '../../support/phenotypeKey'
import { rgb } from '../phenotype'

/**
 * Pastel: the textbook **incomplete dominant**, one copy gives a distinct intermediate look,
 * two copies give a distinct, more extreme "super" form. We write "incomplete dominant," never
 * "co-dominant" — the hobby's usual word describes something else (both alleles separately
 * visible at once), and using it here would ship a real, checkable error.
 */
export const pastelLocus: Locus = {
  id: 'pastel',
  label: 'Pastel',
  placement: { kind: 'autosomal' },
  wildType: 'wild-type',
  alleles: [
    { id: 'wild-type', label: 'wild-type', origin: 'wild-type', invented: false },
    { id: 'pastel', label: 'Pastel', origin: 'authored', invented: false },
  ],
  expression: {
    kind: 'table',
    entries: {
      [key('wild-type', 'wild-type')]: { pastelIntensity: 'wildType' },
      [key('wild-type', 'pastel')]: { pastelIntensity: 'pastel' },
      [key('pastel', 'pastel')]: { pastelIntensity: 'superPastel' },
    },
    otherwise: { pastelIntensity: 'wildType' },
  },
}

export const pastelProjection: TraitProjection<Phenotype> = {
  key: 'pastelIntensity',
  apply: (draft, value) => {
    if (value === 'pastel') {
      Object.assign(draft, {
        label: withLabel(draft.label, 'Pastel'),
        baseColour: rgb(150, 118, 60),
        patternColour: rgb(60, 46, 28),
      })
    } else if (value === 'superPastel') {
      Object.assign(draft, {
        label: withLabel(draft.label, 'Super Pastel'),
        baseColour: rgb(215, 190, 120),
        patternColour: rgb(110, 90, 55),
        body: { ...draft.body, headScale: draft.body.headScale * 1.05 },
      })
    }
  },
}

export const pastelNote: RealVsModeledNote = {
  real:
    'One copy: brighter, higher-contrast colour. Two copies: a distinct, much brighter, ' +
    "pattern-reduced 'super pastel' — a genuinely different phenotype, not more of the same. " +
    "The hobby calls this 'co-dominant'; geneticists call the same table 'incomplete dominance.'",
  modeled:
    "Table has a real third row for pastel/pastel rather than reusing pastel's row twice, " +
    'which is what would happen if this were modelled as ordinary dominant instead.',
}
