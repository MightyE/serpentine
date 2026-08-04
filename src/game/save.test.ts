import { describe, expect, it } from 'vitest'
import { createGame } from './game'
import {
  deserializeGame,
  loadFromLocalStorage,
  saveToLocalStorage,
  serializeGame,
  type SaveFile,
  type SaveStorage,
} from './save'
import { Session } from './session'
import { INCUBATION_WEEKS, PAIRING_RECEPTIVITY_WEEKS } from './tuning'
import { ballPython } from '../species/ballPython'
import { makeIndividual, wildTypeGenotype, withLoci } from '../species/testSupport/fixtures'

/** In-memory `Storage` fake — this suite runs under `environment: 'node'` (vite.config.ts),
 * so there is no jsdom-provided `localStorage` to rely on. */
function fakeStorage(): SaveStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
  }
}

/** Through `localStorage`'s only currency, so a field that cannot survive JSON fails here. */
function throughJson(save: SaveFile): SaveFile {
  return JSON.parse(JSON.stringify(save)) as SaveFile
}

/** A timed session with one clutch already incubating. */
function midIncubation(worldSeed: string): Session {
  const session = new Session({ worldSeed, gateMode: 'timed' })
  for (let i = 0; i < 40; i++) session.spawnRandom('ball-python')
  const residents = session.residents()
  const female = residents.find((r) => session.sexOf(r) === 'female')!
  const male = residents.find((r) => session.sexOf(r) === 'male')!
  session.breed(female.individual.id, male.individual.id)
  session.advance(PAIRING_RECEPTIVITY_WEEKS[1])
  return session
}

