/**
 * Serpentine — the balance invariants.
 *
 * ## What these tests are for
 *
 * Not correctness. `src/genetics/` has tests for correctness. These check that the *game* still
 * has the shape it was designed to have — that rare things are still rare, that no strategy is
 * always right, that money has a ceiling, that inbreeding still costs something.
 *
 * They exist because the person tuning this game is also its only playtester, which is the
 * oldest way there is to end up with a game that's trivially winnable without ever deciding to
 * make one. Every studio solves this with a second person. This file is the second person.
 *
 * ## The rule
 *
 * **No test in this file asserts a constant.** `expect(MUTATION_RATE).toBe(0.00002)` would
 * protect nothing — change the constant, change the test, and the thing you actually cared
 * about is gone. Every assertion here is on a *derived property*: how many clutches to a rare
 * morph, whether the leader changes across the game, whether money flattens out. Those are the
 * design. The constants are just how it's written down.
 *
 * ## When one of these fails
 *
 * Read the message. It says which principle moved and what that principle was holding up. Then
 * decide — the failure is information, not a verdict. If you still want the change: move the
 * band in `tuning.ts` too, and put two sentences in the decision log in
 * `docs/balance-charter.md`. That's the whole procedure, and doing it deliberately is the only
 * difference between designing the game and drifting it.
 *
 * ## What isn't covered yet
 *
 * The models below are models. They read the real constants, but they're a sketch of the game,
 * not the game — see the `it.todo`s at the bottom, which are the cross-checks that tie this
 * model back to the engine and the shipped species data. When you add a mechanic, add it to
 * the model here too. An invariant that only knows about July's mechanics can't protect
 * October's.
 */

import { describe, it } from 'vitest'
import {
  BASE_HATCH_RATE,
  BASE_PRICE_BY_TIER,
  DECISIONS_PER_GENERATION,
  DOMINANCE_MARGIN,
  ECONOMY_CEILING,
  ECONOMY_LATE_ACCELERATION_MAX,
  ECONOMY_SIM_WEEKS,
  EGGS_PER_MUTATION_BAND,
  EXPECTED_HATCHLINGS_PER_CLUTCH,
  FACILITY_UPKEEP_PER_WEEK,
  INCUBATION_WEEKS,
  MAX_DECISIONS_PER_GENERATION,
  MIN_TURNS_PER_DECISION,
  MUTABLE_LOCI_COUNT,
  MUTATION_ADVANTAGE_FLOOR,
  PAIRING_RECEPTIVITY_WEEKS,
  RARITY_TIERS,
  RESIDENT_CARE_PER_WEEK,
  RESIDENT_SUPPORT_PER_WEEK,
  SATURATION_RECOVERY_PER_YEAR,
  SLOT_PURCHASE_COST,
  SLOT_UPKEEP_PER_WEEK,
  STARTING_MONEY,
  STRATEGY_HORIZONS_WEEKS,
  TIER_TARGET_COPIES,
  WEEKS_PER_YEAR,
  WEEKS_TO_MATURITY_FEMALE,
  WEEKS_TO_MATURITY_MALE,
  INBREEDING_HATCH_RATIO_BAND,
  INBREEDING_LOAD_SIGNAL_BAND,
  expectedClutchesToCopies,
  hatchRateAtF,
  loadExpressionProbability,
  mutationProbabilityPerEgg,
  salePrice,
} from './tuning'

/**
 * Throws with the message verbatim, so a failure reads as a paragraph explaining what moved
 * rather than as a diff of two numbers. The message is the whole point of this file.
 */
function invariant(holds: boolean, message: string): void {
  if (!holds) throw new Error(`\n\n${message.trim()}\n`)
}

const round = (n: number, places = 2): string => n.toFixed(places)

// ===========================================================================
// Rarity — principle 2 (information is the reward)
// ===========================================================================

