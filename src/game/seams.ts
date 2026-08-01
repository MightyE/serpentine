/**
 * Serpentine — progression seams.
 *
 * ## What this file is
 *
 * Three small, boring, general mechanisms — a flag set, an unlock registry, and an event bus —
 * and nothing built on top of them.
 *
 * That is the point. **There is no talent tree here, and no quests, and no achievements.**
 * Those are the fun part, and the fun part is not ours to design. What is here is the plumbing
 * that makes them cheap to add later: a place to record that something happened, a place to ask
 * whether something is available yet, and a way for one part of the game to notice what another
 * part did without the two of them having to know about each other.
 *
 * Read this file as an invitation with the shape already cut out.
 *
 * ## How the three fit together
 *
 *     something happens  ──▶  EventBus.emit  ──▶  a listener sets a FlagSet value
 *                                                          │
 *                                       UnlockRegistry reads flags ──▶ decides what is available
 *
 * Deliberately one-directional. Unlocks read state; they never write it. That means you can
 * recompute every unlock from scratch at any moment — on load, after a save migration, after
 * a bug fix — and get the right answer, instead of relying on a stored "unlocked" bit that may
 * have been set by a version of the rules that no longer exists.
 *
 * ## No imports
 *
 * These types name no gene, no species, no phenotype, no snake. That is why they can be
 * referenced from anywhere in the game without dragging a dependency along, and why the
 * event payloads below use plain string ids rather than real objects.
 */

// ---------------------------------------------------------------------------
// Flags — the durable record of what has happened
// ---------------------------------------------------------------------------

/** e.g. `'hasBredFirstClutch'`, `'clutchesHatched'`, `'favouriteSpecies'`. */
export type FlagId = string

/**
 * Deliberately narrow. Flags go in the save file, so they have to be plain.
 *
 * Counters are just numbers — `'clutchesHatched': 12`. Resist the urge to allow objects here;
 * the moment a flag has structure it stops being something an unlock condition can read at a
 * glance, and it starts needing a migration every time it changes.
 */
export type FlagValue = boolean | number | string

/**
 * The game's memory of what the player has done.
 *
 * Everything a progression system could ever want to branch on ends up here, which is what
 * makes the unlock side able to stay a pure function.
 */
export interface FlagSet {
  get(id: FlagId): FlagValue | undefined
  /** Emits `'flag.changed'` on the bus when the value actually changes. */
  set(id: FlagId, value: FlagValue): void
  has(id: FlagId): boolean
  /** Convenience for the common case: `bump('clutchesHatched')`. Missing counts as 0. */
  bump(id: FlagId, by?: number): number
  /** Everything, for the save file and for a debug panel. */
  all(): Readonly<Record<FlagId, FlagValue>>
}

// ---------------------------------------------------------------------------
// Unlocks — what is available, computed rather than remembered
// ---------------------------------------------------------------------------

export type UnlockId = string

/**
 * The read-only view an unlock condition is given.
 *
 * Narrow on purpose. A condition can see flags and other unlocks and nothing else, which
 * guarantees it cannot have side effects and makes the whole registry testable with a
 * hand-written fake — no game, no save file, no snakes.
 */
export interface ProgressView {
  flag(id: FlagId): FlagValue | undefined
  /** Numeric read of a counter flag. Missing counts as 0. */
  count(id: FlagId): number
  /** Lets one unlock require another. This is the edge in a dependency graph. */
  isUnlocked(id: UnlockId): boolean
}

/**
 * One requirement.
 *
 * `describe` is not optional and is not a comment: it is what the UI shows for a locked
 * thing — "breed three clutches" — so the player always knows what to go and do. A locked
 * entry with no legible reason is the most annoying thing a progression system can do.
 */
export interface UnlockCondition {
  readonly describe: string
  readonly isMet: (view: ProgressView) => boolean
}

/**
 * One thing that can become available.
 *
 * ### This is the talent-tree seam
 *
 * A talent tree is nothing more than a set of these whose `requires` reference each other's
 * ids. Branching paths, tiers, mutually exclusive specialisations, a respec — all of them are
 * arrangements of `Unlock` records plus a screen to draw them on. Nothing in the engine needs
 * to change to support any of that, and nothing here presumes which arrangement you will pick.
 *
 * `grants` is intentionally an untyped list of strings. The game layer decides what a grant
 * means — a species you can now keep, a screen that appears, a mechanic that switches on. If
 * grants were an enum, adding a new kind of reward would mean editing this file. It should
 * mean editing a data file.
 */
