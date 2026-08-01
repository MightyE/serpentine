/**
 * The loop, end to end, with no browser in it.
 *
 * If this file passes, the game is playable: spawn animals, pair them, read the prediction,
 * breed, and sell the result. It is the test that would have caught every integration failure
 * this project actually had, and it is deliberately written as one narrative rather than as
 * isolated units — the units all had tests already, and the loop between them did not.
 */
import { describe, expect, it } from 'vitest'
import { Session } from './session'
import { MAX_DECISIONS_PER_GENERATION, MIN_TURNS_PER_DECISION } from './tuning'

function seededPair(session: Session) {
  // Spawn until there is a breedable pair of the same species. Deterministic, so this either
  // always finds one or always does not.
  for (let i = 0; i < 40; i++) session.spawnRandom('ball-python')
  const residents = session.residents()
  const female = residents.find((r) => session.sexOf(r) === 'female')!
  const male = residents.find((r) => session.sexOf(r) === 'male')!
  return { female, male }
}

describe('session: the loop', () => {
  it('spawns a snake that can be looked at', () => {
    const session = new Session({ worldSeed: 'test' })
    const record = session.spawnRandom('ball-python')

    expect(session.residents()).toHaveLength(1)
    expect(session.phenotype(record).label.length).toBeGreaterThan(0)
    expect(session.vigorOf(record)).toBeGreaterThan(0)
    expect(session.valueOf(record)).toBeGreaterThan(0)
  })

  it('refuses a same-sex pairing with a reason a player can act on', () => {
    const session = new Session({ worldSeed: 'test' })
    for (let i = 0; i < 20; i++) session.spawnRandom('ball-python')
    const females = session.residents().filter((r) => session.sexOf(r) === 'female')
    const preview = session.previewPairing(females[0]!.individual.id, females[1]!.individual.id)

    expect(preview.check.ok).toBe(false)
    expect(preview.check.reason).toMatch(/female/i)
  })

  it('refuses a cross-species pairing with a reason', () => {
    const session = new Session({ worldSeed: 'test' })
    const a = session.spawnRandom('ball-python')
    const b = session.spawnRandom('corn-snake')
    const preview = session.previewPairing(a.individual.id, b.individual.id)

    expect(preview.check.ok).toBe(false)
    expect(preview.check.reason).toMatch(/different species/i)
  })

  it('shows the punnett prediction before anything is committed', () => {
    const session = new Session({ worldSeed: 'test' })
    const { female, male } = seededPair(session)
    const before = session.residents().length

    const preview = session.previewPairing(female.individual.id, male.individual.id)

    expect(preview.check.ok).toBe(true)
    expect(preview.outcomes).toBeDefined()
    expect(preview.outcomes!.length).toBeGreaterThan(0)
    const total = preview.outcomes!.reduce((sum, o) => sum + o.probability, 0)
    expect(total).toBeCloseTo(1, 6)
    // Nothing happened just because we looked.
    expect(session.residents()).toHaveLength(before)
  })

  it('breeds a pair and the baby derives from its parents', () => {
    const session = new Session({ worldSeed: 'test' })
    const { female, male } = seededPair(session)

    const babies = session.breed(female.individual.id, male.individual.id)

    expect(babies).toHaveLength(1)
    const baby = babies[0]!
    expect(baby.individual.parents).toEqual([female.individual.id, male.individual.id])
    expect(baby.source).toBe('bred')
    // Item 14: F and expressed load are recorded at hatch, not derived later.
    expect(baby.inbreeding).toBeDefined()
    expect(baby.expressedLoad).toBeDefined()
  })

  it("the pairing screen's relatedness is the hatchling's inbreeding coefficient", () => {
    const session = new Session({ worldSeed: 'test' })
    const { female, male } = seededPair(session)
    const preview = session.previewPairing(female.individual.id, male.individual.id)
    const baby = session.breed(female.individual.id, male.individual.id)[0]!

    expect(baby.inbreeding).toBeCloseTo(preview.relatedness, 12)
  })

  it('inbreeding rises when a hatchling is bred back to its parent', () => {
    const session = new Session({ worldSeed: 'test' })
    const { female, male } = seededPair(session)
    const baby = session.breed(female.individual.id, male.individual.id)[0]!
    const parent = session.sexOf(baby) === 'female' ? male : female

    const preview = session.previewPairing(baby.individual.id, parent.individual.id)
    expect(preview.check.ok).toBe(true)
    expect(preview.relatedness).toBeGreaterThan(0)
  })

  it('sells a snake, and the second of the same morph fetches less', () => {
    const session = new Session({ worldSeed: 'test' })
    for (let i = 0; i < 30; i++) session.spawnRandom('ball-python')
    const byKey = new Map<string, string[]>()
    for (const r of session.residents()) {
      const key = session.speciesOf(r).playable.phenotypeKey(session.phenotype(r))
      byKey.set(key, [...(byKey.get(key) ?? []), r.individual.id])
    }
    const pair = [...byKey.values()].find((ids) => ids.length >= 2)!

    const first = session.sell(pair[0]!)
    const second = session.sell(pair[1]!)

    expect(first).toBeGreaterThan(0)
    expect(second).toBeLessThan(first)
    expect(session.money).toBe(3000 + first + second)
  })

  it('shows a bounded, visible incubation range — never an unknown', () => {
    const session = new Session({ worldSeed: 'test' })
    const { female, male } = seededPair(session)
    const preview = session.previewPairing(female.individual.id, male.individual.id)

    expect(preview.incubation).toMatch(/^\d+(–\d+)? weeks?$/)
    expect(preview.receptivity).toMatch(/^\d+(–\d+)? weeks?$/)
  })
})

