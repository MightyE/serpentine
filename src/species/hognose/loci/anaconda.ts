import type { Locus, TraitProjection } from '../../../genetics/types'
import type { Phenotype } from '../../../render/contract'
import type { RealVsModeledNote } from '../../support/traitNotes'
import { key } from '../../support/genotypeKey'
import { withLabel } from '../../support/phenotypeKey'

/**
 * Anaconda: the textbook **incomplete dominant** on this species. One copy ("Anaconda") merges
 * the dorsal blotches into larger, connected shapes and quiets the side pattern. Two copies
 * ("Superconda") is a third, more extreme phenotype — an almost patternless animal, usually
 * keeping only a dark dorsal stripe and its head markings. We write "incomplete dominant," never
 * "co-dominant" — see `ballPython/loci/pastel.ts` for why that word choice matters.
 *
 * **Not lethal.** Superconda is bred, sold, and photographed as a living adult across every
 * source consulted for this trait — nothing anywhere describes reduced hatch rates or embryonic
 * loss for the homozygous form, unlike ball python's real `champagne` (see `champagne.ts`'s
 * `champagneLethalRule`). This locus deliberately carries no `ViabilityRule`.
 */
export const hognoseAnacondaLocus: Locus = {
  id: 'hognose-anaconda',
  label: 'Anaconda',
  placement: { kind: 'autosomal' },
  wildType: 'wild-type',
  alleles: [
    { id: 'wild-type', label: 'wild-type', origin: 'wild-type', invented: false },
    { id: 'anaconda', label: 'Anaconda', origin: 'authored', invented: false },
  ],
  expression: {
    kind: 'table',
    entries: {
      [key('wild-type', 'wild-type')]: { hognoseAnacondaForm: 'wildType' },
      [key('wild-type', 'anaconda')]: { hognoseAnacondaForm: 'anaconda' },
      [key('anaconda', 'anaconda')]: { hognoseAnacondaForm: 'superconda' },
    },
    otherwise: { hognoseAnacondaForm: 'wildType' },
  },
}

export const hognoseAnacondaProjection: TraitProjection<Phenotype> = {
  key: 'hognoseAnacondaForm',
  apply: (draft, value) => {
    if (value === 'anaconda') {
      Object.assign(draft, {
        label: withLabel(draft.label, 'Anaconda'),
        stages: draft.stages.map((stage) =>
          stage.kind === 'pattern' && stage.name === 'blotches'
            ? { ...stage, params: { ...stage.params, scaleU: 6, threshold: 0.42, softness: 0.14 } }
            : stage,
        ),
      })
    } else if (value === 'superconda') {
      Object.assign(draft, {
        label: withLabel(draft.label, 'Superconda'),
        // Almost patternless: pull the blotches back to a thin dorsal stripe rather than
        // removing the pattern stage outright, so a keepDorsal strip survives — the real
        // animal's one remaining marking.
        stages: [
          ...draft.stages,
          {
            kind: 'modifier' as const,
            name: 'patternReduction',
            params: { amount: 0.94, keepDorsal: 0.1, softness: 0.16, towards: '@baseColour' },
          },
        ],
      })
    }
  },
}

export const hognoseAnacondaNote: RealVsModeledNote = {
  real:
    'One copy: the dorsal blotches fuse into larger connected shapes and the flanks quiet down. ' +
    'Two copies ("Superconda"): a third, distinct, almost patternless animal, usually keeping ' +
    'only a dark dorsal stripe and head pattern. Not lethal in either dose — a genuinely clean ' +
    'incomplete-dominant teaching case, deliberately included to contrast with ball python ' +
    "champagne's real lethal super form.",
  modeled:
    "One copy re-tunes the existing `blotches` pattern stage's own parameters (tighter, lower-" +
    'threshold blotches that read as fused). Two copies adds the `patternReduction` modifier ' +
    "stage on top, same mechanism ball python's `patternReduction`-based `clown` fixture uses, " +
    'tuned to leave a thin dorsal strip rather than erasing everything — the real "faint stripe ' +
    'left" look rather than a flat solid colour.',
}
