/**
 * Serpentine — achievements: the authoring surface.
 *
 * ## Adding an achievement is adding one object to one array
 *
 * That is the entire design goal of this file, and it is a deliberate contrast with the talent
 * tree. A talent tree wants to be small and argued over; an achievement set wants to be large and
 * invented freely. So everything an achievement needs is **data** — no closures, no registration
 * call, no matching change anywhere else:
 *
 * ```ts
 * {
 *   id: 'traits.ball.first-piebald',
 *   category: 'traits',
 *   label: 'Patchwork',
 *   description: 'Hatch a piebald ball python.',
 *   requires: producedTrait('ball-python', 'piebald', 'piebald'),
 *   effort: [{ kind: 'breed', odds: 'recessiveFromCarrierXCarrier', note: 'two carriers' }],
 * }
 * ```
 *
 * Note what is *not* there: the reward. Rewards are computed from `effort` by `reward.ts`, so an
 * author decides how hard something is — a question with a real answer — instead of what it is
 * worth, a question with a hundred plausible answers and no way to check any of them.
 *
 * ## Why requirements are data rather than predicates
 *
 * `seams.ts` models a requirement as `UnlockCondition`, which is a closure. An achievement's
 * requirement is a small tree instead, and it **compiles down to** `UnlockCondition`s
 * (`compile.ts`) exactly the way a `TalentNode` compiles down to an `Unlock` — so the
 * `UnlockRegistry` remains the one thing in the game that decides whether something is met, and
 * there is no second answer to drift away from it. What the tree buys over a raw closure:
 *
 * - **The flags an achievement reads are derivable.** Walk the tree, collect the flag ids, and you
 *   have an index from flag to achievement. Evaluation then touches only the achievements a change
 *   could possibly have affected, instead of all of them. A closure cannot be asked what it reads.
 * - **`describe` writes itself.** `seams.ts` requires a legible reason for every locked thing;
 *   deriving it from the data means it can never fall out of step with the condition.
 * - **A requirement cannot accidentally read the roster.** The only thing the tree can express is a
 *   read of a counter, which is what keeps evaluation O(1) instead of O(collection).
 */
import type { FlagId } from '../seams'
import type { EffortStep } from './effort'
import type { Grant } from './reward'

export type AchievementId = string

/**
 * The category sets.
 *
 * These are **axes, not themes** — that is what makes the taxonomy able to absorb fifty more
 * achievements without them feeling random. Four questions, nine answers:
 *
 * - *What did you make?* — `traits`, `combinations`
 * - *How much of the space have you covered?* — `breadth`, `volume`
 * - *How well do you understand it?* — `mastery`, `lineage`, `curiosities`
 * - *Who are you in this game?* — `firsts`, `sanctuary`
 *
 * A new achievement that does not obviously belong to one of these is worth pausing over: either
 * the taxonomy is missing an axis, or the achievement is a duplicate of one that exists.
 */
export type CategoryId =
  | 'firsts'
  | 'traits'
  | 'combinations'
  | 'breadth'
  | 'volume'
  | 'mastery'
  | 'lineage'
  | 'sanctuary'
  | 'curiosities'

export interface Category {
  readonly id: CategoryId
  readonly label: string
  /** One sentence, shown at the head of the category's page. */
  readonly blurb: string
  /** Display order. Roughly the order a player meets them. */
  readonly order: number
}

