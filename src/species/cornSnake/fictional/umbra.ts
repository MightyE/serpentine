import type { Locus, ModifierRule } from '../../../genetics/types'
import type { Phenotype } from '../../../render/contract'
import { key } from '../../support/genotypeKey'
import { rgb } from '../phenotype'

/**
 * FICTIONAL — this is the demonstration piece D2's "carried forward, unresolved" note asks
 * for. The researcher could not corroborate true single-locus masking epistasis in real ball
 * pythons or corn snakes from two independent sources, so no *real* trait in this game may be
 * labelled epistatic (the well-documented real combos, like albino stripping pigment, are
 * additive/modifier interactions, not one gene switching another off). Umbra is invented
 * specifically to show the engine can do real masking epistasis when the biology actually
 * supports it: two copies unconditionally override whatever `amelanistic` produced, regardless
 * of that locus's own genotype. `reads` lists both loci for exactly the reason the doc comment
 * on `ModifierRule.reads` warns about — omit `amel` here and `punnett()` would compute
 * confident, wrong numbers for any question involving both.
 */
export const umbraLocus: Locus = {
  id: 'umbra',
  label: 'Umbra (fictional)',
  placement: { kind: 'autosomal' },
  wildType: 'wild-type',
  alleles: [
    { id: 'wild-type', label: 'wild-type', origin: 'wild-type', invented: true },
    { id: 'umbra', label: 'Umbra', origin: 'authored', invented: true },
  ],
  expression: {
    kind: 'table',
    entries: {
      [key('wild-type', 'wild-type')]: { umbraMasking: false },
      [key('wild-type', 'umbra')]: { umbraMasking: false },
      [key('umbra', 'umbra')]: { umbraMasking: true },
    },
    otherwise: { umbraMasking: false },
  },
}

export const umbraEpistasis: ModifierRule<Phenotype> = {
  id: 'umbra-masks-amel',
  label: 'Umbra masks amelanistic',
  describe:
    'Fictional: two copies of umbra unconditionally hide amelanistic’s effect, no matter ' +
    'what allele pair is actually at the amel locus.',
  reads: ['umbra', 'amel'],
  apply: (draft, ctx) => {
    if (ctx.traits.umbraMasking !== true) return
    if (ctx.traits.amelanistic !== true) return
    // Overrides amel's colour change back to the pigmented look, as if amel were not there.
    Object.assign(draft, {
      baseColour: rgb(214, 96, 42),
      patternColour: rgb(150, 40, 20),
    })
  },
}
