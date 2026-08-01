import { describe, expect, it } from 'vitest'
import { breedPair, clutchSeed } from './breeding'
import { createGame } from './game'
import { ballPython } from '../species/ballPython'
import { ReferenceGeneticsEngine } from '../species/testSupport/referenceEngine'
import { makeIndividual, wildTypeGenotype, withLoci } from '../species/testSupport/fixtures'

const engine = new ReferenceGeneticsEngine()

describe('breedPair', () => {
  it('adds hatched offspring to the roster and emits clutch.hatched', () => {
    const game = createGame('seed-a')
    const mother = makeIndividual(ballPython, wildTypeGenotype(ballPython, 'female'), 'mother')
    const father = makeIndividual(ballPython, wildTypeGenotype(ballPython, 'male'), 'father')

    const events: unknown[] = []
    game.bus.on('clutch.hatched', (e) => events.push(e))

    const result = breedPair(
      engine,
      ballPython,
      { mother, father, clutchSize: 4, seed: clutchSeed(game.worldSeed, mother.id, father.id, 0) },
      game.roster,
      game.bus,
      game.flags,
      0,
    )

    expect(result.hatchedIds).toHaveLength(4)
    expect(result.unhatchedCount).toBe(0)
    expect(game.roster.all()).toHaveLength(4)
    expect(events).toEqual([{ motherId: mother.id, fatherId: father.id, hatchedCount: 4, unhatchedCount: 0 }])
    expect(game.flags.get('clutchesHatched')).toBe(1)
  })

  it('emits egg.notViable and never adds a non-viable egg to the roster', () => {
    const game = createGame('seed-b')
    const mother = makeIndividual(
      ballPython,
      withLoci(wildTypeGenotype(ballPython, 'female'), { champagne: ['champagne', 'champagne'] }),
      'mother',
    )
    const father = makeIndividual(
      ballPython,
      withLoci(wildTypeGenotype(ballPython, 'male'), { champagne: ['champagne', 'champagne'] }),
      'father',
    )

    const notViable: unknown[] = []
    game.bus.on('egg.notViable', (e) => notViable.push(e))

    const result = breedPair(
      engine,
      ballPython,
      { mother, father, clutchSize: 6, seed: clutchSeed(game.worldSeed, mother.id, father.id, 0) },
      game.roster,
      game.bus,
      game.flags,
      0,
    )

    // champagne/champagne x champagne/champagne -> every egg is homozygous, none hatch.
    expect(result.hatchedIds).toHaveLength(0)
    expect(result.unhatchedCount).toBe(6)
    expect(notViable).toHaveLength(6)
    for (const e of notViable as { ruleId: string }[]) {
      expect(e.ruleId).toBe('super-champagne-lethal')
    }
    expect(game.roster.all()).toHaveLength(0)
  })

  it('clutchSeed follows the documented convention and is stable', () => {
    expect(clutchSeed('world', 'mom', 'dad', 2)).toBe('world:clutch:mom:dad:2')
  })
})
