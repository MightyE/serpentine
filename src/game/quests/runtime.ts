/**
 * Serpentine — quests: the runtime.
 *
 * Offering, activation, step completion, retirement, dismissal, the act index and every `quest.*`
 * flag write. One class, no polling, no ticking, and no knowledge of any particular quest.
 *
 * ## Indexed on acts, never polled
 *
 * Exactly the shape the achievement engine uses for flags: {@link actsIn} walks a signal tree and
 * returns the act kinds it could care about, the index is built once from the catalogue, and an
 * incoming observation re-checks only the handful of steps in that bucket. Steps whose signal is a
 * pure state read have no acts, so they sit in {@link stateSteps} and are re-checked on
 * `flag.changed` instead. Nothing sweeps the catalogue, nothing runs on a tick, and nothing walks the
 * roster on an event.
 *
 * ## Retroactivity has no separate policy
 *
 * When a quest is offered the runtime replays the journal and completes whatever is already done
 * (§A4). That looks like it fights the anti-accident rule and in fact resolves it: a step that would
 * be *wrong* to complete retroactively is a step whose predicate is too weak, which is a bug in the
 * predicate rather than in the replay. So there is one policy — replay everything — and
 * `blind.test.ts` is what keeps it honest.
 *
 * Retroactive completions are silent. A quest every step of which is already done is **retired**:
 * marked done and never shown, because a congratulation for the past is noise and is the single most
 * likely way this system becomes annoying.
 *
 * ## Nothing here is a gate
 *
 * The runtime writes flags under `quest.` and reads acts. It grants nothing, unlocks nothing, and
 * registers nothing with the `UnlockRegistry` — `notAGate.test.ts` asserts the other half, that no
 * unlock condition anywhere reads a flag it wrote.
 */
import type { EventBus, FlagId, Unsubscribe } from '../seams'
import type { FlagSet } from '../seams'
import { createJournal, type Journal } from './journal'
import { createRecorder, type ObserverWorld } from './observe'
import { evaluateSignal, type EvalContext, type SignalProgress, type StateView } from './evaluate'
import {
  LIMITS,
  QUEST_FLAGS,
  QUEST_PREFIX,
  actsIn,
  questCompletedTurnFlag,
  questRetiredFlag,
  questStatusFlag,
  questStepFlag,
} from './types'
import type {
  ActKind,
  ActPayloadMap,
  Observation,
  Quest,
  QuestId,
  QuestSave,
  QuestStatus,
  QuestStep,
  StepId,
} from './types'

/** Everything the runtime needs to know about the game. The union of the two narrow views. */
export interface QuestWorld extends ObserverWorld, StateView {}

export interface QuestRuntimeOptions {
  readonly bus: EventBus
  readonly flags: FlagSet
  readonly world: QuestWorld
  readonly catalogue: readonly Quest[]
  /** The save's `quests` slice, if there is one. */
  readonly restore?: QuestSave
  /** A step ticked *now*. Never fired for a retroactive completion — see the file header. */
  readonly onStepCompleted?: (quest: Quest, step: QuestStep) => void
  /** A quest finished *now*. Never fired for a silent retirement. */
  readonly onQuestCompleted?: (quest: Quest) => void
  readonly onOffered?: (quest: Quest) => void
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export interface StepView {
  readonly id: StepId
  readonly text: string
  readonly done: boolean
  /**
   * An unmet `after` — a *physical* prerequisite, never a pedagogical one. Still rendered, dimmed,
   * with its text readable: the shape of the quest is never hidden.
   */
  readonly blocked: boolean
  readonly hint?: string
  /** True once the step has sat without progress for {@link LIMITS.hintAfterTurns} turns. */
  readonly showHint: boolean
  readonly progress: SignalProgress
  readonly gatesUnderstanding: boolean
}

export interface QuestView {
  readonly id: QuestId
  readonly chapter: string
  readonly title: string
  readonly intent: string
  readonly status: QuestStatus
  readonly steps: readonly StepView[]
  readonly completed: number
  readonly total: number
  /** Done before it was ever offered, so it was never shown. Collapse it in the list. */
  readonly retiredSilently: boolean
}

/** The header line: one quest, one step. The reading budget in §D is per line on screen. */
export interface StripView {
  readonly questId: QuestId
  readonly title: string
  readonly stepId: StepId
  readonly stepText: string
  readonly hint?: string
  readonly satisfied: number
  readonly total: number
}

interface StepRef {
  readonly quest: Quest
  readonly step: QuestStep
}

export class QuestRuntime {
  private readonly options: QuestRuntimeOptions
  private readonly journal: Journal
  private readonly index = new Map<ActKind, StepRef[]>()
  /** Steps with no acts in their signal: pure state reads, re-checked on `flag.changed`. */
  private readonly stateSteps: StepRef[] = []
  /** questId → last turn any step of it gained ground. Drives the hint, and only the hint. */
  private readonly lastProgressTurn = new Map<string, number>()
  private evaluating = false

