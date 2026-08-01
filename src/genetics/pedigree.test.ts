/**
 * Tests for pedigree walking, kinship, and Wright's inbreeding coefficient.
 *
 * These are not tolerance tests. Every value asserted below is a textbook constant with an exact
 * binary representation — ¼, ⅛, ⅜, ½ — so `toBe` is correct and `toBeCloseTo` would be hiding
 * something. If an implementation gets 0.24 for a full-sib mating it is not "close", it is wrong.
 *
 * Fixtures are ids only. Pedigree maths never looks at a genotype, so the genotypes here are
 * empty on purpose: if a test passed because of an allele, the test would be measuring the wrong
 * thing. No trait name, no species name, and no snake appears in this file.
 */

import { describe, expect, it } from 'vitest'
import type { Genotype, Individual, IndividualId } from './types'
import type { PedigreeLookup } from './pedigree'
import { DEFAULT_PEDIGREE_DEPTH, ancestors, inbreedingCoefficient, kinship, pedigreeDepth } from './pedigree'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NO_GENOTYPE: Genotype = { sexChromosomes: ['H', 'H'], loci: {} }

/** A little collection of animals you can look ids up in. */
function herd() {
  const byId = new Map<IndividualId, Individual>()

  const add = (id: string, parents: readonly [string, string] | null): Individual => {
    const individual: Individual = {
      id,
      species: 'test-species',
      genotype: NO_GENOTYPE,
      parents,
      mutations: [],
    }
    byId.set(id, individual)
    return individual
  }

  return {
    founder: (id: string) => add(id, null),
    /** `parents` is `[dam, sire]`; the maths is symmetric in the two, so which is which is free. */
    child: (id: string, dam: string, sire: string) => add(id, [dam, sire]),
    lookup: ((id) => byId.get(id)) as PedigreeLookup,
    get: (id: string): Individual => {
      const found = byId.get(id)
      if (!found) throw new Error(`test fixture has no '${id}'`)
      return found
    },
  }
}

/** Two unrelated founders, two of their offspring (full sibs), and one out of those two. */
function fullSibMating() {
  const h = herd()
  h.founder('a')
  h.founder('b')
  h.child('sib-1', 'a', 'b')
  h.child('sib-2', 'a', 'b')
  h.child('inbred', 'sib-1', 'sib-2')
  return h
}

// ---------------------------------------------------------------------------
// The four textbook values
// ---------------------------------------------------------------------------

describe('the textbook inbreeding coefficients', () => {
  it('gives 0 for a founder and for the offspring of two unrelated founders', () => {
    const h = herd()
    h.founder('a')
    h.founder('b')
    h.child('outcross', 'a', 'b')

    expect(inbreedingCoefficient(h.get('a'), h.lookup)).toBe(0)
    expect(inbreedingCoefficient(h.get('outcross'), h.lookup)).toBe(0)
    expect(kinship(h.get('a'), h.get('b'), h.lookup)).toBe(0)
  })

  it('gives exactly 0.25 for the offspring of a full-sib mating', () => {
    const h = fullSibMating()
    expect(inbreedingCoefficient(h.get('inbred'), h.lookup)).toBe(0.25)
  })

  it('gives exactly 0.25 for a parent bred back to its own offspring', () => {
    const h = herd()
    h.founder('a')
    h.founder('b')
    h.child('offspring', 'a', 'b')
    h.child('backcross', 'offspring', 'a')

    expect(inbreedingCoefficient(h.get('backcross'), h.lookup)).toBe(0.25)
  })

  it('gives exactly 0.125 for the offspring of half sibs', () => {
    const h = herd()
    h.founder('shared-sire')
    h.founder('dam-1')
    h.founder('dam-2')
    h.child('half-sib-1', 'dam-1', 'shared-sire')
    h.child('half-sib-2', 'dam-2', 'shared-sire')
    h.child('inbred', 'half-sib-1', 'half-sib-2')

    expect(inbreedingCoefficient(h.get('inbred'), h.lookup)).toBe(0.125)
  })
})

// ---------------------------------------------------------------------------
// Kinship as the pre-pairing warning
// ---------------------------------------------------------------------------