describe('rarity tiers', () => {
  it('keeps each tier inside the number of clutches it was designed to cost', () => {
    for (const tier of RARITY_TIERS) {
      const expected = expectedClutchesToCopies(tier.probabilityPerHatchling)
      const [min, max] = tier.expectedClutchesBand

      invariant(
        expected >= min && expected <= max,
        `Tier ${tier.tier} (${tier.label}) now takes about ${round(expected)} clutches to get
${TIER_TARGET_COPIES} of them. It was designed to take between ${min} and ${max}.

The path being measured is: ${tier.canonicalPath}.

This number is not set directly anywhere — it falls out of three things together: the odds of
that pairing, the typical clutch size, and the base hatch rate. So if you changed clutch size or
hatch rate, you just changed how rare every morph in the game is, all at once. That's usually
not what you meant, and it's the single easiest way to flatten the whole game by accident.

Principle 2 — information is the reward. The payoff of a breeding is finding out what your
animals carry, and that only means something while finding out takes real effort. A tier-3 morph
that arrives in two clutches isn't rare, it's decoration, and the Punnett squares become a
screensaver.

If you did mean it: widen this tier's band in RARITY_TIERS, check the ordering test below still
passes, and log it in docs/balance-charter.md. If you didn't: the constant you want back is
probably CLUTCH_SIZE_TYPICAL or BASE_HATCH_RATE.`,
      )
    }
  })

  it('keeps the tiers in order, so a rarer trait is never easier than a commoner one', () => {
    const sorted = [...RARITY_TIERS].sort((a, b) => a.tier - b.tier)

    for (let i = 1; i < sorted.length; i++) {
      const lower = sorted[i - 1]!
      const upper = sorted[i]!

      const lowerCost = expectedClutchesToCopies(lower.probabilityPerHatchling)
      const upperCost = expectedClutchesToCopies(upper.probabilityPerHatchling)

      invariant(
        upperCost > lowerCost,
        `Tier ${upper.tier} (${upper.label}) is now easier to obtain than tier ${lower.tier}
(${lower.label}): about ${round(upperCost)} clutches versus ${round(lowerCost)}.

The tiers have stopped meaning anything. A player who works out that the "exceptional" morph is
cheaper to chase than the "rare" one has found a shortcut that makes the rare one pointless, and
every difficulty judgement downstream of the tier labels — prices, unlock ordering, what the UI
calls impressive — is now wrong.

Principle 4 — no strategy should be the best one at every stage. An inverted tier isn't a
strategy that wins for a while; it's a strategy that wins for free.

This one is almost always a typo in probabilityPerHatchling. Check the arithmetic against the
pairing in canonicalPath: het × wild-type is 1/2, carrier × carrier is 1/4, two independent
recessives is 1/16, three is 1/64.`,
      )

      invariant(
        lower.expectedClutchesBand[1] <= upper.expectedClutchesBand[0],
        `The designed bands for tier ${lower.tier} and tier ${upper.tier} now overlap:
tier ${lower.tier} runs up to ${lower.expectedClutchesBand[1]}, tier ${upper.tier} starts at
${upper.expectedClutchesBand[0]}.

This check exists for one specific reason: when the band test above fails, the quickest way to
make it pass is to widen the band, and if you widen it far enough the tiers stop being distinct
without anything ever failing. So the bands have to stay ordered too.

If you genuinely want these tiers closer together, move both bands rather than stretching one,
and log it. If you want a tier to be *meaningfully* rarer than the one below it, there should be
a visible gap between the bands — that gap is the tier actually meaning something.`,
      )
    }
  })
})

// ===========================================================================
// Mutation — principles 2, 8 (the reward is knowing; no slot machines)
// ===========================================================================

