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
import { deserializeStore, serializeStore, type StoreSave, type StoreState } from './placement'
// Type-only, and deliberately so: it is erased at build time, so the session may keep importing
// this file for `deserializeGame` without the two of them forming a runtime cycle.
import type { InFlightSave } from './session'

export const SAVE_SCHEMA_VERSION = 1

export interface SaveFile {
  readonly schemaVersion: typeof SAVE_SCHEMA_VERSION
  readonly worldSeed: string
  readonly balance: number
  readonly flags: Readonly<Record<string, FlagValue>>
  readonly careLog: CareLog
  readonly roster: readonly SnakeRecord[]
  /**
   * The store floor — which habitats are built and who lives in each.
   *
   * **Optional, and the schema version did not move.** It lives on the `Session` rather than on
   * `GameState` (habitats are a playing-game concern, the way loaded species are), so it comes in
   * as an argument rather than being read off the game. Absent in a save written before habitats
   * existed, which loads as a fresh floor rather than as an error — that is what optional buys,
   * and it is why this did not need a migration.
   */
  readonly store?: StoreSave
  /**
   * The time gates still ticking, and the clutches they are carrying.
   *
   * **Optional, and the schema version did not move**, for the same reason as `store`: it lives on
   * the `Session` rather than on `GameState`, and a save written before gates existed loads as a
   * game with nothing in flight rather than as an error.
   *
   * It is also the field this file most has to get right. A save that drops a pending clutch
   * loses a pairing the player committed to fifteen weeks ago and cannot get back, and a game
   * that does that once is a game whose saves nobody trusts again. `Session.toSaveFile` writes it;
   * `new Session({ restore })` reads it; `save.test.ts` round-trips a clutch mid-incubation.
   */
  readonly inFlight?: InFlightSave
}

export function serializeGame(game: GameState, store?: StoreSave): SaveFile {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    worldSeed: game.worldSeed,
    balance: game.economy.balance(),
    flags: game.flags.all(),
    careLog: { ...game.careLog },
    roster: game.roster.all(),
    ...(store ? { store: serializeStore(store) } : {}),
  }
}

/**
 * The store floor out of a save file, or `undefined` if it predates habitats.
 *
 * Separate from `deserializeGame` because the store is not part of `GameState`. It resolves its
 * occupants against the save's own roster, so an animal sold before the save cannot come back as
 * a phantom resident holding a slot nothing can free.
 */
export function storeFromSave(save: SaveFile): StoreState | undefined {
  if (!save.store) return undefined
  return deserializeStore(save.store, new Set(save.roster.map((record) => record.individual.id)))
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