describe('kinship', () => {
  it('equals the inbreeding coefficient the pairing would produce', () => {
    // This is the contract that lets the UI warn *before* a pairing: the number shown for the
    // proposed pair is the number the hatchlings would carry.
    const h = fullSibMating()
    const f = inbreedingCoefficient(h.get('inbred'), h.lookup)

    expect(kinship(h.get('sib-1'), h.get('sib-2'), h.lookup)).toBe(f)
  })

  it('is symmetric', () => {
    const h = fullSibMating()
    expect(kinship(h.get('sib-1'), h.get('inbred'), h.lookup)).toBe(
      kinship(h.get('inbred'), h.get('sib-1'), h.lookup),
    )
  })

  it('is 0.5 for a non-inbred animal against itself, and higher when it is inbred', () => {
    const h = fullSibMating()
    // Two draws from one animal pick the same copy half the time.
    expect(kinship(h.get('sib-1'), h.get('sib-1'), h.lookup)).toBe(0.5)
    // An inbred animal is already partly homozygous by descent, so the two draws agree more often.
    expect(kinship(h.get('inbred'), h.get('inbred'), h.lookup)).toBe(0.625)
  })
})

// ---------------------------------------------------------------------------
// The recursive case: an ancestor who is itself inbred
// ---------------------------------------------------------------------------

describe('an ancestor who is itself inbred', () => {
  /**
   * `line` is the product of a full-sib mating, so F(line) = 0.25. It is then outcrossed to an
   * unrelated founder, and two of those offspring are bred together.
   *
   * The common ancestors of that last pairing are `line` (inbred) and `outcross-founder` (not).
   * Getting this right requires the `½·(1 + F)` term for `line`; a formulation that treats every
   * common ancestor as non-inbred returns 0.25 here instead of 0.28125.
   */
  function inbredAncestor() {
    const h = herd()
    h.founder('a')
    h.founder('b')
    h.child('sib-1', 'a', 'b')
    h.child('sib-2', 'a', 'b')
    h.child('line', 'sib-1', 'sib-2')
    h.founder('outcross-founder')
    h.child('cousin-1', 'line', 'outcross-founder')
    h.child('cousin-2', 'line', 'outcross-founder')
    h.child('result', 'cousin-1', 'cousin-2')
    return h
  }

  it('contributes more identity by descent than a non-inbred one would', () => {
    const h = inbredAncestor()
    expect(inbreedingCoefficient(h.get('line'), h.lookup)).toBe(0.25)
    expect(inbreedingCoefficient(h.get('result'), h.lookup)).toBe(0.28125)
  })

  it('is exactly what the extra 0.03125 comes from', () => {
    // Bounded to one generation, `line`'s own ancestry is invisible, so it is treated as a
    // non-inbred founder — and the answer collapses to the value the naive formulation gives.
    const h = inbredAncestor()
    expect(inbreedingCoefficient(h.get('result'), h.lookup, 1)).toBe(0.25)
  })

  it('reproduces the full-sib inbreeding series 0, ¼, ⅜, ½', () => {
    const h = herd()
    h.founder('a')
    h.founder('b')
    h.child('g1-x', 'a', 'b')
    h.child('g1-y', 'a', 'b')
    h.child('g2-x', 'g1-x', 'g1-y')
    h.child('g2-y', 'g1-x', 'g1-y')
    h.child('g3-x', 'g2-x', 'g2-y')
    h.child('g3-y', 'g2-x', 'g2-y')
    h.child('g4', 'g3-x', 'g3-y')

    expect(inbreedingCoefficient(h.get('g1-x'), h.lookup)).toBe(0)
    expect(inbreedingCoefficient(h.get('g2-x'), h.lookup)).toBe(0.25)
    expect(inbreedingCoefficient(h.get('g3-x'), h.lookup)).toBe(0.375)
    expect(inbreedingCoefficient(h.get('g4'), h.lookup)).toBe(0.5)
  })
})

// ---------------------------------------------------------------------------
// The bound
// ---------------------------------------------------------------------------

describe('the depth bound', () => {
  it('under-reports rather than over-reports when the shared ancestor is out of range', () => {
    const h = fullSibMating()
    // At depth 0 the parents are treated as founders, so their shared parents are invisible.
    expect(inbreedingCoefficient(h.get('inbred'), h.lookup, 0)).toBe(0)
    expect(inbreedingCoefficient(h.get('inbred'), h.lookup, 1)).toBe(0.25)
    expect(inbreedingCoefficient(h.get('inbred'), h.lookup, DEFAULT_PEDIGREE_DEPTH)).toBe(0.25)
  })

  it('defaults to five generations', () => {
    expect(DEFAULT_PEDIGREE_DEPTH).toBe(5)
  })

  it('rejects a nonsense depth instead of guessing', () => {
    const h = fullSibMating()
    expect(() => inbreedingCoefficient(h.get('inbred'), h.lookup, -1)).toThrow(/non-negative/)
    expect(() => kinship(h.get('sib-1'), h.get('sib-2'), h.lookup, 1.5)).toThrow(/whole number/)
  })
})