describe('mutation', () => {
  it('stays a once-in-a-playthrough event rather than a farming strategy', () => {
    const perEgg = mutationProbabilityPerEgg(MUTABLE_LOCI_COUNT)
    const eggsPerMutation = 1 / perEgg
    const [min, max] = EGGS_PER_MUTATION_BAND

    invariant(
      eggsPerMutation >= min && eggsPerMutation <= max,
      `A new mutation now shows up about every ${Math.round(eggsPerMutation)} eggs. It was
designed to appear somewhere between every ${min} and every ${max} — roughly once in a long
playthrough.

Too often, and the best way to get something new stops being "work out which pairing produces
it" and becomes "hatch eggs until the game gives me one". That's principle 8: an action worth
repeating a hundred times for a better result is a slot machine, and it quietly replaces the
entire genetics layer, which is the part of this game that's actually about something.

Too rarely, and the novel-allele machinery is dead code and nobody ever gets the moment.

Real mutation rates are around 1e-8 per generation, so there's no "correct" number here to go
back to — this is a game number and always was. But it's a game number doing a specific job.
If you want mutations more often, say so in the decision log and move the band; the honest
version of that change is "I want discovery to be a mechanic, not an event", which is a real
design position and worth writing down as one.`,
    )
  })

  it('never makes waiting for a mutation competitive with breeding for a morph', () => {
    const hardestTier = [...RARITY_TIERS].sort((a, b) => b.tier - a.tier)[0]!
    const hardestPathEggs =
      expectedClutchesToCopies(hardestTier.probabilityPerHatchling) *
      EXPECTED_HATCHLINGS_PER_CLUTCH

    const specificMutationEggs = 1 / mutationProbabilityPerEgg(1)
    const ratio = specificMutationEggs / hardestPathEggs

    invariant(
      ratio >= MUTATION_ADVANTAGE_FLOOR,
      `Chasing one specific new mutation is now only ${round(ratio, 1)}× harder than breeding
for the rarest morph in the game the deliberate way. It's supposed to be at least
${MUTATION_ADVANTAGE_FLOOR}× harder.

Once those two costs get close, the optimal play stops being "understand the genetics and plan
the pairings" and starts being "produce volume and wait". Principle 2 says the reward of this
game is information — what your animals carry, and what a pairing will do. A player who can
out-earn that by hatching indiscriminately isn't being rewarded for information, they're being
rewarded for throughput.

Hardest deliberate path right now: ${hardestTier.canonicalPath}, about
${Math.round(hardestPathEggs)} eggs. Specific mutation: about
${Math.round(specificMutationEggs)} eggs.

If mutation is meant to be a real route to new morphs rather than a rare gift, that's a much
bigger design change than one constant — it wants its own mechanic (a mutagen? a wild-caught
founder programme?) rather than a raised rate.`,
    )
  })
})

// ===========================================================================
// Inbreeding — principle 3 (genetic progress pushes against something)
// ===========================================================================

describe('inbreeding and genetic load', () => {
  it('makes a full-sib pairing cost something, without making it feel like a punishment', () => {
    const outbred = hatchRateAtF(0)
    const inbred = hatchRateAtF(0.25)
    const ratio = inbred / outbred
    const [min, max] = INBREEDING_HATCH_RATIO_BAND

    invariant(
      ratio >= min && ratio <= max,
      `A full-sib pairing (F = 0.25) now hatches at ${round(ratio * 100, 1)}% of the outbred
rate. The designed band is ${round(min * 100, 0)}%–${round(max * 100, 0)}%.

Both ends of that band are doing a job.

Too high (above ${round(max * 100, 0)}%) and inbreeding costs nothing you can feel. Principle 3
— genetic progress always pushes against something — has no teeth, and the best decision in the
game collapses: if line-breeding is free, you just always line-breed, and "when do you outcross?"
stops being a question.

Too low (below ${round(min * 100, 0)}%) and the game gets mean. This is meant to be a warm game
about caring for animals. An inbreeding penalty steep enough to feel like a slap changes what
the game is about, and no amount of it being biologically accurate makes that a good trade.

Currently ${round(outbred * 100, 1)}% outbred versus ${round(inbred * 100, 1)}% at F = 0.25.
The constants behind it are LOAD_LOCI_COUNT, LOAD_ALLELE_FREQUENCY, and
LOAD_EXTRA_CARE_FRACTION — note that the last one isn't really a difficulty knob. Lowering it
makes more eggs fail instead of more hatchlings needing care, which is a tone change, not a
balance one.`,
    )
  })

  it('makes outcrossing visibly work within one generation', () => {
    const atZero = loadExpressionProbability(0)
    const atQuarter = loadExpressionProbability(0.25)
    const signal = atQuarter / atZero
    const [min, max] = INBREEDING_LOAD_SIGNAL_BAND

    invariant(
      signal >= min && signal <= max,
      `Load expresses ${round(signal, 1)}× more often at F = 0.25 than in an outbred pairing.
The designed band is ${min}×–${max}×.

This is the number that decides whether the mechanic ever *teaches* anything. The moment the
game earns its whole premise is when a player takes a heavily line-bred female, pairs her with
an unrelated male, and sees a visibly better clutch one generation later. That's real biology —
relatives carry the same deleterious recessives, unrelated animals carry different ones, so
nothing pairs up — and it's the reason we model genetic load instead of a "gene strength" stat.

Below ${min}× the signal is buried in ordinary clutch-to-clutch variation and nobody ever
notices the lesson. Above ${max}× line-breeding is so brutal that the interesting version of the
decision — push the line a bit further, or outcross now? — becomes an obvious "outcross always".

At F = 0: ${round(atZero * 100, 1)}% of hatchlings express load. At F = 0.25:
${round(atQuarter * 100, 1)}%.`,
    )
  })
})

