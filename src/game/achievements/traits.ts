/**
 * Serpentine — which alleles an animal is actually *showing*, and how each allele inherits.
 *
 * ## Why the achievement system needs this
 *
 * "Hatch a piebald" has to mean the animal looks piebald, not that it carries one copy — the
 * whole point of a recessive is that a carrier looks like nothing. And "you have produced 25% of
 * hognose's recessives" needs to know which of hognose's alleles *are* the recessives.
 *
 * Both answers already exist in `src/species/`, written as expression tables. Nothing here adds a
 * label to a trait; it reads the table the content author already wrote:
 *
 * - An allele is **visible** in an animal when the animal carries it and the locus expresses
 *   something different from what a wild-type animal of the same sex would.
 * - An allele is **recessive** when one copy expresses exactly what no copies expresses.
 *
 * That derivation is the reason a new trait needs no achievement bookkeeping. Write the table,
 * and the trait shows up in the morph book, in the right quantile ladder, on its own.
 *
 * ## Two honest limitations
 *
 * **A locus with a custom expression rule is classified `'unknown'`** rather than guessed at. A
 * custom rule may read the whole genotype and the individual's id, so probing it with a synthetic
 * pair can give an answer that is true of the probe and false of every real animal. Unknown loci
 * still appear in a species' morph list; they are left out of the dominant/recessive splits.
 *
 * **A sex-linked locus is classified `'sex-linked'`**, for a sharper reason: dominance is not
 * well-defined for a hemizygote. A coral glow male has one copy and shows it, which is neither
 * dominance nor recessiveness — it is having only one copy to work with. Calling it dominant would
 * be a claim the genetics does not make, so it gets its own bucket and its own achievements.
 */
import type {
  AllelePair,
  Individual,
  Locus,
  SpeciesDefinition,
  TraitValues,
} from '../../genetics/types'
import { genotypeKey, sexOf, wildTypePair } from '../../genetics/genotype'

export type Dominance = 'recessive' | 'dominant' | 'sex-linked' | 'unknown'

/** What a locus expresses for one pair of alleles, before any cross-locus modifier runs. */
function expressAtLocus<P extends object>(
  locus: Locus,
  pair: AllelePair,
  individual: Individual,
  species: SpeciesDefinition<P>,
): TraitValues {
  if (locus.expression.kind === 'table') {
    return locus.expression.entries[genotypeKey(pair)] ?? locus.expression.otherwise
  }
  return locus.expression.resolve(pair, {
    genotype: individual.genotype,
    sex: sexOf(individual.genotype, species.sexSystem),
    individualId: individual.id,
    locus,
  })
}

function sameValues(a: TraitValues, b: TraitValues): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    if (a[key] !== b[key]) return false
  }
  return true
}

/** One allele an animal is visibly showing. */
export interface VisibleAllele {
  readonly locusId: string
  readonly alleleId: string
}

/**
 * Every non-wild-type allele this animal is visibly showing.
 *
 * A het piebald returns nothing for the piebald locus; a homozygote returns `piebald`. A
 * compound heterozygote — the ultramel, albino over candy — returns *both*, which is right: the
 * animal is showing you both alleles at once, and that is what makes it its own morph.
 */
export function visibleAlleles<P extends object>(
  individual: Individual,
  species: SpeciesDefinition<P>,
): readonly VisibleAllele[] {
  const out: VisibleAllele[] = []
  for (const locus of species.loci) {
    const pair = individual.genotype.loci[locus.id]
    if (!pair) continue

    const reference = wildTypePair(locus, individual.genotype.sexChromosomes)
    const expressed = expressAtLocus(locus, pair, individual, species)
    if (sameValues(expressed, expressAtLocus(locus, reference, individual, species))) continue

    for (const slot of [0, 1] as const) {
      const allele = pair[slot]
      if (allele === null || allele === locus.wildType) continue
      if (out.some((v) => v.locusId === locus.id && v.alleleId === allele)) continue
      out.push({ locusId: locus.id, alleleId: allele })
    }
  }
  return out
}

/**
 * How an allele inherits, read off the locus's own expression table.
 *
 * The probe is a synthetic animal, which is safe for a table (a table is a pure lookup keyed by
 * the pair and nothing else) and is exactly why a custom rule is refused instead.
 */
export function dominanceOf(locus: Locus, alleleId: string): Dominance {
  if (locus.placement.kind === 'sexLinked') return 'sex-linked'
  if (locus.expression.kind !== 'table') return 'unknown'

  const table = locus.expression
  const valuesFor = (pair: AllelePair): TraitValues =>
    table.entries[genotypeKey(pair)] ?? table.otherwise

  return sameValues(valuesFor([locus.wildType, locus.wildType]), valuesFor([locus.wildType, alleleId]))
    ? 'recessive'
    : 'dominant'
}

/** Every non-wild-type allele a species declares, with how it inherits. */
export function morphList<P extends object>(
  species: SpeciesDefinition<P>,
): readonly { locusId: string; alleleId: string; dominance: Dominance; invented: boolean }[] {
  const out: { locusId: string; alleleId: string; dominance: Dominance; invented: boolean }[] = []
  for (const locus of species.loci) {
    for (const allele of locus.alleles) {
      if (allele.id === locus.wildType) continue
      out.push({
        locusId: locus.id,
        alleleId: allele.id,
        dominance: dominanceOf(locus, allele.id),
        invented: allele.invented === true,
      })
    }
  }
  return out
}
