/**
 * Ties the game shell together: the three progression seams (`seams.ts`), the roster, the
 * economy, and the rehab's care log. Deliberately holds no species data and no
 * `GeneticsEngine` instance — those are supplied by whoever wires the game up (see the module
 * doc comment in `species/testSupport/referenceEngine.ts` for why this repo does not yet have
 * a production engine to import), so this file works unchanged once agent 05's real engine
 * lands.
 */
import { createEventBus } from './eventBus'
import { createFlagSet } from './flagSet'
import { createUnlockRegistry } from './unlockRegistry'
import { createRoster } from './roster'
import { createEconomy } from './economy'
import type { Economy } from './economy'
import type { CareLog } from './rehab'
import type { Roster } from './roster'
import type { EventBus, FlagSet, FlagValue, UnlockRegistry } from './seams'

export interface GameState {
  readonly bus: EventBus
  readonly flags: FlagSet
  readonly unlocks: UnlockRegistry
  readonly roster: Roster
  readonly economy: Economy
  readonly careLog: CareLog
  readonly worldSeed: string
}

export interface CreateGameOptions {
  readonly startingBalance?: number
  readonly flags?: Readonly<Record<string, FlagValue>>
  readonly roster?: Roster
  readonly careLog?: CareLog
}

export function createGame(worldSeed: string, options: CreateGameOptions = {}): GameState {
  const bus = createEventBus()
  return {
    bus,
    flags: createFlagSet(bus, options.flags),
    unlocks: createUnlockRegistry(),
    roster: options.roster ?? createRoster(),
    economy: createEconomy(bus, options.startingBalance),
    careLog: options.careLog ?? {},
    worldSeed,
  }
}
