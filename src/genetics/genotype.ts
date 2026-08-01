/**
 * Genotypes: the two allele slots an animal carries at each locus, and the small pile of
 * helpers that everything else in the engine is built on.
 *
 * ## The one idea in this file
 *
 * An animal's genotype is a pair of chromosome *copies*. Slot 0 is one copy, slot 1 is the
 * other. For an ordinary (autosomal) locus the two slots are interchangeable. For a
 * **sex-linked** locus the slots line up with `Genotype.sexChromosomes`: a locus that lives on
 * chromosome `C` occupies slot *i* only when `sexChromosomes[i] === C`.
 *
 * That single rule is the whole of sex-linkage. There is no `if (isPython)` in this engine and
 * there must never be one — XY and ZW both fall straight out of slot alignment.
 *
 * Everywhere in this engine, **slot 0 comes from the mother and slot 1 comes from the father**.
 * That convention is what makes the slot rule usable: once you know which parent contributed a
 * slot, you know which chromosome is in it.
 */

import type {
  Allele,
  AlleleId,
  AllelePair,
  AlleleSlot,
  ChromosomeId,
  Genotype,
  GenotypeKey,
  Locus,
  Sex,
  SexSystem,
  SpeciesDefinition,
} from './types'
import { allelesAt } from './mutation'

/**
 * The canonical string form of an allele pair: the non-null alleles, sorted, joined by `/`.
 *
 * Sorting is the entire point. `albino/candy` and `candy/albino` are the same animal, so they
 * have to hash to the same key or an expression table would need a row for each ordering — and
 * would silently miss one of them the day someone wrote the alleles the other way round.
 *
 * - homozygous → `'variant-a/variant-a'`
 * - heterozygous → `'variant-a/wild-type'`
 * - hemizygous (only one chromosome carries the locus) → `'variant-a'`
 * - absent entirely (neither chromosome carries it) → `''`
 */
export function genotypeKey(pair: AllelePair): GenotypeKey {
  return alleleCopies(pair).sort().join('/')
}

/**
 * Every allele copy actually present, `null` slots dropped.
 *
 * Length 2 for a normal locus, 1 for a hemizygous one, 0 when the animal has no chromosome
 * that carries this locus at all. Used by polygenic traits (which add *per copy*) and by the
 * key above.
 */
export function alleleCopies(pair: AllelePair): AlleleId[] {
  const out: AlleleId[] = []
  if (pair[0] !== null) out.push(pair[0])
  if (pair[1] !== null) out.push(pair[1])
  return out
}

/** Does this animal carry at least one copy of `allele` here? The definition of "carrier". */
export function pairCarries(pair: AllelePair, allele: AlleleId): boolean {
  return pair[0] === allele || pair[1] === allele
}

/**
 * Read an animal's sex off its sex chromosomes, using the system its species declared.
 *
 * Carrying the heterogametic chromosome (Y in an XY species, W in a ZW species) at all makes
 * you the heterogametic sex, because that chromosome only ever exists in one copy. Everything
 * else is the other sex.
 *
 * Sex is never stored on an animal. It is derived here, every time, from the chromosomes — so
 * it can never drift out of step with the genetics.
 */
export function sexOf(genotype: Genotype, system: SexSystem): Sex {
  const carriesHeterogametic =
    genotype.sexChromosomes[0] === system.heterogameticChromosome ||
    genotype.sexChromosomes[1] === system.heterogameticChromosome
  if (carriesHeterogametic) return system.heterogameticSex
  return otherSex(system.heterogameticSex)
}

/** `'male'` ⇄ `'female'`. There are exactly two, so this is total. */
export function otherSex(sex: Sex): Sex {
  return sex === 'male' ? 'female' : 'male'
}

/**
 * The sex chromosome pair an animal of this sex must have, in `[fromMother, fromFather]` order.
 *
 * The ordering is not cosmetic — it is what makes the slot rule work. Work it through for both
 * systems and notice that the answer is different, and that nothing here had to be told which
 * system it was looking at:
 *
 * - **XY** (heterogametic sex is male). Mother is XX so she always gives X; father gives X or Y.
 *   A son is therefore `['X', 'Y']` — homogametic slot first.
 * - **ZW** (heterogametic sex is female). Mother is ZW so she gives Z or W; father is ZZ so he
 *   always gives Z. A daughter is therefore `['W', 'Z']` — heterogametic slot first.
 */
export function sexChromosomesFor(
  sex: Sex,
  system: SexSystem,
): readonly [ChromosomeId, ChromosomeId] {
  const { homogameticChromosome: homo, heterogameticChromosome: hetero } = system
  if (sex !== system.heterogameticSex) return [homo, homo]
  // The heterogametic chromosome can only have come from the heterogametic parent.
  return system.heterogameticSex === 'female' ? [hetero, homo] : [homo, hetero]
}

/**
 * Which slots of a genotype carry a locus that lives on `chromosome`.
 *
 * Returns `[0]`, `[1]`, `[0, 1]`, or `[]`. The empty case is real biology, not an error: a
 * Y-linked locus in an XX animal has nowhere to live.
 */
export function slotsCarrying(
  sexChromosomes: readonly [ChromosomeId, ChromosomeId],
  chromosome: ChromosomeId,
): number[] {
  const out: number[] = []
  if (sexChromosomes[0] === chromosome) out.push(0)
  if (sexChromosomes[1] === chromosome) out.push(1)
  return out
}

/**
 * Linkage is deliberately not implemented (see `LocusPlacement`). If a locus declares it, stop.
 *
 * The alternative — quietly treating linked genes as unlinked — hands the player confident,
 * wrong probabilities with no warning. That is the worst thing a teaching tool can do, so this
 * throws instead.
 */
