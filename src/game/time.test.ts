import { describe, expect, it } from 'vitest'
import { createGame } from './game'
import { advanceTurn, currentTurn } from './time'

describe('time', () => {
  it('starts at turn 0 and advances by 1 each call', () => {
    const game = createGame('seed')
    expect(currentTurn(game.flags)).toBe(0)
    expect(advanceTurn(game.flags, game.bus)).toBe(1)
    expect(advanceTurn(game.flags, game.bus)).toBe(2)
    expect(currentTurn(game.flags)).toBe(2)
  })

  it('emits turn.advanced', () => {
    const game = createGame('seed')
    const events: unknown[] = []
    game.bus.on('turn.advanced', (e) => events.push(e))
    advanceTurn(game.flags, game.bus)
    expect(events).toEqual([{ turn: 1 }])
  })
})
