/**
 * Serpentine — what an achievement pays, and why that number.
 *
 * ## The requirement this file answers
 *
 * > *"All scaled to how much work it is to achieve them. Completing achievements can be a major
 * > source of early funding for your rehab. This is not meant to be a continuous stream — just as
 * > achievement frequency should go down over time, so do the aggregate rewards. However the
 * > achievements should continue to feel rewarding."*
 *
 * Those last two sentences are in tension and money cannot resolve it, because a fixed sum matters
 * less the richer you get: paying a late achievement *less* money makes it feel like nothing, and
 * paying it more makes the aggregate curve go the wrong way. So the resolution is not in the
 * amount. It is in the **type**.
 *
 * ## The curve
 *
 *     effortValue  = VALUE_PER_CLUTCH_EQUIVALENT × marginal clutch-equivalents
 *     money        = effortValue × MONEY_SHARE_BY_RUNG[rung]
 *     residual     = effortValue − money  (+ a capstone premium, if any)
 *
 * `MONEY_SHARE_BY_RUNG` falls from 1.0 to 0.04. **Effort is paid at a constant rate; only the
 * currency changes.** Early on, the whole of it arrives as cash, and it is meant to — a rehab that
 * cannot yet support itself is exactly what the money is for. Later the same work pays in the
 * things money is forbidden to buy: reputation (which `economy-design.md` already gates better
 * stock behind), a talent point, access to breeding stock, a title.
 *
 * ## What declines is the rate, not the sum — an earlier draft of this file claimed otherwise
 *
 * This comment used to end "the monetary curve declines exactly as asked". **That was false, and it
 * was false in a way the tests could not see.** Aggregate money is checked *by rung*, and a rung
 * measures the size of one achievement, not when it arrives. Ordering the catalogue by the effort it
 * takes to reach each entry — the honest proxy for "when" — money per quartile of the completion
 * order comes out 1930 / 3770 / 6020 / 8280. It **rises**, monotonically, 4.3x from the first
 * quarter of the game to the last. Aggregate money per rung falls only because the catalogue holds
 * dozens of tiny rung-1 entries against a handful of large ones; a player does not meet the
 * catalogue rung by rung.
 *
 * The invariant that actually holds, and the one worth defending:
 *
 * > **Money per unit of work declines monotonically — 150/CE at rung 1 down to 6/CE at rung 5 — so
 * > achievement money collapses as a *share of what the player is earning by then*, even as the
 * > absolute sum grows.** Early achievements are worth two-thirds of the opening balance; late ones
 * > are a rounding error against a running breeding programme. And no achievement is ever more than
 * > 25% of the money available for the work it names (`maxShareOfWorkMoney`), so none of them is
 * > ever a reason to do anything.
 *
 * That is the true form of "aggregate rewards go down while achievements still feel rewarding":
 * **declining relevance, not a declining sum.** A declining sum was never achievable anyway — a
 * fixed amount of money matters less the richer you get, so paying a late achievement fewer dollars
 * makes it feel like nothing, and the felt-reward requirement would break instead. The rate is what
 * the design controls; the sum is an outcome of how many achievements the catalogue happens to hold.
 *
 * ### The argument against this, which is real
 *
 * Non-monetary rewards are only worth something if the systems behind them are worth something. A
 * talent point is worth `VALUE_PER_TALENT_POINT` only if the tree has nodes she wants; reputation
 * is worth anything at all only because `REPUTATION_FOR_STOCK_TIER` gates stock behind it. If
 * either system stays thin, this design has quietly replaced real rewards with a scoreboard, and
 * the late game will feel like it stopped paying. The mitigation is that the exchange rates below
 * are all anchored to numbers those systems already publish, so if a system is thin the anchor is
 * wrong in a visible place rather than the reward being wrong in an invisible one.
 *
 * ## The budget is checked, not trusted
 *
 * {@link validateReward} refuses an achievement whose grants do not cover its residual. That
 * refusal is a design tool, not an inconvenience: an achievement too big to pay for is an
 * achievement that should have been a ladder, which is the same conclusion the quantile
 * progressions reach from the other direction.
 */
import {
  BASE_PRICE_BY_TIER,
  REPUTATION_AWARDS,
  REPUTATION_FOR_STOCK_TIER,
  STARTING_MONEY,
} from '../tuning'
import type { Rung } from './effort'

// ---------------------------------------------------------------------------
// Exchange rates — every one anchored to something the game already publishes
// ---------------------------------------------------------------------------