export function assertNoLinkage(locus: Locus): void {
  if (locus.placement.kind === 'autosomal' && locus.placement.linkage) {
    throw new Error(
      `Locus '${locus.id}' declares linkage (group '${locus.placement.linkage.group}'), ` +
        `but linkage is not implemented in this version of the engine. ` +
        `Remove the linkage block, or implement crossover in makeGamete() first — ` +
        `pretending linked loci assort independently would produce wrong probabilities silently.`,
    )
  }
}

/**
 * Every allele pair an animal of these sex chromosomes could have at this locus, deduplicated
 * by canonical key.
 *
 * This is the candidate set the belief engine reasons over, and the outcome set the probability
 * engine sums over. It is generated from the locus and the chromosomes, never hard-coded.
 *
 * Alleles come from `allelesAt`, not `locus.alleles`, so a morph discovered in play by mutation
 * is a candidate like any other. Reading the authored list directly would assign zero
 * probability to exactly the animals a player is most excited about.
 */
export function possiblePairs(
  locus: Locus,
  sexChromosomes: readonly [ChromosomeId, ChromosomeId],
): AllelePair[] {
  assertNoLinkage(locus)
  const alleleIds = allelesAt(locus).map((a) => a.id)
  const slots =
    locus.placement.kind === 'autosomal'
      ? [0, 1]
      : slotsCarrying(sexChromosomes, locus.placement.chromosome)

  if (slots.length === 0) return [[null, null]]
  if (slots.length === 1) {
    const slot = slots[0]!
    return alleleIds.map((id) => (slot === 0 ? [id, null] : [null, id]) as AllelePair)
  }

  const seen = new Set<GenotypeKey>()
  const out: AllelePair[] = []
  for (const a of alleleIds) {
    for (const b of alleleIds) {
      const pair: AllelePair = [a, b]
      const key = genotypeKey(pair)
      if (seen.has(key)) continue
      seen.add(key)
      out.push(pair)
    }
  }
  return out
}

/** The wild-type pair for a locus, given the chromosomes available to carry it. */
export function wildTypePair(
  locus: Locus,
  sexChromosomes: readonly [ChromosomeId, ChromosomeId],
): AllelePair {
  const slots =
    locus.placement.kind === 'autosomal'
      ? [0, 1]
      : slotsCarrying(sexChromosomes, locus.placement.chromosome)
  const slot0: AlleleSlot = slots.includes(0) ? locus.wildType : null
  const slot1: AlleleSlot = slots.includes(1) ? locus.wildType : null
  return [slot0, slot1]
}

/**
 * Build a complete, valid genotype for an animal of the given sex, wild-type everywhere you do
 * not say otherwise.
 *
 * This is the convenient way to make a founder animal or a test fixture: name the sex, name
 * the handful of loci you care about, and the rest fills itself in correctly — including the
 * `null` slots that sex-linked loci need.
 *
 * Pairs you supply for a sex-linked locus are *repositioned* into the slots that actually carry
 * it, so you can write `['variant-a', null]` or `[null, 'variant-a']` and get the same, correct
 * animal. Supplying two alleles for a locus that only has one slot throws, because that animal
 * cannot exist.
 */
export function makeGenotype<P extends object>(
  species: SpeciesDefinition<P>,
  sex: Sex,
  overrides: Readonly<Record<string, AllelePair>> = {},
): Genotype {
  const sexChromosomes = sexChromosomesFor(sex, species.sexSystem)
  const loci: Record<string, AllelePair> = {}

  for (const locus of species.loci) {
    assertNoLinkage(locus)
    const override = overrides[locus.id]
    loci[locus.id] = override
      ? placeInSlots(locus, sexChromosomes, override)
      : wildTypePair(locus, sexChromosomes)
  }

  for (const id of Object.keys(overrides)) {
    if (!(id in loci)) {
      throw new Error(`makeGenotype: '${id}' is not a locus of species '${species.id}'.`)
    }
  }

  return { sexChromosomes, loci }
}

/** Move whatever alleles were supplied into the slots this animal actually has for the locus. */
function placeInSlots(
  locus: Locus,
  sexChromosomes: readonly [ChromosomeId, ChromosomeId],
  supplied: AllelePair,
): AllelePair {
  if (locus.placement.kind === 'autosomal') return supplied

  const slots = slotsCarrying(sexChromosomes, locus.placement.chromosome)
  const copies = alleleCopies(supplied)
  if (copies.length > slots.length) {
    throw new Error(
      `Locus '${locus.id}' sits on chromosome '${locus.placement.chromosome}', and this animal ` +
        `has ${slots.length} cop${slots.length === 1 ? 'y' : 'ies'} of it — ` +
        `so it cannot carry ${copies.length} alleles there.`,
    )
  }
  const out: [AlleleSlot, AlleleSlot] = [null, null]
  slots.forEach((slot, i) => {
    out[slot] = copies[i] ?? locus.wildType
  })
  return out
}

/** Look up an allele's full record. Throws with the locus named, because a typo here is silent. */
export function alleleOf(locus: Locus, id: AlleleId): Allele {
  const found = allelesAt(locus).find((a) => a.id === id)
  if (!found) {
    throw new Error(`Allele '${id}' is not declared at locus '${locus.id}'.`)
  }
  return found
}

/** Index a species' loci by id once, so callers stop doing `find()` in a loop. */
export function lociById<P extends object>(species: SpeciesDefinition<P>): Map<string, Locus> {
  return new Map(species.loci.map((l) => [l.id, l]))
}
