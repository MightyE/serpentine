/**
 * Concrete `FlagSet` (interface in `game/seams.ts`). Backed by a plain object so it serialises
 * into a save file with zero translation — `all()` *is* the save-file shape.
 */
import type { EventBus, FlagId, FlagSet, FlagValue } from './seams'

export function createFlagSet(bus: EventBus, initial: Readonly<Record<FlagId, FlagValue>> = {}): FlagSet {
  const values: Record<FlagId, FlagValue> = { ...initial }

  return {
    get: (id) => values[id],
    has: (id) => id in values,
    set: (id, value) => {
      if (values[id] === value) return
      values[id] = value
      bus.emit('flag.changed', { flag: id, value })
    },
    bump: (id, by = 1) => {
      const next = (typeof values[id] === 'number' ? values[id] : 0) + by
      values[id] = next
      bus.emit('flag.changed', { flag: id, value: next })
      return next
    },
    all: () => ({ ...values }),
  }
}
