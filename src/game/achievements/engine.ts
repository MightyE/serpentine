/**
 * Serpentine — the achievement engine: noticing, awarding once, and staying cheap.
 *
 * ## Three properties, and the mechanism that gives each one
 *
 * **Cheap.** A flag change re-checks only the achievements whose requirement tree mentions that
 * flag. The index comes free from the requirement being data (`compile.ts`'s `watchedFlags`), and
 * the tally (`tallies.ts`) guarantees a requirement can only ever read a counter — so the cost of
 * one hatched egg is a handful of counter bumps and a handful of integer comparisons, regardless
 * of how big the collection or the catalogue is. Nothing here iterates the roster, ever.
 *
 * **Retroactive-safe.** {@link AchievementEngine.sweep} checks every achievement against current
 * state, and is run on construction. So an achievement written next month, dropped into
 * `catalogue.ts`, and loaded against a save from today is earned immediately if the counters
 * already say so. The honest limit, worth repeating because it is the one thing this cannot do:
 * retroactivity only reaches facts some counter was already recording. `tallies.ts` deliberately
 * records more than the catalogue currently reads, to widen that window.
 *
 * **Deterministic and save-stable.** An award is a flag — `ach.earned.<id>` — and flags *are* the
 * save file. There is no separate achievement save shape, no serialiser, and no migration. Load
 * order does not matter: `sweep()` is a pure function of the flags, and awarding is idempotent
 * because the earned flag is checked first and written before anything is paid.
 *
 * ## What the engine does not do
 *
 * It does not pay anything. It computes the reward and hands it to `onAward`; the game layer moves
 * the money and the reputation. That is what keeps this file free of the economy, and what lets
 * `engine.test.ts` run the whole system against a fake flag set with no session and no snakes.
 */
import type { EventBus, FlagId, FlagSet, ProgressView, UnlockRegistry, Unsubscribe } from '../seams'
import {
  compileAchievement,
  describeRequirement,
  isRequirementMet,
  requirementProgress,
  watchedFlags,
} from './compile'
import type { RequirementProgress } from './compile'
import type { CoverageIndex } from './coverage'
import { clutchEquivalents, explainEffort, rungFor } from './effort'
import type { RewardBreakdown } from './reward'
import { rewardsFor } from './reward'
import type { Achievement, AchievementId } from './types'
import { earnedFlagId } from './types'

/** Prefix of the flags this module writes. Requirements never read them; the bus handler skips them. */
export const EARNED_FLAG_PREFIX = 'ach.earned.'

/**
 * What an achievement pays, derived entirely from its declared effort.
 *
 * Pure and total, which is the whole promise of the reward model: a screen can show a player
 * exactly what an unearned achievement will give them, because there is nothing to know that is
 * not already in the data. A reward you cannot see in advance is a variable-ratio reward, which
 * the balance charter forbids by name.
 */
export function achievementReward(achievement: Achievement): RewardBreakdown {
  const ce = clutchEquivalents(achievement.effort)
  return rewardsFor({
    clutchEquivalents: ce,
    rung: rungFor(ce),
    grants: achievement.grants,
    capstone: achievement.capstone,
  })
}

/** Everything a browsable list needs about one achievement. See `docs/achievements-design.md`. */
export interface AchievementView {
  readonly achievement: Achievement
  readonly earned: boolean
  /** Hidden and not yet earned: show a placeholder rather than the name. */
  readonly concealed: boolean
  readonly requirement: string
  readonly progress: readonly RequirementProgress[]
  /** `[0, 1]`, the mean over the requirement's leaves. What a bar draws. */
  readonly fraction: number
  /** Known before it is earned. A charter obligation, not a courtesy. */
  readonly reward: RewardBreakdown
  /** One line per effort step, saying where the reward value came from. */
  readonly effortExplanation: readonly string[]
}

export interface AchievementEngine {
  /**
   * Check everything against current state and award whatever is newly met.
   *
   * Run on construction, and safe to run at any other time — it is idempotent. This is both the
   * retroactivity mechanism and the save-load mechanism; there is no third path.
   */
  sweep(): readonly Achievement[]
  isEarned(id: AchievementId): boolean
  view(): readonly AchievementView[]
  viewOf(id: AchievementId): AchievementView | undefined
  /** For tests and a debug panel: which achievements a given flag can affect. */
  watchersOf(flag: FlagId): readonly AchievementId[]
  dispose(): void
}

