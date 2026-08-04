/**
 * The engine's three promises — cheap, retroactive-safe, save-stable — tested against the real
 * `FlagSet`, `EventBus` and `UnlockRegistry` rather than fakes, because the promises are all about
 * how it behaves *on those seams*.
 */
import { describe, expect, it } from 'vitest'
import { createEventBus } from '../eventBus'
import { createFlagSet } from '../flagSet'
import { createProgressView } from '../progression/progressView'
import { createUnlockRegistry } from '../unlockRegistry'
import type { FlagId, FlagValue } from '../seams'
import { allSpecies } from '../../species'
import { ACHIEVEMENTS } from './catalogue'
import { buildCoverage } from './coverage'
import { createAchievementEngine, achievementReward } from './engine'
import type { RewardBreakdown } from './reward'
import type { Achievement } from './types'
import { achievementUnlockId, earnedFlagId } from './types'

const coverage = buildCoverage(allSpecies)

/** A tiny catalogue, so a test asserts about the framework and not about the content. */
const COUNTER_FLAG = 'ach.hatched.ball-python'

const SMALL: readonly Achievement[] = [
  {
    id: 'firsts.one',
    category: 'firsts',
    label: 'One',
    description: 'Hatch one ball python.',
    requires: { kind: 'atLeast', flag: COUNTER_FLAG, value: 1, describe: 'hatch a ball python' },
    effort: [{ kind: 'action', actions: 1, note: 'one hatchling' }],
  },
  {
    id: 'volume.three',
    category: 'volume',
    label: 'Three',
    description: 'Hatch three ball pythons.',
    requires: { kind: 'atLeast', flag: COUNTER_FLAG, value: 3, describe: 'hatch three ball pythons' },
    effort: [{ kind: 'action', actions: 2, note: 'two more hatchlings' }],
    supersedes: 'firsts.one',
  },
  {
    id: 'curiosities.secret',
    category: 'curiosities',
    label: 'Secret',
    description: 'Hatch five ball pythons.',
    requires: { kind: 'atLeast', flag: COUNTER_FLAG, value: 5, describe: 'hatch five ball pythons' },
    effort: [{ kind: 'action', actions: 2, note: 'two more' }],
    hidden: true,
  },
]

function harness(
  catalogue: readonly Achievement[] = SMALL,
  initial: Readonly<Record<FlagId, FlagValue>> = {},
) {
  const bus = createEventBus()
  const flags = createFlagSet(bus, initial)
  const registry = createUnlockRegistry()
  const view = createProgressView(flags, registry)
  const awards: { id: string; reward: RewardBreakdown }[] = []
  const engine = createAchievementEngine({
    bus,
    flags,
    view,
    coverage,
    catalogue,
    registry,
    onAward: (achievement, reward) => awards.push({ id: achievement.id, reward }),
  })
  return { bus, flags, registry, engine, awards }
}

describe('awarding', () => {
  it('awards when the counter crosses, and exactly once', () => {
    const { flags, engine, awards } = harness()

    flags.bump(COUNTER_FLAG)
    expect(awards.map((a) => a.id)).toEqual(['firsts.one'])

    flags.bump(COUNTER_FLAG)
    expect(awards).toHaveLength(1)

    flags.bump(COUNTER_FLAG)
    expect(awards.map((a) => a.id)).toEqual(['firsts.one', 'volume.three'])

    // Re-sweeping never pays twice: the earned flag is the idempotence.
    expect(engine.sweep()).toEqual([])
    expect(awards).toHaveLength(2)
  })

  it('records the award as an ordinary flag, which is what makes it save data', () => {
    const { flags, engine } = harness()
    flags.bump(COUNTER_FLAG)
    expect(flags.get(earnedFlagId('firsts.one'))).toBe(true)
    expect(engine.isEarned('firsts.one')).toBe(true)
  })

  it('does not recurse when paying a reward completes another achievement', () => {
    const bus = createEventBus()
    const flags = createFlagSet(bus)
    const registry = createUnlockRegistry()
    const view = createProgressView(flags, registry)
    const awarded: string[] = []
    createAchievementEngine({
      bus,
      flags,
      view,
      coverage,
      catalogue: SMALL,
      registry,
      // The pathological case: the payout itself moves the counter the catalogue is watching.
      onAward: (achievement) => {
        awarded.push(achievement.id)
        if (awarded.length < 10) flags.bump(COUNTER_FLAG, 2)
      },
    })

    flags.bump(COUNTER_FLAG)
    expect(awarded).toEqual(['firsts.one', 'volume.three', 'curiosities.secret'])
  })
})

describe('retroactivity', () => {
  it('earns on construction from counters that predate the engine', () => {
    const { awards } = harness(SMALL, { [COUNTER_FLAG]: 4 })
    expect(awards.map((a) => a.id)).toEqual(['firsts.one', 'volume.three'])
  })

  it('earns an achievement added after the save was played', () => {
    // Play with a catalogue that does not contain the third achievement…
    const first = harness(SMALL.slice(0, 2))
    first.flags.bump(COUNTER_FLAG, 7)
    expect(first.awards.map((a) => a.id)).toEqual(['firsts.one', 'volume.three'])
    const save = first.flags.all()

    // …then load that save against a catalogue that does. The counter was already recording.
    const second = harness(SMALL, save)
    expect(second.awards.map((a) => a.id)).toEqual(['curiosities.secret'])
  })

  it('cannot invent history a counter never recorded — the honest limit', () => {
    const save = { [COUNTER_FLAG]: 9 }
    const newAchievement: Achievement = {
      id: 'mastery.unrecorded',
      category: 'mastery',
      label: 'Unrecorded',
      description: 'Something no counter was watching.',
      requires: {
        kind: 'atLeast',
        flag: 'ach.predictionsCorrect',
        value: 1,
        describe: 'call a clutch correctly',
      },
      effort: [{ kind: 'action', actions: 1, note: 'one prediction' }],
    }
    const { engine } = harness([...SMALL, newAchievement], save)
    expect(engine.isEarned('mastery.unrecorded')).toBe(false)
    // And it is legibly pending rather than silently absent.
    expect(engine.viewOf('mastery.unrecorded')?.requirement).toBe('call a clutch correctly')
  })
})

