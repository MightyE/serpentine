/**
 * The `ProgressView` adapter — the missing half-inch of glue between a live `FlagSet` and the
 * `UnlockRegistry`.
 *
 * `seams.ts` defines `ProgressView` as the narrow read-only window an unlock condition is given,
 * and `UnlockRegistry.isUnlocked` takes one; nothing in the repo built one, because nothing had
 * needed to evaluate a real unlock against a real save yet. This is that.
 *
 * Two things worth knowing:
 *
 * **It is memoised per call-site, not cached.** A view is cheap and disposable — make one, ask
 * it some questions, throw it away. The memo exists only so that a diamond in the dependency
 * graph (two nodes requiring the same parent) doesn't re-walk the same subtree. Holding a view
 * across a flag change would give you stale answers, which is precisely the failure mode
 * `seams.ts` warns about; so don't.
 *
 * **It is cycle-safe.** `isUnlocked(a)` can transitively ask about `a` again if someone authors
 * a cyclic requirement. The tree validator rejects cycles up front, but hand-written unlocks are
 * not validated, and an infinite recursion inside a UI render is a genuinely unpleasant bug to
 * chase. A node in flight resolves to `false` — which is both safe and correct, since a node that
 * requires itself can never legitimately be on.
 */
import type { FlagSet, ProgressView, UnlockId, UnlockRegistry } from '../seams'

export function createProgressView(flags: FlagSet, registry: UnlockRegistry): ProgressView {
  const resolved = new Map<UnlockId, boolean>()
  const inFlight = new Set<UnlockId>()

  const view: ProgressView = {
    flag: (id) => flags.get(id),
    count: (id) => {
      const value = flags.get(id)
      return typeof value === 'number' ? value : 0
    },
    isUnlocked: (id) => {
      const memo = resolved.get(id)
      if (memo !== undefined) return memo
      if (inFlight.has(id)) return false // cycle — see the module comment
      inFlight.add(id)
      try {
        const answer = registry.isUnlocked(id, view)
        resolved.set(id, answer)
        return answer
      } finally {
        inFlight.delete(id)
      }
    },
  }

  return view
}