// ===========================================================================
// Time gates — principle 1 (decisions are scarce; your time never is)
// ===========================================================================

describe('time gates', () => {
  const gates: readonly (readonly [string, readonly [number, number]])[] = [
    ['pairing receptivity', PAIRING_RECEPTIVITY_WEEKS],
    ['incubation', INCUBATION_WEEKS],
    ['maturity (female)', WEEKS_TO_MATURITY_FEMALE],
    ['maturity (male)', WEEKS_TO_MATURITY_MALE],
  ]

  it('keeps every wait bounded, whole-numbered in turns, and showable as a range', () => {
    for (const [name, [min, max]] of gates) {
      invariant(
        Number.isInteger(min) && Number.isInteger(max) && min >= 0 && max >= min && max < 1000,
        `The ${name} gate is ${min}–${max}, which isn't a range the game can show or a player
can plan around.

Two things this is checking. First, durations are whole turns, because a turn is a week and
half a week isn't a thing the player can advance through — a fractional gate is the smell of a
duration that's drifted toward being measured in something other than turns. Second, the range
is finite and ordered, because principle 6 says the player is never uncertain about odds, and
that applies to time: "Incubation: 8–9 weeks" is a scheduling decision, "Incubation: ???" is a
slot machine on wait time.

There is one rule here that isn't negotiable and isn't in a band: no gate is ever wall-clock.
Time advances because the player advanced it. If you ever find yourself wanting "come back in
four hours", the thing you actually want is a longer turn gate plus something worth doing in the
meantime.`,
      )
    }
  })

  it('keeps a generation cheap in clicks even though it is long in the fiction', () => {
    const turnsPerGeneration = PAIRING_RECEPTIVITY_WEEKS[1] + INCUBATION_WEEKS[1]
    const turnsPerDecision = turnsPerGeneration / DECISIONS_PER_GENERATION

    invariant(
      DECISIONS_PER_GENERATION <= MAX_DECISIONS_PER_GENERATION,
      `Getting from choosing a pairing to holding the hatchlings now takes
${DECISIONS_PER_GENERATION} separate things the player has to do. The budget is
${MAX_DECISIONS_PER_GENERATION}.

Principle 1 — decisions are the scarce resource, never your time. A generation is supposed to
fit comfortably in one sitting so that a *project* can span months without the game punishing
you for coming back to it. Every extra required interaction is a place a session ends.

If the new step is a real decision, that's fine and the budget should move. If it's a
confirmation, an acknowledgement, or a screen you have to dismiss, it isn't a decision and it
shouldn't be in the count — or in the game.`,
    )

    invariant(
      turnsPerDecision >= MIN_TURNS_PER_DECISION,
      `Across one generation the game now advances ${round(turnsPerGeneration, 0)} turns for
${DECISIONS_PER_GENERATION} player decisions — ${round(turnsPerDecision, 1)} turns per decision,
against a floor of ${MIN_TURNS_PER_DECISION}.

This is the check on "time is scarce in the fiction and cheap in the wrist". Being turn-based
doesn't automatically make time cheap — a turn-based game where you click End Turn forty times
has charged you exactly the same slow feedback loop as a real-time timer, just paid in wrist
instead of wall clock. The promise is one control that skips to the next thing that needs a
decision, so this ratio is how much work that control is actually doing.

A low ratio means either the gates got short (fine, but then say so — the fiction's clock just
got faster) or the required interactions multiplied (not fine).`,
    )
  })
})

