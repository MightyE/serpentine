import { describe, expect, it } from 'vitest'
import { createEventBus } from '../eventBus'
import { createFlagSet } from '../flagSet'
import { createUnlockRegistry } from '../unlockRegistry'
import { createProgressView } from './progressView'
import { createTalentTree, TalentTreeError, decodeEffect, encodeEffect } from './talentTree'
import { TUNABLES, residentNetPerWeek } from './tunables'
import type { TalentMilestone, TalentNode } from './types'
import { takenFlagId, talentUnlockId } from './types'

/** A tiny fixture tree, independent of `starterTree.ts` so the machinery tests survive her edits. */
const NODES: readonly TalentNode[] = [
  {
    id: 'root-a',
    label: 'Root A',
    description: 'A capability at the root.',
    branch: 'x',
    cost: 1,
    effects: [{ kind: 'capability', capability: 'cap.a' }],
  },
  {
    id: 'child-a',
    label: 'Child A',
    description: 'Needs Root A.',
    branch: 'x',
    cost: 2,
    requires: ['root-a'],
    effects: [{ kind: 'tuning', key: 'incubationVarianceWeeks', op: 'add', value: -0.5 }],
  },
  {
    id: 'root-b',
    label: 'Root B',
    description: 'Content, plus a world condition.',
    branch: 'y',
    cost: 1,
    alsoRequires: [{ describe: 'Hatch a clutch', isMet: (view) => view.count('clutchesHatched') >= 1 }],
    effects: [{ kind: 'content', content: 'habitat.arid' }],
  },
]

const MILESTONES: readonly TalentMilestone[] = [
  { id: 'm1', describe: 'Do a thing', points: 2, isMet: (view) => view.count('things') >= 1 },
  { id: 'm2', describe: 'Do two things', points: 1, isMet: (view) => view.count('things') >= 2 },
]

function harness(nodes: readonly TalentNode[] = NODES) {
  const bus = createEventBus()
  const flags = createFlagSet(bus)
  const registry = createUnlockRegistry()
  const tree = createTalentTree({ nodes, milestones: MILESTONES })
  tree.registerInto(registry)
  return { bus, flags, registry, tree, view: () => createProgressView(flags, registry) }
}

describe('grant encoding', () => {
  it('round-trips every effect kind through the untyped grants array', () => {
    const effects = [
      { kind: 'capability', capability: 'pairing.concurrent' },
      { kind: 'content', content: 'habitat.arid' },
      { kind: 'tuning', key: 'slotUpkeepPerWeek', op: 'add', value: -0.5 },
    ] as const
    for (const effect of effects) {
      expect(decodeEffect(encodeEffect(effect))).toEqual(effect)
    }
  })

  it('refuses a grant naming a tunable that is not on the allow-list', () => {
    expect(decodeEffect('tuning:baseHatchRate:mul:1.2')).toBeNull()
  })
})

describe('validation — authoring mistakes fail loudly at construction', () => {
  const base: TalentNode = {
    id: 'n',
    label: 'N',
    description: '',
    branch: 'x',
    cost: 1,
    effects: [{ kind: 'capability', capability: 'c' }],
  }

  it('rejects a duplicate id', () => {
    expect(() => createTalentTree({ nodes: [base, base], milestones: [] })).toThrow(TalentTreeError)
  })

  it('rejects a prerequisite that is not in the tree', () => {
    expect(() =>
      createTalentTree({ nodes: [{ ...base, requires: ['ghost'] }], milestones: [] }),
    ).toThrow(/not in the tree/)
  })

  it('rejects a cycle, and names the path', () => {
    expect(() =>
      createTalentTree({
        nodes: [
          { ...base, id: 'a', requires: ['b'] },
          { ...base, id: 'b', requires: ['a'] },
        ],
        milestones: [],
      }),
    ).toThrow(/cycle/)
  })

  it('rejects a node with no effects', () => {
    expect(() => createTalentTree({ nodes: [{ ...base, effects: [] }], milestones: [] })).toThrow(
      /no effects/,
    )
  })

  it('rejects a non-positive multiplier, which would break the reachable-range arithmetic', () => {
    expect(() =>
      createTalentTree({
        nodes: [
          { ...base, effects: [{ kind: 'tuning', key: 'slotUpkeepPerWeek', op: 'mul', value: 0 }] },
        ],
        milestones: [],
      }),
    ).toThrow(/multiplier/)
  })
})