/**
 * Value of one clutch-equivalent of work, in money units.
 *
 * Two independent anchors, and the second one is what actually fixes the number:
 *
 * 1. **Against the market.** One entry-tier clutch sold whole grosses about 486. Achievement money
 *    is a bonus on breeding you were going to do anyway, never a reason to breed — so a
 *    clutch-equivalent of achievement work pays under a third of what breeding that clutch and
 *    selling it would. `catalogue.test.ts` asserts that inequality directly, because it is the
 *    structural reason no count achievement is worth farming (charter principle 8).
 * 2. **Against the opening balance.** `STARTING_MONEY` is 3000, and "a major source of early
 *    funding" means the cheap end of the catalogue should be worth appreciably more than the grant
 *    you began with, without making that grant irrelevant. `REWARD_INVARIANTS` pins the ratio.
 *
 * **This was 285 when the catalogue was a sketch, and the second anchor is what moved it.** With
 * the set actually authored, rung 1 came to 56 clutch-equivalents rather than the sixteen the
 * first draft assumed, which put the opening-balance ratio at 5.4× instead of inside its band. The
 * predecessor's comment said that anchor would fail first and fail loudly; it did, and this is the
 * re-derivation. If you add another thirty cheap achievements, expect to do it again.
 */
export const VALUE_PER_CLUTCH_EQUIVALENT = 150

/**
 * How much of the effort value arrives as money, by rung. Index is `rung − 1`.
 *
 * This array *is* the declining-rate answer, and it has to be steep enough to beat the **shape** of
 * the catalogue, not just its ordering. That is the non-obvious part: rung 2 holds more total work
 * than rung 1 — there are fewer mid-sized achievements but each is several times the size — so a
 * gentle taper leaves rung 2 paying out more in aggregate than rung 1. It did, at
 * `[1.0, 0.7, 0.45, 0.25, 0.1]`. Roughly halving at each step is what makes the by-rung aggregate
 * fall.
 *
 * `REWARD_INVARIANTS.aggregateMoneyMustDecline` is therefore a **joint** constraint on this array
 * and on the catalogue's composition, and that is deliberate: adding thirty rung-2 achievements
 * should break a test, because it would quietly re-inflate the middle of the curve.
 *
 * **Read that invariant for what it is, though.** It constrains money *by rung*, which is money by
 * achievement size. It is a useful check on this array's steepness against the catalogue's
 * composition, and it is **not** a check that money declines over time — see the header. Do not
 * cite it for that; two agents have now had to re-derive why.
 *
 * ## The step function is a lever, and it is bounded rather than fixed
 *
 * Because the share steps at rung boundaries rather than varying smoothly with effort, **how finely
 * a ladder is cut changes what it pays for identical work.** Five 5-CE rungs pay 1687; one 25-CE
 * step pays 375. Measured across the catalogue's supersedes chains the spread is 5.5x, from
 * `sanctuary.residents.40` at 28/CE to `curiosities.no-daughters` at 155/CE. That is a real defect —
 * it quietly rewards a catalogue author for splitting ladders — and the honest fix is to make the
 * share continuous in effort, which would move every reward in the game and belongs in its own
 * change. Until then `REWARD_INVARIANTS.ladderRateSpreadMax` pins the spread so it cannot widen
 * without a test saying so.
 */
export const MONEY_SHARE_BY_RUNG: readonly number[] = [1.0, 0.45, 0.22, 0.1, 0.04]

/**
 * Value of one reputation point.
 *
 * Anchored to `REPUTATION_AWARDS.novelPhenotypeProduced` — the game already pays 8 reputation for
 * producing a phenotype nobody has seen, which is a rung-1-to-2 piece of work worth roughly 400.
 */
export const VALUE_PER_REPUTATION = 50

/**
 * Most reputation one achievement may pay.
 *
 * `REPUTATION_AWARDS.alleleDiscovered` is 25 and is the largest single reputation event in the
 * game — finding a brand-new allele. Nothing an achievement can hand you should out-weigh that.
 */
export const MAX_REPUTATION_PER_ACHIEVEMENT = REPUTATION_AWARDS.alleleDiscovered

/**
 * Value of a talent point.
 *
 * A point should cost about what a rare (tier-3) project costs, since `starterTree.ts` awards them
 * for milestones of understanding rather than for repetition: nine clutch-equivalents at the rate
 * above.
 */
export const VALUE_PER_TALENT_POINT = 2500

/** Value of switching a capability or a piece of content on. Below a talent point on purpose. */
export const VALUE_PER_UNLOCK = 1500

/**
 * Value of a breeding-stock introduction.
 *
 * Literally the price of the tier-3 animal it puts in front of you. What the reward actually gives
 * is *access* — the animal still has to be paid for — which is why it can be handed out without
 * touching the money curve.
 */
export const VALUE_PER_STOCK_OFFER = BASE_PRICE_BY_TIER[2]!

/** Value of a title. Pure prestige, no mechanical effect — the small-change of the residual. */
export const VALUE_PER_TITLE = 400

