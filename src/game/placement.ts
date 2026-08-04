/**
 * The store floor: which habitats are built where, who lives in each, and what happens when you
 * try to move an animal.
 *
 * ## No renderer, no React, no Session
 *
 * Everything here is a pure function over plain data. A `StoreState` in, a `StoreState` out; the
 * only inputs beyond that are facts about animals, handed in through {@link PlacementWorld}, so
 * this file never has to know what a genotype is. That is what lets `placement.test.ts` drive the
 * whole thing — capacity limits, refusal reasons, moving an animal, save round-trip — with no
 * canvas and no game. Same discipline as `session.ts`: state is not allowed to live in a
 * component, and the rules are not allowed to live in the renderer.
 *
 * ## The grid is a parameter
 *
 * `columns` and `rows` are stored on the state, defaulted from `STORE_GRID_DEFAULT`. Nothing in
 * this file or in `ui/Store.tsx` hard-codes nine. The store is going to become upgradable, so
 * three-by-three is today's value and not an assumption — see the note in `tuning.ts`.
 *
 * ## Refusals
 *
 * Every rejected placement returns a {@link PlacementRefusal} carrying the facts its sentence
 * needs, and `describeRefusal` turns it into that sentence. There is deliberately no path through
 * this file that returns `false`, `null`-as-failure, or a silent no-op: a drag that vanishes with
 * no explanation is the worst thing this screen could do.
 */

import type { IndividualId } from '../genetics/types'
import type { AnyProvision } from '../habitat/contract'
import { canHouse, type PlacementRefusal } from '../habitat/provisions'
import { biomeRegistry, featureRegistry } from '../habitat/registry'
import {
  HABITAT_SIZES,
  STORE_GRID_DEFAULT,
  habitatSize,
  type HabitatSize,
  type HabitatSizeId,
  type LifeStage,
} from './tuning'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** One built habitat, anchored at a top-left cell and spanning its size's cells. */
export interface HabitatState {
  /** Stable and unique. **Seeds the artwork** — see `habitat/compose.ts` — so never reuse one. */
  readonly id: string
  readonly sizeId: HabitatSizeId
  readonly biomeId: string
  readonly featureIds: readonly string[]
  /** Top-left cell, zero-based. */
  readonly column: number
  readonly row: number
  /** In placement order. The list is the seating plan, not a set. */
  readonly occupants: readonly IndividualId[]
}

/** The whole floor. Plain data all the way down, so this *is* the save-file shape. */
export interface StoreState {
  readonly columns: number
  readonly rows: number
  readonly habitats: readonly HabitatState[]
}

/** One cell of the grid. */
export interface Cell {
  readonly column: number
  readonly row: number
}

// ---------------------------------------------------------------------------
// What placement needs to know about an animal
// ---------------------------------------------------------------------------

/**
 * The facts about one animal that housing rules read, and nothing else.
 *
 * Narrow on purpose, and it is the reason this file imports nothing from `session.ts`: everything
 * placement decides is a function of stage, species and sex. A test writes four of these by hand;
 * the session builds them from the roster.
 */
export interface AnimalFacts {
  readonly id: IndividualId
  readonly name: string
  /** `src/species/` id — `'ball-python'`, not `'Ball python'`. Compared, never shown. */
  readonly species: string
  /** Player-facing species name, for the refusal sentence. */
  readonly speciesLabel: string
  readonly sex: 'female' | 'male'
  readonly stage: LifeStage
}

/** How placement looks an animal up. One function, so a test can hand in a `Map`'s getter. */
export interface PlacementWorld {
  readonly animal: (id: IndividualId) => AnimalFacts | undefined
}

/** Build a world from a list. The shortest path from a test fixture to a `PlacementWorld`. */
export function worldOf(animals: readonly AnimalFacts[]): PlacementWorld {
  const byId = new Map(animals.map((a) => [a.id, a]))
  return { animal: (id) => byId.get(id) }
}

