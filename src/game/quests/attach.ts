/**
 * Serpentine — quests: wiring one runtime to one session.
 *
 * The whole dependency between the quest system and the game, in one function. `Session` never
 * imports the runtime; the runtime never reaches into the session during evaluation. What passes
 * between them is this adapter, and it is deliberately five read-only questions wide — everything a
 * predicate could want to know is baked into an observation at record time (`observe.ts`), so the
 * live game is consulted only while *recording*, never while *deciding*.
 *
 * One call is the whole integration:
 *
 * ```ts
 * const quests = attachQuests(session, QUESTS)
 * // ...and on teardown:
 * quests.stop()
 * ```
 */
import type { Session } from '../session'
import { QuestRuntime, type QuestRuntimeOptions, type QuestWorld } from './runtime'
import type { RosterFacts } from './evaluate'
import type { Quest, SexName, StageName } from './types'

/** The session, seen through the narrowest hole that answers every question the runtime asks. */
export function questWorldOf(session: Session): QuestWorld {
  const facts = (individualId: string) => session.record(individualId)
  return {
    turn: () => session.turn,
    speciesOf: (individualId) => facts(individualId)?.individual.species,
    sexOf: (individualId) => {
      const record = facts(individualId)
      return record ? (session.sexOf(record) as SexName) : undefined
    },
    stageOf: (individualId) => {
      const record = facts(individualId)
      return record ? (session.stageOf(record) as StageName) : undefined
    },
    locusForRule: (ruleId) => {
      for (const loaded of Object.values(session.species)) {
        const rule = loaded.playable.viability.find((candidate) => candidate.id === ruleId)
        if (rule) return rule.involves[0]
      }
      return undefined
    },
    flag: (id) => session.state.flags.get(id),
    roster: (): readonly RosterFacts[] =>
      session.residents().map((record) => ({
        individualId: record.individual.id,
        speciesId: record.individual.species,
        sex: session.sexOf(record) as SexName,
        mature: session.isMature(record),
      })),
  }
}

export interface AttachedQuests {
  readonly runtime: QuestRuntime
  readonly stop: () => void
}

/**
 * Attach the quest system to a live session.
 *
 * Also points {@link Session.questSlice} at the journal, which is what puts the `quests` slice in
 * the next save. A session with no runtime attached writes no slice at all — the system is optional
 * all the way down, which is the same promise `quest.off` makes to the player.
 */
export function attachQuests(
  session: Session,
  catalogue: readonly Quest[],
  hooks: Pick<QuestRuntimeOptions, 'onStepCompleted' | 'onQuestCompleted' | 'onOffered'> = {},
): AttachedQuests {
  const runtime = new QuestRuntime({
    bus: session.state.bus,
    flags: session.state.flags,
    world: questWorldOf(session),
    catalogue,
    restore: session.restoredQuests,
    ...hooks,
  })
  const detach = runtime.attach()
  session.questSlice = () => runtime.toSave()
  return {
    runtime,
    stop: () => {
      detach()
      if (session.questSlice) session.questSlice = null
    },
  }
}
