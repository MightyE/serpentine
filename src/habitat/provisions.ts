/**
 * The provision arithmetic: what an enclosure supplies, how well it matches an animal, and what
 * that is worth.
 *
 * ## The one thing to understand
 *
 * Everything here is arithmetic you could reproduce on paper from numbers the game showed you.
 * That is charter principle 6, and it is why {@link resolveBenefits} returns an itemised ledger
 * rather than a number: the player sees the total *and* every provision that contributed to it.
 *
 * ## Husbandry is a bonus system, never a penalty system
 *
 * Baseline is fully adequate. A plain tub with a hide and correct temperatures meets every
 * requirement of every animal in this game, and an enclosure that would somehow fall below
 * baseline is **refused**, not accepted-and-penalised. Nothing in this repo models an animal
 * suffering, and husbandry is exactly where that rule would be easiest to break by accident: the
 * shape "requirement met = fine, requirement missed = harm" is so standard that it writes itself
 * if you are not watching.
 *
 * *The game never lets you house an animal badly. It lets you house it plainly.*
 *
 * @see ../../docs/economy-design.md
 */

import {
  EXTRA_CARE_MITIGATION_MAX,
  HUSBANDRY_RECEPTIVITY_SHARE,
  HUSBANDRY_SUPPORT_BONUS_MAX,
  PROVISION_AXES,
  PROVISION_BASELINE,
  type EnclosureType,
  type ProvisionAxis,
} from '../game/progression/tuningProposals'
import { clamp01 } from '../render/colour'
import type {
  AnyProvision,
  BenefitChannel,
  BenefitContribution,
  BenefitLedger,
  MatchReport,
} from './contract'
import { SUPPLY_LEVEL_VALUE, UNLOCK_BAND_REPUTATION } from './tuningPlaceholders'

/** What an animal needs, over the same six axes a provision supplies. */
export type RequirementProfile = Readonly<Record<ProvisionAxis, number>>

type AxisTotals = Record<ProvisionAxis, number>

function zeroAxes(): AxisTotals {
  const out = {} as AxisTotals
  for (const axis of PROVISION_AXES) out[axis] = 0
  return out
}

/**
 * Add up what a set of provisions supplies, on top of the enclosure's own baseline.
 *
 * The enclosure itself grants {@link PROVISION_BASELINE} on every axis — that *is* what "a plain
 * tub is fully adequate" means, stated as code rather than as a comment. Provisions add on top,
 * clamped at 1, so stacking four humid hides does not run away.
 */
export function suppliedProfile(
  provisions: readonly AnyProvision[],
  baseline = PROVISION_BASELINE,
): AxisTotals {
  const out = zeroAxes()
  for (const axis of PROVISION_AXES) out[axis] = baseline
  for (const provision of provisions) {
    for (const axis of PROVISION_AXES) {
      const level = provision.supplies[axis]
      if (level === undefined) continue
      out[axis] = Math.min(1, out[axis] + SUPPLY_LEVEL_VALUE[level])
    }
  }
  return out
}

/**
 * How well an enclosure matches one animal.
 *
 * Per axis: baseline already meets the requirement, so what is being scored is the *headroom* —
 * how far above baseline the animal could still appreciate, and how much of that you supplied.
 * An axis the animal is satisfied with at baseline (`required <= baseline`) contributes nothing,
 * because there is nothing there to earn. Axes are weighted by their headroom, so being excellent
 * at humidity counts for more on a ball python than on a hognose. That is the husbandry decision:
 * feature slots are finite, so you are choosing which axes to be good at, for *this* animal.
 */
export function matchQuality(
  provisions: readonly AnyProvision[],
  required: RequirementProfile,
  baseline = PROVISION_BASELINE,
): MatchReport {
  const supplied = suppliedProfile(provisions, baseline)
  const shortfalls: ProvisionAxis[] = []

  let weighted = 0
  let weight = 0
  for (const axis of PROVISION_AXES) {
    if (supplied[axis] < PROVISION_BASELINE) shortfalls.push(axis)
    const headroom = Math.max(0, required[axis] - PROVISION_BASELINE)
    if (headroom <= 0) continue
    weighted += headroom * clamp01((supplied[axis] - PROVISION_BASELINE) / headroom)
    weight += headroom
  }

  return {
    supplied,
    required,
    shortfalls,
    quality: weight === 0 ? 0 : weighted / weight,
  }
}

const CHANNELS: readonly BenefitChannel[] = [
  'receptivityWindow',
  'residentSupport',
  'extraCareOffset',
]

/**
 * How a benefit reaches a snake — the whole seam, in one function.
 *
 * The game hands over the provisions installed in an enclosure and the requirement profile of
 * the animal in it, and gets back a ledger: a share of each channel's published cap, plus the
 * itemised list of which provision earned what. Multiply cap by share and you have the number;
 * {@link applyBenefits} does exactly that so nobody has to remember which cap goes with which
 * channel.
 *
 * Nothing downstream of this function needs to know what a biome is, which is the payoff of
 * biomes and features being one type: this reads one list.
 *
 * Attribution is proportional to what each provision contributed to the axes the animal actually
 * cares about — so a readout can say *"the humid hide is doing most of this"* and be right.
 */
