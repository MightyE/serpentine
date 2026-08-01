/**
 * Serpentine — which tuning values a talent may move, and how far.
 *
 * ## Why this file has to exist
 *
 * `tuning.ts` is the file where the difficulty of the game is written down, and `tuning.test.ts`
 * asserts *derived properties* of those numbers — how many clutches to a rare morph, whether the
 * economy has a ceiling. A talent tree that could move any constant by any amount would be a
 * hole straight through that whole arrangement: the invariants would still pass (they test the
 * constants as authored) while the game a player is actually playing had drifted somewhere else
 * entirely. Silent, and very hard to notice.
 *
 * So a talent may only move a value that appears below, and only inside the band declared here.
 * `talentTree.test.ts` checks the band against the *whole tree at maximum investment*, not
 * against any particular node — which means the guard keeps working as nodes get added, which is
 * the entire point of having it.
 *
 * ## What belongs here — and what emphatically does not
 *
 * Balance charter principle 3 forbids a genetic upgrade that is strictly good, and explicitly
 * permits convenience that is. That line is the filter:
 *
 * - **Yes**: scheduling, upkeep, comfort, variance in something you are planning around.
 * - **No**: hatch rate, clutch size, mutation rate, rarity-tier probabilities, inbreeding load.
 *   Every one of those is load-bearing for a teaching claim — a talent that raises hatch rate
 *   makes inbreeding depression invisible, and a talent that raises mutation rate turns "find
 *   something new" into a farm. If a node wants one of those, the answer is no, and the reason
 *   is that the genetics is the game rather than a difficulty setting on it.
 *
 * The union in `types.ts` is the enforcement; this file is the reasoning.
 */
import {
  INCUBATION_WEEKS,
  PAIRING_RECEPTIVITY_WEEKS,
  RESIDENT_CARE_PER_WEEK,
  RESIDENT_SUPPORT_PER_WEEK,
  SLOT_UPKEEP_PER_WEEK,
} from '../tuning'
import type { TunableKey } from './types'

/**
 * The margin `tuning.ts` deliberately leaves between what a rehab resident brings in and what it
 * costs. Today: care 3 + slot upkeep 2 = 5, against support 4, so a resident is 1/week
 * net-negative — which is exactly the property the comment on `RESIDENT_SUPPORT_PER_WEEK` says
 * is load-bearing (a resident must cost you a slot, never earn you money).
 *
 * Two of the tunables below eat into this margin from opposite ends, and the whole talent budget
 * for both of them is carved out of it. Computed rather than written down so that if anyone
 * retunes the underlying constants, the bands move with them instead of silently going wrong.
 */
const RESIDENT_MARGIN = Math.max(
  0,
  RESIDENT_CARE_PER_WEEK + SLOT_UPKEEP_PER_WEEK - RESIDENT_SUPPORT_PER_WEEK,
)

/**
 * How much of that margin each side may consume. At 0.4 each, the worst reachable corner still
 * leaves 20% of the margin intact.
 *
 * This number was not chosen freely: the first draft of this file allowed the upkeep floor and
 * the support ceiling to be set independently, each looking safe on its own, and together they
 * made a resident *profitable* — turning the rehab into an income source, which is the exact
 * failure charter principles 5 and 7 both forbid. The cross-corner test in `talentTree.test.ts`
 * caught it. Keep that test.
 */
export const TALENT_RESIDENT_MARGIN_SHARE = 0.4

export interface Tunable {
  readonly key: TunableKey
  /** Player-facing, for a UI that wants to say what a node changed. */
  readonly label: string
  /** The value with no talents taken. Read from `tuning.ts` so the two cannot disagree. */
  readonly base: number
  /**
   * `[min, max]` the value may ever reach, however many nodes are taken. Clamped at read time
   * *and* asserted against the tree's reachable range, so a tree that could exceed it fails a
   * test rather than quietly saturating at the clamp.
   */
  readonly bounds: readonly [number, number]
  /** Why the band is where it is. Read this before widening one. */
  readonly rationale: string
}

