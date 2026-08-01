/**
 * Serpentine — progression: the talent tree framework.
 *
 * Wiring it up is four lines:
 *
 * ```ts
 * const tree = createTalentTree(STARTER_TREE)
 * tree.registerInto(game.unlocks)
 * const view = createProgressView(game.flags, game.unlocks)
 * const layout = tree.layout(view)          // hand this straight to a screen
 * ```
 *
 * and reading it back is one:
 *
 * ```ts
 * if (tree.effects(view).has('pairing.concurrent')) { ... }
 * ```
 *
 * Make a fresh `ProgressView` whenever flags may have changed — it is cheap, and a stale one is
 * the one way to get a wrong answer out of this. See `progressView.ts`.
 *
 * The framework is ours; the tree is not. `starterTree.ts` says which is which and why.
 */
export { createProgressView } from './progressView'
export { createTalentTree, decodeEffect, encodeEffect, TalentTreeError } from './talentTree'
export type { TalentTree, TalentTreeSpec } from './talentTree'
export {
  FLAGS_READ_BY_STARTER_TREE,
  STARTER_MILESTONES,
  STARTER_TREE,
  STARTER_TREE_NODES,
} from './starterTree'
export { RESIDENT_NET_MUST_BE_NEGATIVE, TUNABLES, TUNABLE_KEYS, residentNetPerWeek, tunable } from './tunables'
export type { Tunable } from './tunables'
export { takenFlagId, talentUnlockId } from './types'
export type {
  CapabilityId,
  ContentId,
  TakeRefusal,
  TakeResult,
  TalentBranchId,
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
  TuningOp,
} from './types'
