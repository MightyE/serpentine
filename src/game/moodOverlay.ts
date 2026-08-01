/**
 * The other half of the fictional "empath" trait (`species/ballPython/fictional/empath.ts`).
 *
 * Genetics stays pure — it only ever sets `phenotype.extra.empathPresent`. Whether that marker
 * turns into a visible glow depends on the rehab's overall care record, which is game state the
 * genetics pipeline is deliberately not allowed to see. This is the one place in the codebase
 * that decides that question, and it is a plain function over a `Phenotype` and a `FlagSet` —
 * copy this file's shape for the next trait that wants to react to something outside its own
 * genotype.
 */
import type { Phenotype } from '../render/contract'
import type { FlagSet } from './seams'

/** Below this many total care actions, an empath is present but quiet. */
const CONTENTMENT_THRESHOLD = 10

export function applyMoodOverlay(phenotype: Phenotype, flags: FlagSet): Phenotype {
  if (phenotype.extra.empathPresent !== true) return phenotype
  const totalCareGiven = flags.get('totalCareGiven')
  const cared = typeof totalCareGiven === 'number' && totalCareGiven >= CONTENTMENT_THRESHOLD
  if (!cared || phenotype.effects.includes('radiantMood')) return phenotype
  return { ...phenotype, effects: [...phenotype.effects, 'radiantMood'] }
}