describe('taking a node', () => {
  it('refuses when the prerequisite node is not active, and says which', () => {
    const { tree, flags, registry, bus } = harness()
    flags.bump('things')
    const result = tree.take('child-a', flags, registry, bus)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('locked')
      expect(result.detail).toMatch(/Root A/)
    }
  })

  it('refuses when the points are not there', () => {
    const { tree, flags, registry, bus } = harness()
    // No milestones met, so no points at all.
    const result = tree.take('root-a', flags, registry, bus)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('insufficient-points')
  })

  it('refuses an extra world condition that is not met, separately from prerequisites', () => {
    const { tree, flags, registry, bus } = harness()
    flags.bump('things', 2)
    const result = tree.take('root-b', flags, registry, bus)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.detail).toMatch(/Hatch a clutch/)
  })

  it('writes exactly one flag, emits talent.taken, and makes the unlock evaluate true', () => {
    const { tree, flags, registry, bus, view } = harness()
    flags.bump('things')
    const taken: unknown[] = []
    bus.on('talent.taken', (e) => taken.push(e))

    const result = tree.take('root-a', flags, registry, bus)
    expect(result.ok).toBe(true)
    expect(taken).toEqual([{ nodeId: 'root-a', cost: 1 }])
    expect(flags.get(takenFlagId('root-a'))).toBe(true)
    expect(registry.isUnlocked(talentUnlockId('root-a'), view())).toBe(true)
  })

  it('refuses a second take of the same node', () => {
    const { tree, flags, registry, bus } = harness()
    flags.bump('things')
    tree.take('root-a', flags, registry, bus)
    const again = tree.take('root-a', flags, registry, bus)
    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.reason).toBe('already-taken')
  })

  it('refuses an unknown node rather than throwing', () => {
    const { tree, flags, registry, bus } = harness()
    const result = tree.take('nope', flags, registry, bus)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('unknown-node')
  })
})

describe('points are derived, never stored', () => {
  it('earns from milestones and spends on active nodes', () => {
    const { tree, flags, registry, bus, view } = harness()
    expect(tree.points(view())).toEqual({ earned: 0, spent: 0, available: 0 })

    flags.bump('things', 2) // both milestones: 3 points
    expect(tree.points(view()).available).toBe(3)

    tree.take('root-a', flags, registry, bus)
    tree.take('child-a', flags, registry, bus)
    expect(tree.points(view())).toEqual({ earned: 3, spent: 3, available: 0 })
  })

  it('refunds a node whose prerequisites stopped being met — the graceful-respec property', () => {
    // Take a chain, then rewrite history so the root's own requirement fails. The point of the
    // derived design: the child goes inactive and both points come back, with no migration.
    const chain: readonly TalentNode[] = [
      {
        id: 'gate',
        label: 'Gate',
        description: '',
        branch: 'x',
        cost: 1,
        alsoRequires: [{ describe: 'Have a thing', isMet: (view) => view.count('gateFlag') >= 1 }],
        effects: [{ kind: 'capability', capability: 'cap.gate' }],
      },
      {
        id: 'leaf',
        label: 'Leaf',
        description: '',
        branch: 'x',
        cost: 1,
        requires: ['gate'],
        effects: [{ kind: 'capability', capability: 'cap.leaf' }],
      },
    ]
    const { tree, flags, registry, bus, view } = harness(chain)
    flags.bump('things', 2)
    flags.bump('gateFlag')
    expect(tree.take('gate', flags, registry, bus).ok).toBe(true)
    expect(tree.take('leaf', flags, registry, bus).ok).toBe(true)
    expect(tree.points(view()).spent).toBe(2)
    expect(tree.effects(view()).has('cap.leaf')).toBe(true)

    flags.set('gateFlag', 0)
    expect(tree.active(view())).toEqual([])
    expect(tree.points(view())).toEqual({ earned: 3, spent: 0, available: 3 })
    expect(tree.effects(view()).has('cap.leaf')).toBe(false)
  })

  it('respec clears the taken flags and nothing else', () => {
    const { tree, flags, registry, bus, view } = harness()
    flags.bump('things', 2)
    tree.take('root-a', flags, registry, bus)
    tree.respec(flags)
    expect(tree.points(view()).available).toBe(3)
    expect(flags.get('things')).toBe(2)
  })
})

