import type { Locus, TraitProjection } from '../../../genetics/types'
import type { Phenotype } from '../../../render/contract'
import { key } from '../../support/genotypeKey'

/**
 * FICTIONAL, and the literal worked example from the add-a-trait cookbook (see the cycle's
 * `execution/engineer-species-game.md` deposit) — a simple dominant gene for oversized,
 * sparkling eyes. Copy this file's shape for the next one.
 */
export const sparkleEyesLocus: Locus = {
  id: 'sparkle-eyes',
  label: 'Sparkle eyes (fictional)',
  placement: { kind: 'autosomal' },
  wildType: 'wild-type',
  alleles: [
    { id: 'wild-type', label: 'wild-type', origin: 'wild-type', invented: true },
    { id: 'sparkle-eyes', label: 'Sparkle Eyes', origin: 'authored', invented: true },
  ],
  expression: {
    kind: 'table',
    entries: {
      [key('wild-type', 'wild-type')]: { sparkleEyes: false },
      [key('wild-type', 'sparkle-eyes')]: { sparkleEyes: true },
      [key('sparkle-eyes', 'sparkle-eyes')]: { sparkleEyes: true },
    },
    otherwise: { sparkleEyes: false },
  },
}

export const sparkleEyesProjection: TraitProjection<Phenotype> = {
  key: 'sparkleEyes',
  apply: (draft, value) => {
    if (value !== true) return
    Object.assign(draft, { eye: { ...draft.eye, sizeScale: draft.eye.sizeScale * 1.35 } })
  },
}