// ---------------------------------------------------------------------------
// Building a store
// ---------------------------------------------------------------------------

export interface StoreOptions {
  readonly columns?: number
  readonly rows?: number
  readonly habitats?: readonly HabitatState[]
}

export function createStore(options: StoreOptions = {}): StoreState {
  return {
    columns: options.columns ?? STORE_GRID_DEFAULT.columns,
    rows: options.rows ?? STORE_GRID_DEFAULT.rows,
    habitats: options.habitats ?? [],
  }
}

/**
 * The floor a new game starts on: two alcoves and a vivarium, in a nine-cell room.
 *
 * Five of nine cells are visibly empty from the first minute. That is the point — floor space you
 * can see and cannot use yet is what makes buying more of it feel like something, and a full grid
 * on day one would make the eventual upgrade read as a chore rather than a reward.
 *
 * Only the alcoves take hatchlings, so the first clutch immediately runs into the shape of the
 * capacity problem rather than being told about it.
 */
export function startingStore(options: StoreOptions = {}): StoreState {
  return createStore({
    ...options,
    habitats: options.habitats ?? [
      {
        id: 'habitat-1',
        sizeId: 'vivarium',
        biomeId: 'west-african-scrub',
        featureIds: ['cork-hide', 'water-bowl'],
        column: 0,
        row: 0,
        occupants: [],
      },
      {
        id: 'habitat-2',
        sizeId: 'alcove',
        biomeId: 'woodland-edge',
        featureIds: ['cork-hide'],
        column: 2,
        row: 0,
        occupants: [],
      },
      {
        id: 'habitat-3',
        sizeId: 'alcove',
        biomeId: 'sandy-prairie',
        featureIds: ['water-bowl'],
        column: 0,
        row: 1,
        occupants: [],
      },
    ],
  })
}

// ---------------------------------------------------------------------------
// Reading the floor
// ---------------------------------------------------------------------------

export function sizeOf(habitat: HabitatState): HabitatSize {
  return habitatSize(habitat.sizeId)
}

/** Every cell a habitat covers. */
export function cellsOf(habitat: HabitatState): readonly Cell[] {
  const size = sizeOf(habitat)
  const cells: Cell[] = []
  for (let r = 0; r < size.rows; r++) {
    for (let c = 0; c < size.columns; c++) {
      cells.push({ column: habitat.column + c, row: habitat.row + r })
    }
  }
  return cells
}

export function habitatById(store: StoreState, id: string): HabitatState | undefined {
  return store.habitats.find((habitat) => habitat.id === id)
}

/** Whatever covers this cell, if anything. */
export function habitatAt(store: StoreState, cell: Cell): HabitatState | undefined {
  return store.habitats.find((habitat) =>
    cellsOf(habitat).some((c) => c.column === cell.column && c.row === cell.row),
  )
}

/** Cells with nothing built on them — the buildable space. */
export function freeCells(store: StoreState): readonly Cell[] {
  const out: Cell[] = []
  for (let row = 0; row < store.rows; row++) {
    for (let column = 0; column < store.columns; column++) {
      if (!habitatAt(store, { column, row })) out.push({ column, row })
    }
  }
  return out
}

/** Where an animal currently lives, if anywhere. Animals off the floor are simply unhoused. */
export function habitatOf(store: StoreState, snakeId: IndividualId): HabitatState | undefined {
  return store.habitats.find((habitat) => habitat.occupants.includes(snakeId))
}

/** Every animal on the floor, in no particular order. */
export function housedAnimals(store: StoreState): readonly IndividualId[] {
  return store.habitats.flatMap((habitat) => habitat.occupants)
}

/**
 * The provisions installed in a habitat: its biome plus its features, as one list.
 *
 * One list, because a biome and a feature are the same type — `habitat/contract.ts` explains why
 * at length, and this is the payoff: nothing downstream branches on which kind it is holding.
 * Unknown ids are skipped rather than thrown on, because a save written against a build that had
 * a feature this one does not should load with that feature missing, not refuse to open.
 */