describe('effects', () => {
  it('capability and content are separate namespaces', () => {
    const { tree, flags, registry, bus, view } = harness()
    flags.bump('things', 2)
    flags.bump('clutchesHatched')
    tree.take('root-b', flags, registry, bus)
    const effects = tree.effects(view())
    expect(effects.contentUnlocked('habitat.arid')).toBe(true)
    expect(effects.has('habitat.arid')).toBe(false)
  })

  it('an untouched tunable reads its base value from tuning.ts', () => {
    const { tree, view } = harness()
    expect(tree.effects(view()).tuning('slotUpkeepPerWeek')).toBe(TUNABLES.slotUpkeepPerWeek.base)
  })

  it('applies a tuning modifier and clamps to the declared band', () => {
    const { tree, flags, registry, bus, view } = harness()
    flags.bump('things', 2)
    tree.take('root-a', flags, registry, bus)
    tree.take('child-a', flags, registry, bus)
    const spread = tree.effects(view()).tuning('incubationVarianceWeeks')
    expect(spread).toBeCloseTo(TUNABLES.incubationVarianceWeeks.base - 0.5)
    expect(spread).toBeGreaterThanOrEqual(TUNABLES.incubationVarianceWeeks.bounds[0])
  })

  it('is order-independent: adds sum and muls multiply, so take order cannot matter', () => {
    const both: readonly TalentNode[] = [
      {
        id: 'a',
        label: 'A',
        description: '',
        branch: 'x',
        cost: 1,
        effects: [{ kind: 'tuning', key: 'incubationVarianceWeeks', op: 'add', value: -0.5 }],
      },
      {
        id: 'b',
        label: 'B',
        description: '',
        branch: 'x',
        cost: 1,
        effects: [{ kind: 'tuning', key: 'incubationVarianceWeeks', op: 'mul', value: 0.5 }],
      },
    ]
    const forward = harness(both)
    forward.flags.bump('things', 2)
    forward.tree.take('a', forward.flags, forward.registry, forward.bus)
    forward.tree.take('b', forward.flags, forward.registry, forward.bus)

    const backward = harness(both)
    backward.flags.bump('things', 2)
    backward.tree.take('b', backward.flags, backward.registry, backward.bus)
    backward.tree.take('a', backward.flags, backward.registry, backward.bus)

    expect(forward.tree.effects(forward.view()).tuning('incubationVarianceWeeks')).toBe(
      backward.tree.effects(backward.view()).tuning('incubationVarianceWeeks'),
    )
  })
})

describe('layout — everything a screen needs, and no game logic on the screen side', () => {
  it('derives rows from the prerequisite graph rather than from an authored number', () => {
    const { tree, view } = harness()
    const layout = tree.layout(view())
    const row = (id: string) => layout.nodes.find((n) => n.node.id === id)?.row
    expect(row('root-a')).toBe(0)
    expect(row('root-b')).toBe(0)
    expect(row('child-a')).toBe(1)
    expect(layout.rows).toBe(2)
  })

  it('distinguishes affordable from available from locked, and explains each', () => {
    const { tree, flags, view } = harness()
    const state = (id: string) => tree.layout(view()).nodes.find((n) => n.node.id === id)?.state

    expect(state('root-a')).toBe('available') // no points yet
    flags.bump('things')
    expect(state('root-a')).toBe('affordable')
    expect(state('child-a')).toBe('locked')

    const childView = tree.layout(view()).nodes.find((n) => n.node.id === 'child-a')
    expect(childView?.unmet.join(' ')).toMatch(/Root A/)
  })

  it('emits one edge per prerequisite, lit when the parent is active', () => {
    const { tree, flags, registry, bus, view } = harness()
    expect(tree.layout(view()).edges).toEqual([{ from: 'root-a', to: 'child-a', satisfied: false }])
    flags.bump('things')
    tree.take('root-a', flags, registry, bus)
    expect(tree.layout(view()).edges[0]?.satisfied).toBe(true)
  })

  it('lists the milestones still to reach, so a UI can show goals without knowing the rules', () => {
    const { tree, flags, view } = harness()
    expect(tree.layout(view()).nextMilestones.map((m) => m.id)).toEqual(['m1', 'm2'])
    flags.bump('things', 2)
    expect(tree.layout(view()).nextMilestones).toEqual([])
  })
})

describe('the balance guard — a tree can never move the game outside the tuning bands', () => {
  it('computes the reachable range over every combination, not just the affordable ones', () => {
    const { tree } = harness()
    const [min, max] = tree.reachableTuningRange('incubationVarianceWeeks')
    expect(min).toBeCloseTo(TUNABLES.incubationVarianceWeeks.base - 0.5)
    expect(max).toBeCloseTo(TUNABLES.incubationVarianceWeeks.base)
  })

  it('the cross-key invariant holds at the corners: a rehab resident is always net-negative', () => {
    // This is the failure a per-key band cannot catch. Support at its ceiling and slot upkeep at
    // its floor each look safe alone; together they would turn the rehab into an income source,
    // which is exactly what charter principles 5 and 7 forbid.
    const support = TUNABLES.residentSupportPerWeek.bounds[1]
    const upkeep = TUNABLES.slotUpkeepPerWeek.bounds[0]
    expect(residentNetPerWeek(support, upkeep)).toBeLessThan(0)
  })
})
