/**
 * Serpentine — the effort model.
 *
 * ## The unit
 *
 * One **clutch-equivalent** (CE) is one pairing carried through to a hatch: the female you
 * committed, the season she was committed for, and the eggs you got. It is the right unit
 * because it is the charter's own unit — principle 1 says what a breeding costs you is the
 * breeding you did not do, so the honest denominator for "how much work was that" is *pairings
 * foregone*, never minutes and never clicks.
 *
 * Everything else in the game converts into it:
 *
 * | Step | Converts by |
 * |---|---|
 * | breeding for a target | `expectedClutchesToCopies` — negative-binomial mean over the odds |
 * | proving or clearing a het | consecutive-hatchling confidence, solved for clutches |
 * | buying stock | the animal's price over one entry-tier clutch's gross sale value |
 * | a rehab resident | the slot it holds for a season — one pairing you could not make |
 * | pedigree depth | one generation is at least one pairing |
 * | a deliberate act on one animal | one animal's share of a clutch — `1 / EXPECTED_HATCHLINGS_PER_CLUTCH` |
 *
 * Not one of those conversions is a free parameter. Every constant they use already exists in
 * `tuning.ts` and is already defended by `tuning.test.ts`, which is deliberate: the effort model
 * has no numbers of its own to drift.
 *
 * ## Effort is marginal, never cumulative
 *
 * A quantile ladder (10/25/50/75/100% of a species' recessives) declares, at each rung, the work
 * *from the rung below* — not from zero. Two reasons, and the second is the load-bearing one:
 * double-counting would pay for the same clutch five times, and cumulative effort makes the last
 * rung of a long ladder so large that no reward can honestly cover it. Bounded marginal steps are
 * what make a ladder payable at all. See `reward.ts`'s validator, which will refuse an
 * achievement whose declared effort is bigger than the rewards the game has to give.
 */
import {
  BASE_PRICE_BY_TIER,
  EXPECTED_HATCHLINGS_PER_CLUTCH,
  RARITY_TIERS,
  expectedClutchesToCopies,
} from '../tuning'
import { CANONICAL_ODDS, type OddsKey } from './canonicalOdds'

/**
 * One piece of work. Every kind carries a `note` because the design doc, the planning UI and the
 * next person to argue with a reward value all read the same sentence.
 */
export type EffortStep =
  /**
   * Breed for a target. `odds` is a key into {@link CANONICAL_ODDS} rather than a number, so a
   * probability that no `punnett()` test has verified cannot be written down here at all.
   */
  | { readonly kind: 'breed'; readonly odds: OddsKey; readonly copies?: number; readonly note: string }
  /**
   * Establish a genetic fact by test breeding. `confidence` is what the player would accept as
   * settled — 0.95 to prove, a little higher to clear, since "no affected offspring" is never
   * proof, only evidence.
   */
  | { readonly kind: 'evidence'; readonly odds: OddsKey; readonly confidence: number; readonly note: string }
  /** Buy or otherwise obtain stock at a rarity tier. */
  | { readonly kind: 'stock'; readonly tier: 1 | 2 | 3 | 4; readonly count: number; readonly note: string }
  /** Hold a rehab slot. One season is one pairing you did not make — capacity, never conscience. */
  | { readonly kind: 'capacity'; readonly slotSeasons: number; readonly note: string }
  /** Depth in a pedigree. Each generation is at least one pairing, and they cannot be parallel. */
  | { readonly kind: 'generations'; readonly generations: number; readonly note: string }
  /**
   * Deliberate acts on single animals — sell one, place one, record a prediction, read a
   * viability explanation.
   *
   * The conversion is `1 / EXPECTED_HATCHLINGS_PER_CLUTCH`, and it is derived rather than picked:
   * one act on one animal is worth one animal's share of the pairing that produced it. That keeps
   * the small ceremonial achievements — which must be cheap, or every "first time you did X" pays
   * like a breeding project — anchored to the same unit as everything else, with no new constant.
   */
  | { readonly kind: 'action'; readonly actions: number; readonly note: string }

/**
 * Gross sale value of one clutch of entry-tier animals, unsaturated.
 *
 * The exchange rate between money and pairings, and it is derived rather than chosen: it is what
 * a pairing is actually worth if you sell everything it produced at the bottom of the market.
 */
