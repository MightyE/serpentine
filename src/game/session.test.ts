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
import {
  INCUBATION_WEEKS,
  MAX_DECISIONS_PER_GENERATION,
  MIN_TURNS_PER_DECISION,
  PAIRING_RECEPTIVITY_WEEKS,
  WEEKS_TO_MATURITY_MALE,
} from './tuning'

/**
 * A session with the gates collapsed to zero turns.
 *
 * Used by every test below that is about *genetics* rather than about pacing, so that `breed()`
 * hands back the clutch it produced instead of a promise fifteen weeks out. The gates are the
 * subject of exactly one describe block, and it builds its own timed sessions.
 */
function instantSession(worldSeed = 'test'): Session {
  return new Session({ worldSeed, gateMode: 'instant' })
}

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
    const session = instantSession()
    const record = session.spawnRandom('ball-python')

    expect(session.residents()).toHaveLength(1)
    expect(session.phenotype(record).label.length).toBeGreaterThan(0)
    expect(session.vigorOf(record)).toBeGreaterThan(0)
    expect(session.valueOf(record)).toBeGreaterThan(0)
  })

  it('refuses a same-sex pairing with a reason a player can act on', () => {
    const session = instantSession()
    for (let i = 0; i < 20; i++) session.spawnRandom('ball-python')
    const females = session.residents().filter((r) => session.sexOf(r) === 'female')
    const preview = session.previewPairing(females[0]!.individual.id, females[1]!.individual.id)

    expect(preview.check.ok).toBe(false)
    expect(preview.check.reason).toMatch(/female/i)
  })

  it('refuses a cross-species pairing with a reason', () => {
    const session = instantSession()
    const a = session.spawnRandom('ball-python')
    const b = session.spawnRandom('corn-snake')
    const preview = session.previewPairing(a.individual.id, b.individual.id)

    expect(preview.check.ok).toBe(false)
    expect(preview.check.reason).toMatch(/different species/i)
  })

  it('shows the punnett prediction before anything is committed', () => {
    const session = instantSession()
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
    const session = instantSession()
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
    const session = instantSession()
    const { female, male } = seededPair(session)
    const preview = session.previewPairing(female.individual.id, male.individual.id)
    const baby = session.breed(female.individual.id, male.individual.id)[0]!

    expect(baby.inbreeding).toBeCloseTo(preview.relatedness, 12)
  })

  it('inbreeding rises when a hatchling is bred back to its parent', () => {
    const session = instantSession()
    const { female, male } = seededPair(session)
    const baby = session.breed(female.individual.id, male.individual.id)[0]!
    const parent = session.sexOf(baby) === 'female' ? male : female

    const preview = session.previewPairing(baby.individual.id, parent.individual.id)
    expect(preview.check.ok).toBe(true)
    expect(preview.relatedness).toBeGreaterThan(0)
  })

  it('sells a snake, and the market pays less for the next of that morph', () => {
    // Measured on **one** animal, before and after a sale of its morph, rather than by comparing
    // two animals. Since pricing gained a proof term and a trait-strength premium, two animals
    // that share a phenotype key are no longer interchangeable — the key records which render
    // stages ran, not how strongly a polygenic trait came out, so one of them can genuinely be
    // worth more than the other. Holding the animal fixed is what isolates saturation.
    const session = instantSession()
    for (let i = 0; i < 30; i++) session.spawnRandom('ball-python')
    const byKey = new Map<string, string[]>()
    for (const r of session.residents()) {
      const key = session.speciesOf(r).playable.phenotypeKey(session.phenotype(r))
      byKey.set(key, [...(byKey.get(key) ?? []), r.individual.id])
    }
    const pair = [...byKey.values()].find((ids) => ids.length >= 2)!
    const held = session.residents().find((r) => r.individual.id === pair[1]!)!

    const asking = session.valueOf(held)
    const first = session.sell(pair[0]!)
    expect(session.valueOf(held)).toBeLessThan(asking)

    const second = session.sell(pair[1]!)
    expect(first).toBeGreaterThan(0)
    expect(session.money).toBe(3000 + first + second)
  })

  it('shows a bounded, visible incubation range — never an unknown', () => {
    const session = instantSession()
    const { female, male } = seededPair(session)
    const preview = session.previewPairing(female.individual.id, male.individual.id)

    expect(preview.incubation).toMatch(/^\d+(–\d+)? weeks?$/)
    expect(preview.receptivity).toMatch(/^\d+(–\d+)? weeks?$/)
  })
})

