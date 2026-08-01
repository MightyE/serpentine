/**
 * Serpentine — talent tree: the type layer.
 *
 * ## What this is, and what it deliberately is not
 *
 * This is the *machinery* for a talent tree — the node/edge model, what a node can do when you
 * take it, and how the whole thing is handed to a screen to draw. It is not a talent tree.
 * The tree itself (which nodes exist, what they are called, what they give you, how the
 * branches are themed) is the fun part, and the fun part belongs to whoever is building this
 * game. See `starterTree.ts`, which contains four nodes and a note.
 *
 * ## Why it rides `game/seams.ts` instead of being its own system
 *
 * `seams.ts` already has the exact shape a talent tree needs: `Unlock` records whose `requires`
 * reference each other's ids, evaluated as a pure function of a `FlagSet`. Building a second,
 * parallel notion of "is this available yet" would mean two answers to the same question, and
 * they would drift. So a `TalentNode` **compiles down to an `Unlock`** — prerequisites become
 * `UnlockCondition`s, effects become `grants` strings — and the existing `UnlockRegistry` is the
 * only thing that ever decides whether something is on.
 *
 * The one-directional rule from `seams.ts` survives intact:
 *
 *     player spends a point ──▶ a flag is set ──▶ UnlockRegistry recomputes ──▶ effects apply
 *
 * Nothing here stores an "unlocked" bit. The durable record is only ever *"the player chose to
 * spend on this node"*; whether that choice is currently **active** is recomputed from the rules
 * as they exist today. That matters more than it sounds: it means a node you rebalance next
 * month evaluates correctly against a save file from this month, and it means a respec is
 * "clear some flags", not a migration.
 *
 * ## The three effect kinds
 *
 * A node can do exactly three things, because these three cover everything a progression system
 * is actually for:
 *
 * - **`capability`** — switch a mechanic on. "You can now run two pairings at once."
 * - **`tuning`** — move a number that shapes difficulty. Bounded; see `tunables.ts`.
 * - **`content`** — reveal something that exists but is not yet available to you.
 *
 * If you want a fourth kind, the honest question is whether it is really one of these three
 * wearing a costume. Usually it is.
 */
import type { FlagId, ProgressView, UnlockCondition, UnlockId } from '../seams'

export type TalentNodeId = string
export type TalentBranchId = string

/** An opaque string the rest of the game interprets — `'pairing.concurrent'`, `'ui.pedigree'`. */
export type CapabilityId = string

/** An opaque string naming something that exists but is gated — a biome, a species, a screen. */
export type ContentId = string

/**
 * A tuning value a talent is allowed to move.
 *
 * A deliberately short union rather than `string`, so a typo is a compile error rather than a
 * node that silently does nothing. The registry of what each key means, what it starts at, and
 * how far it may ever travel lives in `tunables.ts`.
 */
export type TunableKey =
  | 'pairingReceptivityMaxWeeks'
  | 'incubationVarianceWeeks'
  | 'slotUpkeepPerWeek'
  | 'residentSupportPerWeek'

/**
 * How a tuning effect combines with others.
 *
 * Only `add` and `mul`, and they are resolved as `(base + Σ adds) × Π muls`. That form is
 * **order-independent**, which is the whole reason for the restriction: if the effect of your
 * tree depended on which node you took first, two players with identical trees would have
 * different games, and no test could pin it down. There is no `set` operator for the same
 * reason — `set` makes the last writer win, and "last" is not a thing a set of unlocks has.
 */
export type TuningOp = 'add' | 'mul'

export type TalentEffect =
  | { readonly kind: 'capability'; readonly capability: CapabilityId }
  | { readonly kind: 'content'; readonly content: ContentId }
  | { readonly kind: 'tuning'; readonly key: TunableKey; readonly op: TuningOp; readonly value: number }

/**
 * One node. **This is the whole authoring surface** — adding a node to the game is adding one
 * of these to the array in `starterTree.ts`. Nothing else needs to change: not the registry,
 * not the layout, not the UI, not the save format.
 */
