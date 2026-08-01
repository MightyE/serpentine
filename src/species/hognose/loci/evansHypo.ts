import type { Locus, TraitProjection } from '../../../genetics/types'
import type { Phenotype } from '../../../render/contract'
import type { RealVsModeledNote } from '../../support/traitNotes'
import { key } from '../../support/genotypeKey'
import { withLabel } from '../../support/phenotypeKey'
import { rgb } from '../phenotype'

/**
 * Evans Hypo: **simple recessive**. The name is a historical misnomer worth teaching rather than
 * quietly fixing — it was named "Hypo" (hypomelanistic) by the breeder who found it, but the
 * hobby now largely agrees it is really a third tyrosinase-positive ("T+") mutation, alongside
 * `toffeebelly.ts` and `lavender.ts` on this species, not a true reduction in melanin production.
 * "Evans" was appended once the name had already stuck. Corroborated across the Hognose Wiki and
 * MorphMarket Morphpedia, both making the same T+-not-true-hypo point explicitly.
 */
export const hognoseEvansHypoLocus: Locus = {
  id: 'hognose-evans-hypo',
  label: 'Evans Hypo',
  placement: { kind: 'autosomal' },
  wildType: 'wild-type',
  alleles: [
    { id: 'wild-type', label: 'wild-type', origin: 'wild-type', invented: false },
    {
      id: 'evans-hypo',
      label: 'Evans Hypo',
      origin: 'authored',
      invented: false,
      notes: 'Named for breeder Richard Evans. Despite the name, now understood as T+, not true hypomelanism.',
    },
  ],
  expression: {
    kind: 'table',
    entries: {
      [key('wild-type', 'wild-type')]: { hognoseEvansHypo: false },
      [key('wild-type', 'evans-hypo')]: { hognoseEvansHypo: false },
      [key('evans-hypo', 'evans-hypo')]: { hognoseEvansHypo: true },
    },
    otherwise: { hognoseEvansHypo: false },
  },
}

export const hognoseEvansHypoProjection: TraitProjection<Phenotype> = {
  key: 'hognoseEvansHypo',
  apply: (draft, value) => {
    if (value !== true) return
    Object.assign(draft, {
      label: withLabel(draft.label, 'Evans Hypo'),
      baseColour: rgb(206, 176, 118),
      patternColour: rgb(170, 132, 90),
      bellyColour: rgb(238, 208, 224),
      // The one purely cosmetic, purely real detail worth keeping just because it is delightful:
      // Evans Hypo hognose are reported with a bright purple tongue and pupils.
      eye: { ...draft.eye, pupilColour: rgb(150, 96, 176) },
    })
  },
}

export const hognoseEvansHypoNote: RealVsModeledNote = {
  real:
    'Golden-brown body, a pink-and-purple belly, and — the fun, well-photographed detail — a ' +
    'bright purple tongue and pupils. Despite the name, the hobby now treats this as a third ' +
    "tyrosinase-positive (T+) mutation rather than genuine hypomelanism; the name stuck before " +
    'the reclassification did. Simple recessive.',
  modeled:
    'Body and belly colour, and the purple pupil, are direct matches. The tongue colour is not ' +
    "separately modelled — this game's tongue (`render/head.ts`, not owned by this trait) is " +
    'drawn from `patternColour`, not a dedicated field, so a purple tongue specifically is not ' +
    'reachable without a render change out of scope for a single trait.',
}