describe('save / load round trip', () => {
  it('loading with nothing saved yet returns null', () => {
    expect(loadFromLocalStorage('serpentine:save', fakeStorage())).toBeNull()
  })

  it('round-trips an empty game losslessly', () => {
    const game = createGame('world-seed-1', { startingBalance: 777 })
    const storage = fakeStorage()
    saveToLocalStorage(game, 'serpentine:save', storage)
    const loaded = loadFromLocalStorage('serpentine:save', storage)
    expect(loaded).not.toBeNull()
    expect(loaded!.worldSeed).toBe('world-seed-1')
    expect(loaded!.economy.balance()).toBe(777)
    expect(loaded!.roster.all()).toEqual([])
  })

  it('round-trips a populated game: roster, flags, care log, balance', () => {
    const game = createGame('world-seed-2', { startingBalance: 250 })
    game.economy.spend(50, 'test-purchase')
    game.flags.set('hasBredFirstClutch', true)
    game.flags.bump('clutchesHatched', 3)
    game.careLog['snake-1'] = 4

    const genotype = withLoci(wildTypeGenotype(ballPython, 'male'), {
      champagne: ['wild-type', 'champagne'],
    })
    const individual = makeIndividual(ballPython, genotype, 'snake')
    game.roster.add({ individual, name: 'Biscuit', acquiredTurn: 2, source: 'bred' })

    const storage = fakeStorage()
    saveToLocalStorage(game, 'serpentine:save', storage)
    const loaded = loadFromLocalStorage('serpentine:save', storage)!

    expect(loaded.economy.balance()).toBe(200)
    expect(loaded.flags.get('hasBredFirstClutch')).toBe(true)
    expect(loaded.flags.get('clutchesHatched')).toBe(3)
    expect(loaded.careLog['snake-1']).toBe(4)

    const restored = loaded.roster.get(individual.id)
    expect(restored).toBeDefined()
    expect(restored!.name).toBe('Biscuit')
    expect(restored!.acquiredTurn).toBe(2)
    expect(restored!.source).toBe('bred')
    expect(restored!.individual.genotype).toEqual(individual.genotype)
  })

  it('serializeGame / deserializeGame compose to the identity for a populated game', () => {
    const game = createGame('world-seed-3')
    game.flags.set('favouriteSpecies', 'ball-python')
    const individual = makeIndividual(ballPython, wildTypeGenotype(ballPython, 'female'), 'founder')
    game.roster.add({ individual, name: 'Noodle', acquiredTurn: 0, source: 'founder' })

    const roundTripped = deserializeGame(serializeGame(game))
    expect(serializeGame(roundTripped)).toEqual(serializeGame(game))
  })

  /**
   * The one that matters most in this file.
   *
   * A save that loses a pending clutch loses a pairing the player committed to eight weeks ago and
   * cannot get back — and a game that does that once is a game whose saves nobody trusts again.
   * So: save mid-incubation, reload, and check the eggs are still there, still due on the same
   * week, and still hatch into the same animals they would have without the reload.
   */
  it('preserves a clutch mid-incubation, down to the week it is due', () => {
    const session = midIncubation('mid-gestation')
    const incubating = session.pendingGates().filter((gate) => gate.kind === 'incubation')
    expect(incubating).toHaveLength(1)

    const resumed = new Session({ restore: throughJson(session.toSaveFile()), gateMode: 'timed' })

    expect(resumed.turn).toBe(session.turn)
    expect(resumed.pendingGates()).toEqual(session.pendingGates())
    expect(resumed.inFlight().map((row) => [row.label, row.band, row.remaining])).toEqual(
      session.inFlight().map((row) => [row.label, row.band, row.remaining]),
    )

    // And it hatches into exactly the clutch it would have hatched into unsaved: the plan carries
    // the seed, so reloading cannot re-roll anyone's genetics.
    session.advance(INCUBATION_WEEKS[1])
    resumed.advance(INCUBATION_WEEKS[1])
    const hatchlings = (s: Session) =>
      s.residents().filter((r) => r.source === 'bred').map((r) => [r.individual.id, r.name])
    expect(hatchlings(resumed)).toHaveLength(1)
    expect(hatchlings(resumed)).toEqual(hatchlings(session))
  })

  it('preserves a pairing that has not produced a clutch yet', () => {
    const session = new Session({ worldSeed: 'introduced', gateMode: 'timed' })
    for (let i = 0; i < 40; i++) session.spawnRandom('ball-python')
    const female = session.residents().find((r) => session.sexOf(r) === 'female')!
    const male = session.residents().find((r) => session.sexOf(r) === 'male')!
    session.breed(female.individual.id, male.individual.id)

    const resumed = new Session({ restore: throughJson(session.toSaveFile()), gateMode: 'timed' })
    expect(resumed.pendingGates().map((g) => g.kind)).toEqual(['receptivity'])
    // Still committed: the pair cannot be re-paired to anyone across the reload either.
    expect(resumed.previewPairing(female.individual.id, male.individual.id).check.ok).toBe(false)

    resumed.advance(PAIRING_RECEPTIVITY_WEEKS[1] + INCUBATION_WEEKS[1])
    expect(resumed.residents().some((r) => r.source === 'bred')).toBe(true)
  })

  it('preserves a hatchling still growing, and it is still too young to breed', () => {
    const session = midIncubation('growing')
    session.advance(INCUBATION_WEEKS[1])
    const baby = session.residents().find((r) => r.source === 'bred')!
    expect(session.isMature(baby)).toBe(false)

    const resumed = new Session({ restore: throughJson(session.toSaveFile()), gateMode: 'timed' })
    const restored = resumed.record(baby.individual.id)!
    expect(resumed.isMature(restored)).toBe(false)
    expect(resumed.maturityGateOf(baby.individual.id)).toEqual(session.maturityGateOf(baby.individual.id))
    expect(resumed.ageOf(restored)).toBeCloseTo(session.ageOf(baby), 12)
  })

  it('round-trips a game with nothing in flight', () => {
    const session = new Session({ worldSeed: 'quiet', gateMode: 'timed' })
    const resumed = new Session({ restore: throughJson(session.toSaveFile()) })
    expect(resumed.pendingGates()).toEqual([])
    expect(resumed.turn).toBe(session.turn)
  })

  it('loads a save written before gates existed as a game with nothing in flight', () => {
    const game = createGame('pre-gates')
    const resumed = new Session({ restore: serializeGame(game) })
    expect(resumed.pendingGates()).toEqual([])
    expect(resumed.inFlight()).toEqual([])
  })

  it('refuses to load a save with an unsupported schema version', () => {
    const storage = fakeStorage()
    storage.setItem('serpentine:save', JSON.stringify({ schemaVersion: 999 }))
    expect(() => loadFromLocalStorage('serpentine:save', storage)).toThrow(/schema version/)
  })
})
