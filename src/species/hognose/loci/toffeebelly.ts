import type { Locus, TraitProjection } from '../../../genetics/types'
import type { Phenotype } from '../../../render/contract'
import type { RealVsModeledNote } from '../../support/traitNotes'
import { key } from '../../support/genotypeKey'
import { withLabel } from '../../support/phenotypeKey'
import { rgb } from '../phenotype'

/**
 * Toffeebelly: **simple recessive**, tyrosinase-positive ("T+") — a different melanin-removal
 * mutation from `albino.ts`'s T-. The hobby's own name for the distinction matters here: T+
 * animals keep producing *some* pigment (their eyes stay dark, unlike T-'s red), which is the
 * one clean, checkable fact separating this from plain albino. Corroborated across the Hognose
 * Wiki and multiple independent hobbyist morph guides describing a light, warm caramel body with
 * a toffee-coloured belly and dark eyes.
 */
export const hognoseToffeebellyLocus: Locus = {
  id: 'hognose-toffeebelly',
  label: 'Toffeebelly',
  placement: { kind: 'autosomal' },
  wildType: 'wild-type',
  alleles: [
    { id: 'wild-type', label: 'wild-type', origin: 'wild-type', invented: false },
    {
      id: 'toffeebelly',
      label: 'Toffeebelly',
      origin: 'authored',
      invented: false,
      notes: 'Tyrosinase-positive ("T+"); eyes stay dark, unlike T- albino.',
    },
  ],
  expression: {
    kind: 'table',
    entries: {
      [key('wild-type', 'wild-type')]: { hognoseToffeebelly: false },
      [key('wild-type', 'toffeebelly')]: { hognoseToffeebelly: false },
      [key('toffeebelly', 'toffeebelly')]: { hognoseToffeebelly: true },
    },
    otherwise: { hognoseToffeebelly: false },
  },
}

export const hognoseToffeebellyProjection: TraitProjection<Phenotype> = {
  key: 'hognoseToffeebelly',
  apply: (draft, value) => {
    if (value !== true) return
    Object.assign(draft, {
      label: withLabel(draft.label, 'Toffeebelly'),
      baseColour: rgb(214, 172, 116),
      patternColour: rgb(158, 108, 62),
      bellyColour: rgb(198, 140, 84),
      // T+, not T-: the eye keeps its wild-type-dark pupil/iris rather than turning red.
    })
  },
}

export const hognoseToffeebellyNote: RealVsModeledNote = {
  real:
    'A tyrosinase-positive ("T+") melanin mutation — a lighter, warmer caramel body and a ' +
    'distinctive toffee-coloured belly, but (unlike T- albino) the eyes stay dark because some ' +
    'pigment pathway is still active. Simple recessive.',
  modeled:
    'Colour and belly are direct matches. The real animal is also frequently reported with ' +
    '"paradox" flecks of normal colouring; that noisy, individually-variable extra is not ' +
    'modelled here, since this game has no per-individual noise channel on colour, only on the ' +
    "polygenic traits (see `ballPython/loci/piebald.ts`'s white-percentage trait for where that " +
    'kind of noise does live).',
}