/**
 * Premium for completing a set, paid on top of the marginal effort and **never in money**.
 *
 * A capstone is the answer to "the last rung of a ladder did almost no marginal work but should
 * feel like the biggest thing you have done". One talent point's worth, because that is what
 * finishing a species' entire morph list ought to be.
 */
export const CAPSTONE_VALUE = VALUE_PER_TALENT_POINT

/** Grants beyond this and the reward stops reading as a reward and starts reading as a list. */
export const MAX_GRANTS_PER_ACHIEVEMENT = 3

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

/**
 * One thing an achievement pays.
 *
 * `money` and `reputation` are **computed** from the effort model; the rest are **authored**,
 * because you cannot pay two-thirds of a talent point. The authored ones are what the residual is
 * spent on, and the validator checks the sum.
 */
export type Reward =
  | { readonly kind: 'money'; readonly amount: number }
  | { readonly kind: 'reputation'; readonly amount: number }
  | { readonly kind: 'talentPoint'; readonly points: number }
  | { readonly kind: 'unlock'; readonly content: string; readonly label: string }
  | { readonly kind: 'stockOffer'; readonly offerId: string; readonly label: string }
  | { readonly kind: 'title'; readonly titleId: string; readonly label: string }

/** The authored half — what the residual is paid in. Never money, never reputation. */
export type Grant = Extract<Reward, { kind: 'talentPoint' | 'unlock' | 'stockOffer' | 'title' }>

export function grantValue(grant: Grant): number {
  switch (grant.kind) {
    case 'talentPoint':
      return VALUE_PER_TALENT_POINT * grant.points
    case 'unlock':
      return VALUE_PER_UNLOCK
    case 'stockOffer':
      return VALUE_PER_STOCK_OFFER
    case 'title':
      return VALUE_PER_TITLE
  }
}

/**
 * Round money to something a person would read as a number rather than as an output.
 *
 * Deterministic and monotone, which matters: two achievements whose effort differs must never
 * round to a money value that puts them in the wrong order.
 */
export function roundMoney(amount: number): number {
  if (amount < 1000) return Math.round(amount / 10) * 10
  return Math.round(amount / 50) * 50
}

export interface RewardBreakdown {
  readonly clutchEquivalents: number
  readonly rung: Rung
  /** `VALUE_PER_CLUTCH_EQUIVALENT × clutchEquivalents`. What the work was worth. */
  readonly effortValue: number
  /** Added for a set-completion, paid entirely in non-money currency. */
  readonly capstoneValue: number
  readonly money: number
  readonly reputation: number
  /** Everything, in the order a UI should list it: money, reputation, then the authored grants. */
  readonly rewards: readonly Reward[]
  /** Non-money value still owed after grants and capped reputation. Zero when the budget balances. */
  readonly unpaid: number
}

/**
 * Turn effort into rewards.
 *
 * Pure, total, and deterministic — the same inputs always give the same rewards, which is what
 * lets the UI promise a player exactly what an achievement will pay *before* they earn it. That
 * promise is not a nicety; a reward you cannot see in advance is a variable-ratio reward, which
 * the charter forbids by name.
 */
export function rewardsFor(input: {
  clutchEquivalents: number
  rung: Rung
  grants?: readonly Grant[]
  capstone?: boolean
}): RewardBreakdown {
  const { clutchEquivalents, rung, grants = [], capstone = false } = input

  const effortValue = VALUE_PER_CLUTCH_EQUIVALENT * clutchEquivalents
  const capstoneValue = capstone ? CAPSTONE_VALUE : 0
  const money = roundMoney(effortValue * MONEY_SHARE_BY_RUNG[rung - 1]!)

  const residual = Math.max(0, effortValue - money) + capstoneValue
  const granted = grants.reduce((total, grant) => total + grantValue(grant), 0)
  const reputation = Math.min(
    MAX_REPUTATION_PER_ACHIEVEMENT,
    Math.max(0, Math.round((residual - granted) / VALUE_PER_REPUTATION)),
  )

  const rewards: Reward[] = []
  if (money > 0) rewards.push({ kind: 'money', amount: money })
  if (reputation > 0) rewards.push({ kind: 'reputation', amount: reputation })
  rewards.push(...grants)

  return {
    clutchEquivalents,
    rung,
    effortValue,
    capstoneValue,
    money,
    reputation,
    rewards,
    unpaid: Math.max(0, residual - granted - reputation * VALUE_PER_REPUTATION),
  }
}

/** A budget problem, phrased as the edit that fixes it. */
export interface RewardProblem {
  readonly severity: 'error' | 'warning'
  readonly message: string
}

