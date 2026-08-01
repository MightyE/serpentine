import type { Locus, PolygenicTrait, TraitProjection } from '../../../genetics/types'
import type { Phenotype } from '../../../render/contract'

/**
 * FICTIONAL. Demonstrates: a polygenic trait whose continuous value drives a render
 * parameter directly, with no discrete on/off gate at all — the cleanest possible contrast
 * with piebald's "discrete gene gates a continuous background trait" (see
 * `ballPython/loci/piebald.ts`). Invent more traits like this by copying this file: one
 * dedicated locus, one `PolygenicTrait`, one projection. No engine change required.
 */
export const glimmerLocus: Locus = {
  id: 'glimmer-genes',
  label: 'Glimmer genes (fictional)',
  placement: { kind: 'autosomal' },
  wildType: 'wild-type',
  alleles: [
    { id: 'wild-type', label: 'wild-type', origin: 'wild-type', invented: true },
    { id: 'shimmer-plus', label: 'Shimmer+', origin: 'authored', invented: true },
  ],
  // This locus only exists to feed the polygenic trait below — it has no expression rule of
  // its own worth showing the player, so every genotype maps to the same empty bag.
  expression: {
    kind: 'table',
    entries: {},
    otherwise: {},
  },
}

export const glimmerIntensity: PolygenicTrait = {
  key: 'glimmerIntensity',
  label: 'Iridescence (fictional)',
  baseline: 5,
  contributions: [{ locus: 'glimmer-genes', perAllele: { 'shimmer-plus': 25 } }],
  environmentSd: 6,
  clamp: [0, 100],
}

export const glimmerProjection: TraitProjection<Phenotype> = {
  key: 'glimmerIntensity',
  apply: (draft, value) => {
    const intensity = typeof value === 'number' ? value : 0
    if (intensity <= 0) return
    // Reuses the real `speckle` pattern stage (`render/stages/speckle.ts`) — density and
    // strength scale continuously with the polygenic value, which is the demonstration:
    // a number, not a genotype, driving how strong a visual parameter reads.
    Object.assign(draft, {
      stages: [
        ...draft.stages,
        {
          kind: 'pattern' as const,
          name: 'speckle',
          params: {
            density: 15 + intensity * 0.6,
            radius: 0.22,
            colour: { r: 255, g: 250, b: 225, a: 1 },
            strength: Math.min(1, intensity / 100),
          },
        },
      ],
    })
  },
}
