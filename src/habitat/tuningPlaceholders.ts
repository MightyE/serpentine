/**
 * ============================================================================
 * PLACEHOLDER NUMBERS — FOR INTEGRATION TO MERGE INTO `src/game/tuning.ts`
 * ============================================================================
 *
 * **This file is a staging area, not a home, and it is deliberately tiny.**
 *
 * The repo rule is that every number shaping difficulty lives in exactly one file so the whole
 * game's difficulty can be read top to bottom in a few minutes. The habitat system was built to
 * respect that rule *structurally*, not just to promise it: no biome file and no feature file
 * contains a balance number. They declare ordinal bands — a water dish supplies **moderate**
 * humidity, a display biome unlocks in the **mid** band — and this file is the only place those
 * bands become numbers.
 *
 * That is why the list below is nine values and not forty. Adding the twentieth feature adds
 * nothing here.
 *
 * **Integration should move every export below into `tuning.ts` under a `HABITAT` section, delete
 * this file, and repoint the four importers** (`provisions.ts`, `biomes/*`, `features/*`,
 * `lab/fixtures.ts`). Nothing else reads it.
 *
 * The channel *caps* — how much a perfect enclosure is actually worth — are NOT here. They were
 * set by the economy design and already exist as `HUSBANDRY_RECEPTIVITY_SHARE`,
 * `HUSBANDRY_SUPPORT_BONUS_MAX` and `EXTRA_CARE_MITIGATION_MAX`. This file only decides how close
 * to those caps a given arrangement gets. Inventing a second set of caps here would have been the
 * mistake; `provisions.ts` imports the real ones.
 */

import { SLOT_PURCHASE_COST, SLOT_UPKEEP_PER_WEEK } from '../game/tuning'
import type { SupplyLevel, UnlockBand } from './contract'

/**
 * What each supply band is worth on an axis, 0..1.
 *
 * `PROVISION_BASELINE` is 0.5 and baseline is fully adequate, so these are read against it: a
 * single `moderate` provision on an axis lands you just above baseline, and getting an axis near
 * 1 takes two or three provisions that agree. That shape is the whole husbandry decision — the
 * enclosure has finite feature slots, so you are choosing which axes to be excellent at.
 *
 * PROPOSED. The strategy model has not been run against these.
 */
export const SUPPLY_LEVEL_VALUE: Readonly<Record<SupplyLevel, number>> = {
  none: 0,
  slight: 0.15,
  moderate: 0.35,
  strong: 0.6,
}

/**
 * Reputation needed before each unlock band appears in the shop.
 *
 * Deliberately shaped like `REPUTATION_FOR_STOCK_TIER` and for the same reason: the gate on
 * everything purchasable in this game is what you have produced, proven and placed — never money
 * and never elapsed time. A player cannot buy their way to a nicer enclosure any more than to
 * better stock.
 *
 * PROPOSED.
 */
export const UNLOCK_BAND_REPUTATION: Readonly<Record<UnlockBand, number>> = {
  starting: 0,
  early: 10,
  mid: 45,
  late: 140,
}

/**
 * Provision prices, as multiples of `SLOT_PURCHASE_COST` and `SLOT_UPKEEP_PER_WEEK`.
 *
 * Written as multipliers rather than absolute prices so that retuning the cost of space moves the
 * cost of decorating it too — those two should never drift apart, and they will if they are typed
 * out separately.
 *
 * A biome is a one-off setup cost with no upkeep of its own. A feature costs a fraction of an
 * enclosure and adds a little to the weekly bill; the weekly term matters more than it looks,
 * because it is what keeps a maximally-provisioned display habitat a real decision against a rack
 * rather than a free upgrade.
 *
 * PROPOSED.
 */
export const PROVISION_PRICING = {
  /** A biome setup, times `SLOT_PURCHASE_COST`. */
  biomeCost: 0.8,
  /** A single feature, times `SLOT_PURCHASE_COST`. */
  featureCost: 0.25,
  /** A single feature's weekly upkeep, times `SLOT_UPKEEP_PER_WEEK`. */
  featureUpkeep: 0.15,
} as const

/** Convenience: a biome's cost in money. */
export const BIOME_COST = Math.round(SLOT_PURCHASE_COST * PROVISION_PRICING.biomeCost)

/** Convenience: a feature's cost and weekly upkeep. */
export const FEATURE_COST = Math.round(SLOT_PURCHASE_COST * PROVISION_PRICING.featureCost)
export const FEATURE_UPKEEP = SLOT_UPKEEP_PER_WEEK * PROVISION_PRICING.featureUpkeep

/**
 * A species' requirement profile over the six axes.
 *
 * **These belong in `src/species/`, not here.** A ball python's humidity requirement is a fact
 * about ball pythons, and `src/species/ballPython/` is where facts about ball pythons live —
 * alongside its loci and its sex system, which is the file you already open to learn what the
 * animal is. They are here only because `src/species/` was owned by another agent this cycle.
 *
 * Every value is at or below `PROVISION_BASELINE` for at least the axes a plain tub covers,
 * because baseline is fully adequate: a bare tub with a hide and correct temperatures houses any
 * of these animals correctly. What is above baseline is what an enclosure can be *good* at.
 *
 * PROPOSED, and the herpetology should be checked by someone who keeps these animals before it
 * ships — the shape is right, the numbers are a first draft.
 */
export const SPECIES_REQUIREMENT_PLACEHOLDER = {
  ballPython: {
    humidity: 0.6,
    thermalGradient: 0.65,
    cover: 0.75,
    climbing: 0.2,
    substrateDepth: 0.4,
    enrichment: 0.4,
  },
  cornSnake: {
    humidity: 0.4,
    thermalGradient: 0.55,
    cover: 0.6,
    climbing: 0.5,
    substrateDepth: 0.5,
    enrichment: 0.5,
  },
  hognose: {
    humidity: 0.3,
    thermalGradient: 0.6,
    cover: 0.5,
    climbing: 0.1,
    substrateDepth: 0.75,
    enrichment: 0.4,
  },
} as const
