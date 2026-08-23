import type { Locus, TraitProjection } from '../../../genetics/types'
import type { Phenotype } from '../../../render/contract'
import type { RealVsModeledNote } from '../../support/traitNotes'
import { key } from '../../support/genotypeKey'
import { withMorph } from '../../support/phenotypeKey'

/**
 * Conda: the textbook **incomplete dominant** on this species. One copy ("Conda") merges
 * the dorsal blotches into larger, connected shapes and quiets the side pattern. Two copies
 * ("Superconda") is a third, more extreme phenotype — a patternless animal. We write "incomplete
 * dominant," never "co-dominant" — see `ballPython/loci/pastel.ts` for why that word choice
 * matters.
 *
 * **Not lethal.** Superconda is bred, sold, and photographed as a living adult across every
 * source consulted for this trait — nothing anywhere describes reduced hatch rates or embryonic
 * loss for the homozygous form, unlike ball python's real `champagne` (see `champagne.ts`'s
 * `champagneLethalRule`). This locus deliberately carries no `ViabilityRule`.
 */
export const hognoseCondaLocus: Locus = {
  id: 'hognose-conda',
  label: 'Conda',
  placement: { kind: 'autosomal' },
  wildType: 'wild-type',
  alleles: [
    { id: 'wild-type', label: 'wild-type', origin: 'wild-type', invented: false },
    { id: 'conda', label: 'Conda', origin: 'authored', invented: false },
  ],
  expression: {
    kind: 'table',
    entries: {
      [key('wild-type', 'wild-type')]: { hognoseCondaForm: 'wildType' },
      [key('wild-type', 'conda')]: { hognoseCondaForm: 'conda' },
      [key('conda', 'conda')]: { hognoseCondaForm: 'superconda' },
    },
    otherwise: { hognoseCondaForm: 'wildType' },
  },
}

export const hognoseCondaProjection: TraitProjection<Phenotype> = {
  key: 'hognoseCondaForm',
  apply: (draft, value) => {
    if (value === 'conda') {
      Object.assign(draft, {
        ...withMorph(draft, 'pattern', 'Conda'),
        // Fewer, bigger markings — not more of the same ones. `scaleU` is blotch *frequency*
        // along the body ("higher is more, smaller blobs" — see `render/stages/blotches.ts`), so
        // it drops well below the wild-type 10; and `threshold` is raised above the wild-type
        // 0.52 so less of the body clears the bar at all. Moving only one of the two is the easy
        // mistake: bigger blotches at the same threshold just merge into a coat, and a higher
        // threshold at the same scale gives the same small blotches with gaps in them.
        stages: draft.stages.map((stage) =>
          stage.kind === 'pattern' && stage.name === 'blotches'
            ? { ...stage, params: { ...stage.params, scaleU: 3.2, threshold: 0.6, softness: 0.1 } }
            : stage,
        ),
      })
    } else if (value === 'superconda') {
      Object.assign(draft, {
        ...withMorph(draft, 'pattern', 'Superconda'),
        // No markings at all. Dropping the pattern stages outright, rather than laying a
        // `patternReduction` modifier over the top of them, is the difference between markings
        // that were never drawn and markings that were drawn and then painted over: the modifier
        // approach leaves whatever it does not fully cover, which is how this used to leave a
        // faint dorsal stripe. A superconda is a clean animal, so the pattern simply does not
        // form. The belly mask survives — an underside is not a marking.
        stages: draft.stages.filter((stage) => stage.kind !== 'pattern'),
      })
    }
  },
}

export const hognoseCondaNote: RealVsModeledNote = {
  real:
    'One copy ("Conda"): the dorsal blotches fuse into a much smaller number of much larger ' +
    'connected shapes, and the flanks quiet down. Two copies ("Superconda"): a third, distinct ' +
    'phenotype — a patternless animal. Not lethal in either dose, which makes it a genuinely ' +
    'clean incomplete-dominant teaching case, deliberately included to contrast with ball ' +
    "python champagne's real lethal super form. Older sources and some price lists still call " +
    'the single-copy animal "Anaconda"; "Conda" is the current term and the one used here.',
  modeled:
    "One copy re-tunes the existing `blotches` pattern stage's own parameters — fewer blotches, " +
    'each much larger — rather than swapping in a different pattern, so it reads as the same ' +
    'markings grown together. Two copies drop the pattern stage entirely, so a superconda is ' +
    'drawn with no markings whatsoever. Real superconda hognoses are usually described as ' +
    'keeping faint head markings, and sometimes a trace of dorsal speckling; this game draws ' +
    'them fully clean, which is the one simplification here.',
}