export interface Unlock {
  readonly id: UnlockId
  readonly label: string
  /** Player-facing. What you get, and why you would want it. */
  readonly description: string
  /** All must be met. For "any of", write one condition that ors internally. */
  readonly requires: readonly UnlockCondition[]
  /** Opaque capability strings the rest of the game interprets. */
  readonly grants: readonly string[]
  /** If true, do not show this at all until it is met — for surprises. Default false. */
  readonly hidden?: boolean
}

/**
 * Where unlocks live, and the one place that answers "can I do this yet?".
 *
 * `evaluate` recomputes everything from the current flags. It is cheap, it is a pure function
 * of state, and it should be called freely — on load, after any flag change, whenever a screen
 * opens. Do not cache the answer somewhere else; that is how a progression system gets stuck.
 */
export interface UnlockRegistry {
  /** Throws on a duplicate id. */
  register(unlock: Unlock): void
  get(id: UnlockId): Unlock | undefined
  all(): readonly Unlock[]
  /** True if every condition is currently met. */
  isUnlocked(id: UnlockId, view: ProgressView): boolean
  /** Everything currently unlocked. Recomputed, never stored. */
  evaluate(view: ProgressView): readonly Unlock[]
  /**
   * Everything still locked but worth showing, with the conditions that are not met yet —
   * this is what a "next goals" panel is built from, and it is why `describe` is required.
   */
  pending(view: ProgressView): readonly PendingUnlock[]
}

/** A locked unlock and exactly what is standing in the way. */
export interface PendingUnlock {
  readonly unlock: Unlock
  readonly unmet: readonly UnlockCondition[]
}

// ---------------------------------------------------------------------------
// Events — how one part of the game notices another
// ---------------------------------------------------------------------------

/**
 * Every event the game can emit, as a map from name to payload.
 *
 * ### How to add one
 *
 * Do not edit this interface for a feature-specific event. Use declaration merging from your
 * own module, which lets an event be added next to the code that emits it:
 *
 * ```ts
 * declare module '../game/seams' {
 *   interface GameEventMap {
 *     'shop.itemBought': { itemId: string; price: number }
 *   }
 * }
 * ```
 *
 * The bus stays fully typed — `on('shop.itemBought', e => e.price)` knows `price` is a number —
 * and the map does not become a dumping ground that everything in the game depends on.
 *
 * ### Why the payloads are all ids
 *
 * Passing a whole snake object here would make this file depend on the genetics engine, and
 * would mean an event carried a snapshot that could go stale between emit and handling. Ids
 * cannot go stale. Look the object up when you handle it.
 */
export interface GameEventMap {
  /** A pairing produced eggs. Emitted before anything is known about them. */
  'clutch.laid': {
    motherId: string
    fatherId: string
    eggCount: number
    clutchSeed: string
  }
  'egg.hatched': { individualId: string; clutchSeed: string }
  /**
   * An egg did not hatch, because of the genotype it had.
   *
   * `explanation` is the genetics fact, ready to show — this is reported the way a Punnett
   * square is reported. Nothing in this game models an animal dying, and no handler of this
   * event should.
   */
  'egg.notViable': { clutchSeed: string; explanation: string; ruleId: string }
  /** A snake joined the collection, from breeding, rescue, or anywhere else. */
  'snake.acquired': { individualId: string; source: string }
  /** A new allele appeared, by mutation or by being seen for the first time. */
  'allele.discovered': { speciesId: string; locusId: string; alleleId: string }
  /** Belief about an animal's genetics changed — a test breeding paid off. */
  'genetics.proven': { individualId: string; locusId: string }
  'flag.changed': { flag: FlagId; value: FlagValue }
  'unlock.granted': { unlockId: UnlockId }
}

export type GameEventType = keyof GameEventMap

/** Call it to stop listening. Always keep it; a listener that outlives its screen is a leak. */
export type Unsubscribe = () => void

/**
 * A tiny typed pub/sub.
 *
 * The reason this exists rather than direct calls: progression has to observe almost
 * everything, and without a bus, every system in the game would have to know about the
 * progression system in order to tell it things. With one, progression subscribes and the
 * rest of the game carries on unaware. That is the difference between adding a talent tree
 * later and rewriting the game to add a talent tree later.
 *
 * Keep handlers cheap and synchronous. If a handler throws, the bus must log it and continue —
 * one broken listener should never stop a clutch from hatching.
 */
export interface EventBus {
  on<K extends GameEventType>(
    type: K,
    handler: (payload: GameEventMap[K]) => void,
  ): Unsubscribe
  /** Auto-unsubscribes after the first call. */
  once<K extends GameEventType>(
    type: K,
    handler: (payload: GameEventMap[K]) => void,
  ): Unsubscribe
  emit<K extends GameEventType>(type: K, payload: GameEventMap[K]): void
}