// ===========================================================================
// Economy — principles 5, 7 (bounded by the market, not by taxing the rehab)
// ===========================================================================

/** One way of playing, expressed as a policy the model can run. */
interface Strategy {
  readonly name: string
  /** Enclosure slots this player builds toward. */
  readonly targetSlots: number
  /** The rarity tier they're trying to produce and sell. */
  readonly targetTier: 1 | 2 | 3 | 4
  /** Years of breeding before the target tier is actually producible. */
  readonly rampYears: number
  /** Outcross every N years, resetting F at the cost of buying unrelated stock. 0 = never. */
  readonly outcrossEveryYears: number
  /** Move to a fresh morph every N years, resetting its market saturation. 0 = never. */
  readonly newMorphEveryYears: number
  /** Rehab residents kept, consuming slots and care. */
  readonly residents: number
}

/** Inbreeding accumulated per year of breeding within a line, and where it tops out. */
const F_GAIN_PER_YEAR = 0.03
const F_CEILING = 0.35
const F_AFTER_OUTCROSS = 0.02
/** Fraction of slots that are breeding females. The rest are males, growers, and residents. */
const FEMALE_SHARE_OF_SLOTS = 0.45
/** The small facility a player inherits at the start. Enough to be viable, not enough to coast. */
const STARTING_SLOTS = 8

/**
 * Run one strategy for `weeks` and report money over time.
 *
 * A sketch, not the game — but it reads the real constants, so when a constant moves, this
 * moves with it. Everything modelled here is something the charter says is load-bearing:
 * upkeep that scales with size, prices that decay as a morph saturates the market, vigor that
 * falls as a line narrows, and the ramp cost of switching to something new.
 */
