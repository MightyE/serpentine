import type { Locus, TraitProjection } from '../../../genetics/types'
import type { Phenotype } from '../../../render/contract'
import { key } from '../../support/genotypeKey'

/**
 * FICTIONAL. Demonstrates: a trait that reads game state. The genetics pipeline is
 * deliberately pure (see `ExpressionContext`'s doc comment in `genetics/types.ts`) — it has no
 * way to know how well-cared-for an animal is, and it should not gain one. So "empath" is
 * split across the boundary this directory owns: the locus below only ever sets a plain
 * marker (`empathPresent`) on the phenotype; `game/moodOverlay.ts` is what actually reads the
 * rehab's care flags and decides whether the marker becomes a visible glow. That two-step
 * split — genetics stays pure, the game layer decorates afterward — is the pattern to copy for
 * any future trait that wants to react to something outside the animal's own genotype.
 */
export const empathLocus: Locus = {
  id: 'empath',
  label: 'Empath (fictional)',
  placement: { kind: 'autosomal' },
  wildType: 'wild-type',
  alleles: [
    { id: 'wild-type', label: 'wild-type', origin: 'wild-type', invented: true },
    { id: 'empath', label: 'Empath', origin: 'authored', invented: true },
  ],
  expression: {
    kind: 'table',
    entries: {
      [key('wild-type', 'wild-type')]: { empathPresent: false },
      [key('wild-type', 'empath')]: { empathPresent: true },
      [key('empath', 'empath')]: { empathPresent: true },
    },
    otherwise: { empathPresent: false },
  },
}

export const empathProjection: TraitProjection<Phenotype> = {
  key: 'empathPresent',
  apply: (draft, value) => {
    if (value !== true) return
    // Marker only. `game/moodOverlay.ts` decides, from rehab state, whether this ever becomes
    // a visible effect — see that file for why the decision cannot live here.
    Object.assign(draft, { extra: { ...draft.extra, empathPresent: true } })
  },
}
