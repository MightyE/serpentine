/**
 * The breeding action: a pairing produces a clutch through `GeneticsEngine.breed`, and the game
 * layer turns that into roster entries and events. This file makes no genetics decisions of its
 * own — it is entirely about what happens to a `Clutch` once the engine has produced one.
 */
import type { ClutchRequest, GeneticsEngine, SpeciesDefinition } from '../genetics/types'
import type { Phenotype } from '../render/contract'
import type { Roster, SnakeRecord } from './roster'
import type { EventBus, FlagSet } from './seams'

declare module './seams' {
  interface GameEventMap {
    /** A clutch finished — the whole-clutch summary, complementing the per-egg events below. */
    'clutch.hatched': { motherId: string; fatherId: string; hatchedCount: number; unhatchedCount: number }
    /** A locus expressed visibly for the first time this player has seen. */
    'trait.discovered': { speciesId: string; locusId: string; value: string }
  }
}

export interface BreedResult {
  readonly hatchedIds: readonly string[]
  readonly unhatchedCount: number
}

/** Builds a deterministic clutch seed — see `ClutchRequest.seed`'s doc comment for the convention. */
export function clutchSeed(worldSeed: string, motherId: string, fatherId: string, clutchIndex: number): string {
  return `${worldSeed}:clutch:${motherId}:${fatherId}:${clutchIndex}`
}

export function breedPair(
  engine: GeneticsEngine,
  species: SpeciesDefinition<Phenotype>,
  request: ClutchRequest,
  roster: Roster,
  bus: EventBus,
  flags: FlagSet,
  turn: number,
): BreedResult {
  bus.emit('clutch.laid', {
    motherId: request.mother.id,
    fatherId: request.father.id,
    eggCount: request.clutchSize,
    clutchSeed: request.seed,
  })

  const clutch = engine.breed(request, species)

  for (const hatchling of clutch.hatched) {
    const record: SnakeRecord = {
      individual: hatchling,
      name: `Hatchling (${species.label})`,
      acquiredTurn: turn,
      source: 'bred',
    }
    roster.add(record)
    bus.emit('egg.hatched', { individualId: hatchling.id, clutchSeed: clutch.seed })
  }

  for (const egg of clutch.unhatched) {
    bus.emit('egg.notViable', { clutchSeed: clutch.seed, explanation: egg.explanation, ruleId: egg.ruleId })
  }

  flags.bump('clutchesHatched')
  bus.emit('clutch.hatched', {
    motherId: request.mother.id,
    fatherId: request.father.id,
    hatchedCount: clutch.hatched.length,
    unhatchedCount: clutch.unhatched.length,
  })

  return { hatchedIds: clutch.hatched.map((h) => h.id), unhatchedCount: clutch.unhatched.length }
}
