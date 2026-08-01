import type { Locus, TraitProjection } from '../../../genetics/types'
import type { Phenotype } from '../../../render/contract'
import type { RealVsModeledNote } from '../../support/traitNotes'
import { key } from '../../support/genotypeKey'
import { withLabel } from '../../support/phenotypeKey'
import { rgb } from '../phenotype'

/**
 * Albino, candy, and their compound heterozygote "ultramel" — one locus, three real named
 * alleles. Demonstrates **simple recessive** (albino/albino, candy/candy each alone) and
 * **compound heterozygote** (albino/candy is its own third phenotype, not a blend and not
 * either parent form) in a single, real locus.
 */
export const albinoLocus: Locus = {
  id: 'albino',
  label: 'Albino / Candy complex',
  placement: { kind: 'autosomal' },
  wildType: 'wild-type',
  alleles: [
    { id: 'wild-type', label: 'wild-type', origin: 'wild-type', invented: false },
    {
      id: 'albino',
      label: 'Albino',
      origin: 'authored',
      invented: false,
      notes: 'Loss-of-function mutation in the melanin synthesis pathway.',
    },
    {
      id: 'candy',
      label: 'Candy',
      origin: 'authored',
      invented: false,
      notes: 'A second, distinct loss-of-function mutation at the same locus.',
    },
  ],
  expression: {
    kind: 'table',
    entries: {
      [key('wild-type', 'wild-type')]: { albinoPigment: 'wildType' },
      [key('wild-type', 'albino')]: { albinoPigment: 'wildType' },
      [key('wild-type', 'candy')]: { albinoPigment: 'wildType' },
      [key('albino', 'albino')]: { albinoPigment: 'albino' },
      [key('candy', 'candy')]: { albinoPigment: 'candy' },
      [key('albino', 'candy')]: { albinoPigment: 'ultramel' },
    },
    otherwise: { albinoPigment: 'wildType' },
  },
}

/**
 * All three reachable phenotypes reuse the real `albino` modifier stage
 * (`render/stages/albino.ts`) — pigment removal is one operation on whatever is already
 * there, the same way it is in a real snake. Different `amount`/`warmHue` per phenotype gets
 * three distinct looks out of one stage, which is the composability the modifier design is
 * for. `baseColour`/`patternColour` are still updated directly too, so shop listings and other
 * UI that read the phenotype's summary fields without running the render pipeline see the
 * right colour as well (see `render/contract.ts:Phenotype.baseColour`'s doc comment).
 */
function albinoStage(amount: number, warmHue: number) {
  return { kind: 'modifier' as const, name: 'albino', params: { amount, warmHue } }
}

export const albinoProjection: TraitProjection<Phenotype> = {
  key: 'albinoPigment',
  apply: (draft, value) => {
    if (value === 'albino') {
      Object.assign(draft, {
        label: withLabel(draft.label, 'Albino'),
        baseColour: rgb(250, 232, 168),
        patternColour: rgb(255, 205, 120),
        eye: { ...draft.eye, irisColour: rgb(230, 60, 60), pupilColour: rgb(200, 30, 30) },
        stages: [...draft.stages, albinoStage(1, 45)],
      })
    } else if (value === 'candy') {
      Object.assign(draft, {
        label: withLabel(draft.label, 'Candy'),
        baseColour: rgb(255, 200, 210),
        patternColour: rgb(255, 170, 190),
        eye: { ...draft.eye, irisColour: rgb(220, 90, 120), pupilColour: rgb(180, 40, 60) },
        stages: [...draft.stages, albinoStage(0.8, 350)],
      })
    } else if (value === 'ultramel') {
      // Real: two different TYR-pathway mutations, compound het. Neither parent's colour —
      // a paler, warmer intermediate that is its own named look.
      Object.assign(draft, {
        label: withLabel(draft.label, 'Ultramel'),
        baseColour: rgb(252, 218, 190),
        patternColour: rgb(255, 190, 160),
        eye: { ...draft.eye, irisColour: rgb(225, 110, 90), pupilColour: rgb(190, 70, 55) },
        stages: [...draft.stages, albinoStage(0.55, 20)],
      })
    }
  },
}

export const albinoNote: RealVsModeledNote = {
  real:
    'Albino and candy are two distinct loss-of-function mutations at the same melanin-pathway ' +
    'gene; a compound heterozygote (one copy of each) is visually its own thing — "ultramel" — ' +
    'paler than a wild-type carrier but darker than either homozygous form.',
  modeled:
    'One locus, three authored alleles, and a lookup table with an explicit row for ' +
    "albino/candy. We do not model which molecular pathway is affected, only that it's the " +
    'same gene.',
}
