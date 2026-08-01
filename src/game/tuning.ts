/**
 * Serpentine — every number that shapes difficulty, in one file.
 *
 * ## Why one file
 *
 * Balance numbers scattered across twenty modules can't be reasoned about, and can't be
 * defended. Here, you can read the whole difficulty of the game top to bottom in a few
 * minutes, and `tuning.test.ts` can check that the *consequences* of these numbers still land
 * where they were designed to land.
 *
 * ## How to change something
 *
 * Change it. A test will probably fail, and it will tell you which design principle moved and
 * what that principle was protecting — not `expected 0.001, got 0.1`. If you still want the
 * change after reading that, change the invariant band too and add a line to the decision log
 * in `docs/balance-charter.md`. Two sentences is plenty.
 *
 * That deliberate second step is the entire mechanism. Nobody is checking. It's there so that
 * changing the shape of the game is something you *decide* rather than something that
 * gradually happens.
 *
 * ## The rule for tests
 *
 * `tuning.test.ts` never asserts a constant. A test that says `MUTATION_RATE === 0.00002` is
 * worthless — change the constant and you change the test, so it protects nothing. The tests
 * assert *derived properties*: how many clutches to a rare morph, whether the economy has a
 * ceiling, whether any one strategy is always best. Those are the things that are actually
 * designed. The constants are just how they're expressed.
 *
 * @see ../../docs/balance-charter.md — the eight principles these serve
 */

// ===========================================================================
// TIME — principle 1 (decisions are the scarce resource, never your time)
// ===========================================================================
//
// Every duration here is measured in **turns**, and one turn is one in-game week. Time never
// advances because real time passed. There is no clock running while the tab is closed, and
// there never will be — see principle 1.
//
// The other half of principle 1 is that turns must be cheap to spend. Long gates are fine;
// long gates you have to click through one week at a time are not. The UI owes you one
// control that advances to the next thing needing a decision. `MAX_DECISIONS_PER_GENERATION`
// below is what that promise looks like as a number.

/** One in-game year. Turns are weeks; a year is a real year so the biology reads honestly. */
export const WEEKS_PER_YEAR = 52

/**
 * The breeding season, as week-of-year. Outside it, animals aren't receptive.
 *
 * Principle 1: this window is what makes a season's pairing *irreversible* — pair this female
 * with this male now, and the alternative pairing is gone until next year. That opportunity
 * cost is the real price of a breeding decision. Without a window, incubation variance is
 * decoration (see the Time gates section of the charter).
 *
 * Real ball pythons breed on a seasonal cycle triggered by a cooling period; ~20 weeks is a
 * fair compression of it.
 */
export const BREEDING_SEASON_FIRST_WEEK = 1
export const BREEDING_SEASON_LAST_WEEK = 20

/**
 * Weeks from introducing a pair to a successful copulation. `[min, max]`, uniform inside.
 *
 * Principle 6: the range is *shown to the player before they commit*. Bounded visible variance
 * is a scheduling decision ("if this runs long I lose the season"); unbounded hidden variance
 * is a slot machine on wait time.
 */
export const PAIRING_RECEPTIVITY_WEEKS: readonly [number, number] = [1, 6]

/**
 * Weeks from laying to hatching. `[min, max]`.
 *
 * Real ball python incubation is about 55–60 days at 88–90°F, so 8–9 weeks is close to honest
 * rather than a game invention. Principle 6: shown, always.
 */
export const INCUBATION_WEEKS: readonly [number, number] = [8, 9]

/**
 * Weeks from hatching to breeding age, per sex. `[min, max]`.
 *
 * Real and asymmetric: female ball pythons are usually bred at 2–3 years and at weight, males
 * often under 18 months. That asymmetry is a genuine planning constraint — your females are
 * the bottleneck on every project, which is exactly why a pairing slot is worth something.
 *
 * Variance here is the weakest case in the game (nothing schedules against a two-year wait).
 * Kept for texture; not load-bearing. Simplify it away without guilt if it annoys you.
 */
export const WEEKS_TO_MATURITY_FEMALE: readonly [number, number] = [104, 156]
export const WEEKS_TO_MATURITY_MALE: readonly [number, number] = [34, 78]

/**
 * How many times the player is asked to *do* something between choosing a pairing and holding
 * the hatchlings: choose the pairing, introduce the pair, respond to the clutch being laid,
 * respond to the hatch. Four.
 *
 * Principle 1, the wrist half. The fiction's clock between those two moments is fifteen weeks;
 * the player's cost is four decisions, because one control skips to whichever week the next
 * decision lives in. If this number ever creeps up, the game has started charging you in
 * clicks — which is the same slow feedback loop as a real-time timer, just paid differently.
 */
