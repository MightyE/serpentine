/**
 * Genetic load, attached to a species at the game layer.
 *
 * `genetics/load.ts` gives you the pieces — a pool of deleterious recessives, a hidden `Locus`
 * for each, the viability rules that make the homozygotes real — and deliberately stops there.
 * It never edits a species, because a species is content and the engine does not own content.
 *
 * This file is the assembly step, and it lives in `src/game/` for the same reason: the authored
 * species files under `src/species/` describe *morphs*, which are the traits a keeper is trying
 * to produce. Load alleles are the opposite of that — invisible, unwanted, and identical across
 * every species — so bolting them on here keeps them out of the content that a person is
 * expected to read and extend.
 *
 * {@link playableSpecies} returns a `SpeciesDefinition` that is the authored one plus the pool's
 * loci and viability rules. Everything downstream — `express`, `punnett`, `breed` — then handles
 * inbreeding depression with no special case at all: a homozygous load allele is just an egg
 * that does not hatch, reported with its explanation, exactly like champagne's lethal
 * combination. That is the whole mechanic.
 */
import { LOAD_POOL_SIZE, loadLocus, loadViabilityRules, type GeneticLoadPool, type LoadAllele } from '../genetics/load'
import type { SpeciesDefinition } from '../genetics/types'
import type { Phenotype } from '../render/contract'
import { LOAD_EXTRA_CARE_FRACTION } from './tuning'

/** Locus id prefix for every load locus, so the UI can tell one from an authored trait. */
export const LOAD_LOCUS_PREFIX = 'load-'

export function isLoadLocus(locusId: string): boolean {
  return locusId.startsWith(LOAD_LOCUS_PREFIX)
}

/**
 * Player-facing explanations, cycled through the pool.
 *
 * Deliberately written as *outcomes for the animal*, never as a verdict on it — an egg that does
 * not develop is a genetics result, and a hatchling that needs extra care becomes a resident of
 * the rehab, which is the entire premise of the game. See `docs/balance-charter.md` principle 3.
 */
const NOT_VIABLE_EXPLANATIONS: readonly string[] = [
  'Two copies of this recessive stop the embryo developing, so the egg does not hatch. Both parents carried one copy without showing it.',
  'This pairing brought together two copies of a hidden recessive the line was carrying. The egg does not develop.',
  'A recessive both parents carried, doubled up. Eggs like this do not hatch — the trait only shows when a hatchling inherits two copies.',
]

const EXTRA_CARE_EXPLANATIONS: readonly string[] = [
  'Two copies of this recessive leave the hatchling needing more support than usual. It hatches, and it becomes a resident of the rehab.',
  'A hidden recessive from both sides of the pedigree, doubled. This one needs extra care — a longer settling-in, smaller meals, a warmer spot.',
  'Doubled recessive. The hatchling is fine, it just needs more from you than its clutchmates do.',
]

/**
 * The population's genetic load: {@link LOAD_POOL_SIZE} distinct recessives, a fixed fraction of
 * which are the "needs extra care" kind rather than the "egg does not hatch" kind.
 *
 * Built by generation rather than authored by hand because sixty hand-written near-identical
 * entries would be sixty chances to typo one, and none of them differ in any way a reader would
 * learn something from. The two constants that matter — how many exist, and how they split — are
 * both named, and both live where the balance charter can see them.
 */
export function makeLoadPool(id = 'wild-population'): GeneticLoadPool {
  const entries: LoadAllele[] = []
  for (let i = 0; i < LOAD_POOL_SIZE; i++) {
    // Interleaved rather than "first half / second half", so any subset a founder draws lands
    // near the designed split instead of depending on where in the pool it happened to look.
    const extraCare = i % Math.round(1 / LOAD_EXTRA_CARE_FRACTION) === 0
    const n = i + 1
    entries.push({
      locus: `${LOAD_LOCUS_PREFIX}${n}`,
      allele: `${LOAD_LOCUS_PREFIX}${n}-recessive`,
      outcome: extraCare ? 'needsExtraCare' : 'eggDoesNotHatch',
      explanation: extraCare
        ? EXTRA_CARE_EXPLANATIONS[i % EXTRA_CARE_EXPLANATIONS.length]!
        : NOT_VIABLE_EXPLANATIONS[i % NOT_VIABLE_EXPLANATIONS.length]!,
    })
  }
  return { id, entries }
}

/**
 * The authored species, plus the population's genetic load.
 *
 * This is what the running game breeds; `src/species/`'s export is what a person edits. Keeping
 * the two separate means the trait cookbook never has to mention load alleles, and a test that
 * wants clean Mendelian ratios can use the authored definition directly.
 */
export function playableSpecies(
  species: SpeciesDefinition<Phenotype>,
  pool: GeneticLoadPool,
): SpeciesDefinition<Phenotype> {
  return {
    ...species,
    loci: [...species.loci, ...pool.entries.map((entry) => loadLocus(entry, `${entry.locus}-wild`))],
    viability: [...species.viability, ...loadViabilityRules(pool)],
  }
}
