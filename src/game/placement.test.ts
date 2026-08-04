/**
 * Placement, with no renderer anywhere in sight.
 *
 * That is the point of the test as much as of the file it tests: every rule the store screen
 * enforces — capacity, life stage, mixed species, the pairing confirmation, moving an animal
 * between habitats, surviving a save — is checkable here, so a bug in any of them is found
 * without a browser. If a placement misbehaves in the app and these all pass, the bug is in the
 * component. Same contract as `session.test.ts`.
 */

import { describe, expect, it } from 'vitest'
// Registers the biomes and features that `provisionsOf` resolves ids against.
import '../habitat'
import { describeRefusal } from '../habitat/provisions'
import {
  build,
  canPlace,
  createStore,
  deserializeStore,
  freeCells,
  habitatById,
  habitatOf,
  pairingIn,
  place,
  serializeStore,
  startingStore,
  withdraw,
  worldOf,
  type AnimalFacts,
  type HabitatState,
  type StoreState,
} from './placement'
import { HABITAT_SIZES, STORE_GRID_DEFAULT } from './tuning'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function animal(overrides: Partial<AnimalFacts> & { id: string }): AnimalFacts {
  return {
    name: `Snake ${overrides.id}`,
    species: 'ball-python',
    speciesLabel: 'ball python',
    sex: 'female',
    stage: 'adult',
    ...overrides,
  }
}

const ADAM = animal({ id: 'a', name: 'Adam', sex: 'male' })
const EVE = animal({ id: 'b', name: 'Eve', sex: 'female' })
const CAIN = animal({ id: 'c', name: 'Cain', sex: 'male' })
const HATCHLING = animal({ id: 'h', name: 'Pip', stage: 'hatchling' })
const CORN = animal({ id: 'x', name: 'Kernel', species: 'corn-snake', speciesLabel: 'corn snake', sex: 'male' })

const world = worldOf([ADAM, EVE, CAIN, HATCHLING, CORN])

function habitat(overrides: Partial<HabitatState> & { id: string }): HabitatState {
  return {
    sizeId: 'alcove',
    biomeId: 'west-african-scrub',
    featureIds: [],
    column: 0,
    row: 0,
    occupants: [],
    ...overrides,
  }
}

/** One alcove (capacity 1) and one vivarium (capacity 2), on a default grid. */
function twoHabitats(): StoreState {
  return createStore({
    habitats: [
      habitat({ id: 'alc', sizeId: 'alcove', column: 2, row: 0 }),
      habitat({ id: 'viv', sizeId: 'vivarium', column: 0, row: 0 }),
    ],
  })
}

// ---------------------------------------------------------------------------

describe('the store floor', () => {
  it('takes its grid size as a parameter rather than assuming three by three', () => {
    expect(createStore().columns).toBe(STORE_GRID_DEFAULT.columns)
    expect(createStore().rows).toBe(STORE_GRID_DEFAULT.rows)

    const bigger = createStore({ columns: 5, rows: 4 })
    expect(bigger.columns).toBe(5)
    expect(freeCells(bigger)).toHaveLength(20)
  })

  it('reports unbuilt cells as free space', () => {
    const store = startingStore()
    // A vivarium (2 cells) and two alcoves (1 each) on a nine-cell floor.
    expect(freeCells(store)).toHaveLength(9 - 4)
  })

  it('refuses to build a habitat that overlaps another or runs off the floor', () => {
    const store = twoHabitats()
    expect(() => build(store, habitat({ id: 'clash', column: 0, row: 0 }))).toThrow(/already has a habitat/)
    expect(() => build(store, habitat({ id: 'edge', sizeId: 'vivarium', column: 2, row: 2 }))).toThrow(
      /runs off the floor/,
    )
  })
})

describe('capacity', () => {
  it('gives every size exactly one animal per grid cell', () => {
    // Principle 7's mechanism, asserted as a property rather than as three numbers: a bigger
    // habitat must never be more capacity-efficient, or space stops being scarce. If this test
    // breaks because a size got generous, read `tuning.ts`'s note before changing the test.
    for (const size of HABITAT_SIZES) {
      expect(size.capacity).toBe(size.columns * size.rows)
    }
  })

  it('fills to capacity and then refuses, saying what the limit is', () => {
    let store = twoHabitats()
    store = place(store, 'viv', ADAM.id, world)
    store = place(store, 'viv', CAIN.id, world)

    const refusal = canPlace(store, 'viv', EVE.id, world)
    expect(refusal).toEqual({ kind: 'capacity', capacity: 2, enclosure: 'Vivarium' })
    expect(describeRefusal(refusal!)).toContain('full')
  })

  it('refuses a hatchling in a habitat too big for it, and names the stage', () => {
    const store = createStore({ habitats: [habitat({ id: 'atr', sizeId: 'atrium' })] })
    const refusal = canPlace(store, 'atr', HATCHLING.id, world)
    expect(refusal?.kind).toBe('lifeStage')
    expect(describeRefusal(refusal!)).toContain('hatchling')
  })

  it('takes a hatchling in an alcove, which is the size that accepts one', () => {
    const store = twoHabitats()
    expect(canPlace(store, 'alc', HATCHLING.id, world)).toBeNull()
  })
})

