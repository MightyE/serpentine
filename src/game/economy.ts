/**
 * Money. The economy is entirely invented — the dispatch that authored this content is
 * explicit that real-world snake-market pricing is out of scope — so prices exist only to make
 * buying, selling and breeding feel like a real facility to run, not a claim about what any
 * animal is actually worth.
 */
import type { EventBus } from './seams'

declare module './seams' {
  interface GameEventMap {
    /** Balance changed, for any reason — a sale, a purchase, upkeep. `reason` is a short id. */
    'money.changed': { balance: number; delta: number; reason: string }
  }
}

export interface Economy {
  balance(): number
  /** Adds money. Always succeeds. */
  earn(amount: number, reason: string): void
  /** Subtracts money if there is enough; returns false and changes nothing otherwise. */
  spend(amount: number, reason: string): boolean
}

export function createEconomy(bus: EventBus, startingBalance = 500): Economy {
  let balance = startingBalance

  return {
    balance: () => balance,
    earn(amount, reason) {
      if (amount <= 0) return
      balance += amount
      bus.emit('money.changed', { balance, delta: amount, reason })
    },
    spend(amount, reason) {
      if (amount <= 0) return true
      if (amount > balance) return false
      balance -= amount
      bus.emit('money.changed', { balance, delta: -amount, reason })
      return true
    },
  }
}
