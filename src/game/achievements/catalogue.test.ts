/**
 * The catalogue held to the design, written as checks.
 *
 * Three kinds of assertion live here and they are worth telling apart:
 *
 * 1. **Integrity** — every trait named exists, every id is unique, every `supersedes` resolves.
 *    These fail when the catalogue and `src/species/` drift apart.
 * 2. **Budget** — every achievement's rewards actually pay for its declared effort.
 *    These fail when an achievement is too big for the currencies the game has.
 * 3. **Charter** — the properties `docs/balance-charter.md` forbids the game from losing.
 *    These are the ones to read before changing a constant, and each names its principle.
 */
import { describe, expect, it } from 'vitest'
import { allSpecies } from '../../species'
import { ACHIEVEMENTS } from './catalogue'
import { buildCoverage } from './coverage'
import { watchedFlags } from './compile'
import { ENTRY_CLUTCH_GROSS, clutchEquivalents, rungFor } from './effort'
import { achievementReward } from './engine'
import {
  MONEY_SHARE_BY_RUNG,
  REWARD_INVARIANTS,
  VALUE_PER_CLUTCH_EQUIVALENT,
  validateReward,
} from './reward'
import { morphList } from './traits'
import type { Achievement, Requirement } from './types'
import { CATEGORIES } from './types'

const coverage = buildCoverage(allSpecies)

/** Every leaf of a requirement tree, flattened. */
function leaves(requirement: Requirement): readonly Requirement[] {
  if (requirement.kind === 'all' || requirement.kind === 'any') {
    return requirement.of.flatMap(leaves)
  }
  return [requirement]
}

const ALL_LEAVES = ACHIEVEMENTS.flatMap((a) => leaves(a.requires).map((leaf) => ({ a, leaf })))

/** Real ids, straight from `src/species/`. Nothing in this file hard-codes a trait name. */
const REAL = {
  species: new Set(allSpecies.map((s) => s.id)),
  loci: new Set(allSpecies.flatMap((s) => s.loci.map((l) => l.id))),
  lociOf: new Map(allSpecies.map((s) => [s.id, new Set(s.loci.map((l) => l.id))])),
  traitFlags: new Set(
    allSpecies.flatMap((s) => morphList(s).map((m) => `ach.trait.${s.id}.${m.locusId}.${m.alleleId}`)),
  ),
}

// ---------------------------------------------------------------------------
// 1. Integrity
// ---------------------------------------------------------------------------