describe('refusals always say why', () => {
  it('describes every refusal a placement can produce, non-emptily', () => {
    let store = twoHabitats()
    store = place(store, 'alc', ADAM.id, world)

    const refusals = [
      canPlace(store, 'nope', EVE.id, world), // unbuilt
      canPlace(store, 'alc', ADAM.id, world), // alreadyHere
      canPlace(store, 'alc', EVE.id, world), // capacity (alcove holds one)
      canPlace(createStore({ habitats: [habitat({ id: 'atr', sizeId: 'atrium' })] }), 'atr', HATCHLING.id, world),
    ]

    for (const refusal of refusals) {
      expect(refusal).not.toBeNull()
      expect(describeRefusal(refusal!).length).toBeGreaterThan(20)
    }
  })

  it('will not house two species together, and names both', () => {
    let store = twoHabitats()
    store = place(store, 'viv', ADAM.id, world)

    const refusal = canPlace(store, 'viv', CORN.id, world)
    expect(refusal?.kind).toBe('mixedSpecies')
    const sentence = describeRefusal(refusal!)
    expect(sentence).toContain('Adam')
    expect(sentence).toContain('corn snake')
  })

  it('will not silently create a pairing, but takes yes for an answer', () => {
    let store = twoHabitats()
    store = place(store, 'viv', ADAM.id, world)

    const refusal = canPlace(store, 'viv', EVE.id, world)
    expect(refusal?.kind).toBe('wouldPair')
    expect(describeRefusal(refusal!)).toContain('Adam')

    expect(canPlace(store, 'viv', EVE.id, world, { confirmPairing: true })).toBeNull()
    store = place(store, 'viv', EVE.id, world, { confirmPairing: true })
    expect(habitatById(store, 'viv')!.occupants).toEqual([ADAM.id, EVE.id])
  })

  it('does not ask about a pairing that could not happen anyway', () => {
    let store = twoHabitats()
    store = place(store, 'viv', ADAM.id, world)
    // Two males. Nothing to confirm, so it just goes in.
    expect(canPlace(store, 'viv', CAIN.id, world)).toBeNull()
  })

  it('throws rather than silently doing nothing when a refused placement is forced through', () => {
    let store = twoHabitats()
    store = place(store, 'alc', ADAM.id, world)
    expect(() => place(store, 'alc', EVE.id, world)).toThrow(/refused \(capacity\)/)
  })
})

describe('moving an animal', () => {
  it('leaves the habitat it came from when it goes into another', () => {
    let store = twoHabitats()
    store = place(store, 'alc', ADAM.id, world)
    expect(habitatOf(store, ADAM.id)?.id).toBe('alc')

    store = place(store, 'viv', ADAM.id, world)
    expect(habitatOf(store, ADAM.id)?.id).toBe('viv')
    expect(habitatById(store, 'alc')!.occupants).toEqual([])
  })

  it('frees the slot it was holding, so the old habitat can take someone else', () => {
    let store = twoHabitats()
    store = place(store, 'alc', ADAM.id, world)
    expect(canPlace(store, 'alc', CAIN.id, world)?.kind).toBe('capacity')

    store = place(store, 'viv', ADAM.id, world)
    expect(canPlace(store, 'alc', CAIN.id, world)).toBeNull()
  })

  it('withdraws an animal from the floor, and is happy to withdraw one that is already off it', () => {
    let store = twoHabitats()
    store = place(store, 'viv', ADAM.id, world)
    store = withdraw(store, ADAM.id)
    expect(habitatOf(store, ADAM.id)).toBeUndefined()
    expect(withdraw(store, ADAM.id)).toBe(store)
  })

  it('never mutates the store it was given', () => {
    const before = twoHabitats()
    const snapshot = JSON.stringify(before)
    place(before, 'viv', ADAM.id, world)
    expect(JSON.stringify(before)).toBe(snapshot)
  })
})

describe('pairings', () => {
  it('finds the couple in a habitat, mother first', () => {
    let store = twoHabitats()
    store = place(store, 'viv', ADAM.id, world)
    store = place(store, 'viv', EVE.id, world, { confirmPairing: true })

    expect(pairingIn(store, 'viv', world)).toEqual({ motherId: EVE.id, fatherId: ADAM.id })
  })

  it('finds nothing in a habitat that cannot produce one', () => {
    let store = twoHabitats()
    store = place(store, 'viv', ADAM.id, world)
    expect(pairingIn(store, 'viv', world)).toBeUndefined()

    store = place(store, 'viv', CAIN.id, world)
    expect(pairingIn(store, 'viv', world)).toBeUndefined()
  })
})

describe('save and load', () => {
  const roster = new Set([ADAM.id, EVE.id, CAIN.id, HATCHLING.id, CORN.id])

  it('survives a round trip through JSON with every placement intact', () => {
    let store = startingStore()
    store = place(store, 'habitat-1', ADAM.id, world)
    store = place(store, 'habitat-1', EVE.id, world, { confirmPairing: true })
    store = place(store, 'habitat-2', CORN.id, world)

    const reloaded = deserializeStore(JSON.parse(JSON.stringify(serializeStore(store))), roster)

    expect(reloaded).toEqual(store)
    expect(habitatOf(reloaded, ADAM.id)?.id).toBe('habitat-1')
    expect(habitatOf(reloaded, CORN.id)?.id).toBe('habitat-2')
    expect(pairingIn(reloaded, 'habitat-1', world)).toEqual({ motherId: EVE.id, fatherId: ADAM.id })
  })

  it('drops residents who are no longer on the roster, rather than leaving a slot stuck', () => {
    let store = twoHabitats()
    store = place(store, 'alc', ADAM.id, world)

    // Adam was sold between save and load.
    const reloaded = deserializeStore(serializeStore(store), new Set([EVE.id]))
    expect(habitatOf(reloaded, ADAM.id)).toBeUndefined()
    expect(canPlace(reloaded, 'alc', EVE.id, world)).toBeNull()
  })

  it('drops a habitat whose size this build no longer knows about', () => {
    const store = createStore({
      habitats: [habitat({ id: 'ghost', sizeId: 'penthouse' as never })],
    })
    expect(deserializeStore(serializeStore(store), roster).habitats).toEqual([])
  })
})