export const DECISIONS_PER_GENERATION = 4

/** Budget. Above this, a generation stops fitting in one sitting. Principle 1. */
export const MAX_DECISIONS_PER_GENERATION = 8

/**
 * Minimum ratio of in-fiction turns to player decisions across one generation.
 *
 * Principle 1: this is what "time is scarce in the fiction and cheap in the wrist" means as a
 * checkable number. Below about 3, skipping isn't doing enough work and you're back to
 * pressing End Turn.
 */
export const MIN_TURNS_PER_DECISION = 3

// ===========================================================================
// CLUTCHES — principle 8 (repetition may be a ritual, never an improvement)
// ===========================================================================

/**
 * Eggs per clutch. Real ball python clutches run about 4–8, occasionally up to 11.
 *
 * This is one of the two constants that most directly moves how rare "rare" is — raise it and
 * every rarity tier gets easier at once, which is why the tier invariants are computed from it
 * rather than stated independently.
 */
export const CLUTCH_SIZE_MIN = 4
export const CLUTCH_SIZE_TYPICAL = 6
export const CLUTCH_SIZE_MAX = 11

/**
 * Baseline probability an egg hatches, before genetic load. The other big rarity lever.
 *
 * Not 1.0, because a clutch where every egg hatches makes the load mechanic invisible — you
 * can only notice inbreeding costing you hatchlings if hatchlings were something you could
 * lose. Kept high, because losing eggs isn't the fun part.
 */
export const BASE_HATCH_RATE = 0.9

/** Expected living hatchlings per clutch, before load. Used by every rarity calculation. */
export const EXPECTED_HATCHLINGS_PER_CLUTCH = CLUTCH_SIZE_TYPICAL * BASE_HATCH_RATE

// ===========================================================================
// RARITY TIERS — principles 2, 4 (information is the reward; nothing always wins)
// ===========================================================================
//
// A tier is not a difficulty label pasted onto a trait. It's a *pairing you would actually
// make* and the probability that pairing gives you the animal you want. The probabilities
// below are Mendelian arithmetic, not knobs — which is the point, and why raising a tier's
// difficulty means moving a trait to a different tier rather than editing a number.

/**
 * How many copies of a target morph count as "obtained".
 *
 * Three, not one — because one animal isn't a project. You need a small group to breed on,
 * and a lone rare male you can't pair is a trophy, not progress. This is also what separates
 * the tiers usefully: at a clutch of six, a 1-in-2 trait and a 1-in-4 trait both show up in
 * nearly every clutch, so counting first-appearance can't tell them apart. Counting to three
 * can.
 */
export const TIER_TARGET_COPIES = 3

/** A rarity tier: the pairing that gets you there, and the odds it gives per hatchling. */
export interface RarityTier {
  readonly tier: 1 | 2 | 3 | 4
  readonly label: string
  /** The pairing a player would realistically make to chase this. Plain English. */
  readonly canonicalPath: string
  /** Probability one hatchling from that pairing is the target. Mendel, not a knob. */
  readonly probabilityPerHatchling: number
  /**
   * Designed band for expected clutches to {@link TIER_TARGET_COPIES} copies. `[min, max]`.
   *
   * This is the number the invariant actually checks, and it's the honest expression of "how
   * rare is rare" because it folds in clutch size and hatch rate as well as the genetics.
   */
  readonly expectedClutchesBand: readonly [number, number]
}

/**
 * The four tiers.
 *
 * Bands are ordered and non-overlapping on purpose: `tuning.test.ts` checks the ordering as
 * well as the membership, so a tier can't be rescued by quietly widening its band into the
 * next tier's territory. If you want tier 3 easier, that's a real decision and it should show
 * up as a gap that fails.
 */
export const RARITY_TIERS: readonly RarityTier[] = [
  {
    tier: 1,
    label: 'common',
    canonicalPath: 'heterozygote × wild-type, for a dominant or incomplete-dominant trait',
    probabilityPerHatchling: 1 / 2,
    expectedClutchesBand: [1.0, 2.0],
  },
  {
    tier: 2,
    label: 'uncommon',
    canonicalPath: 'carrier × carrier, for a simple recessive',
    probabilityPerHatchling: 1 / 4,
    expectedClutchesBand: [2.0, 4.0],
  },
  {
    tier: 3,
    label: 'rare',
    canonicalPath: 'double carrier × double carrier, for two independent recessives',
    probabilityPerHatchling: 1 / 16,
    expectedClutchesBand: [6.0, 13.0],
  },
  {
    tier: 4,
    label: 'exceptional',
    canonicalPath: 'triple carrier × triple carrier, for three independent recessives',
    probabilityPerHatchling: 1 / 64,
    expectedClutchesBand: [25.0, 60.0],
  },
]