/**
 * Check that an achievement's rewards actually pay for its effort.
 *
 * Under-payment is an error and the message says what to do about it, because the fix is a design
 * decision the author has to make: give it a grant, or split it into a ladder. Over-payment is an
 * error too — a reward worth more than the work is how a dominant strategy gets built by accident
 * (charter principle 4).
 */
export function validateReward(breakdown: RewardBreakdown, grants: readonly Grant[]): readonly RewardProblem[] {
  const problems: RewardProblem[] = []

  if (grants.length > MAX_GRANTS_PER_ACHIEVEMENT) {
    problems.push({
      severity: 'error',
      message:
        `${grants.length} grants, over the limit of ${MAX_GRANTS_PER_ACHIEVEMENT}. An achievement ` +
        `needing this many rewards is doing too much at once — split it into a progression.`,
    })
  }

  if (breakdown.unpaid > VALUE_PER_REPUTATION) {
    problems.push({
      severity: 'error',
      message:
        `${Math.round(breakdown.unpaid)} of value is unpaid — reputation is capped at ` +
        `${MAX_REPUTATION_PER_ACHIEVEMENT} and the grants cover the rest. Either add a grant ` +
        `(a talent point is worth ${VALUE_PER_TALENT_POINT}), or split this into a ladder so each ` +
        `rung's marginal effort is smaller.`,
    })
  }

  const granted = grants.reduce((total, grant) => total + grantValue(grant), 0)
  const residual = Math.max(0, breakdown.effortValue - breakdown.money) + breakdown.capstoneValue
  const overpay = granted - residual
  if (overpay > VALUE_PER_TITLE) {
    problems.push({
      severity: 'error',
      message:
        `the grants are worth ${Math.round(overpay)} more than the work. Drop one, or use a title ` +
        `(worth ${VALUE_PER_TITLE}) instead of a heavier grant.`,
    })
  }

  return problems
}

/**
 * Properties the whole set has to have, asserted in `catalogue.test.ts`.
 *
 * These are the design, written as checks. A number below is only ever a *band*, never a target —
 * the catalogue is allowed to land anywhere inside one, and a change that leaves the band is a
 * change to the design rather than to the content.
 */
export const REWARD_INVARIANTS = {
  /**
   * Rung-1 achievement money, as a multiple of `STARTING_MONEY`. "A major source of early funding"
   * means clearly more than the grant you started with; not so much more that the opening balance
   * stops mattering.
   */
  rung1MoneyOverStartingMoney: [1.0, 3.0] as const,
  /**
   * Aggregate money **per rung** must fall, monotonically, with no ties — a joint check on
   * `MONEY_SHARE_BY_RUNG`'s steepness and the catalogue's composition.
   *
   * Not a claim about time. Money over the completion order *rises*; see this file's header and
   * {@link maxShareOfWorkMoney}, which is the bound that actually does the design work.
   */
  aggregateMoneyMustDecline: true,
  /**
   * Most of the money available for a piece of work that the achievement for it may itself be —
   * valuing the work at the *bottom* market tier, which is the conservative direction.
   *
   * This is the real anti-grind guarantee (principle 8) and it is the one number that makes "no
   * achievement is ever a reason to breed" a checkable sentence rather than an intention. The
   * catalogue's maximum is 0.250, hit by the rung-1 ceremonies; everything larger is far below it.
   */
  maxShareOfWorkMoney: 0.3,
  /**
   * Widest allowed ratio between the best- and worst-paying ladder, measured as total money over
   * total clutch-equivalents along a supersedes chain.
   *
   * Bounds the granularity lever described above rather than removing it. Currently 5.5.
   */
  ladderRateSpreadMax: 6.0,
  /**
   * Floor on the `sanctuary` category's money-per-CE as a fraction of the catalogue's overall
   * money-per-CE.
   *
   * Principle 7 from the side the existing tests do not cover. They correctly bound the rehab from
   * *above* — a capacity achievement must never out-pay the pairing whose slot it took, or taking in
   * animals becomes an income strategy. Nothing bounded it from below, and the rehab is the one
   * activity with no market income of its own, so the money curve *is* its income curve. It sits at
   * 0.45 of the catalogue rate, deliberately: the rehab is paid in access (0.60 grants per
   * achievement, the joint highest of any category), which is what a rehab player is short of. This
   * floor exists so a later edit cannot quietly starve it to nothing.
   */
  sanctuaryRateFloorFraction: 0.35,
  /**
   * Reputation the whole catalogue can pay, as a fraction of the tier-4 stock gate. Achievements
   * are *a* route to the best stock, never the only one and never a shortcut past playing.
   */
  totalReputationOverTier4Gate: [0.5, 2.0] as const,
  /** For reference in the assertions. */
  startingMoney: STARTING_MONEY,
  tier4ReputationGate: REPUTATION_FOR_STOCK_TIER[3]!,
} as const
