import { describe, expect, it } from 'vitest'
import { createGame } from './game'
import { buySnake, estimateValue, sellSnake, type ShopListing } from './market'
import { ballPython } from '../species/ballPython'
import { ReferenceGeneticsEngine } from '../species/testSupport/referenceEngine'
import { makeIndividual, wildTypeGenotype, withLoci } from '../species/testSupport/fixtures'

const engine = new ReferenceGeneticsEngine()

describe('market: estimateValue', () => {
  it('a plain wild-type snake is worth the base price', () => {
    const phenotype = engine.express(makeIndividual(ballPython, wildTypeGenotype(ballPython, 'male')), ballPython)
    expect(estimateValue(phenotype)).toBe(60)
  })

  it('a snake carrying named traits is worth more', () => {
    const genotype = withLoci(wildTypeGenotype(ballPython, 'male'), { pastel: ['pastel', 'pastel'] })
    const phenotype = engine.express(makeIndividual(ballPython, genotype), ballPython)
    expect(estimateValue(phenotype)).toBeGreaterThan(60)
  })
})

describe('market: selling', () => {
  it('removes the snake from the roster and adds its value to the balance', () => {
    const game = createGame('seed', { startingBalance: 100 })
    const individual = makeIndividual(ballPython, wildTypeGenotype(ballPython, 'male'))
    game.roster.add({ individual, name: 'For Sale', acquiredTurn: 0, source: 'founder' })

    const price = sellSnake(individual.id, game.roster, game.economy, game.bus, engine, ballPython)

    expect(price).toBe(60)
    expect(game.economy.balance()).toBe(160)
    expect(game.roster.get(individual.id)).toBeUndefined()
  })

  it('throws for an id not in the roster', () => {
    const game = createGame('seed')
    expect(() => sellSnake('nope', game.roster, game.economy, game.bus, engine, ballPython)).toThrow()
  })
})

describe('market: buying', () => {
  it('succeeds and adds the snake when funds are sufficient', () => {
    const game = createGame('seed', { startingBalance: 100 })
    const listing: ShopListing = {
      individual: makeIndividual(ballPython, wildTypeGenotype(ballPython, 'female'), 'shop'),
      price: 60,
    }
    const bought = buySnake(listing, game.roster, game.economy, game.bus, 0, 'Newcomer')
    expect(bought).toBe(true)
    expect(game.economy.balance()).toBe(40)
    expect(game.roster.get(listing.individual.id)?.name).toBe('Newcomer')
  })

  it('fails and changes nothing when funds are insufficient', () => {
    const game = createGame('seed', { startingBalance: 10 })
    const listing: ShopListing = {
      individual: makeIndividual(ballPython, wildTypeGenotype(ballPython, 'female'), 'shop'),
      price: 60,
    }
    const bought = buySnake(listing, game.roster, game.economy, game.bus, 0, 'Newcomer')
    expect(bought).toBe(false)
    expect(game.economy.balance()).toBe(10)
    expect(game.roster.get(listing.individual.id)).toBeUndefined()
  })
})