// ===========================================================================
// MUTATION — principles 2, 8 (information is the reward; no slot machines)
// ===========================================================================

/**
 * Probability a given allele copy mutates when a gamete is made.
 *
 * Real mutation rates are around 1e-8 per base per generation, which at game scale means never.
 * This is a game number — say so in the docs, don't pretend otherwise.
 *
 * The design job this constant does: a mutation should be a *once in a long playthrough*
 * event, so that finding one is a story rather than a farming strategy. Raise it much and
 * "hatch eggs until something new appears" becomes a better plan than breeding deliberately,
 * which would replace the entire genetics layer with a slot machine (principle 8).
 */
export const MUTATION_RATE_PER_ALLELE = 2e-5

/** Roughly how many loci in a shipped species can mutate. Used only by the design model. */
export const MUTABLE_LOCI_COUNT = 10

/**
 * Expected eggs before *any* mutation appears must land in this band.
 *
 * Designed as "about once per long playthrough". A committed player hatches on the order of a
 * thousand eggs over many in-game years, so a few thousand eggs per mutation makes it a rare
 * gift rather than a mechanic. Below the floor it's a farm; above the ceiling it may as well
 * not exist and the novel-allele machinery is dead code.
 */
export const EGGS_PER_MUTATION_BAND: readonly [number, number] = [800, 6000]

/**
 * How much harder chasing a *specific* new mutation must be than the hardest breeding path.
 *
 * Principle 2: the reward is knowing what your animals carry, and the route to a target morph
 * is deliberate breeding. If waiting for a mutation ever competes with breeding for it, the
 * deliberate route stops being the point of the game.
 */
export const MUTATION_ADVANTAGE_FLOOR = 50

// ===========================================================================
// GENETIC LOAD AND INBREEDING — principle 3 (progress pushes against something)
// ===========================================================================
//
// This is the archetype the whole of principle 3 is built on, and the best decision in the
// game: line-breeding fixes a trait and quietly raises the inbreeding coefficient; outcrossing
// restores vigor and gives back some of the fixation. *When do you outcross?*
//
// The model here is a first-order approximation used only for the design bands. The engine
// does the real thing — hidden deleterious recessives at ordinary loci, expressed when an
// animal inherits two copies. See `docs/genetics-primer.md`.

/** How many loci in a species carry a possible deleterious recessive. */
export const LOAD_LOCI_COUNT = 14

/** Frequency of the deleterious allele at each of those loci in the founder pool. */
export const LOAD_ALLELE_FREQUENCY = 0.08

/**
 * Of the outcomes where an animal is homozygous for a load allele, the fraction that become a
 * hatchling needing extra care rather than an egg that doesn't hatch.
 *
 * Half. This is a tone decision as much as a balance one: an animal that needs extra care is a
 * resident, and residents are what the rehab is *for* (principle 7). It also means the cost of
 * inbreeding arrives partly as capacity pressure rather than entirely as loss, which is both
 * warmer and more interesting.
 *
 * There is no death here and there is no culling. That is not a balance parameter.
 */
export const LOAD_EXTRA_CARE_FRACTION = 0.5

/**
 * Hatch rate at F = 0.25 (a full-sib or parent-offspring pairing), as a fraction of the
 * outbred rate. `[min, max]`.
 *
 * Both ends are load-bearing. Below the floor, inbreeding is punishing and the game stops
 * being warm. Above the ceiling, it's invisible and principle 3 has no teeth — the fixation
 * decision collapses into "always line-breed."
 */
export const INBREEDING_HATCH_RATIO_BAND: readonly [number, number] = [0.80, 0.95]

/**
 * How much more often load expresses at F = 0.25 than at F = 0. `[min, max]`.
 *
 * This is the one that makes outcrossing *visibly* work within a single generation, which is
 * the moment the mechanic teaches something. If a heavily line-bred female paired to an
 * unrelated male doesn't produce a noticeably better clutch, the lesson never lands.
 */
export const INBREEDING_LOAD_SIGNAL_BAND: readonly [number, number] = [2.0, 6.0]

// ===========================================================================
// ECONOMY — principles 5, 7 (compounding bounded by the market, not by the rehab)
// ===========================================================================
//
// The runaway loop is money → better animals → more money. The thing that stops it here is
// **market saturation**: a morph's price falls as it becomes common. That's the honest sink —
// it's what actually happened to ball python morph prices — and it bounds the loop without
// making the rehab the tax, which is what principle 7 forbids.

