import { describe, expect, it } from 'vitest'
import { createGame } from './game'
import { giveCare, needsExtraCare, residentsNeedingCare } from './rehab'
import { ballPython } from '../species/ballPython'
import { ReferenceGeneticsEngine } from '../species/testSupport/referenceEngine'
import { makeIndividual, wildTypeGenotype, withLoci } from '../species/testSupport/fixtures'

const engine = new ReferenceGeneticsEngine()
const speciesById = { 'ball-python': ballPython }

describe('rehab: needs-extra-care', () => {
  it('a plain wild-type snake needs no extra care', () => {
    const record = { individual: makeIndividual(ballPython, wildTypeGenotype(ballPython, 'male')), name: 'Wild', acquiredTurn: 0, source: 'founder' as const }
    expect(needsExtraCare(record, engine, ballPython)).toBe(false)
  })

  it('a champagne heterozygote needs extra care (documented wobble-like signs)', () => {
    const genotype = withLoci(wildTypeGenotype(ballPython, 'male'), { champagne: ['wild-type', 'champagne'] })
    const record = { individual: makeIndividual(ballPython, genotype), name: 'Fizz', acquiredTurn: 0, source: 'founder' as const }
    expect(needsExtraCare(record, engine, ballPython)).toBe(true)
  })

  it('residentsNeedingCare finds exactly the flagged residents in a mixed roster', () => {
    const game = createGame('seed')
    const normal = makeIndividual(ballPython, wildTypeGenotype(ballPython, 'male'), 'normal')
    const champagne = makeIndividual(
      ballPython,
      withLoci(wildTypeGenotype(ballPython, 'female'), { champagne: ['wild-type', 'champagne'] }),
      'champagne',
    )
    game.roster.add({ individual: normal, name: 'Normal', acquiredTurn: 0, source: 'founder' })
    game.roster.add({ individual: champagne, name: 'Champagne', acquiredTurn: 0, source: 'founder' })

    const flagged = residentsNeedingCare(game.roster, engine, speciesById)
    expect(flagged.map((r) => r.individual.id)).toEqual([champagne.id])
  })
})

describe('rehab: giving care', () => {
  it('accumulates a per-individual count and bumps the global flag', () => {
    const game = createGame('seed')
    expect(giveCare('snake-1', game.careLog, game.flags, game.bus)).toBe(1)
    expect(giveCare('snake-1', game.careLog, game.flags, game.bus)).toBe(2)
    expect(giveCare('snake-2', game.careLog, game.flags, game.bus)).toBe(1)
    expect(game.careLog['snake-1']).toBe(2)
    expect(game.flags.get('totalCareGiven')).toBe(3)
  })

  it('emits snake.comforted', () => {
    const game = createGame('seed')
    const events: unknown[] = []
    game.bus.on('snake.comforted', (e) => events.push(e))
    giveCare('snake-1', game.careLog, game.flags, game.bus)
    expect(events).toEqual([{ individualId: 'snake-1', totalCareGiven: 1 }])
  })
})
