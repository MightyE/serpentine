import type { Locus, TraitProjection } from '../../../genetics/types'
import type { Phenotype } from '../../../render/contract'
import type { RealVsModeledNote } from '../../support/traitNotes'
import { key } from '../../support/genotypeKey'
import { withLabel } from '../../support/phenotypeKey'
import { rgb } from '../phenotype'

/**
 * Coral Glow / Banana — the real, named, **Y-linked** ball python colour trait (D2a). Its
 * inheritance pattern does not fit ZW at all, and is one of the lines of evidence Gamble et
 * al. 2017 cite for XY in pythons: a male carrier passes it to (almost) all his sons and none
 * of his daughters, because it rides the Y chromosome itself.
 *
 * Because a Y chromosome exists in only one copy per animal (only males have one, and only
 * one), this locus can never be homozygous — there is no "super" form to discover here, and
 * that absence is itself real biology, not a gap in this content. See
 * `ballPython/index.ts:coralGlowNote` for the corroboration caveat: peer-reviewed papers
 * confirm a sex-linked ball python colour mutation exists (supporting the XY finding);
 * exactly how it segregates is corroborated across hobby sources but not peer-reviewed under
 * this name.
 */
export const coralGlowLocus: Locus = {
  id: 'coral-glow',
  label: 'Coral Glow / Banana',
  placement: { kind: 'sexLinked', chromosome: 'Y' },
  wildType: 'wild-type',
  alleles: [
    { id: 'wild-type', label: 'wild-type', origin: 'wild-type', invented: false },
    {
      id: 'coral-glow',
      label: 'Coral Glow',
      origin: 'authored',
      invented: false,
      notes: 'Also sold as "Banana." Rides the Y chromosome; only males can carry it.',
    },
  ],
  expression: {
    kind: 'table',
    entries: {
      // Females have no Y chromosome at all, so this locus has no allele to report — the
      // empty key, per `genotypeKey.ts`.
      [key()]: { coralGlowPresent: false },
      [key('wild-type')]: { coralGlowPresent: false },
      [key('coral-glow')]: { coralGlowPresent: true },
    },
    otherwise: { coralGlowPresent: false },
  },
}

export const coralGlowProjection: TraitProjection<Phenotype> = {
  key: 'coralGlowPresent',
  apply: (draft, value) => {
    if (value !== true) return
    Object.assign(draft, {
      label: withLabel(draft.label, 'Coral Glow'),
      baseColour: rgb(235, 200, 120),
      patternColour: rgb(210, 160, 90),
    })
  },
}

export const coralGlowNote: RealVsModeledNote = {
  real:
    'A real, named colour mutation whose inheritance is Y-linked, not Z-linked — one of the ' +
    'lines of evidence for ball pythons being XY at all. A male carrier passes it to sons only. ' +
    'Peer-reviewed literature corroborates that a sex-linked ball python colour mutation exists; ' +
    'the specific breeder-facing segregation detail is corroborated across hobby sources but ' +
    'not itself published under this name.',
  modeled:
    'One Y-linked locus, two alleles, no homozygous state possible by construction (a Y ' +
    'chromosome never pairs with another Y). We do not invent a "super coral glow" — none is ' +
    'documented, and the engine has nowhere to put a second copy anyway.',
}
