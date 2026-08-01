/**
 * Serpentine — the talent tree machinery.
 *
 * Read `types.ts` first; it carries the design reasoning. This file is the implementation, and
 * it does five things:
 *
 * 1. **Validates** a tree at construction — duplicate ids, dangling prerequisites, cycles, a
 *    tunable moved the wrong way. All of these are authoring mistakes, and all of them are much
 *    cheaper to hear about at startup than to discover as a node that quietly does nothing.
 * 2. **Compiles** each node into an `Unlock` and registers it with the shared `UnlockRegistry`,
 *    so the existing seam is the only thing that ever answers "is this on?".
 * 3. **Derives** points — earned from milestones, spent on nodes that are currently valid.
 *    Neither number is stored; both are recomputed. A save file cannot lose your points and
 *    cannot lie about them.
 * 4. **Folds** the active nodes' effects into a read surface the rest of the game queries.
 * 5. **Lays out** the graph into a grid a screen can draw with no game logic of its own.
 *
 * ## Adding a node
 *
 * Put a `TalentNode` in the array in `starterTree.ts`. That is the whole procedure. Rows are
 * derived from the graph, the unlock is compiled for you, the effects wire themselves up, and
 * the layout picks it up on the next render. Nothing in this file needs to change — and if you
 * ever find that it does, that is a bug in this file rather than a step in the procedure.
 */
import type { EventBus, FlagSet, ProgressView, Unlock, UnlockCondition, UnlockRegistry } from '../seams'
import { createProgressView } from './progressView'
import { TUNABLES, TUNABLE_KEYS, tunable } from './tunables'
import type {
  CapabilityId,
  ContentId,
  TakeResult,
  TalentEdgeView,
  TalentEffect,
  TalentEffects,
  TalentLayout,
  TalentMilestone,
  TalentNode,
  TalentNodeId,
  TalentNodeState,
  TalentNodeView,
  TalentPoints,
  TunableKey,
} from './types'
import { takenFlagId, talentUnlockId } from './types'

declare module '../seams' {
  interface GameEventMap {
    /** The player spent points on a node. Fired after the flag is set, so a handler sees it on. */
    'talent.taken': { nodeId: string; cost: number }
  }
}

// ---------------------------------------------------------------------------
// Effects as grant strings
// ---------------------------------------------------------------------------
//
// `Unlock.grants` is an untyped `readonly string[]` on purpose (see `seams.ts`): the game layer
// decides what a grant means, so adding a new kind of reward never means editing the seam. That
// freedom costs a small encoder/decoder pair, which is this. The grammar is deliberately dull:
//
//     capability:<id>
//     content:<id>
//     tuning:<key>:<add|mul>:<number>

export function encodeEffect(effect: TalentEffect): string {
  switch (effect.kind) {
    case 'capability':
      return `capability:${effect.capability}`
    case 'content':
      return `content:${effect.content}`
    case 'tuning':
      return `tuning:${effect.key}:${effect.op}:${effect.value}`
  }
}