export const STARTING_MONEY = 3000

/** Fixed weekly cost of having a facility at all, regardless of size. */
export const FACILITY_UPKEEP_PER_WEEK = 8

/** One enclosure slot. Slots are how you scale, and how scaling costs you. */
export const SLOT_PURCHASE_COST = 350

/**
 * Weekly cost of one slot, forever. Principle 5: this is what makes over-expansion punishable
 * — marginal upkeep is constant while marginal income decays with saturation, so there's a
 * size beyond which growing makes you poorer.
 *
 * Roughly 100 a year per animal, against a few hundred a year of income from an average
 * breeding female. That ratio is deliberately tight, and it's close to the real thing: keeping
 * snakes is cheap, breeding ordinary ones barely pays, and the money is all in producing
 * something the market hasn't seen. That's why the economy points at the genetics.
 */
export const SLOT_UPKEEP_PER_WEEK = 2

/**
 * Weekly care cost per rehab resident.
 *
 * Deliberately modest, and *deliberately not the mechanism that bounds the economy*.
 * Principle 7: a resident should cost you a slot and your attention, not make compassion the
 * losing play. If you ever find yourself raising this to control runaway money, raise
 * `SLOT_UPKEEP_PER_WEEK` or shorten `SATURATION_HALFLIFE_SALES` instead — those tax scale.
 * This one taxes the mission.
 */
export const RESIDENT_CARE_PER_WEEK = 3

/** Multiplier on care for a resident needing extra care. Real cost, still not a punishment. */
export const EXTRA_CARE_MULTIPLIER = 2.5

/**
 * Weekly support — donations, sponsorships, placement fees — per rehab resident.
 *
 * Real sanctuaries run on this, so it isn't a game invention, and it's what makes principle 7
 * come out exactly as written: support very nearly covers care, so **what a resident actually
 * costs you is the slot** — the enclosure, and the breeding female you didn't put in it.
 * Capacity, not conscience.
 *
 * Note it is deliberately *below* `RESIDENT_CARE_PER_WEEK + SLOT_UPKEEP_PER_WEEK`. A resident
 * is always slightly net-negative in money, so taking animals in can never become a way to farm
 * income — which would be a runaway loop (principle 5) and, worse, would make the rehab a
 * money-printer rather than a mission.
 */
export const RESIDENT_SUPPORT_PER_WEEK = 4

/**
 * Undiscounted price of a healthy, unsaturated animal at each rarity tier, index = tier − 1.
 *
 * The gaps between tiers are wider than the gaps in how hard the tiers are to produce, on
 * purpose — that's what makes chasing something rarer worth the years it costs. But not *much*
 * wider, or the lower tiers become jokes and principle 4's dominance margin starts failing.
 * The rarity-band test is the honest measure of how much harder each tier really is; if you
 * move a price, compare it against that.
 */
export const BASE_PRICE_BY_TIER: readonly number[] = [90, 320, 1600, 7000]

/**
 * How many of one phenotype must reach the market before its price halves.
 *
 * Principle 5, and the load-bearing constant of the whole economy. It's why the answer to "how
 * do I earn more" is "find something new" rather than "do more of what worked" — which points
 * the money loop straight back at the genetics instead of away from it.
 */
export const SATURATION_HALFLIFE_SALES = 120

/**
 * Fraction of a morph's accumulated market saturation that fades each year.
 *
 * Markets recover: animals get sold on, keepers leave the hobby, new ones arrive. Without this
 * every morph would decay permanently to the floor and the only viable play would be an endless
 * treadmill of new morphs, which is a grind wearing a genetics costume (principle 8).
 *
 * With it, each morph settles at an equilibrium price where your sales rate matches the market's
 * recovery rate — which is the actual bound on compounding. Flood the market and the price you
 * get falls until it isn't worth flooding.
 */
export const SATURATION_RECOVERY_PER_YEAR = 0.4

/**
 * Price floor as a fraction of base, however saturated a morph gets.
 *
 * Low enough that a saturated morph can't sustain expansion (that's the ceiling doing its
 * job), high enough that common animals still have a use and the market never reads as broken.
 */
export const MARKET_PRICE_FLOOR_FRACTION = 0.1

/**
 * Price multiplier from vigor, at the worst and best ends. Principles 3 and 5 together.
 *
 * This is what gives fixation-versus-vigor an economic edge instead of leaving it as flavour:
 * a rare animal out of a narrow line is genuinely worth less than the same morph out of a
 * diverse one, because a buyer of breeding stock cares. It's also true, which is the better
 * reason.
 */
