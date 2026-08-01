/**
 * Concrete `UnlockRegistry` (interface in `game/seams.ts`). `evaluate`/`pending` recompute from
 * `ProgressView` every call — nothing here stores an "unlocked" bit, per the seam's own
 * requirement that a rules change or bug fix must produce the right answer on an old save.
 *
 * **This is the talent-tree seam.** Nothing is registered here beyond what the rehab itself
 * needs (see `game/rehab.ts` and `game/breeding.ts` for the handful of real unlocks this
 * dispatch ships). A talent tree is an arrangement of more `Unlock` records whose `requires`
 * reference each other — deliberately not built here.
 */
import type { Unlock, UnlockCondition, UnlockId, UnlockRegistry, PendingUnlock, ProgressView } from './seams'

export function createUnlockRegistry(): UnlockRegistry {
  const unlocks = new Map<UnlockId, Unlock>()

  function isMet(condition: UnlockCondition, view: ProgressView): boolean {
    return condition.isMet(view)
  }

  return {
    register(unlock) {
      if (unlocks.has(unlock.id)) throw new Error(`Unlock "${unlock.id}" is already registered.`)
      unlocks.set(unlock.id, unlock)
    },
    get: (id) => unlocks.get(id),
    all: () => [...unlocks.values()],
    isUnlocked(id, view) {
      const unlock = unlocks.get(id)
      if (!unlock) return false
      return unlock.requires.every((c) => isMet(c, view))
    },
    evaluate(view) {
      return [...unlocks.values()].filter((u) => u.requires.every((c) => isMet(c, view)))
    },
    pending(view): readonly PendingUnlock[] {
      const out: PendingUnlock[] = []
      for (const unlock of unlocks.values()) {
        const unmet = unlock.requires.filter((c) => !isMet(c, view))
        if (unmet.length > 0) out.push({ unlock, unmet })
      }
      return out
    },
  }
}
