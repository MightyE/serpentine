import { describe, expect, it } from 'vitest'
import { createGame } from './game'
import {
  buySnake,
  estimateValue,
  rarityTierOf,
  recordSale,
  sellSnake,
  unitsAbsorbed,
  type SaturationLedger,
  type ShopListing,
} from './market'
import { ballPython } from '../species/ballPython'
import { ReferenceGeneticsEngine } from '../species/testSupport/referenceEngine'
import { makeIndividual, wildTypeGenotype, withLoci } from '../species/testSupport/fixtures'
import {
  BASE_PRICE_BY_TIER,
  MARKET_PRICE_FLOOR_FRACTION,
  SATURATION_HALFLIFE_SALES,
  SATURATION_RECOVERY_PER_YEAR,
  VIGOR_PRICE_MULTIPLIER_MAX,
  VIGOR_PRICE_MULTIPLIER_MIN,
  WEEKS_PER_YEAR,
} from './tuning'

const engine = new ReferenceGeneticsEngine()

const wildType = (sex: 'male' | 'female' = 'male') =>
  engine.express(makeIndividual(ballPython, wildTypeGenotype(ballPython, sex)), ballPython)

const pastel = () =>
  engine.express(
    makeIndividual(ballPython, withLoci(wildTypeGenotype(ballPython, 'male'), { pastel: ['pastel', 'pastel'] })),
    ballPython,
  )

describe('market: estimateValue', () => {
  it('prices a plain wild-type snake off the tier-1 base', () => {
    expect(estimateValue(wildType(), { vigor: 1 })).toBe(
      Math.round(BASE_PRICE_BY_TIER[0]! * VIGOR_PRICE_MULTIPLIER_MAX),
    )
  })

  it('a snake carrying named traits reads as a higher tier and is worth more', () => {
    expect(rarityTierOf(pastel())).toBeGreaterThan(rarityTierOf(wildType()))
    expect(estimateValue(pastel())).toBeGreaterThan(estimateValue(wildType()))
  })

  it('saturation halves the price after SATURATION_HALFLIFE_SALES have been absorbed', () => {
    const fresh = estimateValue(pastel(), { unitsAlreadySold: 0 })
    const flooded = estimateValue(pastel(), { unitsAlreadySold: SATURATION_HALFLIFE_SALES })
    expect(flooded).toBeCloseTo(fresh / 2, -1)
  })

  it('never falls below the floor, however flooded the market gets', () => {
    const tier = rarityTierOf(pastel())
    const floor = BASE_PRICE_BY_TIER[tier - 1]! * MARKET_PRICE_FLOOR_FRACTION * VIGOR_PRICE_MULTIPLIER_MIN
    expect(estimateValue(pastel(), { unitsAlreadySold: 100_000, vigor: 0 })).toBeGreaterThanOrEqual(
      Math.round(floor),
    )
  })

  it('a low-vigor animal of the same morph is worth less than a high-vigor one', () => {
    const healthy = estimateValue(pastel(), { vigor: 1 })
    const linebred = estimateValue(pastel(), { vigor: 0 })
    expect(linebred).toBeLessThan(healthy)
    expect(linebred / healthy).toBeCloseTo(VIGOR_PRICE_MULTIPLIER_MIN / VIGOR_PRICE_MULTIPLIER_MAX, 1)
  })
})

describe('market: saturation ledger', () => {
  it('counts each sale of a phenotype', () => {
    const ledger: SaturationLedger = {}
    recordSale(ledger, 'key', 0)
    recordSale(ledger, 'key', 0)
    expect(unitsAbsorbed(ledger, 'key', 0)).toBe(2)
    expect(unitsAbsorbed(ledger, 'other', 0)).toBe(0)
  })

  it('recovers SATURATION_RECOVERY_PER_YEAR of its saturation each year', () => {
    const ledger: SaturationLedger = {}
    recordSale(ledger, 'key', 0)
    expect(unitsAbsorbed(ledger, 'key', WEEKS_PER_YEAR)).toBeCloseTo(1 - SATURATION_RECOVERY_PER_YEAR, 6)
  })
})

describe('market: selling', () => {
  it('removes the snake from the roster and adds its value to the balance', () => {
    const game = createGame('seed', { startingBalance: 100 })
    const individual = makeIndividual(ballPython, wildTypeGenotype(ballPython, 'male'))
    game.roster.add({ individual, name: 'For Sale', acquiredTurn: 0, source: 'founder' })

    const price = sellSnake(individual.id, game.roster, game.economy, game.bus, engine, ballPython)

    expect(price).toBe(estimateValue(wildType()))
    expect(game.economy.balance()).toBe(100 + price)
    expect(game.roster.get(individual.id)).toBeUndefined()
  })

  it('records the sale against the market, so the next one of the same morph is worth less', () => {
    const ledger: SaturationLedger = {}
    const game = createGame('seed', { startingBalance: 0 })
    const ids = ['a', 'b'].map((suffix) => {
      const individual = makeIndividual(
        ballPython,
        withLoci(wildTypeGenotype(ballPython, 'male'), { pastel: ['pastel', 'pastel'] }),
        suffix,
      )
      game.roster.add({ individual, name: `Pastel ${suffix}`, acquiredTurn: 0, source: 'founder' })
      return individual.id
    })

    const opts = { ledger, turn: 0 }
    const first = sellSnake(ids[0]!, game.roster, game.economy, game.bus, engine, ballPython, opts)
    const second = sellSnake(ids[1]!, game.roster, game.economy, game.bus, engine, ballPython, opts)

    expect(second).toBeLessThan(first)
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