export const CATEGORIES: readonly Category[] = [
  {
    id: 'firsts',
    label: 'First Light',
    blurb: 'The things that happen once. Ceremony belongs to novelty, never to repetition.',
    order: 1,
  },
  {
    id: 'traits',
    label: 'The Morph Book',
    blurb: 'One page per trait. Produce it yourself and the page fills in.',
    order: 2,
  },
  {
    id: 'combinations',
    label: 'Compound Interest',
    blurb: 'Two genes in one animal, then three. Where the arithmetic starts to bite.',
    order: 3,
  },
  {
    id: 'breadth',
    label: 'The Catalogue',
    blurb: 'How much of what exists have you actually seen? Measured in tenths.',
    order: 4,
  },
  {
    id: 'volume',
    label: 'A Working Collection',
    blurb: 'What a lab that has been running a while looks like. Counted, never farmed.',
    order: 5,
  },
  {
    id: 'mastery',
    label: 'Reading the Square',
    blurb: 'Predicting, proving, testing. The part of the game that is actually genetics.',
    order: 6,
  },
  {
    id: 'lineage',
    label: 'The Studbook',
    blurb: 'Depth, diversity, and knowing when to outcross.',
    order: 7,
  },
  {
    id: 'sanctuary',
    label: 'The Rehab',
    blurb: 'The mission. Capacity given to animals who needed it.',
    order: 8,
  },
  {
    id: 'curiosities',
    label: 'Odd Corners',
    blurb: 'The genetics that surprises people. Mostly it is the inheritance being honest.',
    order: 9,
  },
]

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------

/**
 * A named, **derived** set of flags — "every recessive allele on hognose", "every morph in the
 * game". Built from `src/species/` at startup rather than listed by hand, which is the single most
 * useful property in this file: add a trait and the 10/25/50/75/100% achievements that mention its
 * species widen to include it, with no edit here.
 *
 * See `coverage.ts` for how membership is decided, and for the two honest limitations (loci with a
 * custom expression rule, and sex-linked loci, are left out of the dominant/recessive splits).
 */
export type CoverageSetId = string

export type Requirement =
  /** A counter flag has reached a value. The workhorse. */
  | { readonly kind: 'atLeast'; readonly flag: FlagId; readonly value: number; readonly describe: string }
  /** A boolean flag is set. */
  | { readonly kind: 'isTrue'; readonly flag: FlagId; readonly describe: string }
  /**
   * A fraction of a coverage set has been reached. The quantile-progression primitive.
   *
   * Latching: once earned, an achievement is never taken away, so adding a trait to a species can
   * widen the set without un-earning the 100% badge somebody already has. That is a deliberate
   * choice — nothing she adds to the game should ever punish an existing save.
   */
  | { readonly kind: 'coverage'; readonly set: CoverageSetId; readonly fraction: number }
  | { readonly kind: 'all'; readonly of: readonly Requirement[] }
  | { readonly kind: 'any'; readonly of: readonly Requirement[]; readonly describe: string }

// ---------------------------------------------------------------------------
// The achievement
// ---------------------------------------------------------------------------

export interface Achievement {
  readonly id: AchievementId
  readonly category: CategoryId
  /** Player-facing name. Short. */
  readonly label: string
  /** Player-facing. What to do, in one sentence, in the imperative. */
  readonly description: string
  readonly requires: Requirement
  /**
   * The work, **marginal** — measured from `supersedes` if there is one, from nothing if not.
   * See `effort.ts`. This is the only thing that decides what the achievement pays.
   */
  readonly effort: readonly EffortStep[]
  /** The residual, in currencies money cannot buy. `reward.ts` checks that these cover it. */
  readonly grants?: readonly Grant[]
  /** A set-completion. Adds a premium paid entirely in non-money currency. */
  readonly capstone?: boolean
  /** The rung below, in a ladder. Also what makes `effort` legible as a marginal quantity. */
  readonly supersedes?: AchievementId
  /** Not shown until earned. For the ones whose fun is finding out they existed. */
  readonly hidden?: boolean
}

/** The flag that records an award. Namespaced so it cannot collide with a game flag. */
export function earnedFlagId(id: AchievementId): FlagId {
  return `ach.earned.${id}`
}

/** The `UnlockId` an achievement compiles to. Namespaced away from talents and hand-written unlocks. */
export function achievementUnlockId(id: AchievementId): string {
  return `achievement:${id}`
}
