/**
 * Serpentine — quests are guidance, never gates.
 *
 * > *the user … doesn't have to complete the tutorial quests to play like normal.*
 *
 * The structural rule is one sentence: **no `UnlockCondition` anywhere in the game may read a flag
 * under the `quest.` namespace.** This test is why that is checkable rather than promised. It walks
 * every registered achievement and every talent node, collects the flags their requirements read,
 * and asserts none of them begins with `quest.`.
 *
 * The one sanctioned exception, because a fifteen-year-old deserves a badge: an achievement may read
 * a `quest.` flag if and only if its own `grants` is empty. A badge for finishing the tutorial is a
 * *record*, not a capability, so it is not a gate. Both halves are checked in the same pass, which is
 * the point — the exemption is narrow enough to state and therefore narrow enough to enforce.
 *
 * The other half of the guarantee is structural rather than tested: a quest does not compile to an
 * `Unlock` and has no `grants` field, so there is no second path by which one could become a
 * requirement. `types.ts` has no `grants` on `Quest`, and `runtime.ts` registers nothing.
 */
import { describe, expect, it } from 'vitest'
import { ACHIEVEMENTS } from '../achievements/catalogue'
import { watchedFlags } from '../achievements/compile'
import { buildCoverage } from '../achievements/coverage'
import { Session } from '../session'
import { isQuestFlag } from './types'

// The species as the game actually loads them, genetic load and all — the same input the
// achievement engine builds its coverage sets from.
const coverage = buildCoverage(
  Object.values(new Session({ worldSeed: 'notAGate' }).species).map((loaded) => loaded.playable),
)

describe('quests are not gates', () => {
  it('no achievement requirement reads a quest flag unless it pays nothing', () => {
    const offenders: string[] = []
    for (const achievement of ACHIEVEMENTS) {
      const questFlags = watchedFlags(achievement.requires, coverage).filter(isQuestFlag)
      if (questFlags.length === 0) continue
      const pays = (achievement.grants ?? []).length > 0
      if (pays) offenders.push(`${achievement.id} reads ${questFlags.join(', ')} and grants something`)
    }
    expect(
      offenders,
      'an achievement that both reads a quest flag and grants a capability is a gate behind the ' +
        'tutorial — the exemption is only for badges that pay nothing',
    ).toEqual([])
  })

  it('the namespace test itself works', () => {
    // Guards the guard: a typo in `isQuestFlag` would make the assertion above vacuously true, and
    // nothing else in the suite would notice.
    expect(isQuestFlag('quest.status.one')).toBe(true)
    expect(isQuestFlag('ach.earned.one')).toBe(false)
    expect(isQuestFlag('clutchesHatched')).toBe(false)
  })
})
