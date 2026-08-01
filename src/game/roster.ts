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
  /**
   * Wright's `F`, computed **once, at hatch**, against the pedigree as it stood then.
   *
   * `genetics/pedigree.ts` deliberately adds no field to `Individual` — the engine states `F`
   * as a function of a pedigree, and the game layer is the thing that owns a pedigree. Storing
   * it here means the number on the animal's card is the number that was true when it hatched,
   * which is also the number `kinship(dam, sire)` showed before the pairing was committed.
   *
   * Absent on a founder or a purchased animal: those have no known parents, so `F` is 0 by
   * definition and there is nothing to record.
   */
  readonly inbreeding?: number
  /** Load alleles this animal is homozygous for, by locus id — see `genetics/load.ts`. */
  readonly expressedLoad?: readonly string[]
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
