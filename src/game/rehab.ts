/**
 * The rehab: residents that need extra care, and giving it to them.
 *
 * "Needs extra care" is read straight off the phenotype's `effects` tag — a species' content
 * decides when that applies (see `species/ballPython/loci/champagne.ts`, where a champagne
 * heterozygote gets the tag because the real morph is documented with wobble-like neurological
 * signs). This file never asks *why* an animal needs care; that judgement belongs to content,
 * not to the rehab.
 */
import type { GeneticsEngine, IndividualId, SpeciesDefinition } from '../genetics/types'
import type { Phenotype } from '../render/contract'
import type { Roster, SnakeRecord } from './roster'
import type { EventBus, FlagSet } from './seams'

const NEEDS_EXTRA_CARE_TAG = 'needsExtraCare'

declare module './seams' {
  interface GameEventMap {
    /** A resident got attention this turn. */
    'snake.comforted': { individualId: string; totalCareGiven: number }
  }
}

export function needsExtraCare(
  record: SnakeRecord,
  engine: GeneticsEngine,
  species: SpeciesDefinition<Phenotype>,
): boolean {
  const phenotype = engine.express(record.individual, species)
  return phenotype.effects.includes(NEEDS_EXTRA_CARE_TAG)
}

export function residentsNeedingCare(
  roster: Roster,
  engine: GeneticsEngine,
  speciesById: Readonly<Record<string, SpeciesDefinition<Phenotype>>>,
): SnakeRecord[] {
  return roster.all().filter((record) => {
    const species = speciesById[record.individual.species]
    return species ? needsExtraCare(record, engine, species) : false
  })
}

/** How much attention each resident has received, by individual id. Lives in the save file. */
export type CareLog = Record<IndividualId, number>

export function giveCare(id: IndividualId, careLog: CareLog, flags: FlagSet, bus: EventBus): number {
  const total = (careLog[id] ?? 0) + 1
  careLog[id] = total
  flags.bump('totalCareGiven')
  bus.emit('snake.comforted', { individualId: id, totalCareGiven: total })
  return total
}