export const VIGOR_PRICE_MULTIPLIER_MIN = 0.55
export const VIGOR_PRICE_MULTIPLIER_MAX = 1.25

/**
 * Hard ceiling the modelled economy must never cross, over `ECONOMY_SIM_WEEKS`.
 *
 * Not a wall in the game — nothing clamps your money. It's the assertion that no strategy the
 * model knows about compounds through it. If a real strategy does, the model has a gap and the
 * gap is the bug (see principle 4's standing obligation).
 */
export const ECONOMY_CEILING = 120_000

/** How long the economy model runs. Twenty in-game years — long enough for a morph to saturate,
 * for a line-bred lineage's vigor to erode, and for any compounding to become obvious. */
export const ECONOMY_SIM_WEEKS = 1040

/**
 * How much faster money may accumulate in the last five years than in the five before them.
 *
 * This is the real test of principle 5, and it's about the *shape* of the curve rather than its
 * height. Steady linear income is fine — it's bounded by how many animals you can house. What
 * isn't fine is each period earning more than the last, forever, because that's the runaway
 * loop: money buys animals, animals make money, and nothing pushes back.
 *
 * At 1.0 the curve is a straight line. Much above it and it's bending upward at the point where
 * it was designed to have flattened.
 */
export const ECONOMY_LATE_ACCELERATION_MAX = 1.35

/**
 * The most any strategy may beat the runner-up by, at any measured horizon.
 *
 * Principle 4. A strategy is allowed to be the right call for a while — that's a game having
 * phases. It isn't allowed to make the others jokes.
 */
export const DOMINANCE_MARGIN = 2.5

/**
 * Horizons, in weeks, at which strategies are compared: one year, five years, twenty.
 *
 * Spaced this widely because the interesting differences take generations to appear — a
 * line-breeder's vigor doesn't erode in a season, and a morph doesn't saturate in a year.
 */
export const STRATEGY_HORIZONS_WEEKS: readonly number[] = [52, 260, 1040]

// ===========================================================================
// Derived model — the arithmetic the invariants are written against
// ===========================================================================
//
// These are pure functions of the constants above. They live here rather than in the test file
// so that the game's UI and the invariants agree by construction: if the "about 9 clutches"
// shown on a planning screen ever disagrees with what the tests protect, one of them is lying.

/**
 * Expected clutches to obtain `copies` of an outcome with probability `p` per hatchling.
 *
 * Negative binomial mean over hatchlings (`copies / p`), converted to clutches. Uses expected
 * hatchlings per clutch, so raising clutch size or hatch rate makes every tier easier — which
 * is exactly the coupling the tier invariants exist to catch.
 */
export function expectedClutchesToCopies(
  probabilityPerHatchling: number,
  copies: number = TIER_TARGET_COPIES,
  hatchlingsPerClutch: number = EXPECTED_HATCHLINGS_PER_CLUTCH,
): number {
  if (probabilityPerHatchling <= 0) return Number.POSITIVE_INFINITY
  return copies / probabilityPerHatchling / hatchlingsPerClutch
}

/** Probability a specific allele copy at a specific locus mutates into something new, per egg. */
export function mutationProbabilityPerEgg(locusCount: number = 1): number {
  // Two gametes per egg, one allele copy each at a given locus.
  return 2 * MUTATION_RATE_PER_ALLELE * locusCount
}

/**
 * Probability an animal at inbreeding coefficient `f` expresses at least one load allele.
 *
 * First-order approximation, used only to set design bands: at each load locus, the animal is
 * homozygous by descent with probability `f` (and then affected with probability `q`), or not
 * identical by descent with probability `1 − f` (and then affected with probability `q²`).
 * The engine models the real thing; this is the arithmetic the bands are drawn against.
 */
export function loadExpressionProbability(f: number): number {
  const q = LOAD_ALLELE_FREQUENCY
  const perLocus = f * q + (1 - f) * q * q
  return 1 - Math.pow(1 - perLocus, LOAD_LOCI_COUNT)
}

/** Effective hatch rate at inbreeding coefficient `f`, after load and the extra-care split. */
export function hatchRateAtF(f: number): number {
  const failed = loadExpressionProbability(f) * (1 - LOAD_EXTRA_CARE_FRACTION)
  return BASE_HATCH_RATE * (1 - failed)
}

/**
 * Sale price of one animal: base tier price, decayed by how many of that phenotype the market
 * has already absorbed, scaled by vigor, floored.
 *
 * The saturation term is the shape of principle 5 — exponential decay in units sold, with a
 * floor so the market never reads as broken.
 */