function runEconomy(strategy: Strategy, weeks: number): number[] {
  let money = STARTING_MONEY
  let slots = STARTING_SLOTS
  let f = 0
  let morphGeneration = 0
  const soldByMorph = new Map<string, number>()
  const history: number[] = []

  for (let week = 0; week < weeks; week++) {
    const year = Math.floor(week / WEEKS_PER_YEAR)

    // Residents arrive as capacity allows — you can't house ten snakes in four enclosures.
    // Capped at half the facility so there is always something left to breed with.
    const residents = Math.min(strategy.residents, Math.floor(slots / 2))

    // Upkeep, every week, forever. This is what makes scale cost something.
    money -=
      FACILITY_UPKEEP_PER_WEEK +
      slots * SLOT_UPKEEP_PER_WEEK +
      residents * (RESIDENT_CARE_PER_WEEK - RESIDENT_SUPPORT_PER_WEEK)

    // Expand when there's comfortable headroom and the operation is actually growing. Modelled
    // players don't expand into a decline, and neither does anyone real — without this guard the
    // model happily builds itself bankrupt and every downstream invariant passes vacuously.
    const moneyAYearAgo = history[history.length - WEEKS_PER_YEAR] ?? STARTING_MONEY
    const growing = money >= moneyAYearAgo
    if (slots < strategy.targetSlots && money > SLOT_PURCHASE_COST * 3 && growing) {
      money -= SLOT_PURCHASE_COST
      slots++
    }

    // Once a year: the breeding season resolves.
    if (week % WEEKS_PER_YEAR === WEEKS_PER_YEAR - 8) {
      // The market recovers a little each year before this season's animals reach it.
      for (const [key, sold] of soldByMorph) {
        soldByMorph.set(key, sold * (1 - SATURATION_RECOVERY_PER_YEAR))
      }

      const breedingSlots = Math.max(0, slots - residents)
      // You start with a pair, so any breeding capacity at all means at least one female.
      const females =
        breedingSlots > 0 ? Math.max(1, Math.round(breedingSlots * FEMALE_SHARE_OF_SLOTS)) : 0

      if (strategy.outcrossEveryYears > 0 && year > 0 && year % strategy.outcrossEveryYears === 0) {
        // Unrelated stock costs money and gives back some of the fixation.
        money -= BASE_PRICE_BY_TIER[1]! * Math.max(1, Math.round(females / 3))
        f = F_AFTER_OUTCROSS
      } else {
        f = Math.min(F_CEILING, f + F_GAIN_PER_YEAR)
      }

      if (strategy.newMorphEveryYears > 0 && year > 0 && year % strategy.newMorphEveryYears === 0) {
        morphGeneration++
      }

      // While ramping up to a target morph you're buying carriers, not selling them. The
      // rarer the goal, the more that costs — which is what makes chasing something rare a
      // real investment rather than just a longer wait, and what lets a plain volume operation
      // genuinely lead in the early years.
      if (year < strategy.rampYears) {
        const wanted = BASE_PRICE_BY_TIER[strategy.targetTier - 1]! * 0.35
        money -= Math.max(0, Math.min(wanted, money * 0.4))
      }

      const hatchlings = females * EXPECTED_HATCHLINGS_PER_CLUTCH * (hatchRateAtF(f) / BASE_HATCH_RATE)
      const vigor = Math.max(0, 1 - f / F_CEILING)

      const producingTarget = year >= strategy.rampYears
      const targetTier = producingTarget ? strategy.targetTier : 1
      const targetOdds = producingTarget
        ? RARITY_TIERS.find((t) => t.tier === strategy.targetTier)!.probabilityPerHatchling
        : 1

      const targets = hatchlings * targetOdds
      const rest = hatchlings - targets

      const targetKey = `${targetTier}:${morphGeneration}`
      const restKey = `1:common`

      const soldTarget = soldByMorph.get(targetKey) ?? 0
      const soldRest = soldByMorph.get(restKey) ?? 0

      money += targets * salePrice(targetTier, soldTarget, vigor)
      money += rest * salePrice(1, soldRest, vigor)

      soldByMorph.set(targetKey, soldTarget + targets)
      soldByMorph.set(restKey, soldRest + rest)
    }

    history.push(money)
  }

  return history
}

const STRATEGIES: readonly Strategy[] = [
  {
    name: 'volume — breed common morphs, sell everything, scale hard',
    targetSlots: 18,
    targetTier: 1,
    rampYears: 0,
    outcrossEveryYears: 4,
    newMorphEveryYears: 0,
    residents: 2,
  },
  {
    name: 'line-breed — push one rare line hard and never outcross',
    targetSlots: 16,
    targetTier: 3,
    rampYears: 3,
    outcrossEveryYears: 0,
    newMorphEveryYears: 0,
    residents: 2,
  },
  {
    name: 'outcross — chase the same rare morph but keep the line healthy',
    targetSlots: 16,
    targetTier: 3,
    rampYears: 4,
    outcrossEveryYears: 3,
    newMorphEveryYears: 0,
    residents: 2,
  },
  {
    name: 'novelty — chase the hardest morphs and keep moving to new ones',
    targetSlots: 18,
    targetTier: 4,
    rampYears: 5,
    outcrossEveryYears: 4,
    newMorphEveryYears: 4,
    residents: 2,
  },
]

