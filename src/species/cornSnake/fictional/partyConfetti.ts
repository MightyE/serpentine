import type { Locus, TraitProjection } from '../../../genetics/types'
import type { Phenotype } from '../../../render/contract'
import { key } from '../../support/genotypeKey'

/**
 * FICTIONAL, and simply delightful: a recessive gene for rainbow speckles. Also incidentally
 * exercises the `pattern` stage kind (as opposed to `mask`, used by piebald, or `modifier`,
 * used by pinstripe/albino/pulse-glow/umbra) — between the real and fictional content, all
 * four `StageKind`s get exercised somewhere.
 */
export const partyConfettiLocus: Locus = {
  id: 'confetti',
  label: 'Party confetti (fictional)',
  placement: { kind: 'autosomal' },
  wildType: 'wild-type',
  alleles: [
    { id: 'wild-type', label: 'wild-type', origin: 'wild-type', invented: true },
    { id: 'confetti', label: 'Confetti', origin: 'authored', invented: true },
  ],
  expression: {
    kind: 'table',
    entries: {
      [key('wild-type', 'wild-type')]: { confetti: false },
      [key('wild-type', 'confetti')]: { confetti: false },
      [key('confetti', 'confetti')]: { confetti: true },
    },
    otherwise: { confetti: false },
  },
}

export const partyConfettiProjection: TraitProjection<Phenotype> = {
  key: 'confetti',
  apply: (draft, value) => {
    if (value !== true) return
    Object.assign(draft, {
      // The real `speckle` pattern stage's own doc comment names this exact look ("the
      // 'confetti'/'pied dust' look") — dense and colourful here, rather than Glimmer's
      // sparse, pale use of the same stage (`ballPython/fictional/glimmer.ts`).
      stages: [
        ...draft.stages,
        {
          kind: 'pattern' as const,
          name: 'speckle',
          params: { density: 70, radius: 0.4, colour: { r: 230, g: 70, b: 160, a: 1 }, strength: 1 },
        },
      ],
      effects: [...draft.effects, 'glitter'],
    })
  },
}
