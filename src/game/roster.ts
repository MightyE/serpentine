/**
 * The snake roster: every individual the rehab currently holds, plus the small pile of
 * game-facing metadata (`Individual` in `genetics/types.ts` is deliberately thin — name, how it
 * arrived, and when belong here, not there).
 */
import type { Individual, IndividualId } from '../genetics/types'

export type AcquisitionSource = 'founder' | 'bred' | 'rescued' | 'purchased'

export interface SnakeRecord {
  readonly individual: Individual
  readonly name: string
  readonly acquiredTurn: number
  readonly source: AcquisitionSource
}

export interface Roster {
  add(record: SnakeRecord): void
  get(id: IndividualId): SnakeRecord | undefined
  remove(id: IndividualId): SnakeRecord | undefined
  all(): readonly SnakeRecord[]
  bySpecies(speciesId: string): readonly SnakeRecord[]
}

export function createRoster(initial: readonly SnakeRecord[] = []): Roster {
  const byId = new Map<IndividualId, SnakeRecord>(initial.map((r) => [r.individual.id, r]))

  return {
    add(record) {
      if (byId.has(record.individual.id)) {
        throw new Error(`Roster already has an individual with id "${record.individual.id}"`)
      }
      byId.set(record.individual.id, record)
    },
    get: (id) => byId.get(id),
    remove(id) {
      const record = byId.get(id)
      if (record) byId.delete(id)
      return record
    },
    all: () => [...byId.values()],
    bySpecies: (speciesId) => [...byId.values()].filter((r) => r.individual.species === speciesId),
  }
}