export function decodeEffect(grant: string): TalentEffect | null {
  const parts = grant.split(':')
  if (parts[0] === 'capability' && parts.length === 2) {
    return { kind: 'capability', capability: parts[1] }
  }
  if (parts[0] === 'content' && parts.length === 2) {
    return { kind: 'content', content: parts[1] }
  }
  if (parts[0] === 'tuning' && parts.length === 4) {
    const key = parts[1] as TunableKey
    if (!TUNABLE_KEYS.includes(key)) return null
    const op = parts[2]
    if (op !== 'add' && op !== 'mul') return null
    const value = Number(parts[3])
    if (!Number.isFinite(value)) return null
    return { kind: 'tuning', key, op, value }
  }
  return null
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export class TalentTreeError extends Error {}

function validate(nodes: readonly TalentNode[], milestones: readonly TalentMilestone[]): void {
  const seen = new Set<TalentNodeId>()
  for (const node of nodes) {
    if (seen.has(node.id)) throw new TalentTreeError(`Duplicate talent node id "${node.id}".`)
    seen.add(node.id)
    if (!Number.isFinite(node.cost) || node.cost < 0) {
      throw new TalentTreeError(`Talent node "${node.id}" has a negative or non-finite cost.`)
    }
    if (node.effects.length === 0) {
      throw new TalentTreeError(
        `Talent node "${node.id}" has no effects. A node that does nothing is a dead end for the ` +
          `player and a hole in the tree's meaning — give it an effect or delete it.`,
      )
    }
    for (const effect of node.effects) {
      if (effect.kind !== 'tuning') continue
      if (!TUNABLE_KEYS.includes(effect.key)) {
        throw new TalentTreeError(`Talent node "${node.id}" moves unknown tunable "${effect.key}".`)
      }
      if (effect.op === 'mul' && effect.value <= 0) {
        throw new TalentTreeError(
          `Talent node "${node.id}" has a non-positive multiplier. Multipliers must be > 0 so the ` +
            `reachable range stays computable (see \`reachableTuningRange\`).`,
        )
      }
    }
  }

  const milestoneIds = new Set<string>()
  for (const milestone of milestones) {
    if (milestoneIds.has(milestone.id)) {
      throw new TalentTreeError(`Duplicate milestone id "${milestone.id}".`)
    }
    milestoneIds.add(milestone.id)
  }

  const byId = new Map(nodes.map((n) => [n.id, n]))
  for (const node of nodes) {
    for (const prerequisite of node.requires ?? []) {
      if (!byId.has(prerequisite)) {
        throw new TalentTreeError(
          `Talent node "${node.id}" requires "${prerequisite}", which is not in the tree.`,
        )
      }
    }
  }

  // Cycles. A cyclic tree is unreachable rather than merely wrong, and the `ProgressView` would
  // resolve it to a permanently-locked node with no explanation — so catch it here where the
  // message can name the nodes involved.
  const state = new Map<TalentNodeId, 'visiting' | 'done'>()
  const walk = (id: TalentNodeId, path: TalentNodeId[]): void => {
    const mark = state.get(id)
    if (mark === 'done') return
    if (mark === 'visiting') {
      throw new TalentTreeError(`Talent prerequisite cycle: ${[...path, id].join(' → ')}.`)
    }
    state.set(id, 'visiting')
    for (const prerequisite of byId.get(id)?.requires ?? []) walk(prerequisite, [...path, id])
    state.set(id, 'done')
  }
  for (const node of nodes) walk(node.id, [])
}

// ---------------------------------------------------------------------------
// The tree
// ---------------------------------------------------------------------------

export interface TalentTreeSpec {
  readonly nodes: readonly TalentNode[]
  readonly milestones: readonly TalentMilestone[]
}

export interface TalentTree {
  readonly nodes: readonly TalentNode[]
  readonly milestones: readonly TalentMilestone[]
  node(id: TalentNodeId): TalentNode | undefined
  /** Compile every node to an `Unlock` and put it in the shared registry. Call once, at startup. */
  registerInto(registry: UnlockRegistry): void
  /** Taken *and* still valid. Effects come only from these. */
  active(view: ProgressView): readonly TalentNode[]
  points(view: ProgressView): TalentPoints
  effects(view: ProgressView): TalentEffects
  layout(view: ProgressView): TalentLayout
  /**
   * Spend points on a node. Writes one flag and emits `talent.taken`; changes nothing else,
   * because everything else is derived from that flag.
   */
  take(nodeId: TalentNodeId, flags: FlagSet, registry: UnlockRegistry, bus: EventBus): TakeResult
  /**
   * Give back every point: clears the taken flags. Cheap because nothing was ever stored except
   * the choices, which is the whole reason the design keeps activation derived.
   */
  respec(flags: FlagSet): void
  /**
   * `[min, max]` a tunable can reach across *every* combination of nodes in this tree, whether or
   * not the player could afford them. This is what `talentTree.test.ts` checks against the bands
   * in `tunables.ts`, and it is why adding a node cannot quietly move the game out from under the
   * balance invariants.
   */
  reachableTuningRange(key: TunableKey): readonly [number, number]
}

export function createTalentTree(spec: TalentTreeSpec): TalentTree {
  validate(spec.nodes, spec.milestones)
  const byId = new Map(spec.nodes.map((n) => [n.id, n]))
  const declarationOrder = new Map(spec.nodes.map((n, i) => [n.id, i]))

  /** Longest path from a root. Derived so authoring a node never involves layout arithmetic. */
  const rowOf = (() => {
    const memo = new Map<TalentNodeId, number>()
    const depth = (id: TalentNodeId): number => {
      const hit = memo.get(id)
      if (hit !== undefined) return hit
      const prerequisites = byId.get(id)?.requires ?? []
      const value = prerequisites.length === 0 ? 0 : 1 + Math.max(...prerequisites.map(depth))
      memo.set(id, value)
      return value
    }
    return depth
  })()

  function prerequisiteCondition(prerequisite: TalentNodeId): UnlockCondition {
    const parent = byId.get(prerequisite)
    return {
      describe: `Take “${parent?.label ?? prerequisite}” first`,
      isMet: (view) => view.isUnlocked(talentUnlockId(prerequisite)),
    }
  }

  function takenCondition(node: TalentNode): UnlockCondition {
    return {
      describe: `Spend ${node.cost} talent point${node.cost === 1 ? '' : 's'}`,
      isMet: (view) => view.flag(takenFlagId(node.id)) === true,
    }
  }

  function toUnlock(node: TalentNode): Unlock {
    return {
      id: talentUnlockId(node.id),
      label: node.label,
      description: node.description,
      requires: [
        ...(node.requires ?? []).map(prerequisiteCondition),
        ...(node.alsoRequires ?? []),
        takenCondition(node),
      ],
      grants: node.effects.map(encodeEffect),
      hidden: node.hidden,
    }
  }

  /** Everything except "has the player paid for it" — i.e. is this node takeable. */
  function requirementsMet(node: TalentNode, view: ProgressView): readonly string[] {
    const unmet: string[] = []
    for (const prerequisite of node.requires ?? []) {
      const condition = prerequisiteCondition(prerequisite)
      if (!condition.isMet(view)) unmet.push(condition.describe)
    }
    for (const condition of node.alsoRequires ?? []) {
      if (!condition.isMet(view)) unmet.push(condition.describe)
    }
    return unmet
  }

  function isTaken(node: TalentNode, view: ProgressView): boolean {
    return view.flag(takenFlagId(node.id)) === true
  }

  function activeNodes(view: ProgressView): readonly TalentNode[] {
    return spec.nodes.filter((n) => isTaken(n, view) && requirementsMet(n, view).length === 0)
  }

  function points(view: ProgressView): TalentPoints {
    const earned = spec.milestones.reduce((sum, m) => (m.isMet(view) ? sum + m.points : sum), 0)
    const spent = activeNodes(view).reduce((sum, n) => sum + n.cost, 0)
    return { earned, spent, available: earned - spent }
  }

  function effects(view: ProgressView): TalentEffects {
    const on = activeNodes(view)
    const capabilities = new Set<CapabilityId>()
    const contents = new Set<ContentId>()
    const adds = new Map<TunableKey, number>()
    const muls = new Map<TunableKey, number>()

    for (const node of on) {
      for (const effect of node.effects) {
        if (effect.kind === 'capability') capabilities.add(effect.capability)
        else if (effect.kind === 'content') contents.add(effect.content)
        else if (effect.op === 'add') adds.set(effect.key, (adds.get(effect.key) ?? 0) + effect.value)
        else muls.set(effect.key, (muls.get(effect.key) ?? 1) * effect.value)
      }
    }

    return {
      has: (capability) => capabilities.has(capability),
      contentUnlocked: (content) => contents.has(content),
      tuning: (key) => {
        const spec_ = tunable(key)
        const raw = (spec_.base + (adds.get(key) ?? 0)) * (muls.get(key) ?? 1)
        return Math.min(spec_.bounds[1], Math.max(spec_.bounds[0], raw))
      },
      granted: () => [...capabilities, ...contents].sort(),
    }
  }

  function stateOf(node: TalentNode, view: ProgressView, available: number): TalentNodeState {
    const unmet = requirementsMet(node, view)
    if (isTaken(node, view) && unmet.length === 0) return 'active'
    if (unmet.length > 0) return node.hidden ? 'hidden' : 'locked'
    return node.cost <= available ? 'affordable' : 'available'
  }

  function layout(view: ProgressView): TalentLayout {
    const purse = points(view)
    const rows = new Map<number, TalentNode[]>()
    for (const node of spec.nodes) {
      const row = rowOf(node.id)
      const bucket = rows.get(row) ?? []
      bucket.push(node)
      rows.set(row, bucket)
    }

    const nodeViews: TalentNodeView[] = []
    for (const [row, bucket] of rows) {
      const ordered = [...bucket].sort(
        (a, b) =>
          (a.column ?? declarationOrder.get(a.id) ?? 0) - (b.column ?? declarationOrder.get(b.id) ?? 0),
      )
      ordered.forEach((node, index) => {
        const state = stateOf(node, view, purse.available)
        nodeViews.push({
          node,
          state,
          row,
          column: node.column ?? index,
          unmet:
            state === 'available'
              ? [`Needs ${node.cost - purse.available} more talent point(s)`]
              : requirementsMet(node, view),
        })
      })
    }

    const edges: TalentEdgeView[] = []
    for (const node of spec.nodes) {
      for (const prerequisite of node.requires ?? []) {
        edges.push({
          from: prerequisite,
          to: node.id,
          satisfied: view.isUnlocked(talentUnlockId(prerequisite)),
        })
      }
    }

    return {
      nodes: nodeViews,
      edges,
      points: purse,
      nextMilestones: spec.milestones.filter((m) => !m.isMet(view)),
      columns: Math.max(1, ...[...rows.values()].map((b) => b.length)),
      rows: rows.size,
    }
  }

  return {
    nodes: spec.nodes,
    milestones: spec.milestones,
    node: (id) => byId.get(id),

    registerInto(registry) {
      for (const node of spec.nodes) registry.register(toUnlock(node))
    },

    active: activeNodes,
    points,
    effects,
    layout,

    take(nodeId, flags, registry, bus) {
      const node = byId.get(nodeId)
      if (!node) return { ok: false, reason: 'unknown-node', detail: `No talent node "${nodeId}".` }
      const view = createProgressView(flags, registry)
      if (isTaken(node, view)) {
        return { ok: false, reason: 'already-taken', detail: `“${node.label}” is already taken.` }
      }
      const unmet = requirementsMet(node, view)
      if (unmet.length > 0) {
        return { ok: false, reason: 'locked', detail: unmet.join('; ') }
      }
      const purse = points(view)
      if (node.cost > purse.available) {
        return {
          ok: false,
          reason: 'insufficient-points',
          detail: `“${node.label}” costs ${node.cost}; you have ${purse.available}.`,
        }
      }
      flags.set(takenFlagId(node.id), true)
      bus.emit('talent.taken', { nodeId: node.id, cost: node.cost })
      bus.emit('unlock.granted', { unlockId: talentUnlockId(node.id) })
      return { ok: true, node, pointsRemaining: purse.available - node.cost }
    },

    respec(flags) {
      for (const node of spec.nodes) flags.set(takenFlagId(node.id), false)
    },

    reachableTuningRange(key) {
      const base = TUNABLES[key].base
      let addMin = 0
      let addMax = 0
      let mulMin = 1
      let mulMax = 1
      for (const node of spec.nodes) {
        for (const effect of node.effects) {
          if (effect.kind !== 'tuning' || effect.key !== key) continue
          if (effect.op === 'add') {
            if (effect.value < 0) addMin += effect.value
            else addMax += effect.value
          } else if (effect.value < 1) {
            mulMin *= effect.value
          } else {
            mulMax *= effect.value
          }
        }
      }
      // Four corners plus the do-nothing case. Exact for `(base + Σadd) × Πmul`, and robust to a
      // negative intermediate — which is why it is four multiplications rather than two.
      const corners = [
        base,
        (base + addMin) * mulMin,
        (base + addMin) * mulMax,
        (base + addMax) * mulMin,
        (base + addMax) * mulMax,
      ]
      return [Math.min(...corners), Math.max(...corners)]
    },
  }
}
