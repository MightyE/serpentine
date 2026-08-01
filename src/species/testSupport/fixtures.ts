/**
 * Tiny, engine-independent test fixtures: build a wild-type `Genotype` for either sex of a
 * species, override a locus or two, wrap it in an `Individual`. Deliberately does not import
 * anything from `src/genetics/**` (see `referenceEngine.ts`'s header) — it is a second,
 * independent implementation of "what does a wild-type genotype look like," so a bug shared
 * between this file and the real engine is very unlikely to hide a test failure.
 */
import type { AllelePair, Genotype, Individual, Sex, SexSystem, SpeciesDefinition } from '../../genetics/types'

export function sexChromosomesFor(sex: Sex, system: SexSystem): readonly [string, string] {
  if (sex === system.heterogameticSex) {
    return system.heterogameticSex === 'female'
      ? [system.heterogameticChromosome, system.homogameticChromosome]
      : [system.homogameticChromosome, system.heterogameticChromosome]
  }
  return [system.homogameticChromosome, system.homogameticChromosome]
}

export function wildTypeGenotype<P extends object>(species: SpeciesDefinition<P>, sex: Sex): Genotype {
  const sexChromosomes = sexChromosomesFor(sex, species.sexSystem)
  const loci: Record<string, AllelePair> = {}
  for (const locus of species.loci) {
    if (locus.placement.kind === 'sexLinked') {
      const pair: [string | null, string | null] = [null, null]
      if (sexChromosomes[0] === locus.placement.chromosome) pair[0] = locus.wildType
      if (sexChromosomes[1] === locus.placement.chromosome) pair[1] = locus.wildType
      loci[locus.id] = pair
    } else {
      loci[locus.id] = [locus.wildType, locus.wildType]
    }
  }
  return { sexChromosomes, loci }
}

export function withLoci(genotype: Genotype, overrides: Readonly<Record<string, AllelePair>>): Genotype {
  return { sexChromosomes: genotype.sexChromosomes, loci: { ...genotype.loci, ...overrides } }
}

/**
 * Places `allele` into whichever slot(s) of a sex-linked locus this sex actually has, so a
 * test never has to guess which of the two `AllelePair` slots is the one that matters (that
 * depends on the species' `SexSystem` and which chromosome carries the locus). Passing `null`
 * clears it back to "no copy."
 */
export function sexLinkedPair<P extends object>(
  species: SpeciesDefinition<P>,
  sex: Sex,
  locusId: string,
  allele: string | null,
): AllelePair {
  const locus = species.loci.find((l) => l.id === locusId)
  if (!locus || locus.placement.kind !== 'sexLinked') {
    throw new Error(`sexLinkedPair: '${locusId}' is not a sex-linked locus on '${species.id}'`)
  }
  const sexChromosomes = sexChromosomesFor(sex, species.sexSystem)
  const pair: [string | null, string | null] = [null, null]
  if (sexChromosomes[0] === locus.placement.chromosome) pair[0] = allele
  if (sexChromosomes[1] === locus.placement.chromosome) pair[1] = allele
  return pair
}

let counter = 0

export function makeIndividual<P extends object>(
  species: SpeciesDefinition<P>,
  genotype: Genotype,
  idPrefix = 'test',
): Individual {
  counter += 1
  return { id: `${idPrefix}-${counter}`, species: species.id, genotype, parents: null, mutations: [] }
}