export function salePrice(tier: number, unitsAlreadySold: number, vigor: number): number {
  const base = BASE_PRICE_BY_TIER[tier - 1] ?? 0
  const decay = Math.pow(0.5, unitsAlreadySold / SATURATION_HALFLIFE_SALES)
  const saturated = Math.max(decay, MARKET_PRICE_FLOOR_FRACTION)
  const clampedVigor = Math.min(1, Math.max(0, vigor))
  const vigorMultiplier =
    VIGOR_PRICE_MULTIPLIER_MIN +
    (VIGOR_PRICE_MULTIPLIER_MAX - VIGOR_PRICE_MULTIPLIER_MIN) * clampedVigor
  return base * saturated * vigorMultiplier
}

// ===========================================================================
// CHEATS — bookkeeping, not restriction
// ===========================================================================

/**
 * Cheat mode acts on your live save, on purpose: a sandbox that can't touch the real game
 * can't be used to test the real game. The save records that cheats were used and how often,
 * so a clean run stays distinguishable from a developed one. Nothing is blocked, and nothing
 * about balance depends on this — the invariants over the constants above are what hold the
 * line.
 *
 * The number of distinct cheat *uses* worth recording separately before it's just "a lot".
 * Purely cosmetic; the flag is what matters.
 */
export const CHEAT_USE_DISPLAY_CAP = 99

// ===========================================================================
// FACILITY, HUSBANDRY, INFORMATION, REPUTATION
// ===========================================================================
//
// Merged in from `progression/tuningProposals.ts`, which was a staging area created only because
// three agents were editing this file at once. The rule it was staging against is the reason it
// could not stay: every number that shapes difficulty lives in exactly one file, or the
// invariants in `tuning.test.ts` are protecting half a design.
//
// The design reasoning behind this section is in `docs/economy-design.md` and
// `docs/progression-design.md`. Read those before changing anything here; the numbers are the
// cheap part.

// ===========================================================================
// FACILITY — principle 7 (the rehab competes for capacity, never conscience)
// ===========================================================================
//
// A problem with the shipped constants, stated plainly because it should be argued with rather
// than quietly patched: at a flat `SLOT_PURCHASE_COST` of 350, one tier-3 sale (1600) buys four
// enclosures. Capacity pressure is therefore real for the first hour and gone by mid-game — and
// capacity pressure is the *entire* mechanism principle 7 relies on to make taking an animal in a
// genuine decision. A principle whose mechanism expires is a principle that expires.
//
// The fix is not to make slots more expensive (that hurts most where the pressure already
// works). It is to make *space itself* come in blocks, the way it really does: you do not buy a
// seventh rack, you rent a bigger room. Each expansion is a step change, and the steps get
// steeper.

/**
 * Enclosure slots available at each facility tier: a spare bedroom, a garage, a converted unit,
 * a small commercial space. Index = tier.
 */
export const FACILITY_SLOTS_BY_TIER: readonly number[] = [6, 14, 30, 60]

/**
 * Cost to move up to each tier. Index 0 is free (you start there).
 *
 * Superlinear on purpose: roughly 2.5× per step against a market whose per-morph income is
 * bounded by saturation. That is what keeps space scarce at year twenty as well as at week one,
 * and it is why the answer to "I need more room" stays "produce something the market has not
 * seen" rather than "sell six more normals".
 */
export const FACILITY_TIER_COST: readonly number[] = [0, 4_000, 11_000, 30_000]

/** Weekly facility upkeep per tier. Bigger space, bigger bill. Principle 5. */
export const FACILITY_UPKEEP_BY_TIER: readonly number[] = [8, 22, 55, 130]

// ===========================================================================
// ENCLOSURES — principles 3, 7 (convenience may be strictly good; capacity is the cost)
// ===========================================================================
//
// Four types, and they are deliberately NOT a ladder. A rack is the best capacity per pound and
// always will be; a display vivarium is where the habitat renderer actually shows you an animal
// and where provisions do anything. The choice between throughput and the thing you built the
// game to look at is the storefront's core tension, and neither answer is wrong.

export type EnclosureTypeId = 'rack-slot' | 'tub' | 'vivarium' | 'display'