  constructor(options: QuestRuntimeOptions) {
    this.options = options
    this.journal = createJournal(options.restore)

    for (const quest of options.catalogue) {
      for (const step of quest.steps) {
        const acts = actsIn(step.when)
        if (acts.length === 0) {
          this.stateSteps.push({ quest, step })
          continue
        }
        for (const act of acts) {
          const bucket = this.index.get(act) ?? []
          bucket.push({ quest, step })
          this.index.set(act, bucket)
        }
      }
    }
  }

  // -- wiring ---------------------------------------------------------------

  /**
   * Start listening, and reconcile once against the state as it already is.
   *
   * The reconcile matters on load as much as on a new game: a quest added to the catalogue in a later
   * build meets a save whose journal already satisfies it, and gets retired rather than offered.
   */
  attach(): Unsubscribe {
    const recorder = createRecorder(this.options.world, this.journal.all())
    const stop = recorder.attach(this.options.bus, (act, fields) => {
      this.observe(act, fields)
    })
    const stopFlags = this.options.bus.on('flag.changed', ({ flag }) => {
      // Its own writes, and the achievement system's earned flags, are not news. Without this the
      // first `quest.step.*` write would re-enter evaluation from inside itself.
      if (flag.startsWith(QUEST_PREFIX)) return
      // Only the state-read steps can change on a flag: an act-indexed step cannot become true
      // without an act, and re-checking it here would be the sweep this design does not do.
      this.refreshOffers()
      this.checkSteps(this.stateSteps)
    })
    this.refresh()
    return () => {
      stop()
      stopFlags()
    }
  }

  private observe<K extends ActKind>(act: K, fields: ActPayloadMap[K]): void {
    this.journal.record(act, fields, this.options.world.turn())
    this.refreshOffers()
    const affected = this.index.get(act)
    if (affected) this.checkSteps(affected)
  }

  /** Re-check everything. Cheap enough for a load, a restore, or a flag change. */
  refresh(): void {
    this.refreshOffers()
    // A quest restored from a save has no in-memory progress mark, so start its hint clock now
    // rather than at turn zero — otherwise every hint in an old save is visible on load.
    for (const quest of this.options.catalogue) {
      if (this.statusOf(quest.id) === undefined) continue
      if (!this.lastProgressTurn.has(quest.id)) this.noteProgress(quest.id)
    }
    this.checkSteps(this.allSteps())
  }

  private allSteps(): StepRef[] {
    const out: StepRef[] = []
    for (const quest of this.options.catalogue) {
      for (const step of quest.steps) out.push({ quest, step })
    }
    return out
  }

  // -- evaluation -----------------------------------------------------------

  private context(): EvalContext {
    return { journal: this.journal.all(), state: this.options.world }
  }

  private checkSteps(refs: readonly StepRef[]): void {
    if (this.evaluating) return
    this.evaluating = true
    try {
      const touched = new Set<Quest>()
      for (const { quest, step } of refs) {
        const status = this.statusOf(quest.id)
        // A quest that has never been offered has nothing to complete yet; a finished one is
        // finished. A **dismissed** quest keeps completing steps in the background, which is what
        // makes restoring it show real progress instead of a reset — and it is free, because the
        // journal was being written anyway.
        if (status === undefined || status === 'done') continue
        if (this.isStepDone(quest.id, step.id)) continue
        if (this.isBlocked(quest, step)) continue
        const progress = evaluateSignal(step.when, this.context())
        if (progress.satisfied > 0) this.noteProgress(quest.id)
        if (!progress.done) continue
        this.completeStep(quest, step, false)
        touched.add(quest)
      }
      let finishedAny = false
      for (const quest of touched) finishedAny = this.checkQuestDone(quest, false) || finishedAny
      // A quest finishing can satisfy another's `offer.after`, and the offer has to happen *now*.
      //
      // Not a cosmetic latency. `observe` refreshes offers before it evaluates steps, so without
      // this the newly unlocked quest waits for the next act — and the decision made at offer time
      // is whether to retire the quest silently (§A4). One more act arriving first is enough to turn
      // a quest that should have been retired into one that is offered and then completed with
      // ceremony, which is precisely the congratulation-for-the-past that rule exists to prevent.
      // If the player closes the game on that act, the offer never happens at all.
      if (finishedAny) this.refreshOffers()
    } finally {
      this.evaluating = false
    }
  }

