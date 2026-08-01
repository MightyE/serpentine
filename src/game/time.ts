/** Turn/season advancement. Deliberately just a counter — pacing decisions belong elsewhere. */
import type { EventBus, FlagSet } from './seams'

declare module './seams' {
  interface GameEventMap {
    'turn.advanced': { turn: number }
  }
}

export function advanceTurn(flags: FlagSet, bus: EventBus): number {
  const turn = flags.bump('turn')
  bus.emit('turn.advanced', { turn })
  return turn
}

export function currentTurn(flags: FlagSet): number {
  const value = flags.get('turn')
  return typeof value === 'number' ? value : 0
}