export const ENTRY_CLUTCH_GROSS = EXPECTED_HATCHLINGS_PER_CLUTCH * BASE_PRICE_BY_TIER[0]!

/**
 * Clutches of test breeding to reach `confidence` that a target with per-hatchling probability
 * `p` either has appeared or is not going to.
 *
 * `1 − (1 − p)^n ≥ confidence`, solved for `n` hatchlings and divided by clutch size. This is the
 * arithmetic behind the hobby's "clear at five clean offspring": at `p = 1/2` it takes five
 * hatchlings to be 97% sure, which is a little under one clutch. Note it can never reach 1 —
 * absence of evidence is asymptotic, which is exactly why the game sells a gene test.
 */
export function clutchesForConfidence(
  probabilityPerHatchling: number,
  confidence: number,
  hatchlingsPerClutch: number = EXPECTED_HATCHLINGS_PER_CLUTCH,
): number {
  if (probabilityPerHatchling <= 0 || probabilityPerHatchling >= 1) {
    throw new Error(`clutchesForConfidence: probability must be strictly between 0 and 1, got ${probabilityPerHatchling}`)
  }
  if (confidence <= 0 || confidence >= 1) {
    throw new Error(`clutchesForConfidence: confidence must be strictly between 0 and 1, got ${confidence}`)
  }
  const hatchlings = Math.log(1 - confidence) / Math.log(1 - probabilityPerHatchling)
  return hatchlings / hatchlingsPerClutch
}

/** One step, in clutch-equivalents. */
export function stepClutchEquivalents(step: EffortStep): number {
  switch (step.kind) {
    case 'breed':
      return expectedClutchesToCopies(CANONICAL_ODDS[step.odds].probabilityPerHatchling, step.copies ?? 1)
    case 'evidence':
      return clutchesForConfidence(CANONICAL_ODDS[step.odds].probabilityPerHatchling, step.confidence)
    case 'stock':
      return (BASE_PRICE_BY_TIER[step.tier - 1]! * step.count) / ENTRY_CLUTCH_GROSS
    case 'capacity':
      return step.slotSeasons
    case 'generations':
      return step.generations
    case 'action':
      return step.actions / EXPECTED_HATCHLINGS_PER_CLUTCH
  }
}

/** The marginal work an achievement asks for, in clutch-equivalents. */
export function clutchEquivalents(steps: readonly EffortStep[]): number {
  return steps.reduce((total, step) => total + stepClutchEquivalents(step), 0)
}

/**
 * Which band of the game an amount of work belongs to.
 *
 * **Every threshold is a number `RARITY_TIERS` already publishes**, so the rungs cannot drift
 * away from what the game calls common, uncommon, rare and exceptional. A single-locus dominant
 * project lands in rung 1, a simple recessive in rung 2, a double recessive in rung 3, a triple
 * in rung 4 — because those are literally the tiers' own expected-clutch bands.
 */
export const RUNG_THRESHOLDS: readonly number[] = [
  RARITY_TIERS[1]!.expectedClutchesBand[0], // 2  — a recessive project starts here
  RARITY_TIERS[2]!.expectedClutchesBand[0], // 6  — a double recessive starts here
  RARITY_TIERS[3]!.expectedClutchesBand[0], // 25 — a triple recessive starts here
  RARITY_TIERS[3]!.expectedClutchesBand[1], // 60 — past the top of the published bands
]

export type Rung = 1 | 2 | 3 | 4 | 5

export function rungFor(clutchEquivalentTotal: number): Rung {
  let rung = 1
  for (const threshold of RUNG_THRESHOLDS) {
    if (clutchEquivalentTotal >= threshold) rung += 1
  }
  return rung as Rung
}

/** Player-facing summary of where a number came from. The planning UI shows this verbatim. */
export function explainEffort(steps: readonly EffortStep[]): readonly string[] {
  return steps.map((step) => {
    const ce = stepClutchEquivalents(step)
    return `${step.note} — about ${ce.toFixed(1)} clutch${ce >= 1.95 ? 'es' : ''} of work`
  })
}