  private completeStep(quest: Quest, step: QuestStep, silent: boolean): void {
    this.options.flags.set(questStepFlag(quest.id, step.id), true)
    this.noteProgress(quest.id)
    if (silent) return
    if (this.statusOf(quest.id) === 'offered') this.setStatus(quest.id, 'active')
    this.options.onStepCompleted?.(quest, step)
  }

  private checkQuestDone(quest: Quest, silent: boolean): boolean {
    if (!quest.steps.every((step) => this.isStepDone(quest.id, step.id))) return false
    this.setStatus(quest.id, 'done')
    this.options.flags.set(questCompletedTurnFlag(quest.id), this.options.world.turn())
    // Bumped for a silent retirement too. `quest.completed` is what an achievement reads so it needs
    // no quest id, and a counter that skips the quests a player happened to satisfy early is a
    // counter that makes such an achievement quietly unreachable. The *ceremony* is what §A4 forbids,
    // and that lives in `onQuestCompleted` — which a retirement does not call.
    this.options.flags.bump(QUEST_FLAGS.completed)
    if (!silent) this.options.onQuestCompleted?.(quest)
    return true
  }

  // -- offering -------------------------------------------------------------

  /**
   * Offer everything whose conditions now hold, to a fixpoint.
   *
   * The loop is not defensive padding. Offering a quest can *finish* it — that is what a silent
   * retirement is — and a finished quest can satisfy the next one's `offer.after`, so a chain of
   * quests the player has already outrun must retire in one pass rather than one per act. Bounded by
   * the catalogue length because every pass that continues has offered at least one quest, and a
   * quest is offered at most once.
   */
  private refreshOffers(): void {
    if (this.isOff()) return
    for (let pass = 0; pass <= this.options.catalogue.length; pass++) {
      let offeredAny = false
      for (const quest of this.options.catalogue) {
        if (this.statusOf(quest.id) !== undefined) continue
        if (quest.offer.after?.some((id) => this.statusOf(id) !== 'done')) continue
        if (quest.offer.when && !evaluateSignal(quest.offer.when, this.context()).done) continue
        this.offer(quest)
        offeredAny = true
      }
      if (!offeredAny) return
    }
  }

  /**
   * Offer a quest, after replaying the journal into it.
   *
   * The replay writes step flags with no callbacks — a step the player finished before they were
   * asked is honest progress, not an event. If that finishes the whole quest it is retired: done,
   * never shown, no toast. See §A4 for why that rule is the one that keeps this system from being
   * annoying.
   */
  private offer(quest: Quest): void {
    this.setStatus(quest.id, 'offered')
    this.lastProgressTurn.set(quest.id, this.options.world.turn())
    // To a fixpoint, for the same reason `refreshOffers` is: completing one step can unblock another
    // through `after`, and a single pass in declaration order only resolves that when every `after`
    // happens to point backwards. `content/catalogue.test.ts` does require exactly that of the arc —
    // but it is a content test, it does not run over `reference.ts` or over a catalogue a later build
    // adds, and nothing in `types.ts` promises it. One pass got the outcome §A4 exists to prevent:
    // the quest was offered and then congratulated for work the player did before it existed.
    // Bounded by the step count, because every pass that continues completed at least one step.
    for (let pass = 0; pass < quest.steps.length; pass++) {
      let completedAny = false
      for (const step of quest.steps) {
        if (this.isStepDone(quest.id, step.id)) continue
        if (this.isBlocked(quest, step)) continue
        if (!evaluateSignal(step.when, this.context()).done) continue
        this.completeStep(quest, step, true)
        completedAny = true
      }
      if (!completedAny) break
    }
    if (this.checkQuestDone(quest, true)) {
      this.options.flags.set(questRetiredFlag(quest.id), true)
      return
    }
    this.options.onOffered?.(quest)
  }

  // -- player controls ------------------------------------------------------

  /** Clicking the strip. Purely cosmetic — an offered quest is already recording. */
  activate(id: QuestId): void {
    if (this.statusOf(id) === 'offered') this.setStatus(id, 'active')
  }

  /**
   * Dismiss one quest. Leaves the strip, stays in the list with a restore control, never re-offered
   * on its own, and **keeps completing steps in the background**.
   */
  dismiss(id: QuestId): void {
    const status = this.statusOf(id)
    if (status === undefined || status === 'done' || status === 'dismissed') return
    this.setStatus(id, 'dismissed')
    this.options.flags.bump(QUEST_FLAGS.dismissed)
  }

  restore(id: QuestId): void {
    if (this.statusOf(id) !== 'dismissed') return
    this.setStatus(id, 'active')
    this.noteProgress(id)
    this.refresh()
  }