export interface TalentNode {
  readonly id: TalentNodeId
  /** Player-facing name. */
  readonly label: string
  /** Player-facing. What you get and why you would want it. Shown locked as well as unlocked. */
  readonly description: string
  /** Which track this belongs to. Purely for grouping and colour; no mechanical meaning. */
  readonly branch: TalentBranchId
  /** Talent points to take it. */
  readonly cost: number
  /** Node ids that must be active first. These are the edges of the graph. */
  readonly requires?: readonly TalentNodeId[]
  /**
   * Extra requirements beyond the prerequisite nodes — "have placed an animal", "have proven a
   * het". Same `UnlockCondition` the rest of the game uses, so `describe` is mandatory and the
   * UI can always say what is standing in the way.
   */
  readonly alsoRequires?: readonly UnlockCondition[]
  /** What taking it does. A node with no effects is legal but pointless; the validator says so. */
  readonly effects: readonly TalentEffect[]
  /** Hidden nodes are not drawn at all until their prerequisites are active. For surprises. */
  readonly hidden?: boolean
  /**
   * Optional column hint for layout. Rows are derived from the graph, so most nodes need
   * nothing here; set it only when you want two siblings side by side in a specific order.
   */
  readonly column?: number
}

/**
 * A way to earn talent points.
 *
 * Points come from **milestones of understanding**, never from repetition and never from money.
 * That is a design position, not an implementation detail: principle 2 of the balance charter
 * says information is the reward, so the thing that advances you should be *finding something
 * out* — proving a het, hatching a first clutch, outcrossing a narrow line — rather than doing
 * anything a hundred times.
 *
 * `isMet` is a pure read of flags, so the total points a player has earned is derived, never
 * stored. Nothing in a save file can lose them.
 */
export interface TalentMilestone {
  readonly id: string
  /** Shown in the UI as a goal. "Prove a het by test breeding." */
  readonly describe: string
  readonly points: number
  readonly isMet: (view: ProgressView) => boolean
}

export interface TalentPoints {
  /** From milestones currently met. Derived. */
  readonly earned: number
  /** Sum of the costs of nodes currently taken *and still valid*. Derived. */
  readonly spent: number
  readonly available: number
}

export type TalentNodeState =
  /** Taken, prerequisites met, effects applying. */
  | 'active'
  /** Not taken; prerequisites met; the player can afford it right now. */
  | 'affordable'
  /** Not taken; prerequisites met; not enough points yet. */
  | 'available'
  /** Prerequisites or extra conditions not met. */
  | 'locked'
  /** A `hidden` node whose prerequisites are not met. Do not draw it. */
  | 'hidden'

/** One node, ready to draw. A renderer needs nothing from this module except this record. */
export interface TalentNodeView {
  readonly node: TalentNode
  readonly state: TalentNodeState
  /** Derived depth in the graph — longest path from a root. Use it as the row. */
  readonly row: number
  readonly column: number
  /** Human-readable reasons this node is not takeable yet. Empty when `affordable` or `active`. */
  readonly unmet: readonly string[]
}

export interface TalentEdgeView {
  readonly from: TalentNodeId
  readonly to: TalentNodeId
  /** True when `from` is active — i.e. draw this edge lit. */
  readonly satisfied: boolean
}

/** Everything a screen needs. Position, state, and why — no game logic on the UI side. */
export interface TalentLayout {
  readonly nodes: readonly TalentNodeView[]
  readonly edges: readonly TalentEdgeView[]
  readonly points: TalentPoints
  /** Milestones not yet met, as goals to show. */
  readonly nextMilestones: readonly TalentMilestone[]
  /** Widest row, so a renderer can size its grid without walking the nodes itself. */
  readonly columns: number
  readonly rows: number
}

/** What `take` did, or why it did nothing. Never throws for an ordinary refusal. */
export type TakeResult =
  | { readonly ok: true; readonly node: TalentNode; readonly pointsRemaining: number }
  | { readonly ok: false; readonly reason: TakeRefusal; readonly detail: string }

export type TakeRefusal = 'unknown-node' | 'already-taken' | 'locked' | 'insufficient-points'

/**
 * Read side of a taken tree. Handed to the systems that care — breeding asks about capabilities,
 * the economy asks about tuning, the storefront asks about content.
 */
export interface TalentEffects {
  has(capability: CapabilityId): boolean
  contentUnlocked(content: ContentId): boolean
  /** The tunable's base value with every active modifier applied, clamped to its declared band. */
  tuning(key: TunableKey): number
  /** For a debug panel: every capability and content id currently switched on. */
  granted(): readonly string[]
}

/** The flag that records a spend. One per node, namespaced so a save file stays readable. */
export function takenFlagId(nodeId: TalentNodeId): FlagId {
  return `talent.taken.${nodeId}`
}

/** The `UnlockId` a node compiles to. Namespaced so it cannot collide with a hand-written unlock. */
export function talentUnlockId(nodeId: TalentNodeId): UnlockId {
  return `talent:${nodeId}`
}
