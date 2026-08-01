/**
 * Every species this game knows about, plus the real-vs-modelled notes the UI and docs read.
 *
 * To add a whole new species: write a sibling directory to `ballPython/` and `cornSnake/`
 * (sex system, base phenotype, `loci/`, optionally `fictional/`, an `index.ts` that assembles
 * a `SpeciesDefinition<Phenotype>`), then add it to `allSpecies` below. Nothing outside
 * `src/species/` needs to change.
 *
 * To add a single trait to an existing species, see the cookbook in the cycle's execution
 * deposit — it is the literal, verified sequence of edits, not a guess at one.
 */
import type { SpeciesDefinition } from '../genetics/types'
import type { Phenotype } from '../render/contract'
import type { RealTraitNotes } from './support/traitNotes'
import { ballPython, ballPythonRealTraitNotes } from './ballPython'
import { cornSnake, cornSnakeRealTraitNotes } from './cornSnake'

export { ballPython, ballPythonRealTraitNotes } from './ballPython'
export { cornSnake, cornSnakeRealTraitNotes } from './cornSnake'

export const allSpecies: readonly SpeciesDefinition<Phenotype>[] = [ballPython, cornSnake]

export const allRealTraitNotes: Readonly<Record<string, RealTraitNotes>> = {
  'ball-python': ballPythonRealTraitNotes,
  'corn-snake': cornSnakeRealTraitNotes,
}
