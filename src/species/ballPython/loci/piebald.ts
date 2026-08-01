import type { Locus, PolygenicTrait, TraitProjection } from '../../../genetics/types'
import type { Phenotype } from '../../../render/contract'
import { withLabel } from '../../support/phenotypeKey'
import type { RealVsModeledNote } from '../../support/traitNotes'
import { key } from '../../support/genotypeKey'

/**
 * Piebald: **simple recessive** for "has patches at all" (real, corroborated cause: a
 * nonsense mutation in *TFEC*), paired with a genuinely **polygenic** continuous trait for how
 * much of the body those patches cover. The discrete gene and the continuous background trait
 * are deliberately two separate mechanisms that compose — that composition is itself a real,
 * documented fact (spider, lesser and spotnose are cited as background modifiers of white %).
 */
export const piebaldLocus: Locus = {
  id: 'piebald',
  label: 'Piebald',
  placement: { kind: 'autosomal' },
  wildType: 'wild-type',
  alleles: [
    { id: 'wild-type', label: 'wild-type', origin: 'wild-type', invented: false },
    {
      id: 'piebald',
      label: 'Piebald',
      origin: 'authored',
      invented: false,
      notes: 'Nonsense mutation in TFEC (bioRxiv preprint); recessive.',
    },
  ],
  expression: {
    kind: 'table',
    entries: {
      [key('wild-type', 'wild-type')]: { hasPiebaldPatches: false },
      [key('wild-type', 'piebald')]: { hasPiebaldPatches: false },
      [key('piebald', 'piebald')]: { hasPiebaldPatches: true },
    },
    otherwise: { hasPiebaldPatches: false },
  },
}

/**
 * Continuous white-percentage value. Only meaningful once `hasPiebaldPatches` is true — the
 * projection below is what decides that; the polygenic system itself has no idea piebald
 * exists, on purpose (a polygenic trait is just "small pushes plus noise," never a gate).
 */
export const piebaldWhitePercentage: PolygenicTrait = {
  key: 'piebaldWhitePercent',
  label: 'Piebald white %',
  baseline: 15,
  contributions: [{ locus: 'piebald', perAllele: { piebald: 20 } }],
  environmentSd: 12,
  clamp: [0, 100],
}

export const piebaldProjection: TraitProjection<Phenotype> = {
  key: 'hasPiebaldPatches',
  apply: (draft, value, ctx) => {
    if (value !== true) return
    const whitePercent = ctx.traits.piebaldWhitePercent
    const coverage = (typeof whitePercent === 'number' ? whitePercent : 15) / 100
    Object.assign(draft, {
      label: withLabel(draft.label, 'Piebald'),
      // The real `piebald` mask stage (`render/stages/piebald.ts`) — it already draws exactly
      // this: irregular unpigmented patches, indifferent to whatever pattern is underneath.
      stages: [
        ...draft.stages,
        { kind: 'mask' as const, name: 'piebald', params: { coverage, colour: '@bellyColour' } },
      ],
    })
  },
}

export const piebaldNote: RealVsModeledNote = {
  real:
    'Two independent things: a recessive TFEC mutation that turns patches on at all (real, ' +
    "peer-reviewed candidate gene), and a separate, genuinely polygenic 'how much of the body' " +
    'that several other genes are documented to nudge higher or lower.',
  modeled:
    'The on/off gene is an ordinary recessive locus. Coverage is a `PolygenicTrait` — a number, ' +
    'not a genotype — with a small non-heritable noise term, labelled polygenic rather than ' +
    'given a fake discrete allele so it is not mistaken for Mendelian.',
}
