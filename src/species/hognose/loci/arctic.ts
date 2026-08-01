import type { Locus, TraitProjection } from '../../../genetics/types'
import type { Phenotype } from '../../../render/contract'
import type { RealVsModeledNote } from '../../support/traitNotes'
import { key } from '../../support/genotypeKey'
import { withLabel } from '../../support/phenotypeKey'
import { rgb } from '../phenotype'

/**
 * Arctic: a second **incomplete dominant** on this species, independent of `anaconda.ts`. One
 * copy darkens and outlines the dorsal blotches (the hobby calls out the "eyebrow" markings
 * above the eyes specifically). Two copies ("Superarctic") pushes melanin further and washes the
 * background toward white, reducing the head pattern too. Corroborated across the Hognose Wiki
 * and independent hobbyist morph guides, both naming it incomplete dominant with a distinct
 * homozygous super form — the same shape as `anaconda.ts`, from an unrelated real mutation.
 */
export const hognoseArcticLocus: Locus = {
  id: 'hognose-arctic',
  label: 'Arctic',
  placement: { kind: 'autosomal' },
  wildType: 'wild-type',
  alleles: [
    { id: 'wild-type', label: 'wild-type', origin: 'wild-type', invented: false },
    { id: 'arctic', label: 'Arctic', origin: 'authored', invented: false },
  ],
  expression: {
    kind: 'table',
    entries: {
      [key('wild-type', 'wild-type')]: { hognoseArcticForm: 'wildType' },
      [key('wild-type', 'arctic')]: { hognoseArcticForm: 'arctic' },
      [key('arctic', 'arctic')]: { hognoseArcticForm: 'superarctic' },
    },
    otherwise: { hognoseArcticForm: 'wildType' },
  },
}

export const hognoseArcticProjection: TraitProjection<Phenotype> = {
  key: 'hognoseArcticForm',
  apply: (draft, value) => {
    if (value === 'arctic') {
      Object.assign(draft, {
        label: withLabel(draft.label, 'Arctic'),
        patternColour: rgb(48, 38, 34),
      })
    } else if (value === 'superarctic') {
      Object.assign(draft, {
        label: withLabel(draft.label, 'Superarctic'),
        // Melanin concentrates into the blotches while the background washes out toward white —
        // the opposite move from anaconda's pattern reduction, so the two stay visually distinct
        // if a save file ever lets a player compare them side by side.
        baseColour: rgb(232, 226, 220),
        patternColour: rgb(38, 32, 30),
      })
    }
  },
}

export const hognoseArcticNote: RealVsModeledNote = {
  real:
    'One copy: darker, more sharply outlined dorsal blotches, with a marked "eyebrow" line above ' +
    'each eye. Two copies ("Superarctic"): melanin concentrates further and the background ' +
    'washes toward white, with a reduced head pattern. Real animals also darken markedly around ' +
    'hatching and lighten with each subsequent shed. Incomplete dominant.',
  modeled:
    "Both doses re-tune existing phenotype fields directly rather than a new render stage. The " +
    'shed-by-shed lightening is not modelled, for the same reason noted on `lavender.ts` and ' +
    '`sable.ts`: this game changes body proportions with age, not colour.',
}