export function resolveBenefits(
  provisions: readonly AnyProvision[],
  required: RequirementProfile,
  baseline = PROVISION_BASELINE,
): BenefitLedger {
  const match = matchQuality(provisions, required, baseline)

  // Each provision's share of the earned quality, by how much it supplied on axes with headroom.
  const raw = provisions.map((provision) => {
    let score = 0
    for (const axis of PROVISION_AXES) {
      const level = provision.supplies[axis]
      if (level === undefined) continue
      const headroom = Math.max(0, required[axis] - PROVISION_BASELINE)
      if (headroom <= 0) continue
      score += Math.min(SUPPLY_LEVEL_VALUE[level], headroom)
    }
    return { provision, score }
  })

  const totalScore = raw.reduce((sum, entry) => sum + entry.score, 0)
  const contributions: BenefitContribution[] = []
  for (const channel of CHANNELS) {
    for (const { provision, score } of raw) {
      if (score <= 0) continue
      contributions.push({
        channel,
        source: provision.id,
        sourceLabel: provision.label,
        share: (score / totalScore) * match.quality,
      })
    }
  }

  const totals = {} as Record<BenefitChannel, number>
  for (const channel of CHANNELS) totals[channel] = match.quality

  return {
    match,
    contributions,
    totals,
    placementAllowed: match.shortfalls.length === 0,
  }
}

/** The three published caps, resolved into game numbers. Everything a caller needs. */
export interface AppliedBenefits {
  /** Fraction to shorten the receptivity window by, within its published range. */
  readonly receptivityShortening: number
  /** Fraction to raise resident support by. Capped so a resident stays net-negative. */
  readonly supportBonus: number
  /** Fraction of the extra-care multiplier this enclosure offsets. */
  readonly extraCareOffset: number
}

/**
 * Turn a ledger into the numbers the game applies.
 *
 * The caps come from the economy design's own constants — this function does not invent any. If a
 * cap needs to move, it moves in `tuning.ts` and every enclosure in the game moves with it.
 */
export function applyBenefits(ledger: BenefitLedger): AppliedBenefits {
  return {
    receptivityShortening: ledger.totals.receptivityWindow * HUSBANDRY_RECEPTIVITY_SHARE,
    supportBonus: ledger.totals.residentSupport * HUSBANDRY_SUPPORT_BONUS_MAX,
    extraCareOffset: ledger.totals.extraCareOffset * EXTRA_CARE_MITIGATION_MAX,
  }
}

/** Why a placement was refused. Never a penalty — a refusal, with a reason you can act on. */
export type PlacementRefusal =
  | { readonly kind: 'lifeStage'; readonly stage: string; readonly enclosure: string }
  | { readonly kind: 'capacity'; readonly capacity: number }
  | { readonly kind: 'featureSlots'; readonly used: number; readonly available: number }
  | { readonly kind: 'belowBaseline'; readonly axes: readonly ProvisionAxis[] }

/**
 * Can this animal go in this enclosure?
 *
 * Refusals, not penalties — the whole point. A hatchling in a display habitat is a welfare
 * problem rather than a treat, so the game declines and says why.
 *
 * The `belowBaseline` branch cannot fire against any provision shipped today, because no
 * provision supplies a negative amount. It is here anyway, because the day someone adds a
 * provision with a downside is the day this needs to already exist rather than be remembered.
 */
export function canHouse(
  enclosure: EnclosureType,
  animalStage: 'hatchling' | 'juvenile' | 'adult',
  installed: readonly AnyProvision[],
  occupants: number,
  ledger?: BenefitLedger,
): PlacementRefusal | null {
  if (!enclosure.stages.includes(animalStage)) {
    return { kind: 'lifeStage', stage: animalStage, enclosure: enclosure.label }
  }
  if (occupants >= enclosure.capacity) {
    return { kind: 'capacity', capacity: enclosure.capacity }
  }
  const used = installed.reduce((sum, p) => sum + p.featureSlotCost, 0)
  if (used > enclosure.featureSlots) {
    return { kind: 'featureSlots', used, available: enclosure.featureSlots }
  }
  if (ledger && !ledger.placementAllowed) {
    return { kind: 'belowBaseline', axes: ledger.match.shortfalls }
  }
  return null
}

/** Is this provision buyable yet? The gate is reputation — never money, never elapsed time. */
export function isUnlocked(provision: AnyProvision, reputation: number): boolean {
  return reputation >= UNLOCK_BAND_REPUTATION[provision.unlock]
}

/** Total weekly upkeep added by a set of provisions. */
export function upkeepOf(provisions: readonly AnyProvision[]): number {
  return provisions.reduce((sum, p) => sum + p.upkeepPerWeek, 0)
}
