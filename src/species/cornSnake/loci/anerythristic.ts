import type { Locus, ModifierRule, TraitProjection } from '../../../genetics/types'
import type { Phenotype } from '../../../render/contract'
import type { RealVsModeledNote } from '../../support/traitNotes'
import { key } from '../../support/genotypeKey'
import { withLabel } from '../../support/phenotypeKey'
import { rgb } from '../phenotype'

/**
 * Anerythristic: **simple recessive**, independent locus from amelanistic. Removes red/orange
 * pigment only. Combined with amelanistic (below), the double recessive is "snow" — a
 * well-documented, satisfying two-gene independent-assortment payoff.
 */
export const anerythristicLocus: Locus = {
  id: 'anery',
  label: 'Anerythristic',
  placement: { kind: 'autosomal' },
  wildType: 'wild-type',
  alleles: [
    { id: 'wild-type', label: 'wild-type', origin: 'wild-type', invented: false },
    { id: 'anery', label: 'Anerythristic', origin: 'authored', invented: false },
  ],
  expression: {
    kind: 'table',
    entries: {
      [key('wild-type', 'wild-type')]: { anerythristic: false },
      [key('wild-type', 'anery')]: { anerythristic: false },
      [key('anery', 'anery')]: { anerythristic: true },
    },
    otherwise: { anerythristic: false },
  },
}

export const anerythristicProjection: TraitProjection<Phenotype> = {
  key: 'anerythristic',
  apply: (draft, value) => {
    if (value !== true) return
    Object.assign(draft, {
      label: withLabel(draft.label, 'Anerythristic'),
      baseColour: rgb(190, 190, 190),
      patternColour: rgb(60, 60, 60),
    })
  },
}

/**
 * "Snow" — amelanistic and anerythristic together. This is *not* a third locus: it is a
 * `ModifierRule` reading both independent loci and overriding colour when both happen to be
 * homozygous recessive at once. `reads` must list both, or the probability engine will not
 * know these two loci need to be considered jointly for anything that keys off `snow`.
 */
export const snowModifier: ModifierRule<Phenotype> = {
  id: 'snow-combo',
  label: 'Snow (amel + anery)',
  describe:
    'Two independent recessive genes, both homozygous at once: no black pigment and no ' +
    'red/orange pigment, leaving a white, red-eyed animal.',
  reads: ['amel', 'anery'],
  apply: (draft, ctx) => {
    const isAmel = ctx.traits.amelanistic === true
    const isAnery = ctx.traits.anerythristic === true
    if (!isAmel || !isAnery) return
    Object.assign(draft, {
      label: 'Snow',
      baseColour: rgb(255, 250, 245),
      patternColour: rgb(255, 235, 225),
      eye: { ...draft.eye, irisColour: rgb(230, 60, 60), pupilColour: rgb(200, 30, 30) },
    })
  },
}

export const anerythristicNote: RealVsModeledNote = {
  real:
    'Removes red/orange pigment only, leaving a grey/black/white animal. Independent of ' +
    "amelanistic; combining both recessives (\"snow\") is a real, well-documented double-recessive " +
    'result and a clean teaching case for independent assortment.',
  modeled:
    'Direct match for the single locus. "Snow" is implemented as a `ModifierRule` reading both ' +
    'loci rather than a third gene, because that is what it actually is.',
}
