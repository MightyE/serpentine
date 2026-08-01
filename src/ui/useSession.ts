/**
 * The one hook the whole app runs on.
 *
 * `Session` is a plain object with a coarse "something changed" subscription, so React's job here
 * is small on purpose: hold the session, re-render when it says so, and stay out of the way. All
 * the game state lives in `src/game/`, none of it in component state — which is what makes the
 * whole loop drivable from a test with no renderer at all.
 */
import { useEffect, useReducer, useRef } from 'react'
import { foundingPair, registerCheatUnlock } from '../game/cheats'
import { Session } from '../game/session'

/**
 * The world seed, from `?seed=` or a fixed default.
 *
 * Deliberately not `Date.now()`. Every random thing in this game derives from a seed so that a
 * save is reproducible and a bug is reportable — "load `?seed=weird` and look at the third
 * hatchling" is a bug report you can act on. A clock in here would quietly break that for the
 * sake of a different starting collection, which is a bad trade.
 */
function worldSeed(): string {
  if (typeof window === 'undefined') return 'serpentine'
  return new URLSearchParams(window.location.search).get('seed') ?? 'serpentine'
}

function makeSession(): Session {
  const session = new Session({ worldSeed: worldSeed() })
  registerCheatUnlock(session)
  // The first thirty seconds decide whether anyone comes back. An empty rehab is a worse opening
  // than any amount of polish can rescue, and two animals you cannot breed together is worse
  // still — so the founding pair is guaranteed one of each sex rather than left to a coin flip.
  foundingPair(session, 'ball-python')
  foundingPair(session, 'corn-snake')
  return session
}

export function useSession(): Session {
  const ref = useRef<Session | null>(null)
  if (ref.current === null) ref.current = makeSession()
  const session = ref.current
  const [, bump] = useReducer((n: number) => n + 1, 0)

  useEffect(() => session.subscribe(bump), [session])

  return session
}