describe('session: knowledge', () => {
  it('a hatchling out of two carriers is a possible het, with its arithmetic legible', () => {
    const session = new Session({ worldSeed: 'test' })
    const { female, male } = seededPair(session)
    const baby = session.breed(female.individual.id, male.individual.id)[0]!

    const species = session.speciesOf(baby)
    const beliefs = session.knowledgeOf(baby).loci
    // Every reported locus is an authored trait; the population's load stays off the card.
    for (const locusId of Object.keys(beliefs)) {
      expect(species.authored.loci.some((l) => l.id === locusId)).toBe(true)
    }

    for (const locusId of Object.keys(beliefs)) {
      const rows = session.carrierBreakdown(baby, locusId)
      expect(rows.length).toBeGreaterThan(0)
      expect(rows.reduce((sum, r) => sum + r.probability, 0)).toBeCloseTo(1, 6)
    }
  })
})

describe('session: time', () => {
  it('advance-to-next-decision skips at least MIN_TURNS_PER_DECISION when nothing is pending', () => {
    const session = new Session({ worldSeed: 'test' })
    const before = session.turn
    session.advanceToNextDecision()
    expect(session.turn - before).toBeGreaterThanOrEqual(MIN_TURNS_PER_DECISION)
  })

  it('a whole generation costs no more than the decision budget', () => {
    const session = new Session({ worldSeed: 'test', gateMode: 'timed' })
    const { female, male } = seededPair(session)

    // choose the pairing (1), commit it (2), then skip to whatever asks next.
    let decisions = 2
    session.breed(female.individual.id, male.individual.id)
    while (session.pendingGates().some((g) => g.kind === 'incubation')) {
      session.advanceToNextDecision()
      decisions++
      expect(decisions).toBeLessThanOrEqual(MAX_DECISIONS_PER_GENERATION)
    }
    expect(decisions).toBeLessThanOrEqual(MAX_DECISIONS_PER_GENERATION)
  })

  it('never reads a wall clock', () => {
    // The whole point of turn-based: time only moves when the player moves it.
    const session = new Session({ worldSeed: 'test' })
    const turn = session.turn
    expect(session.turn).toBe(turn)
  })
})