describe('session: knowledge', () => {
  it('a hatchling out of two carriers is a possible het, with its arithmetic legible', () => {
    const session = instantSession()
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
    const session = instantSession()
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
    while (session.pendingGates().some((g) => g.kind !== 'maturity')) {
      session.advanceToNextDecision()
      decisions++
      expect(decisions).toBeLessThanOrEqual(MAX_DECISIONS_PER_GENERATION)
    }
    expect(decisions).toBeLessThanOrEqual(MAX_DECISIONS_PER_GENERATION)
  })

  it('never lands "next decision" on a turn with nothing to decide', () => {
    // The whole promise of the control: every press arrives at something. A press that puts you
    // a week short of the hatch has charged a click for nothing.
    const session = new Session({ worldSeed: 'test', gateMode: 'timed' })
    const { female, male } = seededPair(session)
    session.breed(female.individual.id, male.individual.id)

    let presses = 0
    while (session.pendingGates().length > 0 && presses < 10) {
      const arrivals: string[] = []
      const stops = [
        session.state.bus.on('clutch.laid', () => arrivals.push('laid')),
        session.state.bus.on('clutch.hatched', () => arrivals.push('hatched')),
        session.state.bus.on('snake.matured', () => arrivals.push('matured')),
      ]
      session.advanceToNextDecision()
      for (const stop of stops) stop()
      presses++
      expect(arrivals.length).toBeGreaterThan(0)
    }
    // Pairing, clutch laid, hatch, and each hatchling growing up: every press landed on one.
    expect(presses).toBeGreaterThanOrEqual(3)
  })

  it('never reads a wall clock', () => {
    // The whole point of turn-based: time only moves when the player moves it.
    const session = instantSession()
    const turn = session.turn
    expect(session.turn).toBe(turn)
  })
})