export interface EnclosureType {
  readonly id: EnclosureTypeId
  readonly label: string
  /** How many slots of facility space it occupies. */
  readonly footprint: number
  /** How many animals it can hold. Racks hold hatchlings; a display holds one adult. */
  readonly capacity: number
  /** Life stages it may house. A hatchling in a display enclosure is a welfare problem, not a treat. */
  readonly stages: readonly ('hatchling' | 'juvenile' | 'adult')[]
  readonly cost: number
  readonly upkeepPerWeek: number
  /** How many provisions (features) may be installed. Racks take none; that is the trade. */
  readonly featureSlots: number
  /** Whether the habitat renderer draws this enclosure at all. Principle: the reward is seeing it. */
  readonly rendered: boolean
}

export const ENCLOSURE_TYPES: readonly EnclosureType[] = [
  {
    id: 'rack-slot',
    label: 'Rack slot',
    footprint: 1,
    capacity: 4,
    stages: ['hatchling', 'juvenile'],
    cost: Math.round(SLOT_PURCHASE_COST * 0.35),
    upkeepPerWeek: SLOT_UPKEEP_PER_WEEK * 0.5,
    featureSlots: 0,
    rendered: false,
  },
  {
    id: 'tub',
    label: 'Tub',
    footprint: 1,
    capacity: 1,
    stages: ['juvenile', 'adult'],
    cost: SLOT_PURCHASE_COST,
    upkeepPerWeek: SLOT_UPKEEP_PER_WEEK,
    featureSlots: 1,
    rendered: true,
  },
  {
    id: 'vivarium',
    label: 'Vivarium',
    footprint: 2,
    capacity: 1,
    stages: ['juvenile', 'adult'],
    cost: SLOT_PURCHASE_COST * 3,
    upkeepPerWeek: SLOT_UPKEEP_PER_WEEK * 2,
    featureSlots: 3,
    rendered: true,
  },
  {
    id: 'display',
    label: 'Display habitat',
    footprint: 4,
    capacity: 1,
    stages: ['adult'],
    cost: SLOT_PURCHASE_COST * 8,
    upkeepPerWeek: SLOT_UPKEEP_PER_WEEK * 4,
    featureSlots: 6,
    rendered: true,
  },
]

// ===========================================================================
// PROVISIONS — one model for biomes and features (anticipates the habitat work)
// ===========================================================================
//
// A biome is a bundle of provisions; a feature is a single one. Same type, same axes, same
// effects channel — so the habitat renderer has one list to read and the game has one number to
// compute. Two systems here would have been the obvious mistake.

export const PROVISION_AXES = [
  'humidity',
  'thermalGradient',
  'cover',
  'climbing',
  'substrateDepth',
  'enrichment',
] as const
export type ProvisionAxis = (typeof PROVISION_AXES)[number]

/**
 * Baseline provision level. A plain tub with a hide and correct temperatures sits here, and
 * **baseline is fully adequate** — no animal is ever harmed by being housed plainly.
 *
 * That is a tone decision with teeth: husbandry in this game is a bonus system, never a penalty
 * system. Provisions above baseline earn you something; the game simply refuses a placement that
 * would fall below it, rather than accepting it and quietly hurting an animal. Nothing in this
 * repo models an animal suffering, and husbandry is exactly where that rule would be easiest to
 * break by accident.
 */
export const PROVISION_BASELINE = 0.5

/**
 * How much a perfect match may shorten the receptivity window, as a share of its range.
 *
 * Principle 6: this narrows a *published* range, it never hides one. Principle 1: the benefit is
 * a scheduling benefit — you are more likely to fit the pairing inside the season — which is the
 * only kind of time benefit this game is allowed to sell.
 */
export const HUSBANDRY_RECEPTIVITY_SHARE = 0.4

/**
 * Maximum bonus to resident support from a visibly excellent enclosure, as a fraction.
 *
 * Capped hard, and the cap has a reason: a resident must remain net-negative in money at every
 * reachable combination (principles 5 and 7), and this stacks with the talent-tree band in
 * `progression/tunables.ts`. Whatever else changes, the assertion in `residentNetPerWeek` is what
 * must survive.
 */
export const HUSBANDRY_SUPPORT_BONUS_MAX =
  (RESIDENT_CARE_PER_WEEK + SLOT_UPKEEP_PER_WEEK - RESIDENT_SUPPORT_PER_WEEK) /
  RESIDENT_SUPPORT_PER_WEEK /
  2

/** How much of the extra-care multiplier a well-provisioned enclosure offsets. Principle 7. */
export const EXTRA_CARE_MITIGATION_MAX = 0.4

// ===========================================================================
// PURCHASABLES — principles 2, 3 (information is the reward; convenience may be free)
// ===========================================================================