describe('catalogue integrity', () => {
  it('is large enough to be a catalogue rather than a sample', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(60)
  })

  it('has unique ids, each namespaced by its category', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const a of ACHIEVEMENTS) expect(a.id.startsWith(`${a.category}.`)).toBe(true)
  })

  it('uses only declared categories, and fills every one of them', () => {
    const declared = new Set(CATEGORIES.map((c) => c.id))
    for (const a of ACHIEVEMENTS) expect(declared.has(a.category)).toBe(true)
    for (const category of declared) {
      expect(ACHIEVEMENTS.some((a) => a.category === category)).toBe(true)
    }
  })

  it('names only traits that exist in src/species/', () => {
    // A trait flag that is not a member of some coverage set names an allele nobody wrote. The
    // coverage sets are built from `morphList`, so this compares the catalogue against the
    // species files themselves rather than against a list maintained here.
    for (const { a, leaf } of ALL_LEAVES) {
      if (leaf.kind !== 'atLeast' || !leaf.flag.startsWith('ach.trait.')) continue
      expect(REAL.traitFlags, `${a.id} names a trait that does not exist: ${leaf.flag}`).toContain(
        leaf.flag,
      )
    }
  })

  it('names only species and loci that exist, in every other flag shape', () => {
    for (const { a, leaf } of ALL_LEAVES) {
      if (leaf.kind !== 'atLeast') continue
      const { flag } = leaf

      const combo = /^ach\.combo\.(.+?)\.(.+)\+(.+)$/.exec(flag)
      if (combo) {
        const [, speciesId, locusA, locusB] = combo
        const loci = REAL.lociOf.get(speciesId!)
        expect(loci, `${a.id}: unknown species ${speciesId}`).toBeDefined()
        expect(loci, `${a.id}: unknown locus ${locusA}`).toContain(locusA)
        expect(loci, `${a.id}: unknown locus ${locusB}`).toContain(locusB)
        continue
      }

      const multi = /^ach\.multi\.(.+)\.(\d+)$/.exec(flag)
      if (multi) {
        const [, speciesId, count] = multi
        const loci = REAL.lociOf.get(speciesId!)
        expect(loci, `${a.id}: unknown species ${speciesId}`).toBeDefined()
        // Asking for more simultaneous traits than the species has loci is unreachable forever.
        expect(Number(count), `${a.id}: asks for more traits than ${speciesId} has`).toBeLessThanOrEqual(
          loci!.size,
        )
        continue
      }

      const perSpecies = /^ach\.(?:hatched|species)\.(.+)$/.exec(flag)
      if (perSpecies) {
        expect(REAL.species, `${a.id}: unknown species`).toContain(perSpecies[1])
        continue
      }

      const proven = /^ach\.proven\.(.+)$/.exec(flag)
      if (proven) expect(REAL.loci, `${a.id}: unknown locus`).toContain(proven[1])
    }
  })

  it('names only coverage sets that resolve to at least one real member', () => {
    for (const a of ACHIEVEMENTS) {
      expect(
        watchedFlags(a.requires, coverage).length,
        `${a.id} watches no flags — an empty or misspelled coverage set`,
      ).toBeGreaterThan(0)
    }
  })

  it('has a resolvable, acyclic supersedes chain', () => {
    const byId = new Map(ACHIEVEMENTS.map((a) => [a.id, a]))
    for (const a of ACHIEVEMENTS) {
      if (a.supersedes === undefined) continue
      expect(byId.has(a.supersedes), `${a.id} supersedes unknown ${a.supersedes}`).toBe(true)

      const seen = new Set<string>([a.id])
      let cursor: Achievement | undefined = byId.get(a.supersedes)
      while (cursor) {
        expect(seen.has(cursor.id), `supersedes cycle through ${cursor.id}`).toBe(false)
        seen.add(cursor.id)
        cursor = cursor.supersedes === undefined ? undefined : byId.get(cursor.supersedes)
      }
    }
  })

  it('gives every achievement player-facing copy and at least one effort step', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.label.length, a.id).toBeGreaterThan(0)
      expect(a.description.length, a.id).toBeGreaterThan(0)
      expect(a.effort.length, `${a.id} declares no effort, so it would pay nothing`).toBeGreaterThan(0)
      for (const step of a.effort) expect(step.note.length, a.id).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// 2. Budget
// ---------------------------------------------------------------------------

