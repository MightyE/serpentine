import { describe, expect, it } from 'vitest'
import { allRealTraitNotes, allSpecies } from './index'

describe('every real trait carries a non-empty real-vs-modelled note', () => {
  it('at least one species and at least 8 real traits total', () => {
    expect(allSpecies.length).toBeGreaterThanOrEqual(2)
    const totalRealTraits = Object.values(allRealTraitNotes).reduce(
      (sum, notes) => sum + Object.keys(notes).length,
      0,
    )
    expect(totalRealTraits).toBeGreaterThanOrEqual(8)
  })

  for (const [speciesId, notes] of Object.entries(allRealTraitNotes)) {
    for (const [locusId, note] of Object.entries(notes)) {
      it(`${speciesId}/${locusId} has a real and a modeled note, both non-empty`, () => {
        expect(note.real.trim().length).toBeGreaterThan(0)
        expect(note.modeled.trim().length).toBeGreaterThan(0)
      })
    }
  }

  it('every real trait note corresponds to an actual locus on its species', () => {
    for (const species of allSpecies) {
      const notes = allRealTraitNotes[species.id]
      if (!notes) continue
      const locusIds = new Set(species.loci.map((l) => l.id))
      for (const locusId of Object.keys(notes)) {
        expect(locusIds.has(locusId)).toBe(true)
      }
    }
  })
})
