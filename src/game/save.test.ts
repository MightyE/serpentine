import { describe, expect, it } from 'vitest'
import { createGame } from './game'
import { deserializeGame, loadFromLocalStorage, saveToLocalStorage, serializeGame, type SaveStorage } from './save'
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

  it('refuses to load a save with an unsupported schema version', () => {
    const storage = fakeStorage()
    storage.setItem('serpentine:save', JSON.stringify({ schemaVersion: 999 }))
    expect(() => loadFromLocalStorage('serpentine:save', storage)).toThrow(/schema version/)
  })
})