export interface AchievementEngineOptions {
  readonly bus: EventBus
  readonly flags: FlagSet
  readonly view: ProgressView
  readonly coverage: CoverageIndex
  readonly catalogue: readonly Achievement[]
  /** Optional: the registry gets one `Unlock` per achievement, so it stays the one authority. */
  readonly registry?: UnlockRegistry
  /** Called once per achievement, the first time it is met. The game layer pays out here. */
  readonly onAward?: (achievement: Achievement, reward: RewardBreakdown) => void
}

export function createAchievementEngine(options: AchievementEngineOptions): AchievementEngine {
  const { bus, flags, view, coverage, catalogue, registry, onAward } = options

  const byId = new Map<AchievementId, Achievement>()
  // flag → the achievements that could possibly care. The reason evaluation is cheap.
  const watchers = new Map<FlagId, AchievementId[]>()

  for (const achievement of catalogue) {
    if (byId.has(achievement.id)) throw new Error(`achievements: duplicate id ${achievement.id}`)
    byId.set(achievement.id, achievement)
    registry?.register(compileAchievement(achievement, coverage))

    for (const flag of watchedFlags(achievement.requires, coverage)) {
      const list = watchers.get(flag)
      if (list) list.push(achievement.id)
      else watchers.set(flag, [achievement.id])
    }
  }

  const isEarned = (id: AchievementId): boolean => flags.get(earnedFlagId(id)) === true

  /**
   * Award queue and re-entrancy guard.
   *
   * `onAward` moves money, moving money sets a flag, and a flag change re-enters this module. So
   * awards are queued rather than paid inline and the queue is drained by whichever call is
   * outermost. Without this, a reward that happens to complete a second achievement would recurse
   * — and the recursion would be data-dependent, which is the worst kind to find later.
   */
  let draining = false
  const queue: Achievement[] = []

  function tryAward(achievement: Achievement): void {
    if (isEarned(achievement.id)) return
    if (!isRequirementMet(achievement.requires, view, coverage)) return
    // The earned flag goes in *before* anything is paid: it is what makes awarding idempotent, and
    // it has to already be true when a handler observes the payment and asks the question again.
    flags.set(earnedFlagId(achievement.id), true)
    queue.push(achievement)
  }

  function drain(): readonly Achievement[] {
    if (draining) return []
    draining = true
    const awarded: Achievement[] = []
    try {
      while (queue.length > 0) {
        const achievement = queue.shift()!
        awarded.push(achievement)
        onAward?.(achievement, achievementReward(achievement))
      }
    } finally {
      draining = false
    }
    return awarded
  }

  function sweep(): readonly Achievement[] {
    for (const achievement of catalogue) tryAward(achievement)
    return drain()
  }

  const subscriptions: Unsubscribe[] = [
    bus.on('flag.changed', ({ flag }) => {
      // Written by this module, read by no requirement. Skipping keeps an award from walking the
      // index for nothing.
      if (flag.startsWith(EARNED_FLAG_PREFIX)) return
      for (const id of watchers.get(flag) ?? []) {
        const achievement = byId.get(id)
        if (achievement) tryAward(achievement)
      }
      drain()
    }),
  ]

  function viewOf(achievement: Achievement): AchievementView {
    const earned = isEarned(achievement.id)
    const progress = requirementProgress(achievement.requires, view, coverage)
    const fraction =
      progress.length === 0
        ? 0
        : progress.reduce((total, leaf) => total + Math.min(1, leaf.fraction), 0) / progress.length
    return {
      achievement,
      earned,
      concealed: achievement.hidden === true && !earned,
      requirement: describeRequirement(achievement.requires, coverage),
      progress,
      fraction: earned ? 1 : fraction,
      reward: achievementReward(achievement),
      effortExplanation: explainEffort(achievement.effort),
    }
  }

  sweep()

  return {
    sweep,
    isEarned,
    view: () => catalogue.map(viewOf),
    viewOf: (id) => {
      const achievement = byId.get(id)
      return achievement ? viewOf(achievement) : undefined
    },
    watchersOf: (flag) => watchers.get(flag) ?? [],
    dispose: () => {
      for (const unsubscribe of subscriptions) unsubscribe()
      subscriptions.length = 0
    },
  }
}
