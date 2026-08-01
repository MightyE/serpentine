import type { Locus, TraitProjection } from '../../../genetics/types'
import type { Phenotype } from '../../../render/contract'
import type { RealVsModeledNote } from '../../support/traitNotes'
import { key } from '../../support/genotypeKey'
import { withLabel } from '../../support/phenotypeKey'
import { rgb } from '../phenotype'

/**
 * Albino: **simple recessive**, tyrosinase-negative ("T-") — the classic red-eyed amelanistic.
 * Corroborated across independent hobby genetics references (MorphMarket Morphpedia and the
 * Hognose Wiki both describe it as a simple recessive that removes black/brown pigment entirely,
 * leaving red/orange/yellow tones and red eyes).
 *
 * Deliberately kept as its own independent locus rather than folded into an allelic complex with
 * `toffeebelly`/`lavender`/`evansHypo` below: those are also albino-*like* (they each remove or
 * mute melanin some other way) but nothing in the sourcing available for this cycle establishes
 * that they fail to complement each other genetically the way ball python's `albinoComplex.ts`
 * members are documented to. Modelling them as independent loci is the honest choice absent that
 * evidence — see this file's `RealVsModeledNote` and the matching notes on the other three.
 */
export const hognoseAlbinoLocus: Locus = {
  id: 'hognose-albino',
  label: 'Albino',
  placement: { kind: 'autosomal' },
  wildType: 'wild-type',
  alleles: [
    { id: 'wild-type', label: 'wild-type', origin: 'wild-type', invented: false },
    {
      id: 'albino',
      label: 'Albino',
      origin: 'authored',
      invented: false,
      notes: 'Tyrosinase-negative ("T-"); red eyes distinguish it from the T+ forms on this species.',
    },
  ],
  expression: {
    kind: 'table',
    entries: {
      [key('wild-type', 'wild-type')]: { hognoseAlbino: false },
      [key('wild-type', 'albino')]: { hognoseAlbino: false },
      [key('albino', 'albino')]: { hognoseAlbino: true },
    },
    otherwise: { hognoseAlbino: false },
  },
}

export const hognoseAlbinoProjection: TraitProjection<Phenotype> = {
  key: 'hognoseAlbino',
  apply: (draft, value) => {
    if (value !== true) return
    Object.assign(draft, {
      label: withLabel(draft.label, 'Albino'),
      baseColour: rgb(252, 176, 96),
      patternColour: rgb(226, 122, 48),
      eye: { ...draft.eye, irisColour: rgb(224, 64, 64), pupilColour: rgb(196, 32, 32) },
    })
  },
}

export const hognoseAlbinoNote: RealVsModeledNote = {
  real:
    'A tyrosinase-negative ("T-") mutation: melanin production is switched off entirely, leaving ' +
    'red/orange/yellow pigment and the tell-tale red eyes. Simple recessive.',
  modeled:
    'Direct match — a plain recessive locus. The red eye is written explicitly rather than ' +
    "derived, so this trait's genotype is checkable against the one real, easily-photographed " +
    'feature that separates it from this species\' several T+ forms.',
}