describe('session: the gates are real', () => {
  const timed = (seed = 'gates') => new Session({ worldSeed: seed, gateMode: 'timed' })

  it('takes the pairing gate and then the incubation gate, both inside their declared bands', () => {
    const session = timed()
    const { female, male } = seededPair(session)

    expect(session.breed(female.individual.id, male.individual.id)).toHaveLength(0)

    let laidOn: number | undefined
    let hatchedOn: number | undefined
    session.state.bus.on('clutch.laid', () => (laidOn = session.turn))
    session.state.bus.on('clutch.hatched', () => (hatchedOn = session.turn))

    const start = session.turn
    for (let week = 0; week < 40 && hatchedOn === undefined; week++) session.advance(1)

    expect(laidOn).toBeDefined()
    expect(hatchedOn).toBeDefined()
    const receptivity = laidOn! - start
    const incubation = hatchedOn! - laidOn!
    expect(receptivity).toBeGreaterThanOrEqual(PAIRING_RECEPTIVITY_WEEKS[0])
    expect(receptivity).toBeLessThanOrEqual(PAIRING_RECEPTIVITY_WEEKS[1])
    expect(incubation).toBeGreaterThanOrEqual(INCUBATION_WEEKS[0])
    expect(incubation).toBeLessThanOrEqual(INCUBATION_WEEKS[1])
  })

  it('advancing in one jump lands in the same state as advancing week by week', () => {
    const jump = timed('same')
    const step = timed('same')
    for (const session of [jump, step]) {
      const { female, male } = seededPair(session)
      session.breed(female.individual.id, male.individual.id)
    }
    jump.advance(20)
    for (let i = 0; i < 20; i++) step.advance(1)

    expect(jump.turn).toBe(step.turn)
    expect(jump.residents().map((r) => r.individual.id)).toEqual(
      step.residents().map((r) => r.individual.id),
    )
    expect(jump.pendingGates()).toEqual(step.pendingGates())
  })

  it('keeps a hatchling out of the breeding pool until it has grown, and says how long', () => {
    const session = timed()
    const { female, male } = seededPair(session)
    session.breed(female.individual.id, male.individual.id)
    session.advance(PAIRING_RECEPTIVITY_WEEKS[1] + INCUBATION_WEEKS[1])

    const baby = session.residents().find((r) => r.source === 'bred')!
    expect(session.isMature(baby)).toBe(false)

    const parent = session.sexOf(baby) === 'female' ? male : female
    const refusal = session.previewPairing(baby.individual.id, parent.individual.id)
    expect(refusal.check.ok).toBe(false)
    expect(refusal.check.reason).toMatch(/still growing/)
    // Never `???` — the refusal carries the wait, in weeks.
    expect(refusal.check.reason).toMatch(/\d+ weeks?/)

    session.advance(WEEKS_TO_MATURITY_MALE[1] + 1)
    expect(session.isMature(session.record(baby.individual.id)!)).toBe(true)
  })

  it('shows every wait as a range plus a countdown, and never as an unknown', () => {
    const session = timed()
    const { female, male } = seededPair(session)
    session.breed(female.individual.id, male.individual.id)

    const rows = session.inFlight()
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.band).toMatch(/^\d+(–\d+)? weeks?$/)
      expect(row.remaining).toMatch(/^(\d+ weeks?|this week)$/)
      expect(row.subject).not.toMatch(/\?/)
    }
  })

  it('does not lose a clutch when the sire is sold mid-incubation', () => {
    const session = timed()
    const { female, male } = seededPair(session)
    session.breed(female.individual.id, male.individual.id)
    session.advance(PAIRING_RECEPTIVITY_WEEKS[1])
    expect(session.pendingGates().some((g) => g.kind === 'incubation')).toBe(true)

    session.sell(male.individual.id)
    session.advance(INCUBATION_WEEKS[1])

    expect(session.residents().some((r) => r.source === 'bred')).toBe(true)
  })
})

describe('session: cheat mode skips gates', () => {
  it('resolves a pending clutch rather than throwing it away', () => {
    const session = new Session({ worldSeed: 'cheat', gateMode: 'timed' })
    const { female, male } = seededPair(session)
    session.breed(female.individual.id, male.individual.id)

    // Twice: once for the pairing, once for the incubation it opens.
    expect(session.resolveAllGates()).toBeGreaterThan(0)
    session.resolveAllGates()

    expect(session.residents().some((r) => r.source === 'bred')).toBe(true)
    expect(session.turn).toBe(0)
  })

  it('skips only the next wait, leaving the rest ticking', () => {
    const session = new Session({ worldSeed: 'cheat-one', gateMode: 'timed' })
    const { female, male } = seededPair(session)
    session.breed(female.individual.id, male.individual.id)
    session.resolveNextGate()

    const pending = session.pendingGates()
    expect(pending).toHaveLength(1)
    expect(pending[0]!.kind).toBe('incubation')
  })

  it('turning the waiting off settles what is already in flight', () => {
    const session = new Session({ worldSeed: 'cheat-off', gateMode: 'timed' })
    const { female, male } = seededPair(session)
    session.breed(female.individual.id, male.individual.id)

    session.setGateMode('instant')

    expect(session.pendingGates()).toHaveLength(0)
    expect(session.residents().some((r) => r.source === 'bred')).toBe(true)
  })
})