/**
 * Cost to test one locus on one animal. The charter explicitly permits buying a fact.
 *
 * Priced against the tier-2 animal it typically informs: about two-thirds of one sale. The point
 * is that it hurts — the *alternative* to a gene test is a test breeding, which costs no money
 * and instead costs a pairing slot and a season. Money or a season, and which is scarcer changes
 * as you go. That is the best decision in the shop and it should stay tight.
 */
export const GENE_TEST_COST = Math.round(BASE_PRICE_BY_TIER[1] * 0.65)

/**
 * Multiplier for testing every locus at once, relative to `GENE_TEST_COST × loci`.
 *
 * Above 1: a full panel is deliberately *worse per fact* than a targeted test. Bulk discounts on
 * information would let money replace the judgment about which question to ask — and principle 2
 * says the one thing that can never be bought is which pairing to make. Choosing what to test is
 * the same skill.
 */
export const FULL_PANEL_COST_MULTIPLIER = 1.4

/** Reads `F` and the pedigree of an animal you did not breed. Cheap; it is public-record stuff. */
export const PEDIGREE_AUDIT_COST = Math.round(BASE_PRICE_BY_TIER[1] * 0.3)

/**
 * Price multiplier for an animal whose carrier status is *proven* versus merely possible.
 *
 * Not a constant — a function, because the honest answer is already in the engine. A 66%
 * possible het is worth about 66% of a proven one, because that is what a buyer is getting. This
 * is the row in the economy that closes the loop: information is the reward (principle 2), and
 * information is also the thing that pays.
 *
 * `liquidityDiscount` is the small extra haircut for uncertainty itself — buyers dislike variance
 * beyond its expected value, which is real and is why proving a het before selling is worth doing.
 */
export function provenPriceMultiplier(carrierProbability: number, liquidityDiscount = 0.9): number {
  const p = Math.min(1, Math.max(0, carrierProbability))
  return p >= 1 ? 1 : p * liquidityDiscount
}

/**
 * Premium on stock advertised as unrelated to anything you own.
 *
 * Buying diversity is buying a real thing (see D3: outcrossing restores vigor in one generation),
 * and it is the money-for-genetics conversion that keeps line-breeding a decision rather than a
 * default. Priced above a same-morph animal because the seller knows what it is for.
 */
export const OUTCROSS_STOCK_PREMIUM = 1.6

/**
 * Reputation needed before the shop lists stock of each rarity tier. Index = tier − 1.
 *
 * This is the progressive-difficulty gate, and it is deliberately made of *achievements*, not of
 * money or of time: reputation comes from what you have produced, proven, and placed. You cannot
 * buy your way to better stock, which is what stops money from being the only axis in the game.
 */
export const REPUTATION_FOR_STOCK_TIER: readonly number[] = [0, 15, 60, 200]

/** Reputation earned per event. Bounded per source so nothing here is farmable. Principle 8. */
export const REPUTATION_AWARDS = {
  /** First time you produce a given phenotype. Repeats of the same morph award nothing. */
  novelPhenotypeProduced: 8,
  /** A locus proven by test breeding, once per animal per locus. */
  genotypeProven: 3,
  /** A rehab resident placed in a permanent home. */
  residentPlaced: 5,
  /** A new allele found. Once in a long playthrough, per `MUTATION_RATE_PER_ALLELE`. */
  alleleDiscovered: 25,
} as const

// ===========================================================================
// INVARIANTS THIS DISPATCH OWES `tuning.test.ts` — principle 4's standing obligation
// ===========================================================================
//
// Adding a mechanic without adding it to the strategy model is how an invariant suite quietly
// stops protecting the game. Three are owed, and the first is the important one:
//
// 1. **Portfolio rotation must be in the strategy model.** Saturation is keyed to a phenotype and
//    recovers at `SATURATION_RECOVERY_PER_YEAR`, so a player cycling five morphs never saturates
//    any of them — income scales with morph count, morph count scales with capacity, and the
//    runaway loop principle 5 forbids reappears one level up. `ECONOMY_LATE_ACCELERATION_MAX`
//    will not catch it if the model only simulates a single-morph strategy. Model it before
//    patching it; the fix may turn out to be a shared saturation term across related phenotypes,
//    but that should be a response to a failing test rather than a guess.
// 2. **Money-for-information must not dominate breeding-for-information** at any horizon in
//    `STRATEGY_HORIZONS_WEEKS`. A "buy every gene test" strategy that beats "run test breedings"
//    everywhere would hollow out principle 2.
// 3. **Capacity must still be scarce at week 1040.** Assert that facility slots remain a binding
//    constraint at the end of the economy simulation — that is the checkable form of "principle 7
//    still has a mechanism".
