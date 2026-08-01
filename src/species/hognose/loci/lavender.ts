import type { Locus, TraitProjection } from '../../../genetics/types'
import type { Phenotype } from '../../../render/contract'
import type { RealVsModeledNote } from '../../support/traitNotes'
import { key } from '../../support/genotypeKey'
import { withLabel } from '../../support/phenotypeKey'
import { rgb } from '../phenotype'

/**
 * Lavender: **simple recessive**, another tyrosinase-positive ("T+") melanin mutation,
 * independent of `toffeebelly.ts` and `evansHypo.ts` on the same evidence basis (see the note in
 * `albino.ts` about why these are modelled as separate loci rather than one complex).
 * Corroborated across the Hognose Wiki and hobbyist morph guides.
 */
export const hognoseLavenderLocus: Locus = {
  id: 'hognose-lavender',
  label: 'Lavender',
  placement: { kind: 'autosomal' },
  wildType: 'wild-type',
  alleles: [
    { id: 'wild-type', label: 'wild-type', origin: 'wild-type', invented: false },
    {
      id: 'lavender',
      label: 'Lavender',
      origin: 'authored',
      invented: false,
      notes: 'Tyrosinase-positive ("T+"). Hatches with a reddish tint that fades toward lavender with age.',
    },
  ],
  expression: {
    kind: 'table',
    entries: {
      [key('wild-type', 'wild-type')]: { hognoseLavender: false },
      [key('wild-type', 'lavender')]: { hognoseLavender: false },
      [key('lavender', 'lavender')]: { hognoseLavender: true },
    },
    otherwise: { hognoseLavender: false },
  },
}

export const hognoseLavenderProjection: TraitProjection<Phenotype> = {
  key: 'hognoseLavender',
  apply: (draft, value) => {
    if (value !== true) return
    Object.assign(draft, {
      label: withLabel(draft.label, 'Lavender'),
      // The settled adult colour — see the note below for the hatchling-red-fading-out behaviour
      // this game does not attempt.
      baseColour: rgb(196, 170, 188),
      patternColour: rgb(132, 104, 128),
    })
  },
}

export const hognoseLavenderNote: RealVsModeledNote = {
  real:
    'A tyrosinase-positive ("T+") melanin mutation. Hatchlings show a reddish tint that fades ' +
    'out over their first year or two, settling into the lavender/mauve colour the name refers ' +
    'to. Simple recessive.',
  modeled:
    'The settled adult lavender colour is a direct match. The hatch-red-then-fade timeline is ' +
    "not modelled: this game's render pipeline changes body *proportions* with age (see " +
    '`render/bodyShape.ts`\'s `LifeShape`) but not colour, so every age of a lavender hognose in ' +
    'this game shows the adult colour. Worth a future project-ladder entry if age-linked colour ' +
    'ever becomes a mechanic.',
}
