import type { Locus, TraitProjection } from '../../../genetics/types'
import type { Phenotype } from '../../../render/contract'
import type { RealVsModeledNote } from '../../support/traitNotes'
import { key } from '../../support/genotypeKey'
import { withLabel } from '../../support/phenotypeKey'
import { rgb } from '../phenotype'

/**
 * The blue-eyed-leucistic (BEL) complex: **one locus, a real multi-allele series** (lesser,
 * mojave, butter here; the real locus has at least seven named members). Any two different
 * members together — or one doubled — produce blue-eyed leucistic. This is the cap-at-two
 * demonstration D2d requires: there is nowhere in an `AllelePair` to put a third allele, so
 * "three BEL alleles at once" cannot even be represented, let alone bred.
 *
 * Starter set uses three of the real named alleles rather than all seven-plus, to keep the
 * table readable; the mechanism (multi-allele, pairwise-compatible, capped at two) is
 * identical either way.
 */
export const belLocus: Locus = {
  id: 'bel',
  label: 'Blue-eyed leucistic complex',
  placement: { kind: 'autosomal' },
  wildType: 'wild-type',
  alleles: [
    { id: 'wild-type', label: 'wild-type', origin: 'wild-type', invented: false },
    { id: 'lesser', label: 'Lesser', origin: 'authored', invented: false },
    { id: 'mojave', label: 'Mojave', origin: 'authored', invented: false },
    { id: 'butter', label: 'Butter', origin: 'authored', invented: false },
  ],
  expression: {
    kind: 'table',
    entries: {
      [key('wild-type', 'wild-type')]: { belForm: 'wildType' },
      [key('wild-type', 'lesser')]: { belForm: 'hetLesser' },
      [key('wild-type', 'mojave')]: { belForm: 'hetMojave' },
      [key('wild-type', 'butter')]: { belForm: 'hetButter' },
      [key('lesser', 'lesser')]: { belForm: 'bel' },
      [key('mojave', 'mojave')]: { belForm: 'bel' },
      [key('butter', 'butter')]: { belForm: 'bel' },
      [key('lesser', 'mojave')]: { belForm: 'bel' },
      [key('lesser', 'butter')]: { belForm: 'bel' },
      [key('mojave', 'butter')]: { belForm: 'bel' },
    },
    // Any pairing this table doesn't spell out (e.g. a fifth allele added later) still reads
    // as "two different complex members together" — the real rule for this locus.
    otherwise: { belForm: 'bel' },
  },
}

export const belProjection: TraitProjection<Phenotype> = {
  key: 'belForm',
  apply: (draft, value) => {
    if (value === 'bel') {
      Object.assign(draft, {
        label: withLabel(draft.label, 'Blue-Eyed Leucistic'),
        baseColour: rgb(245, 242, 236),
        patternColour: rgb(245, 242, 236),
        eye: { ...draft.eye, irisColour: rgb(90, 150, 210), pupilColour: rgb(40, 70, 110) },
      })
    } else if (typeof value === 'string' && value.startsWith('het')) {
      Object.assign(draft, {
        label: withLabel(draft.label, value.replace('het', 'het ')),
        baseColour: rgb(150, 128, 90),
        effects: [...draft.effects, 'spiderWebHeadMarks'],
      })
    }
  },
}

export const belNote: RealVsModeledNote = {
  real:
    'One locus with at least seven named alleles (lesser, mojave, butter, russo, mocha, ' +
    'bamboo, phantom and others); any two different members, or one doubled, produce blue-eyed ' +
    "leucistic. An animal can carry at most two — one per chromosome copy — never three. " +
    "(One recent single-source claim reports lesser and butter may be genetically distinct " +
    "rather than the same allele; not corroborated by a second source, so not built into this " +
    "content.)",
  modeled:
    'Same locus, three of the real named alleles instead of all seven-plus, so the table stays ' +
    'readable. The two-per-animal cap is not a rule we enforce — it is structural, because ' +
    "`AllelePair` only has two slots.",
}
