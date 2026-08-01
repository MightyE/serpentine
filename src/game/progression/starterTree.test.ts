/**
 * These tests assert properties of *whatever tree is in `starterTree.ts`* — not the presence of
 * any particular node. That is deliberate: the four starter nodes are a placeholder for someone
 * else's design work, and a test suite that pinned them down would turn every creative edit into
 * a chore. Nothing here should ever need changing because a node was added, renamed, or deleted.
 *
 * What it does guard is the handful of things that would be genuinely bad to get wrong and hard
 * to notice: a cycle, a tuning value driven outside the band the balance invariants assume, a
 * rehab resident that became profitable, and a tree cheap enough to clear completely.
 */
import { describe, expect, it } from 'vitest'
import { createEventBus } from '../eventBus'
import { createFlagSet } from '../flagSet'
import { createUnlockRegistry } from '../unlockRegistry'
import { createProgressView } from './progressView'
import { STARTER_TREE } from './starterTree'
import { createTalentTree } from './talentTree'
import { TUNABLES, TUNABLE_KEYS, residentNetPerWeek } from './tunables'

const tree = createTalentTree(STARTER_TREE)

describe('the starter tree is a well-formed tree', () => {
  it('constructs — which is the acyclic, no-dangling-prerequisite assertion', () => {
    expect(tree.nodes.length).toBeGreaterThan(0)
  })

  it('has at least one node with no prerequisites, or nothing is ever reachable', () => {
    expect(tree.nodes.some((n) => (n.requires ?? []).length === 0)).toBe(true)
  })

  it('gives every node a label and a description — a locked node must explain itself', () => {
    for (const node of tree.nodes) {
      expect(node.label.length, node.id).toBeGreaterThan(0)
      expect(node.description.length, node.id).toBeGreaterThan(0)
    }
  })
})

describe('the balance guard', () => {
  it('cannot drive any tunable outside its declared band, however many nodes are taken', () => {
    for (const key of TUNABLE_KEYS) {
      const [min, max] = tree.reachableTuningRange(key)
      const [floor, ceiling] = TUNABLES[key].bounds
      // Strict, not clamped-and-shrugged: a tree that *would* exceed the band should fail here
      // rather than saturate silently at the clamp in `effects().tuning`.
      expect(min, `${key} floor`).toBeGreaterThanOrEqual(floor)
      expect(max, `${key} ceiling`).toBeLessThanOrEqual(ceiling)
    }
  })

  it('keeps a rehab resident net-negative at every reachable corner', () => {
    // Charter principles 5 and 7: a resident costs you a slot and your attention, and must never
    // become a way to farm income. Evaluated at the corners because that is where per-key bands
    // stop being sufficient.
    const [, supportMax] = tree.reachableTuningRange('residentSupportPerWeek')
    const [upkeepMin] = tree.reachableTuningRange('slotUpkeepPerWeek')
    expect(residentNetPerWeek(supportMax, upkeepMin)).toBeLessThan(0)
  })

  it('costs more in total than the milestones award, so the tree is a choice not a checklist', () => {
    const totalCost = tree.nodes.reduce((sum, n) => sum + n.cost, 0)
    const totalPoints = tree.milestones.reduce((sum, m) => sum + m.points, 0)
    expect(totalCost).toBeGreaterThan(totalPoints)
  })
})

describe('end to end, against the real seams', () => {
  it('a milestone earns a point, the point buys a node, and the effect switches on', () => {
    const bus = createEventBus()
    const flags = createFlagSet(bus)
    const registry = createUnlockRegistry()
    tree.registerInto(registry)
    const view = () => createProgressView(flags, registry)

    expect(tree.points(view()).available).toBe(0)

    // The one flag `game/breeding.ts` already bumps for real.
    flags.bump('clutchesHatched')
    expect(tree.points(view()).earned).toBeGreaterThan(0)

    const affordable = tree.layout(view()).nodes.filter((n) => n.state === 'affordable')
    expect(affordable.length).toBeGreaterThan(0)

    const target = affordable[0].node
    const result = tree.take(target.id, flags, registry, bus)
    expect(result.ok).toBe(true)
    expect(tree.active(view()).map((n) => n.id)).toContain(target.id)
  })

  it('registers into the shared UnlockRegistry rather than a parallel system', () => {
    const registry = createUnlockRegistry()
    tree.registerInto(registry)
    expect(registry.all().length).toBe(tree.nodes.length)
    expect(registry.all().every((u) => u.id.startsWith('talent:'))).toBe(true)
  })
})