describe('economy', () => {
  it('has a ceiling — no modelled strategy compounds without bound', () => {
    for (const strategy of STRATEGIES) {
      const history = runEconomy(strategy, ECONOMY_SIM_WEEKS)
      const peak = Math.max(...history)

      invariant(
        peak <= ECONOMY_CEILING,
        `The "${strategy.name}" strategy reaches ${Math.round(peak).toLocaleString()} over
${ECONOMY_SIM_WEEKS} weeks. The designed ceiling is ${ECONOMY_CEILING.toLocaleString()}.

Money → better animals → more money is a runaway loop, and once it runs away the game is over
in the boring way: everything is affordable, no purchase is a decision, and the rehab stops
being a place you have to make choices about.

Principle 5 says the thing that bounds it is the *market* — a morph's price falls as it becomes
common — not the cost of caring for animals. So if this failed, look at SATURATION_HALFLIFE_SALES
(how fast prices decay), MARKET_PRICE_FLOOR_FRACTION (how low they can go), or
SLOT_UPKEEP_PER_WEEK (what scale costs you).

Do not fix this by raising RESIDENT_CARE_PER_WEEK. That works, and it makes the rehab the thing
taxing you, which is exactly what principle 7 forbids. It puts running a small cold operation on
the optimal line, and that's not the game we're building.`,
      )
    }
  })

  it('stops accelerating — money grows at a steady rate, not a growing one', () => {
    // Three samples, five years apart, all at the same point in the breeding year so the
    // annual income lump doesn't skew the comparison.
    const window = 5 * WEEKS_PER_YEAR

    for (const strategy of STRATEGIES) {
      const history = runEconomy(strategy, ECONOMY_SIM_WEEKS)
      const end = history[ECONOMY_SIM_WEEKS - 1]!
      const mid = history[ECONOMY_SIM_WEEKS - 1 - window]!
      const early = history[ECONOMY_SIM_WEEKS - 1 - 2 * window]!

      const priorGain = mid - early
      const recentGain = end - mid

      if (priorGain <= 0) continue // still climbing out of the ramp; nothing to compare

      const acceleration = recentGain / priorGain

      invariant(
        acceleration <= ECONOMY_LATE_ACCELERATION_MAX,
        `The "${strategy.name}" strategy earned ${Math.round(recentGain).toLocaleString()} in its
last five years against ${Math.round(priorGain).toLocaleString()} in the five before —
${round(acceleration, 2)}× as fast, where the allowance is ${ECONOMY_LATE_ACCELERATION_MAX}×.

This is about the shape of the curve, not how high it gets. Steady income is fine: it's bounded
by how many animals you can actually house. What isn't fine is each period earning more than the
last, forever — that's the runaway loop principle 5 exists to stop. Money buys better animals,
better animals make more money, and if nothing pushes back the game ends in the boring way,
where everything is affordable and no purchase is a decision.

The thing that's supposed to push back is market saturation: a morph's price falls as it
becomes common, so scaling up your best line eats its own margin. If that's stopped biting,
look at SATURATION_HALFLIFE_SALES, SATURATION_RECOVERY_PER_YEAR, and
MARKET_PRICE_FLOOR_FRACTION — in that order.`,
      )
    }
  })

  it('lets a rehab-heavy way of playing stay solvent — the mission is a cost, not a trap', () => {
    const missionHeavy: Strategy = {
      name: 'mission-first — half the facility given over to residents',
      targetSlots: 20,
      targetTier: 2,
      rampYears: 2,
      outcrossEveryYears: 3,
      newMorphEveryYears: 0,
      residents: 10,
    }

    const history = runEconomy(missionHeavy, ECONOMY_SIM_WEEKS)
    const end = history[history.length - 1]!
    const worst = Math.min(...history)

    invariant(
      end > STARTING_MONEY && worst > -STARTING_MONEY,
      `A player who gives half their facility over to rehab residents ends a long game at
${Math.round(end).toLocaleString()}, having bottomed out at ${Math.round(worst).toLocaleString()}.
That way of playing is supposed to be *slower*, not *unsurvivable*.

Principle 7 — the rehab competes for capacity, never for your conscience. Taking in an animal
should cost you a slot and some attention you wanted for your breeding project. It should never
mean the game stops working. The moment compassion is a losing move rather than a slower one,
optimal play is to run a small cold operation, and we have accidentally built a game that
rewards not caring.

If this failed alongside the ceiling test, the fix is probably not here: something is taxing
per-resident cost to control the economy, which principle 5 explicitly routes away from. Bound
the money loop with market saturation and slot upkeep; leave RESIDENT_CARE_PER_WEEK modest.`,
    )
  })
})