describe('save and load', () => {
  it('round-trips through the flag set with no re-award and no lost award', () => {
    const first = harness()
    first.flags.bump(COUNTER_FLAG, 5)
    const earnedBefore = SMALL.filter((a) => first.engine.isEarned(a.id)).map((a) => a.id)
    expect(earnedBefore).toHaveLength(3)

    const second = harness(SMALL, first.flags.all())
    expect(second.awards).toEqual([]) // nothing paid twice on load
    expect(SMALL.filter((a) => second.engine.isEarned(a.id)).map((a) => a.id)).toEqual(earnedBefore)
  })

  it('keeps an earned achievement earned when its coverage set widens', () => {
    // Latching: the badge survives content being added. Modelled by loading a save whose earned
    // flag is set against a requirement that is no longer met.
    const { engine } = harness(SMALL, { [earnedFlagId('curiosities.secret')]: true })
    expect(engine.isEarned('curiosities.secret')).toBe(true)
    expect(engine.viewOf('curiosities.secret')?.fraction).toBe(1)
  })
})

describe('cost of evaluation', () => {
  it('touches only the achievements a changed flag could affect', () => {
    const { engine } = harness(ACHIEVEMENTS)
    const watchers = engine.watchersOf('ach.trait.ball-python.piebald.piebald')
    expect(watchers.length).toBeGreaterThan(0)
    // A tiny slice of a 100+ catalogue, not all of it.
    expect(watchers.length).toBeLessThan(ACHIEVEMENTS.length / 4)
    expect(watchers).toContain('traits.ball-python.piebald')
    expect(watchers).not.toContain('sanctuary.placed.1')
  })

  it('has no watchers at all for a flag nothing reads', () => {
    const { engine } = harness(ACHIEVEMENTS)
    expect(engine.watchersOf('some.unrelated.flag')).toEqual([])
  })

  it('ignores its own earned flags, so an award does not walk the index', () => {
    const { engine } = harness(ACHIEVEMENTS)
    expect(engine.watchersOf(earnedFlagId('firsts.clutch'))).toEqual([])
  })
})

describe('the browsable view', () => {
  it('promises the reward before the achievement is earned', () => {
    const { engine } = harness()
    const view = engine.viewOf('volume.three')!
    expect(view.earned).toBe(false)
    expect(view.reward).toEqual(achievementReward(SMALL[1]!))
    expect(view.reward.rewards.length).toBeGreaterThan(0)
    expect(view.effortExplanation.length).toBe(1)
  })

  it('reports partial progress toward an unearned achievement', () => {
    const { flags, engine } = harness()
    flags.bump(COUNTER_FLAG, 2)
    const view = engine.viewOf('curiosities.secret')!
    expect(view.progress).toEqual([
      { label: 'hatch five ball pythons', done: 2, total: 5, fraction: 2 / 5 },
    ])
    expect(view.fraction).toBeCloseTo(0.4, 10)
  })

  it('conceals a hidden achievement until it is earned, then stops', () => {
    const { flags, engine } = harness()
    expect(engine.viewOf('curiosities.secret')?.concealed).toBe(true)
    flags.bump(COUNTER_FLAG, 5)
    expect(engine.viewOf('curiosities.secret')?.concealed).toBe(false)
  })

  it('covers the real catalogue without throwing, and every entry has a legible requirement', () => {
    const { engine } = harness(ACHIEVEMENTS)
    const views = engine.view()
    expect(views).toHaveLength(ACHIEVEMENTS.length)
    for (const view of views) {
      expect(view.requirement.length, view.achievement.id).toBeGreaterThan(0)
      expect(view.progress.length, view.achievement.id).toBeGreaterThan(0)
      expect(view.fraction).toBeGreaterThanOrEqual(0)
      expect(view.fraction).toBeLessThanOrEqual(1)
    }
  })
})

describe('the unlock registry stays the one authority', () => {
  it('registers one unlock per achievement, agreeing with the engine', () => {
    const { flags, registry, engine } = harness()
    const view = createProgressView(flags, registry)

    expect(registry.all()).toHaveLength(SMALL.length)
    expect(registry.isUnlocked(achievementUnlockId('firsts.one'), view)).toBe(false)

    flags.bump(COUNTER_FLAG)
    expect(engine.isEarned('firsts.one')).toBe(true)
    expect(registry.isUnlocked(achievementUnlockId('firsts.one'), view)).toBe(true)
  })

  it('refuses a duplicate id rather than registering it twice', () => {
    expect(() => harness([SMALL[0]!, SMALL[0]!])).toThrow(/duplicate id/)
  })

  it('grants nothing through the unlock system — rewards are paid once, by the engine', () => {
    const { registry } = harness()
    for (const unlock of registry.all()) expect(unlock.grants).toEqual([])
  })
})

describe('disposal', () => {
  it('stops listening', () => {
    const { flags, engine, awards } = harness()
    engine.dispose()
    flags.bump(COUNTER_FLAG, 5)
    expect(awards).toEqual([])
  })
})