export const TUNABLES: Readonly<Record<TunableKey, Tunable>> = {
  pairingReceptivityMaxWeeks: {
    key: 'pairingReceptivityMaxWeeks',
    label: 'Longest wait for a receptive pairing',
    base: PAIRING_RECEPTIVITY_WEEKS[1],
    bounds: [PAIRING_RECEPTIVITY_WEEKS[0] + 1, PAIRING_RECEPTIVITY_WEEKS[1]],
    rationale:
      'Better conditioning genuinely shortens how long a pair takes to lock up, and shortening it ' +
      'is a scheduling benefit — it makes the breeding-season window easier to hit. The floor is ' +
      'the published minimum plus one: the range may narrow, it may never collapse to a point, ' +
      'because the moment it does the breeding season stops being something you plan around and ' +
      'the variance in `tuning.ts` becomes decoration (charter, Time gates).',
  },
  incubationVarianceWeeks: {
    key: 'incubationVarianceWeeks',
    label: 'Spread in incubation length',
    base: INCUBATION_WEEKS[1] - INCUBATION_WEEKS[0],
    bounds: [0, INCUBATION_WEEKS[1] - INCUBATION_WEEKS[0]],
    rationale:
      'A stable incubator narrows the spread. Note what this does NOT touch: the mean, and the ' +
      'hatch rate. A better incubator in reality gets you a more predictable hatch date, not more ' +
      'hatchlings — and modelling it that way keeps the hatch rate free to mean exactly one thing, ' +
      'which is genetic load. Reaching 0 is allowed and is a real, satisfying upgrade.',
  },
  slotUpkeepPerWeek: {
    key: 'slotUpkeepPerWeek',
    label: 'Weekly upkeep per enclosure',
    base: SLOT_UPKEEP_PER_WEEK,
    bounds: [SLOT_UPKEEP_PER_WEEK - RESIDENT_MARGIN * TALENT_RESIDENT_MARGIN_SHARE, SLOT_UPKEEP_PER_WEEK],
    rationale:
      'Efficiency: bulk feed, better thermostats, one bill instead of six. The floor is not a ' +
      'round number because it is not a free choice — marginal upkeep is what makes ' +
      'over-expansion punishable (principle 5), and it is simultaneously half of what keeps a ' +
      'rehab resident net-negative. Both jobs are done by the same number, so the floor is ' +
      'carved out of the resident margin rather than picked.',
  },
  residentSupportPerWeek: {
    key: 'residentSupportPerWeek',
    label: 'Weekly support per rehab resident',
    base: RESIDENT_SUPPORT_PER_WEEK,
    bounds: [
      RESIDENT_SUPPORT_PER_WEEK,
      RESIDENT_SUPPORT_PER_WEEK + RESIDENT_MARGIN * TALENT_RESIDENT_MARGIN_SHARE,
    ],
    rationale:
      'A visibly well-run rehab attracts more sponsorship, which is how real sanctuaries work. ' +
      'The ceiling shares the resident margin with `slotUpkeepPerWeek`: a resident must stay ' +
      'net-negative in money, or taking animals in becomes a way to farm income and the rehab ' +
      'turns into a money-printer instead of a mission (principles 5 and 7). The invariant in ' +
      '`residentNetPerWeek`, not this number, is the thing to preserve.',
  },
}

/**
 * The cross-key invariant a single band cannot express.
 *
 * `residentSupportPerWeek` has a ceiling *and* `slotUpkeepPerWeek` has a floor, and each looks
 * safe alone — but a tree that raises support to its ceiling and drops upkeep to its floor makes
 * a resident net-positive, which is exactly the failure both bands were drawn to prevent. This is
 * the kind of bug per-key bounds always miss, so the test evaluates it at the corners of the
 * reachable space rather than at the base values.
 */
export function residentNetPerWeek(support: number, slotUpkeep: number): number {
  return support - (RESIDENT_CARE_PER_WEEK + slotUpkeep)
}

/** Must hold at every reachable combination. Asserted in `talentTree.test.ts`. */
export const RESIDENT_NET_MUST_BE_NEGATIVE = true

export function tunable(key: TunableKey): Tunable {
  return TUNABLES[key]
}

export const TUNABLE_KEYS: readonly TunableKey[] = Object.keys(TUNABLES) as TunableKey[]
