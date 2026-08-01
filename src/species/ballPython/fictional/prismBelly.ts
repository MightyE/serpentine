import type { Locus, TraitProjection } from '../../../genetics/types'
import type { Phenotype } from '../../../render/contract'
import { key } from '../../support/genotypeKey'

/**
 * FICTIONAL. No teaching point beyond "genetics can be delightful" — a simple dominant gene
 * for an oil-slick rainbow sheen. Wires up the real `iridescent` effect (`render/effects.ts`,
 * an animated hue-slide down the whole body) rather than inventing a new one, since that
 * effect already *is* "prism belly." Exists to prove that not every data file has to justify
 * itself pedagogically to be worth adding.
 */
export const prismBellyLocus: Locus = {
  id: 'prism',
  label: 'Prism belly (fictional)',
  placement: { kind: 'autosomal' },
  wildType: 'wild-type',
  alleles: [
    { id: 'wild-type', label: 'wild-type', origin: 'wild-type', invented: true },
    { id: 'prism', label: 'Prism', origin: 'authored', invented: true },
  ],
  expression: {
    kind: 'table',
    entries: {
      [key('wild-type', 'wild-type')]: { prismBelly: false },
      [key('wild-type', 'prism')]: { prismBelly: true },
      [key('prism', 'prism')]: { prismBelly: true },
    },
    otherwise: { prismBelly: false },
  },
}

export const prismBellyProjection: TraitProjection<Phenotype> = {
  key: 'prismBelly',
  apply: (draft, value) => {
    if (value !== true) return
    Object.assign(draft, { effects: [...draft.effects, 'iridescent'] })
  },
}
