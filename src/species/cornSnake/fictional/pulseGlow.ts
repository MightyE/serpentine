import type { Locus, TraitProjection } from '../../../genetics/types'
import type { Phenotype } from '../../../render/contract'
import { key } from '../../support/genotypeKey'

/**
 * FICTIONAL. Demonstrates: a trait using the renderer's *animated* half. A `StageFn` (the
 * pattern/mask/modifier pipeline) has no clock — it is a pure function of `(u, v, incoming,
 * params, rng)`, baked once into a texture and never re-run. Animation is a different, separate
 * mechanism: `render/effects.ts`'s `EffectDefinition`, which draws over the finished body every
 * frame and does know what time it is. This locus wires up the real, already-animated `glow`
 * effect (a soft light that pulses with `Math.sin(time)`) rather than inventing a new one.
 */
export const pulseGlowLocus: Locus = {
  id: 'pulse-glow',
  label: 'Pulse glow (fictional)',
  placement: { kind: 'autosomal' },
  wildType: 'wild-type',
  alleles: [
    { id: 'wild-type', label: 'wild-type', origin: 'wild-type', invented: true },
    { id: 'pulse-glow', label: 'Pulse Glow', origin: 'authored', invented: true },
  ],
  expression: {
    kind: 'table',
    entries: {
      [key('wild-type', 'wild-type')]: { pulseGlow: false },
      [key('wild-type', 'pulse-glow')]: { pulseGlow: true },
      [key('pulse-glow', 'pulse-glow')]: { pulseGlow: true },
    },
    otherwise: { pulseGlow: false },
  },
}

export const pulseGlowProjection: TraitProjection<Phenotype> = {
  key: 'pulseGlow',
  apply: (draft, value) => {
    if (value !== true) return
    Object.assign(draft, { effects: [...draft.effects, 'glow'] })
  },
}