  /**
   * Turn the whole system off, or back on.
   *
   * The journal keeps recording either way, which is why turning it back on later replays into real
   * progress rather than a blank slate. Two clicks to make it vanish is the difference between a
   * tutorial and a nag, and it costs nothing to support.
   */
  setEnabled(on: boolean): void {
    this.options.flags.set(QUEST_FLAGS.off, !on)
    if (on) this.refresh()
  }

  isOff(): boolean {
    return this.options.flags.get(QUEST_FLAGS.off) === true
  }

  // -- reading --------------------------------------------------------------

  statusOf(id: QuestId): QuestStatus | undefined {
    const value = this.options.flags.get(questStatusFlag(id))
    return typeof value === 'string' ? (value as QuestStatus) : undefined
  }

  isStepDone(questId: QuestId, stepId: StepId): boolean {
    return this.options.flags.get(questStepFlag(questId, stepId)) === true
  }

  /** Every quest the player could be looking at, in arc order. */
  list(): readonly QuestView[] {
    const ctx = this.context()
    return [...this.options.catalogue]
      .filter((quest) => this.statusOf(quest.id) !== undefined)
      .sort((a, b) => a.offer.order - b.offer.order)
      .map((quest) => this.viewOf(quest, ctx))
  }

  view(id: QuestId): QuestView | undefined {
    const quest = this.options.catalogue.find((candidate) => candidate.id === id)
    return quest ? this.viewOf(quest, this.context()) : undefined
  }

  private viewOf(quest: Quest, ctx: EvalContext): QuestView {
    const stale = this.turnsWithoutProgress(quest.id)
    const steps = quest.steps.map((step): StepView => {
      const done = this.isStepDone(quest.id, step.id)
      return {
        id: step.id,
        text: step.text,
        done,
        blocked: !done && this.isBlocked(quest, step),
        hint: step.hint,
        showHint: !done && step.hint !== undefined && stale >= LIMITS.hintAfterTurns,
        progress: done
          ? { done: true, satisfied: 1, total: 1, parts: [] }
          : evaluateSignal(step.when, ctx),
        gatesUnderstanding: step.gates === 'understanding',
      }
    })
    return {
      id: quest.id,
      chapter: quest.chapter,
      title: quest.title,
      intent: quest.intent,
      status: this.statusOf(quest.id) ?? 'offered',
      steps,
      completed: steps.filter((step) => step.done).length,
      total: steps.length,
      retiredSilently: this.options.flags.get(questRetiredFlag(quest.id)) === true,
    }
  }

  /**
   * The header line, or `null` when there is nothing to say.
   *
   * One quest, one step: the lowest-order active or offered quest, and its first step that is
   * neither done nor blocked.
   */
  strip(): StripView | null {
    if (this.isOff()) return null
    const ctx = this.context()
    const candidates = [...this.options.catalogue]
      .filter((quest) => {
        const status = this.statusOf(quest.id)
        return status === 'offered' || status === 'active'
      })
      .sort((a, b) => a.offer.order - b.offer.order)
    for (const quest of candidates) {
      const view = this.viewOf(quest, ctx)
      const step = view.steps.find((candidate) => !candidate.done && !candidate.blocked)
      if (!step) continue
      return {
        questId: quest.id,
        title: quest.title,
        stepId: step.id,
        stepText: step.text,
        hint: step.showHint ? step.hint : undefined,
        satisfied: step.progress.satisfied,
        total: step.progress.total,
      }
    }
    return null
  }

  /** For tests and for the debug panel. The journal is otherwise nobody's business. */
  observations(): readonly Observation[] {
    return this.journal.all()
  }

  toSave(): QuestSave {
    return this.journal.toSave()
  }

  // -- internals ------------------------------------------------------------

  private isBlocked(quest: Quest, step: QuestStep): boolean {
    return step.after?.some((id) => !this.isStepDone(quest.id, id)) === true
  }

  private setStatus(id: QuestId, status: QuestStatus): void {
    this.options.flags.set(questStatusFlag(id), status)
  }

  private noteProgress(id: QuestId): void {
    this.lastProgressTurn.set(id, this.options.world.turn())
  }

  private turnsWithoutProgress(id: QuestId): number {
    const last = this.lastProgressTurn.get(id)
    if (last === undefined) return 0
    return Math.max(0, this.options.world.turn() - last)
  }
}

/** Every flag the runtime writes, for `notAGate.test.ts` and for a debug panel. */
export function questFlagsOf(catalogue: readonly Quest[]): readonly FlagId[] {
  const out: FlagId[] = [QUEST_FLAGS.completed, QUEST_FLAGS.dismissed, QUEST_FLAGS.off]
  for (const quest of catalogue) {
    out.push(questStatusFlag(quest.id), questCompletedTurnFlag(quest.id), questRetiredFlag(quest.id))
    for (const step of quest.steps) out.push(questStepFlag(quest.id, step.id))
  }
  return out
}
