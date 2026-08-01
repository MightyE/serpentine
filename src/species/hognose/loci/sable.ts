import type { Locus, TraitProjection } from '../../../genetics/types'
import type { Phenotype } from '../../../render/contract'
import type { RealVsModeledNote } from '../../support/traitNotes'
import { key } from '../../support/genotypeKey'
import { withLabel } from '../../support/phenotypeKey'
import { rgb } from '../phenotype'

/**
 * Sable: **simple recessive**, and the odd one out among this species' traits — every other real
 * hognose locus in this file *removes* pigment; sable *adds* it, pushing melanin up rather than
 * down until some animals read as nearly solid black as adults. Corroborated across the Hognose
 * Wiki and independent hobbyist morph guides.
 */
export const hognoseSableLocus: Locus = {
  id: 'hognose-sable',
  label: 'Sable',
  placement: { kind: 'autosomal' },
  wildType: 'wild-type',
  alleles: [
    { id: 'wild-type', label: 'wild-type', origin: 'wild-type', invented: false },
    { id: 'sable', label: 'Sable', origin: 'authored', invented: false },
  ],
  expression: {
    kind: 'table',
    entries: {
      [key('wild-type', 'wild-type')]: { hognoseSable: false },
      [key('wild-type', 'sable')]: { hognoseSable: false },
      [key('sable', 'sable')]: { hognoseSable: true },
    },
    otherwise: { hognoseSable: false },
  },
}

export const hognoseSableProjection: TraitProjection<Phenotype> = {
  key: 'hognoseSable',
  apply: (draft, value) => {
    if (value !== true) return
    Object.assign(draft, {
      label: withLabel(draft.label, 'Sable'),
      // The settled dark-adult colour — see the note below for the darkens-with-age behaviour
      // this game does not attempt.
      baseColour: rgb(70, 54, 46),
      patternColour: rgb(30, 22, 20),
    })
  },
}

export const hognoseSableNote: RealVsModeledNote = {
  real:
    'Increases melanin production rather than reducing it — the one hognose trait in this game ' +
    'that goes the other direction. Continues darkening as the animal ages; some individuals ' +
    'become nearly solid black as adults. Simple recessive.',
  modeled:
    'The settled dark-adult colour is a direct match. As with lavender, the progressive ' +
    "darkening-with-age is not modelled — this game's ages change body proportions, not colour " +
    '(see `render/bodyShape.ts`), so a sable hognose shows the same dark colouring at every ' +
    'life stage rather than gradually deepening into it.',
}