// ===========================================================================
// Strategy dominance — principle 4 (nothing is best at every stage)
// ===========================================================================

describe('strategy dominance', () => {
  const leaderAt = (weeks: number): { name: string; best: number; second: number } => {
    const scored = STRATEGIES.map((s) => ({
      name: s.name,
      score: runEconomy(s, weeks)[weeks - 1]!,
    })).sort((a, b) => b.score - a.score)

    return { name: scored[0]!.name, best: scored[0]!.score, second: scored[1]!.score }
  }

  it('never lets one way of playing lead at every stage of the game', () => {
    const leaders = STRATEGY_HORIZONS_WEEKS.map((w) => ({ weeks: w, ...leaderAt(w) }))
    const distinct = new Set(leaders.map((l) => l.name))

    invariant(
      distinct.size > 1,
      `The same strategy — "${leaders[0]!.name}" — is now ahead at every horizon we measure
(${STRATEGY_HORIZONS_WEEKS.map((w) => `${Math.round(w / WEEKS_PER_YEAR)}y`).join(', ')}).

Principle 4: a strategy is allowed to be the right call for a while. That's a game having
phases, and an approach that's clearly best in the first couple of years is good onboarding.
What's not allowed is one that never stops being correct — because then there's no decision,
and without a decision there's no game, just a procedure.

The interesting shape is a lead that changes hands: volume pays first because it needs no ramp,
line-breeding overtakes it once a rare morph is producible, and outcrossing wins late because
the line-breeder's vigor — and therefore their prices — have quietly eroded. If that's stopped
happening, one of those three pressures has gone soft.

Worth checking before you touch a constant: has a mechanic been added that this model doesn't
know about? The model can only see what's in it, and an invariant that only knows July's
mechanics can't protect October's.`,
    )
  })

  it('never lets the leading strategy make the others look like jokes', () => {
    for (const weeks of STRATEGY_HORIZONS_WEEKS) {
      const { name, best, second } = leaderAt(weeks)
      if (second <= 0 || best <= 0) continue

      const margin = best / second

      invariant(
        margin <= DOMINANCE_MARGIN,
        `At ${Math.round(weeks / WEEKS_PER_YEAR)} in-game years, "${name}" is ahead of the
next-best approach by ${round(margin, 2)}×. The allowance is ${DOMINANCE_MARGIN}×.

Leading is fine. Lapping the field is not. Once the gap is this wide, the other approaches stop
being alternatives and become mistakes — and a player who works that out has effectively been
handed the answer to the only strategic question the game asks.

Principle 4 again, the other half of it: it isn't enough that the leader changes over time if,
at any given moment, everything except the leader is unplayable.

Look at what the leader is exploiting. If it's price, the tier prices in BASE_PRICE_BY_TIER may
have drifted apart faster than the tiers actually got harder — compare them against the rarity
band test above, which is the honest measure of how much harder each tier is.`,
      )
    }
  })
})

// ===========================================================================
// Not yet runnable — the cross-checks that tie this model back to the game
// ===========================================================================
//
// These are the tests that stop the model above from drifting away from the actual game. They
// need `punnett()` and the shipped species data, neither of which exists at the time this file
// was written. They are the highest-value tests in this file and they are not optional
// long-term: everything above protects a *sketch* of the game until these exist.

describe('cross-checks against the real engine and species data', () => {
  it.todo(
    'every shipped trait\'s tier matches what punnett() says its canonical pairing actually yields',
  )

  it.todo(
    'no shipped morph is obtainable by an easier route than the canonical path its tier claims',
  )

  it.todo(
    'observed hatch rates from a seeded line-breeding run match hatchRateAtF() within tolerance',
  )
})
