/**
 * Concrete `EventBus` (the interface is `game/seams.ts`, the architect's contract — this file
 * is the implementation the seam asks for, not a change to it).
 */
import type { EventBus, GameEventMap, GameEventType, Unsubscribe } from './seams'

export function createEventBus(): EventBus {
  const handlers = new Map<GameEventType, Set<(payload: unknown) => void>>()

  function on<K extends GameEventType>(type: K, handler: (payload: GameEventMap[K]) => void): Unsubscribe {
    const set = handlers.get(type) ?? new Set()
    set.add(handler as (payload: unknown) => void)
    handlers.set(type, set)
    return () => {
      set.delete(handler as (payload: unknown) => void)
    }
  }

  function once<K extends GameEventType>(type: K, handler: (payload: GameEventMap[K]) => void): Unsubscribe {
    const unsubscribe = on(type, (payload) => {
      unsubscribe()
      handler(payload)
    })
    return unsubscribe
  }

  function emit<K extends GameEventType>(type: K, payload: GameEventMap[K]): void {
    const set = handlers.get(type)
    if (!set) return
    // A broken listener must never stop a clutch from hatching (seams.ts's own requirement) —
    // catch and log, keep going.
    for (const handler of [...set]) {
      try {
        handler(payload)
      } catch (error) {
        console.error(`EventBus: handler for "${type}" threw`, error)
      }
    }
  }

  return { on, once, emit }
}