// ---------------------------------------------------------------------------
// Walking the graph
// ---------------------------------------------------------------------------

describe('ancestors', () => {
  it('reports each ancestor once, at its shallowest depth', () => {
    const h = herd()
    h.founder('a')
    h.founder('b')
    h.child('offspring', 'a', 'b')
    h.child('backcross', 'offspring', 'a')

    const found = ancestors(h.get('backcross'), h.lookup)
    // 'a' is both a parent and a grandparent; the shallower appearance is the one reported.
    expect([...found.entries()].sort()).toEqual([
      ['a', 1],
      ['b', 2],
      ['offspring', 1],
    ])
  })

  it('excludes the animal itself and stops at the bound', () => {
    const h = fullSibMating()
    expect(ancestors(h.get('inbred'), h.lookup).has('inbred')).toBe(false)
    expect([...ancestors(h.get('inbred'), h.lookup, 1).keys()].sort()).toEqual(['sib-1', 'sib-2'])
  })

  it('is empty for a founder', () => {
    const h = herd()
    h.founder('a')
    expect(ancestors(h.get('a'), h.lookup).size).toBe(0)
  })
})

describe('pedigreeDepth', () => {
  it('counts the longest known chain, capped at the bound', () => {
    const h = herd()
    h.founder('a')
    h.founder('b')
    h.child('g1', 'a', 'b')
    h.founder('unrelated')
    h.child('g2', 'g1', 'unrelated')

    expect(pedigreeDepth(h.get('a'), h.lookup)).toBe(0)
    expect(pedigreeDepth(h.get('g1'), h.lookup)).toBe(1)
    expect(pedigreeDepth(h.get('g2'), h.lookup)).toBe(2)
    expect(pedigreeDepth(h.get('g2'), h.lookup, 1)).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Awkward data
// ---------------------------------------------------------------------------

describe('awkward data', () => {
  it('throws a clear error rather than looping forever on a cyclic pedigree', () => {
    const h = herd()
    h.founder('outsider')
    h.child('x', 'y', 'outsider')
    h.child('y', 'x', 'outsider')

    expect(() => inbreedingCoefficient(h.get('x'), h.lookup)).toThrow(/its own ancestor/)
    expect(() => ancestors(h.get('x'), h.lookup)).toThrow(/Pedigree cycle/)
    expect(() => pedigreeDepth(h.get('x'), h.lookup)).toThrow(/Pedigree cycle/)
  })

  it('catches an animal listed as its own parent', () => {
    const h = herd()
    h.founder('outsider')
    h.child('self', 'self', 'outsider')

    expect(() => inbreedingCoefficient(h.get('self'), h.lookup, 1)).toThrow(/its own ancestor/)
  })

  it('treats a parent id that resolves to nothing as an unrelated unknown founder', () => {
    const h = herd()
    h.child('imported-1', 'unknown-dam', 'unknown-sire')
    h.child('imported-2', 'other-dam', 'other-sire')

    expect(inbreedingCoefficient(h.get('imported-1'), h.lookup)).toBe(0)
    expect(kinship(h.get('imported-1'), h.get('imported-2'), h.lookup)).toBe(0)
    expect([...ancestors(h.get('imported-1'), h.lookup).keys()].sort()).toEqual([
      'unknown-dam',
      'unknown-sire',
    ])
  })

  it('still counts an unknown ancestor as one animal when two pedigrees name the same id', () => {
    // The id is real information even when the animal is not on hand: two imports out of the
    // same unrecorded sire are half sibs, and saying otherwise would hide a genuine relationship.
    const h = herd()
    h.child('imported-1', 'unknown-dam-1', 'shared-unknown-sire')
    h.child('imported-2', 'unknown-dam-2', 'shared-unknown-sire')

    expect(kinship(h.get('imported-1'), h.get('imported-2'), h.lookup)).toBe(0.125)
  })

  it('handles a shared ancestor appearing at two different depths', () => {
    // 'a' reaches 'result' as a great-grandparent down one side and as a grandparent down the
    // other. Both routes have to count, and the animal must not be double-listed as two animals.
    const h = herd()
    h.founder('a')
    h.founder('b')
    h.child('near', 'a', 'b')
    h.founder('c')
    h.child('far-1', 'a', 'c')
    h.founder('d')
    h.child('far-2', 'far-1', 'd')
    h.child('result', 'near', 'far-2')

    // One path through 'a': result ← near ← a → far-1 → far-2 → result, one step on the near
    // side and two on the far side, so (½)^(1 + 2 + 1) = 0.0625.
    expect(inbreedingCoefficient(h.get('result'), h.lookup)).toBe(0.0625)
  })
})