describe('reward budget', () => {
  it('pays for every achievement — no under-payment, no over-payment', () => {
    const failures: string[] = []
    for (const a of ACHIEVEMENTS) {
      const problems = validateReward(achievementReward(a), a.grants ?? [])
      for (const problem of problems) failures.push(`${a.id}: ${problem.message}`)
    }
    expect(failures).toEqual([])
  })

  it('is deterministic — the same achievement always pays the same thing', () => {
    for (const a of ACHIEVEMENTS) {
      expect(achievementReward(a)).toEqual(achievementReward(a))
    }
  })

  it('never pays a capstone premium in money', () => {
    for (const a of ACHIEVEMENTS) {
      if (a.capstone !== true) continue
      const withoutCapstone = clutchEquivalents(a.effort)
      const reward = achievementReward(a)
      // Money is a function of effort alone; the capstone value goes entirely to the residual.
      expect(reward.money, a.id).toBeLessThanOrEqual(
        VALUE_PER_CLUTCH_EQUIVALENT * withoutCapstone + 50,
      )
      expect(reward.capstoneValue, a.id).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// 3. Charter
// ---------------------------------------------------------------------------

describe('balance charter', () => {
  /**
   * Principle 8 — repetition may never improve your expected result.
   *
   * This is the structural anti-grind guarantee and it is one inequality: a clutch-equivalent of
   * work is worth less as an achievement than the same clutch is worth *sold*. Achievement money
   * is also one-time while the market pays every time, so breeding for an achievement is strictly
   * dominated by breeding for the market. No count achievement can be a treadmill while this holds.
   *
   * **Saturation is not what is protecting this, and it was checked rather than assumed.**
   * `SATURATION_HALFLIFE_SALES` is 120, so ten of one morph — the most any entry here asks for —
   * costs 5.6% of price, and five costs 2.8%. The market's bound on compounding is real but it
   * engages an order of magnitude above the catalogue's volumes (at a sustained 48 sales a year of
   * one morph the price halves). What makes the volume ladder safe is that it is finite and each
   * rung pays once, plus the inequality below — not the market punishing you for climbing it.
   */
  it('never makes achievement money a better reason to breed than the market (principle 8)', () => {
    expect(VALUE_PER_CLUTCH_EQUIVALENT).toBeLessThan(ENTRY_CLUTCH_GROSS / 2)
  })

  /**
   * Principle 8, the same rule applied to the catalogue's shape rather than its constants.
   *
   * A count achievement on one morph stops at ten. Fifty or a hundred of a single morph would be
   * reachable only by repeating one pairing, and that is the volume at which saturation finally
   * does bite — 50 sold of one morph fetches 0.75 of base, 100 fetches 0.56 — so the achievement
   * would be the only remaining reason to do it. Ten is comfortably below where the market starts
   * arguing back, which is exactly where a cap belongs: the ladder ends before the treadmill
   * starts, rather than relying on the treadmill being unpleasant. The 50 and 100 rungs survive at
   * the per-species level, where they accrue from every project you run at once.
   */
  it('caps single-morph counts at ten (principle 8)', () => {
    for (const { a, leaf } of ALL_LEAVES) {
      if (leaf.kind !== 'atLeast' || !leaf.flag.startsWith('ach.trait.')) continue
      expect(leaf.value, `${a.id} asks for ${leaf.value} of one morph — that is a treadmill`).toBeLessThanOrEqual(
        10,
      )
    }
  })

  /** Principle 6 — a reward you cannot see in advance is a variable-ratio reward. */
  it('promises every reward before it is earned (principle 6)', () => {
    for (const a of ACHIEVEMENTS) {
      const reward = achievementReward(a)
      expect(reward.rewards.length, `${a.id} pays nothing at all`).toBeGreaterThan(0)
      expect(Number.isFinite(reward.money), a.id).toBe(true)
    }
  })

  /**
   * A joint constraint on `MONEY_SHARE_BY_RUNG` and on how many achievements sit in each rung; a
   * drift in either breaks it, which is the point.
   *
   * **This test used to claim, in this docstring, that "since a player meets the cheap ones first,
   * this is the same as falling over time." It is not, and the sentence cost two agents a
   * re-derivation.** A rung measures the size of one achievement. Ordering the catalogue by the
   * effort needed to reach each entry, money per quartile of the completion order is
   * 1930 / 3770 / 6020 / 8280 — it rises 4.3x. See `risesInAbsoluteMoneyOverTheCompletionOrder`
   * below, which asserts the truth so it cannot be mistaken again, and `reward.ts`'s header for
   * why the rising sum is the correct design and the rate is what carries the requirement.
   */
  it('pays less in aggregate at every step up the difficulty curve', () => {
    const money = new Map<number, number>()
    for (const a of ACHIEVEMENTS) {
      const rung = rungFor(clutchEquivalents(a.effort))
      money.set(rung, (money.get(rung) ?? 0) + achievementReward(a).money)
    }
    const populated = [...money.entries()].sort(([a], [b]) => a - b)
    expect(populated.length).toBeGreaterThan(2)
    for (let i = 1; i < populated.length; i++) {
      expect(
        populated[i]![1],
        `rung ${populated[i]![0]} pays more in aggregate than rung ${populated[i - 1]![0]}`,
      ).toBeLessThan(populated[i - 1]![1])
    }
    expect(REWARD_INVARIANTS.aggregateMoneyMustDecline).toBe(true)
  })

  it('declines the money share monotonically by rung', () => {
    for (let i = 1; i < MONEY_SHARE_BY_RUNG.length; i++) {
      expect(MONEY_SHARE_BY_RUNG[i]!).toBeLessThan(MONEY_SHARE_BY_RUNG[i - 1]!)
    }
  })

  /**
   * The truth the by-rung test above is routinely mistaken for, asserted so it stops being
   * mistakeable.
   *
   * Ordering by cumulative effort-to-reach (the supersedes chain — the honest proxy for "when"),
   * absolute money **rises** across the completion order. That is not a defect: a fixed sum matters
   * less the richer you get, so a literally declining sum would make late achievements feel like
   * nothing and break the other half of the requirement. What declines is the rate, which the two
   * tests above already pin.
   */
  it('rises in absolute money over the completion order, and that is the design', () => {
    const byId = new Map(ACHIEVEMENTS.map((a) => [a.id, a]))
    const reach = (id: string, seen = new Set<string>()): number => {
      const a = byId.get(id)
      if (!a || seen.has(id)) return 0
      seen.add(id)
      return clutchEquivalents(a.effort) + (a.supersedes ? reach(a.supersedes, seen) : 0)
    }
    const ordered = [...ACHIEVEMENTS].sort((x, y) => reach(x.id) - reach(y.id))
    const quartiles = [0, 0, 0, 0]
    ordered.forEach((a, i) => {
      quartiles[Math.min(3, Math.floor((i * 4) / ordered.length))]! += achievementReward(a).money
    })
    for (let i = 1; i < quartiles.length; i++) {
      expect(
        quartiles[i]!,
        `quartile ${i + 1} pays ${quartiles[i]} against ${quartiles[i - 1]} — if this ever inverts, ` +
          `re-read reward.ts's header before "fixing" it: a falling sum is not the requirement`,
      ).toBeGreaterThan(quartiles[i - 1]!)
    }
  })

  /**
   * Principle 8's load-bearing bound, and the one that makes "no achievement is ever a reason to
   * breed" checkable.
   *
   * For each entry: the achievement's money as a share of all the money that work could produce,
   * valuing the work at the *bottom* market tier — the conservative direction, since real breeding
   * pays up to 1069 per clutch-equivalent against entry tier's 486.
   */
  it('is never more than a fraction of the money available for the same work (principle 8)', () => {
    for (const a of ACHIEVEMENTS) {
      const ce = clutchEquivalents(a.effort)
      if (ce <= 0) continue
      const money = achievementReward(a).money
      const share = money / (money + ce * ENTRY_CLUTCH_GROSS)
      expect(
        share,
        `${a.id} is ${(share * 100).toFixed(1)}% of the money for its own work — at that share the ` +
          `achievement starts being the reason, which is what principle 8 forbids`,
      ).toBeLessThanOrEqual(REWARD_INVARIANTS.maxShareOfWorkMoney)
    }
  })

  /**
   * Bounds the granularity lever `reward.ts` documents: because the money share steps at rung
   * boundaries, a ladder cut into many small rungs pays more for the same work than one cut coarsely.
   * This does not fix it — it stops it widening unnoticed.
   */
  it('pays comparable rates for a ladder however finely it is cut', () => {
    const byId = new Map<string, Achievement>(ACHIEVEMENTS.map((a) => [a.id, a]))
    const superseded = new Set(
      ACHIEVEMENTS.map((a) => a.supersedes).filter((id): id is string => Boolean(id)),
    )
    const rates: { id: string; rate: number }[] = []
    for (const tail of ACHIEVEMENTS.filter((a) => a.supersedes && !superseded.has(a.id))) {
      let ce = 0
      let money = 0
      const seen = new Set<string>()
      for (let cur: string | undefined = tail.id; cur && !seen.has(cur); ) {
        seen.add(cur)
        const step: Achievement = byId.get(cur)!
        ce += clutchEquivalents(step.effort)
        money += achievementReward(step).money
        cur = step.supersedes
      }
      if (ce > 0) rates.push({ id: tail.id, rate: money / ce })
    }
    expect(rates.length).toBeGreaterThan(5)
    const best = rates.reduce((x, y) => (y.rate > x.rate ? y : x))
    const worst = rates.reduce((x, y) => (y.rate < x.rate ? y : x))
    expect(
      best.rate / worst.rate,
      `${best.id} pays ${best.rate.toFixed(0)}/CE and ${worst.id} pays ${worst.rate.toFixed(0)}/CE ` +
        `for the same kind of work — the gap is how finely each ladder happens to be cut`,
    ).toBeLessThanOrEqual(REWARD_INVARIANTS.ladderRateSpreadMax)
  })

  it('is a major source of early funding without replacing the opening balance', () => {
    const rung1 = ACHIEVEMENTS.filter((a) => rungFor(clutchEquivalents(a.effort)) === 1).reduce(
      (total, a) => total + achievementReward(a).money,
      0,
    )
    const ratio = rung1 / REWARD_INVARIANTS.startingMoney
    const [low, high] = REWARD_INVARIANTS.rung1MoneyOverStartingMoney
    expect(ratio).toBeGreaterThanOrEqual(low)
    expect(ratio).toBeLessThanOrEqual(high)
  })

  /** Principle 4 — achievements are *a* route to the best stock, never a shortcut past playing. */
  it('cannot carry a player to the top stock gate on reputation alone', () => {
    const reputation = ACHIEVEMENTS.reduce((total, a) => total + achievementReward(a).reputation, 0)
    const ratio = reputation / REWARD_INVARIANTS.tier4ReputationGate
    const [low, high] = REWARD_INVARIANTS.totalReputationOverTier4Gate
    expect(ratio).toBeGreaterThanOrEqual(low)
    expect(ratio).toBeLessThanOrEqual(high)
  })

  /**
   * Principle 7 — the rehab competes for capacity, never for your conscience.
   *
   * Two halves, and the second is the one that needed arithmetic. The mission has to be *worth*
   * achievements at all — so `sanctuary` is a full category. But those achievements must not turn
   * taking in an animal into an income strategy, and the quantity that decides it is **not**
   * upkeep. A resident is only about one money-unit per week net, so cash was never the real cost;
   * the real cost is the slot, and a slot-season spent on a resident is a pairing not made, worth
   * `ENTRY_CLUTCH_GROSS` gross. Every achievement that declares capacity pays well under that per
   * slot-season, so helping is never the profitable move — while never being the losing one either,
   * because the achievement exists at all.
   */
  it('gives the rehab its own achievements without paying for the residents (principle 7)', () => {
    expect(ACHIEVEMENTS.filter((a) => a.category === 'sanctuary').length).toBeGreaterThanOrEqual(8)

    // Every achievement anywhere in the catalogue that asks for capacity, not just the sanctuary
    // ones — an achievement in another category could subsidise the rehab just as easily.
    for (const a of ACHIEVEMENTS) {
      const slotSeasons = a.effort.reduce(
        (total, step) => total + (step.kind === 'capacity' ? step.slotSeasons : 0),
        0,
      )
      if (slotSeasons === 0) continue
      expect(
        achievementReward(a).money / slotSeasons,
        `${a.id} pays more per slot-season than the pairing that slot could have carried`,
      ).toBeLessThan(ENTRY_CLUTCH_GROSS)
      // And the tighter bound the current curve actually satisfies.
      expect(achievementReward(a).money / slotSeasons, a.id).toBeLessThanOrEqual(
        VALUE_PER_CLUTCH_EQUIVALENT,
      )
    }
  })

  /**
   * Principle 7 from the side the test above does not cover.
   *
   * That one bounds the rehab from *above*, which is right — pay more per slot-season than the
   * pairing that slot displaced and taking in animals becomes an income strategy. But nothing
   * bounded it from below, and the rehab is the one activity in the game with no market income of
   * its own (resident support very nearly covers resident care), so the achievement curve *is* the
   * rehab's income curve. A rehab commitment is denominated in slot-seasons, which carries large
   * clutch-equivalents, which lands in rungs 3-4 where the money share collapses — so the mission
   * drifts toward the bottom of the pay table by pure arithmetic, with nobody having decided it.
   *
   * It currently sits at 0.45 of the catalogue's overall rate, and that is deliberate rather than
   * neglected: the rehab is paid in **access** instead — the vet room, the quarantine wing, the
   * regional rescue network, the titles — at 0.60 grants per achievement, the joint highest of any
   * category, which is the currency a rehab player is actually short of. This floor is here so a
   * later edit cannot quietly starve it while every other test still passes.
   */
  it('never lets the mission drift to the bottom of the pay table (principle 7)', () => {
    let sanctuaryMoney = 0
    let sanctuaryCE = 0
    let totalMoney = 0
    let totalCE = 0
    let sanctuaryGrants = 0
    let sanctuaryCount = 0
    for (const a of ACHIEVEMENTS) {
      const ce = clutchEquivalents(a.effort)
      const money = achievementReward(a).money
      totalMoney += money
      totalCE += ce
      if (a.category !== 'sanctuary') continue
      sanctuaryMoney += money
      sanctuaryCE += ce
      sanctuaryGrants += (a.grants ?? []).length
      sanctuaryCount += 1
    }
    const fraction = sanctuaryMoney / sanctuaryCE / (totalMoney / totalCE)
    expect(
      fraction,
      `the sanctuary category pays ${(sanctuaryMoney / sanctuaryCE).toFixed(1)}/CE against the ` +
        `catalogue's ${(totalMoney / totalCE).toFixed(1)}/CE. Raising sanctuary money is the wrong ` +
        `fix — it would make the rehab an income strategy. Give it grants, or split its ladders finer.`,
    ).toBeGreaterThanOrEqual(REWARD_INVARIANTS.sanctuaryRateFloorFraction)

    // And the compensating half must actually be there, or the paragraph above is just an excuse.
    expect(sanctuaryGrants / sanctuaryCount, 'the rehab is paid in access, so the grants must exist').
      toBeGreaterThanOrEqual(0.5)
  })

  /** Principle 5 — nothing here compounds, because nothing here repeats. */
  it('has no repeatable income: the catalogue is finite and each entry pays once', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    // Each requirement is a threshold, never a rate — so there is no achievement that can be
    // earned twice, and therefore no achievement income that scales with anything.
    for (const { leaf } of ALL_LEAVES) {
      if (leaf.kind === 'atLeast') expect(leaf.value).toBeGreaterThan(0)
    }
  })

  /** The talent tree stays the interesting scarce thing; achievements top it up, not flood it. */
  it('grants only a handful of talent points across the whole catalogue', () => {
    const points = ACHIEVEMENTS.flatMap((a) => a.grants ?? []).reduce(
      (total, grant) => (grant.kind === 'talentPoint' ? total + grant.points : total),
      0,
    )
    expect(points).toBeGreaterThan(0)
    expect(points).toBeLessThanOrEqual(5)
  })

  /**
   * Rung 5 is deliberately empty, and the emptiness is the design.
   *
   * `RUNG_THRESHOLDS`' top entry is past the top of every published rarity band, so a single
   * achievement landing there would be sixty clutch-equivalents of work — more than any reward the
   * game has to give, and more than any one goal should ask for. Anything that big is a ladder.
   */
  it('puts nothing in rung 5: an achievement that big should have been a ladder', () => {
    for (const a of ACHIEVEMENTS) {
      expect(rungFor(clutchEquivalents(a.effort)), a.id).toBeLessThan(5)
    }
  })
})
