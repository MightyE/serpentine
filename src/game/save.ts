/**
 * Save / load to `localStorage`, with a schema version field.
 *
 * Everything in a `GameState` that matters to a save is already plain data — `Roster` entries
 * are `Individual` (genotype, parentage, mutations: all plain) plus a name/turn/source, `FlagSet`
 * is a plain record, `Economy` is a number. So serialising is a direct projection with no
 * translation layer to keep in sync, which is also what makes the round-trip lossless.
 *
 * Species definitions themselves are never saved (see `genetics/types.ts`'s "what gets saved"
 * note) — only the ids and allele ids a genotype references. Loading against a `src/species/`
 * that has since deleted a referenced allele is a content problem, not one this file tries to
 * paper over.
 */
import { createEventBus } from './eventBus'
import { createFlagSet } from './flagSet'
import { createUnlockRegistry } from './unlockRegistry'
import { createRoster } from './roster'
import { createEconomy } from './economy'
import type { CareLog } from './rehab'
import type { SnakeRecord } from './roster'
import type { GameState } from './game'
import type { FlagValue } from './seams'

export const SAVE_SCHEMA_VERSION = 1

export interface SaveFile {
  readonly schemaVersion: typeof SAVE_SCHEMA_VERSION
  readonly worldSeed: string
  readonly balance: number
  readonly flags: Readonly<Record<string, FlagValue>>
  readonly careLog: CareLog
  readonly roster: readonly SnakeRecord[]
}

export function serializeGame(game: GameState): SaveFile {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    worldSeed: game.worldSeed,
    balance: game.economy.balance(),
    flags: game.flags.all(),
    careLog: { ...game.careLog },
    roster: game.roster.all(),
  }
}

export function deserializeGame(save: SaveFile): GameState {
  if (save.schemaVersion !== SAVE_SCHEMA_VERSION) {
    throw new Error(
      `Save file schema version ${save.schemaVersion} is not supported by this build ` +
        `(expected ${SAVE_SCHEMA_VERSION}). Write a migration before loading it.`,
    )
  }
  const bus = createEventBus()
  return {
    bus,
    flags: createFlagSet(bus, save.flags),
    unlocks: createUnlockRegistry(),
    roster: createRoster(save.roster),
    economy: createEconomy(bus, save.balance),
    careLog: { ...save.careLog },
    worldSeed: save.worldSeed,
  }
}

const DEFAULT_STORAGE_KEY = 'serpentine:save'

/** The slice of the `Storage` DOM interface this file actually needs — small enough that a
 * test can hand in a plain in-memory fake instead of running under jsdom. */
export type SaveStorage = Pick<Storage, 'getItem' | 'setItem'>

function resolveStorage(storage: SaveStorage | undefined): SaveStorage {
  const resolved = storage ?? (globalThis as { localStorage?: SaveStorage }).localStorage
  if (!resolved) {
    throw new Error(
      'saveToLocalStorage/loadFromLocalStorage: no localStorage in this environment — pass one explicitly.',
    )
  }
  return resolved
}

export function saveToLocalStorage(game: GameState, key: string = DEFAULT_STORAGE_KEY, storage?: SaveStorage): void {
  resolveStorage(storage).setItem(key, JSON.stringify(serializeGame(game)))
}

/** `null` if there is nothing saved under this key yet. */
export function loadFromLocalStorage(key: string = DEFAULT_STORAGE_KEY, storage?: SaveStorage): GameState | null {
  const raw = resolveStorage(storage).getItem(key)
  if (raw === null) return null
  return deserializeGame(JSON.parse(raw) as SaveFile)
}
