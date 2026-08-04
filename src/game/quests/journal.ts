/**
 * Serpentine — quests: the act journal.
 *
 * Two hundred observations, newest last, and a sequence number that never resets. That is the whole
 * data structure, and every interesting property of the quest system comes out of how small it is.
 *
 * ## Why a bounded journal rather than a full history
 *
 * Retroactivity is unconditional (`docs/quest-design.md` §A4): if the player already did a step
 * before the quest was offered, it counts, and the runtime finds out by replaying this buffer. A
 * bound therefore has a *pedagogical* justification and not only an engineering one. Evidence older
 * than the buffer falls off and the step waits for a fresh act — which is correct, because a
 * sequence performed forty hours ago is weak evidence that the concept is live *now*, while one
 * performed two minutes ago is excellent evidence and re-demanding it is insulting.
 *
 * The engineering side is the free part: the save cost is bounded and small, and a save file cannot
 * grow without limit no matter how long the game runs.
 *
 * ## Why `seq` is not the array index
 *
 * `sequence` signals ask "did this happen before that". Array position answers that only while
 * nothing has been evicted and nothing reloaded. A monotonic counter that survives both is the
 * cheapest honest answer, it is one number in the save, and it means an observation is comparable to
 * one it no longer shares an array with.
 */
import { LIMITS } from './types'
import type { ActKind, ActPayloadMap, Observation, QuestSave } from './types'

export interface Journal {
  /** Append one act. Returns the observation, which is what the runtime then evaluates against. */
  record<K extends ActKind>(act: K, fields: ActPayloadMap[K], turn: number): Observation
  /** Oldest first. The evaluator's only input. */
  all(): readonly Observation[]
  /** Next sequence number that will be issued. */
  seq(): number
  toSave(): QuestSave
}

/**
 * A journal, optionally restored.
 *
 * A save with no `quests` slice starts empty rather than erroring — Eric confirmed there are no real
 * saves, so there is no migration, and "absent means empty" is the same shape `store` and `inFlight`
 * already use in `save.ts`.
 *
 * A restored journal is truncated to the current bound, so lowering {@link LIMITS.journalSize} in a
 * later build cannot leave an over-long buffer alive in an old save.
 */
export function createJournal(restore?: QuestSave): Journal {
  const entries: Observation[] = restore ? [...restore.journal].slice(-LIMITS.journalSize) : []
  let next = restore?.seq ?? 0
  // A restored `seq` that is behind its own entries would let a new act sort before an old one, and
  // `sequence` would start reading history backwards. Cheap to rule out; impossible to debug later.
  for (const entry of entries) if (entry.seq >= next) next = entry.seq + 1

  return {
    record(act, fields, turn) {
      const observation: Observation = { act, at: turn, seq: next++, fields }
      entries.push(observation)
      if (entries.length > LIMITS.journalSize) entries.splice(0, entries.length - LIMITS.journalSize)
      return observation
    },
    all: () => entries,
    seq: () => next,
    toSave: () => ({ journal: [...entries], seq: next }),
  }
}
