/**
 * Serpentine — coverage sets: the quantile progressions, derived rather than listed.
 *
 * ## What this buys
 *
 * "Produce 25% of hognose's recessives" is a single achievement whose meaning changes correctly
 * when the species changes. Add a ninth recessive to hognose tomorrow and the ladder widens by
 * itself: no achievement is edited, no number is updated, nothing silently keeps measuring the old
 * list. That is the property worth protecting here, because a quantile achievement that has to be
 * hand-maintained is a quantile achievement that will be wrong within two traits.
 *
 * Membership comes from `traits.ts`, which reads dominance off each locus's own expression table.
 * So the authoring gesture for "this new morph belongs in the recessive ladder" is *writing the
 * recessive's expression table*, which is a thing you had to do anyway.
 *
 * ## Latching, and why widening a set is safe
 *
 * An earned achievement is never revoked (`engine.ts` records the award in a flag and never clears
 * it). So adding a trait can push a player from 100% back down to 90% of a set without taking the
 * 100% badge away. That asymmetry is deliberate: the alternative is a game that punishes its
 * author for adding content, which would be a strange thing for this project of all projects to do.
 * The progress bar tells the truth; the badge stays earned.
 */
import type { SpeciesDefinition } from '../../genetics/types'
import type { FlagId, ProgressView } from '../seams'
import type { CoverageSetId } from './types'
import { TALLY } from './tallies'
import { morphList } from './traits'

export interface CoverageSet {
  readonly id: CoverageSetId
  /** Player-facing, and used to build the `describe` of any requirement over this set. */
  readonly label: string
  readonly memberFlags: readonly FlagId[]
}

export interface CoverageIndex {
  get(id: CoverageSetId): CoverageSet | undefined
  all(): readonly CoverageSet[]
  /** Members reached, out of the total. What a progress bar draws. */
  progress(id: CoverageSetId, view: ProgressView): { readonly done: number; readonly total: number }
}

/** Ids are stable strings so an achievement can name one without importing anything. */
export const coverageId = {
  morphs: (speciesId: string): CoverageSetId => `${speciesId}:morphs`,
  recessives: (speciesId: string): CoverageSetId => `${speciesId}:recessives`,
  dominants: (speciesId: string): CoverageSetId => `${speciesId}:dominants`,
  realMorphs: (speciesId: string): CoverageSetId => `${speciesId}:real-morphs`,
  allMorphs: 'all:morphs' as CoverageSetId,
  allRecessives: 'all:recessives' as CoverageSetId,
  allDominants: 'all:dominants' as CoverageSetId,
  allSpecies: 'all:species' as CoverageSetId,
}

export function buildCoverage<P extends object>(
  species: readonly SpeciesDefinition<P>[],
): CoverageIndex {
  const sets = new Map<CoverageSetId, CoverageSet>()

  const add = (id: CoverageSetId, label: string, memberFlags: readonly FlagId[]): void => {
    // A set with no members would make `progress` divide by zero and, worse, would report 0/0 as
    // complete — so an empty set is simply not registered, and a requirement naming it fails
    // validation rather than silently passing.
    if (memberFlags.length === 0) return
    sets.set(id, { id, label, memberFlags })
  }

  const everyMorph: FlagId[] = []
  const everyRecessive: FlagId[] = []
  const everyDominant: FlagId[] = []

  for (const sp of species) {
    const morphs = morphList(sp)
    const flagOf = (m: { locusId: string; alleleId: string }): FlagId =>
      TALLY.trait(sp.id, m.locusId, m.alleleId)

    const all = morphs.map(flagOf)
    const recessives = morphs.filter((m) => m.dominance === 'recessive').map(flagOf)
    const dominants = morphs.filter((m) => m.dominance === 'dominant').map(flagOf)
    const real = morphs.filter((m) => !m.invented).map(flagOf)

    add(coverageId.morphs(sp.id), `${sp.label} morphs`, all)
    add(coverageId.recessives(sp.id), `${sp.label} recessives`, recessives)
    add(coverageId.dominants(sp.id), `${sp.label} dominant and incomplete-dominant traits`, dominants)
    add(coverageId.realMorphs(sp.id), `${sp.label} real-world morphs`, real)

    everyMorph.push(...all)
    everyRecessive.push(...recessives)
    everyDominant.push(...dominants)
  }

  add(coverageId.allMorphs, 'every morph in the game', everyMorph)
  add(coverageId.allRecessives, 'every recessive in the game', everyRecessive)
  add(coverageId.allDominants, 'every dominant and incomplete-dominant trait in the game', everyDominant)
  add(
    coverageId.allSpecies,
    'every species',
    species.map((sp) => TALLY.speciesSeen(sp.id)),
  )

  return {
    get: (id) => sets.get(id),
    all: () => [...sets.values()],
    progress: (id, view) => {
      const set = sets.get(id)
      if (!set) return { done: 0, total: 0 }
      const done = set.memberFlags.reduce((n, flag) => (view.count(flag) > 0 ? n + 1 : n), 0)
      return { done, total: set.memberFlags.length }
    },
  }
}

/**
 * The quantile rungs, as fractions.
 *
 * Five rungs rather than four or six because 10% is the one that matters most: it is the rung that
 * fires early enough to tell a new player that the ladder exists at all, and a ladder nobody knows
 * about motivates nobody. The rest are the obvious quarters.
 */
export const QUANTILES: readonly number[] = [0.1, 0.25, 0.5, 0.75, 1.0]

export function quantileLabel(fraction: number): string {
  return `${Math.round(fraction * 100)}%`
}