export function provisionsOf(habitat: HabitatState): readonly AnyProvision[] {
  const out: AnyProvision[] = []
  const biome = biomeRegistry.get(habitat.biomeId)
  if (biome) out.push(biome)
  for (const id of habitat.featureIds) {
    const feature = featureRegistry.get(id)
    if (feature) out.push(feature)
  }
  return out
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

export interface PlacementOptions {
  /**
   * The player has seen the `wouldPair` refusal and said yes.
   *
   * Two compatible animals in one habitat is how a pairing happens — that is the mechanic, not a
   * mistake. But a clutch you got because you dropped a snake in the wrong box is a clutch you
   * did not choose, and choosing the pairing is the game. So it asks once.
   */
  readonly confirmPairing?: boolean
}

/**
 * Would putting this animal in this habitat be all right?
 *
 * `null` means yes. Anything else is a refusal carrying the facts its sentence needs; run it
 * through `describeRefusal` and show it. Order matters: the cheapest and most obvious reasons are
 * checked first, so the player is told the *most useful* thing rather than the first thing that
 * happens to be wrong.
 */
export function canPlace(
  store: StoreState,
  habitatId: string,
  snakeId: IndividualId,
  world: PlacementWorld,
  options: PlacementOptions = {},
): PlacementRefusal | null {
  const habitat = habitatById(store, habitatId)
  if (!habitat) return { kind: 'unbuilt' }

  const size = sizeOf(habitat)
  const incoming = world.animal(snakeId)
  if (!incoming) return { kind: 'unbuilt' }

  if (habitat.occupants.includes(snakeId)) {
    return { kind: 'alreadyHere', enclosure: size.label }
  }

  const enclosureSays = canHouse(size, incoming.stage, provisionsOf(habitat), habitat.occupants.length)
  if (enclosureSays) return enclosureSays

  const residents = habitat.occupants
    .map((id) => world.animal(id))
    .filter((a): a is AnimalFacts => a !== undefined)

  const otherSpecies = residents.find((r) => r.species !== incoming.species)
  if (otherSpecies) {
    return {
      kind: 'mixedSpecies',
      enclosure: size.label,
      resident: otherSpecies.name,
      residentSpecies: otherSpecies.speciesLabel,
      incomingSpecies: incoming.speciesLabel,
    }
  }

  if (!options.confirmPairing) {
    const partner = residents.find((r) => wouldPair(incoming, r))
    if (partner) {
      return { kind: 'wouldPair', enclosure: size.label, partnerId: partner.id, partner: partner.name }
    }
  }

  return null
}

/**
 * Would these two breed if they shared an enclosure?
 *
 * The same three conditions `Session.previewPairing` checks — same species, one of each sex, both
 * grown — asked of the facts placement has rather than of two genotypes. Deliberately *not* a
 * second breeding rule: this only decides whether to ask the question. `session.ts` still owns
 * whether a pairing can actually go ahead, and it is the only thing that produces a clutch.
 */
export function wouldPair(a: AnimalFacts, b: AnimalFacts): boolean {
  return a.species === b.species && a.sex !== b.sex && a.stage === 'adult' && b.stage === 'adult'
}

/**
 * The pairing sitting in a habitat right now, if there is one.
 *
 * What the store shows as "these two will pair", and what the session hands to its existing
 * `breed()`. Returns the first compatible couple; a habitat holding three adults is a decision
 * the player made and the game does not try to be clever about it.
 */
export function pairingIn(
  store: StoreState,
  habitatId: string,
  world: PlacementWorld,
): { readonly motherId: IndividualId; readonly fatherId: IndividualId } | undefined {
  const habitat = habitatById(store, habitatId)
  if (!habitat) return undefined
  const residents = habitat.occupants
    .map((id) => world.animal(id))
    .filter((a): a is AnimalFacts => a !== undefined)

  for (let i = 0; i < residents.length; i++) {
    for (let j = i + 1; j < residents.length; j++) {
      const a = residents[i]!
      const b = residents[j]!
      if (!wouldPair(a, b)) continue
      const mother = a.sex === 'female' ? a : b
      const father = a.sex === 'female' ? b : a
      return { motherId: mother.id, fatherId: father.id }
    }
  }
  return undefined
}

/**
 * Put an animal in a habitat, taking it out of wherever it was.
 *
 * **Throws if the placement was refused**, rather than returning the store unchanged. A silent
 * no-op here would be a bug that looks like a UI glitch: call `canPlace` first, which every path
 * in `ui/Store.tsx` does so it can show the reason.
 */
export function place(
  store: StoreState,
  habitatId: string,
  snakeId: IndividualId,
  world: PlacementWorld,
  options: PlacementOptions = {},
): StoreState {
  const refusal = canPlace(store, habitatId, snakeId, world, options)
  if (refusal) {
    throw new Error(`place: refused (${refusal.kind}). Call canPlace first and show the reason.`)
  }
  return {
    ...store,
    habitats: store.habitats.map((habitat) => {
      const without = habitat.occupants.filter((id) => id !== snakeId)
      if (habitat.id !== habitatId) {
        return without.length === habitat.occupants.length ? habitat : { ...habitat, occupants: without }
      }
      return { ...habitat, occupants: [...without, snakeId] }
    }),
  }
}

/** Take an animal off the floor entirely. Idempotent — withdrawing an unhoused animal is fine. */
export function withdraw(store: StoreState, snakeId: IndividualId): StoreState {
  if (!habitatOf(store, snakeId)) return store
  return {
    ...store,
    habitats: store.habitats.map((habitat) =>
      habitat.occupants.includes(snakeId)
        ? { ...habitat, occupants: habitat.occupants.filter((id) => id !== snakeId) }
        : habitat,
    ),
  }
}

/** Build a habitat on free floor. The seam the store upgrade will use; no purchase flow here. */
export function build(store: StoreState, habitat: HabitatState): StoreState {
  const size = habitatSize(habitat.sizeId)
  if (habitat.column + size.columns > store.columns || habitat.row + size.rows > store.rows) {
    throw new Error(`build: a ${size.label} at (${habitat.column}, ${habitat.row}) runs off the floor.`)
  }
  for (const cell of cellsOf(habitat)) {
    if (habitatAt(store, cell)) {
      throw new Error(`build: cell (${cell.column}, ${cell.row}) already has a habitat on it.`)
    }
  }
  return { ...store, habitats: [...store.habitats, habitat] }
}

// ---------------------------------------------------------------------------
// Save / load
// ---------------------------------------------------------------------------

/**
 * The save-file shape. Identical to {@link StoreState}, and that is the design: every field is
 * already plain JSON, so serialising is a projection with no translation layer to keep in sync —
 * the same property that makes `game/save.ts`'s round-trip lossless.
 */
export type StoreSave = StoreState

export function serializeStore(store: StoreState): StoreSave {
  return {
    columns: store.columns,
    rows: store.rows,
    habitats: store.habitats.map((habitat) => ({ ...habitat, occupants: [...habitat.occupants] })),
  }
}

/**
 * Read a store back, dropping occupants who are no longer on the roster.
 *
 * An animal that was sold between save and load must not stay in its enclosure holding a slot
 * that nothing can free — so `knownAnimals` is required rather than optional. Passing `undefined`
 * would have been the convenient signature and the one that quietly leaks phantom residents.
 */
export function deserializeStore(save: StoreSave, knownAnimals: ReadonlySet<IndividualId>): StoreState {
  const sizes = new Set(HABITAT_SIZES.map((size) => size.id))
  return {
    columns: save.columns,
    rows: save.rows,
    habitats: save.habitats
      .filter((habitat) => sizes.has(habitat.sizeId))
      .map((habitat) => ({
        ...habitat,
        featureIds: [...habitat.featureIds],
        occupants: habitat.occupants.filter((id) => knownAnimals.has(id)),
      })),
  }
}
