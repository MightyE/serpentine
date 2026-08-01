import type { Locus, TraitProjection, ViabilityRule } from '../../../genetics/types'
import type { Phenotype } from '../../../render/contract'
import type { RealVsModeledNote } from '../../support/traitNotes'
import { key } from '../../support/genotypeKey'
import { withLabel } from '../../support/phenotypeKey'
import { rgb } from '../phenotype'

/**
 * Champagne: incomplete dominant, like pastel — **except** the homozygous "super" form is
 * real and homozygous-lethal. Champagne heterozygotes are also documented with wobble-like
 * neurological signs (see `game/rehab.ts`, which flags them for extra care); the homozygous
 * super form does not survive incubation at all. Per D2b: a non-viable genotype is an egg
 * that does not hatch, reported as a genetics fact — never a death, never a cull.
 */
export const champagneLocus: Locus = {
  id: 'champagne',
  label: 'Champagne',
  placement: { kind: 'autosomal' },
  wildType: 'wild-type',
  alleles: [
    { id: 'wild-type', label: 'wild-type', origin: 'wild-type', invented: false },
    {
      id: 'champagne',
      label: 'Champagne',
      origin: 'authored',
      invented: false,
      notes: 'Heterozygote is a real, sought-after morph; two copies do not hatch.',
    },
  ],
  expression: {
    kind: 'table',
    entries: {
      [key('wild-type', 'wild-type')]: { champagneIntensity: 'wildType' },
      [key('wild-type', 'champagne')]: { champagneIntensity: 'champagne' },
      // This row is reachable by `punnett()` and by a Punnett-square preview even though no
      // living animal ever has this genotype — `champagneLethalRule` below removes it from
      // `breed()`'s hatched output before an `Individual` is ever created for it.
      [key('champagne', 'champagne')]: { champagneIntensity: 'superChampagne' },
    },
    otherwise: { champagneIntensity: 'wildType' },
  },
}

export const champagneLethalRule: ViabilityRule = {
  id: 'super-champagne-lethal',
  label: 'Super champagne is non-viable',
  involves: ['champagne'],
  explanation:
    'Two copies of champagne are documented as lethal in the egg. This clutch has an egg that ' +
    'will not hatch — a real, well-documented genetics fact, not an accident of care.',
  isNonViable: (genotype) => {
    const pair = genotype.loci.champagne
    return pair?.[0] === 'champagne' && pair?.[1] === 'champagne'
  },
}

export const champagneProjection: TraitProjection<Phenotype> = {
  key: 'champagneIntensity',
  apply: (draft, value) => {
    if (value === 'champagne') {
      Object.assign(draft, {
        label: withLabel(draft.label, 'Champagne'),
        baseColour: rgb(200, 175, 130),
        patternColour: rgb(120, 100, 70),
        effects: [...draft.effects, 'needsExtraCare'],
      })
    } else if (value === 'superChampagne') {
      // Unreachable in a hatched animal; kept honest for the Punnett-square preview.
      Object.assign(draft, {
        label: withLabel(draft.label, 'Super Champagne'),
        baseColour: rgb(235, 225, 200),
        patternColour: rgb(200, 190, 165),
      })
    }
  },
}

export const champagneNote: RealVsModeledNote = {
  real:
    'Champagne heterozygotes are a real morph, also documented with wobble-like neurological ' +
    'signs in some individuals. Two copies (super champagne) are real and homozygous-lethal — ' +
    "breeders are told never to pair champagne × champagne.",
  modeled:
    'The lethal genotype is a `ViabilityRule`: the egg does not hatch and the reason is shown ' +
    'to the player as a genetics fact. There is no death, no culling, and no living animal ever ' +
    'carries two copies in this game — matching what happens in reality, where none survive to ' +
    'be an animal you could keep.',
}
