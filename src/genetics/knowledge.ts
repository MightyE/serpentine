/**
 * What the player *knows*, as opposed to what is true.
 *
 * ## Why this file exists at all
 *
 * The engine knows every animal's genotype exactly. The player does not, and must not — an
 * animal that looks normal might carry a hidden copy of something, and finding out is the game.
 * So ground truth lives in `Genotype`, belief lives in `GeneticKnowledge`, and this file is the
 * bridge: it takes the *evidence* the player has accumulated and works out what that evidence
 * actually implies.
 *
 * The rule the whole design rests on: **evidence is what gets saved; belief is recomputed.**
 * A save file records "these were its parents", "it looked like this", "it was bred to that
 * animal and here is what hatched". It never records "66% het". That number is derived here,
 * every time, which means a fixed inference bug reaches old saves and a stored probability can
 * never drift out of step with the facts underneath it.
 *
 * ## How the inference works
 *
 * Exact Bayes, by enumeration. There is no clever algorithm and there does not need to be one:
 * the number of genotypes an animal could have is small, so the honest thing is to list them
 * all, give each a prior, multiply in the likelihood of everything that has been observed, and
 * normalise.
 *
 *     P(genotype | evidence)  ∝  P(genotype) × P(evidence | genotype)
 *
 * Each kind of evidence contributes one factor:
 *
 * | Evidence | What it contributes |
 * |---|---|
 * | `parentage` | the **prior** — the offspring distribution of the parents, from `punnett` |
 * | `observedPhenotype` | likelihood 0 for every genotype that would have looked different |
 * | `observedSex` | likelihood 0 for every genotype of the other sex — which is what pins a sex-linked locus |
 * | `offspring` | P(the offspring you actually got \| this genotype × that mate) |
 * | `geneTest` | likelihood 0 for everything except the tested result — instant certainty |
 *
 * The `offspring` row is the interesting one, and it is the mechanic breeders call "proving it
 * out". Breed a suspected carrier to a known one. Every normal-looking hatchling makes it a
 * little less likely that the suspect carries anything — but never impossible, because a
 * carrier can easily produce four normal-looking offspring in a row. One visibly affected
 * hatchling settles it in a single animal. That asymmetry is real, it is the reason a breeder
 * can never quite prove a negative, and it falls out of the arithmetic here rather than being
 * written down as a rule.
 *
 * ## One honest limitation
 *
 * A phenotype likelihood treats appearance as a function of genotype. For a polygenic trait
 * that is only approximately true — part of the value is environmental, drawn from the animal's
 * own id — so a species whose `phenotypeKey` includes a polygenic value will not match itself
 * here. Keep polygenic values out of `phenotypeKey`, which is good advice anyway: a key that
 * splits one visual result into fifty rows is not a phenotype, it is a measurement.
 */

import type {
  Evidence,
  GeneticKnowledge,
  Genotype,
  GenotypeKey,
  Individual,
  IndividualId,
  LocusBelief,
  LocusId,
  Sex,
  SpeciesDefinition,
  Weighted,
} from './types'
import {
  assertNoLinkage,
  genotypeKey,
  otherSex,
  possiblePairs,
  sexChromosomesFor,
  sexOf,
} from './genotype'
import { express } from './expression'
import { checkViability } from './viability'
import { punnett } from './distribution'

/** Enumeration is only honest while it is finite. Same spirit as `PunnettOptions`. */
const MAX_CANDIDATES = 50_000

/** Below this, a probability is floating-point dust rather than a possibility. */
const EPSILON = 1e-12

/**
 * Turn everything the player has learned about one animal into belief about its genotype.
 *
 * `others` supplies what is already believed about the animal's parents and mates, because
 * belief about one animal genuinely does depend on belief about its relatives — a test breeding
 * to an animal you are only *fairly* sure about is weaker evidence, and that weakening happens
 * automatically below by marginalising over the mate's possible genotypes.
 */
export function inferKnowledge<P extends object>(
  individual: IndividualId,
  evidence: readonly Evidence[],
  species: SpeciesDefinition<P>,
  others: Readonly<Record<IndividualId, GeneticKnowledge>>,
): GeneticKnowledge {
  for (const locus of species.loci) assertNoLinkage(locus)

  // Knowing nothing is a real state, and it is the baseline every locus is compared against
  // at the end: a locus the evidence never touched should come back as 'unknown', not as a
  // posterior that happens to be flat.
  const uninformed = defaultCandidates(species)

  const parentage = evidence.find((e) => e.kind === 'parentage')
  let rows =
    parentage && parentage.kind === 'parentage'
      ? candidatesFromParents(parentage.mother, parentage.father, species, others)
      : uninformed

  const phenotypeCache = new Map<string, Map<string, number>>()

  for (const item of evidence) {
    switch (item.kind) {
      case 'parentage':
        // Already used, as the prior. Using it again would count the same fact twice.
        break

      case 'observedPhenotype':
        rows = reweight(rows, (genotype) =>
          phenotypeKeyOf(individual, genotype, species) === item.phenotypeKey ? 1 : 0,
        )
        break

      case 'observedSex':
        rows = reweight(rows, (genotype) =>
          sexOf(genotype, species.sexSystem) === item.sex ? 1 : 0,
        )
        break

      case 'geneTest': {
        if (!species.loci.some((l) => l.id === item.locus)) {
          throw new Error(
            `inferKnowledge: gene test names locus '${item.locus}', which species ` +
              `'${species.id}' does not declare.`,
          )
        }
        const tested = genotypeKey(item.pair)
        rows = reweight(rows, (genotype) =>
          genotypeKey(genotype.loci[item.locus]!) === tested ? 1 : 0,
        )
        break
      }

      case 'offspring': {
        const mates = new Map<Sex, readonly Weighted<Genotype>[]>()
        rows = reweight(rows, (genotype) => {
          const sex = sexOf(genotype, species.sexSystem)
          const mateSex = otherSex(sex)
          if (!mates.has(mateSex)) {
            mates.set(mateSex, candidatesFor(item.mate, mateSex, species, others))
          }
          return offspringLikelihood(
            { id: individual, genotype },
            { id: item.mate, candidates: mates.get(mateSex)! },
            item.offspringPhenotypeKeys,
            species,
            phenotypeCache,
          )
        })
        break
      }
    }
  }

  const posterior = normalise(
    rows,
    `inferKnowledge: no genotype of '${individual}' can account for the evidence recorded ` +
      `against it. Something in that evidence is inconsistent with this species' genetics.`,
  )

  const believed = marginalise(posterior, species)
  const baseline = marginalise(uninformed, species)

  const loci: Record<LocusId, LocusBelief> = {}
  for (const locus of species.loci) {
    loci[locus.id] = toBelief(believed[locus.id]!, baseline[locus.id]!)
  }
  return { individual, loci }
}

// ---------------------------------------------------------------------------
// Candidate genotypes
// ---------------------------------------------------------------------------

/**
 * Every allele pair an animal of these sex chromosomes could carry at this locus.
 *
 * This was a local copy for one dispatch, because `possiblePairs` read `locus.alleles` directly
 * and so could not represent a morph discovered in play. That defect is now fixed at the root,
 * so this is a thin alias and every other caller of `possiblePairs` gets the same correctness.
 */
const candidatePairs = possiblePairs

/**
 * Every genotype an animal of this species could have, with nothing yet known about it.
 *
 * Uniform over the pairs the species allows at each locus, and 50/50 over sex — which is what
 * `LocusBelief.unknown` means, spelled out as an actual distribution so the arithmetic has
 * something to start from. Genotypes that could not have hatched are dropped: the animal is
 * standing in front of you, so it is viable.
 */
function defaultCandidates<P extends object>(
  species: SpeciesDefinition<P>,
): readonly Weighted<Genotype>[] {
  const rows: Weighted<Genotype>[] = []
  for (const sex of ['female', 'male'] as const) {
    const sexChromosomes = sexChromosomesFor(sex, species.sexSystem)
    const perLocus = species.loci.map((locus) => {
      const pairs = candidatePairs(locus, sexChromosomes)
      return pairs.map((pair) => ({ pair, probability: 1 / pairs.length }))
    })
    for (const row of expand(species, sexChromosomes, perLocus, 0.5)) rows.push(row)
  }
  return normalise(viableOnly(rows, species), `defaultCandidates: species '${species.id}' has no viable genotype at all.`)
}

/** Candidate genotypes for a named animal, from whatever is already believed about it. */
function candidatesFor<P extends object>(
  id: IndividualId,
  sex: Sex,
  species: SpeciesDefinition<P>,
  others: Readonly<Record<IndividualId, GeneticKnowledge>>,
): readonly Weighted<Genotype>[] {
  const knowledge = others[id]
  const sexChromosomes = sexChromosomesFor(sex, species.sexSystem)

  const perLocus = species.loci.map((locus) => {
    const pairs = candidatePairs(locus, sexChromosomes)
    const belief = knowledge?.loci[locus.id]

    if (!belief || belief.kind === 'unknown') {
      return pairs.map((pair) => ({ pair, probability: 1 / pairs.length }))
    }
    if (belief.kind === 'certain') {
      return [{ pair: belief.pair, probability: 1 }]
    }
    // A posterior is keyed canonically, so match it back to the pairs this animal could have.
    const weighted = pairs
      .map((pair) => ({ pair, probability: belief.distribution[genotypeKey(pair)] ?? 0 }))
      .filter((o) => o.probability > 0)
    if (weighted.length === 0) {
      throw new Error(
        `inferKnowledge: the belief recorded about '${id}' at locus '${locus.id}' gives zero ` +
          `probability to every pair a ${sex} of this species could carry.`,
      )
    }
    const total = weighted.reduce((s, o) => s + o.probability, 0)
    return weighted.map((o) => ({ ...o, probability: o.probability / total }))
  })

  const rows = expand(species, sexChromosomes, perLocus, 1)
  return normalise(
    viableOnly(rows, species),
    `inferKnowledge: nothing believed about '${id}' describes an animal that could have hatched.`,
  )
}

/**
 * The prior an animal gets from its parents: literally the Punnett square of the pairing.
 *
 * Both parents may themselves be uncertain, so this averages over their candidate genotypes.
 * That is the honest thing — a hatchling out of two "probably carriers" is less likely to carry
 * than one out of two proven carriers, and it should be, by exactly this much.
 */
function candidatesFromParents<P extends object>(
  mother: IndividualId,
  father: IndividualId,
  species: SpeciesDefinition<P>,
  others: Readonly<Record<IndividualId, GeneticKnowledge>>,
): readonly Weighted<Genotype>[] {
  const mothers = candidatesFor(mother, 'female', species, others)
  const fathers = candidatesFor(father, 'male', species, others)
  const allLoci = species.loci.map((l) => l.id)

  const merged = new Map<string, { value: Genotype; probability: number }>()
  for (const m of mothers) {
    for (const f of fathers) {
      const distribution = punnett(
        { id: mother, species: species.id, genotype: m.value, parents: null, mutations: [] },
        { id: father, species: species.id, genotype: f.value, parents: null, mutations: [] },
        species,
      )
      for (const row of distribution.joint(allLoci)) {
        add(merged, row.value, m.probability * f.probability * row.probability, species)
      }
    }
  }
  return normalise(
    [...merged.values()],
    `inferKnowledge: '${mother}' × '${father}' cannot produce a viable offspring at all.`,
  )
}

/** Grow one row per combination of the per-locus options. Throws rather than hanging. */
function expand<P extends object>(
  species: SpeciesDefinition<P>,
  sexChromosomes: readonly [string, string],
  perLocus: readonly (readonly { pair: readonly [string | null, string | null]; probability: number }[])[],
  seed: number,
): Weighted<Genotype>[] {
  const size = perLocus.reduce((n, options) => n * options.length, 1)
  if (size > MAX_CANDIDATES) {
    throw new Error(
      `inferKnowledge: enumerating [${species.loci.map((l) => l.id).join(', ')}] needs ${size} ` +
        `candidate genotypes, over the limit of ${MAX_CANDIDATES}. Record a gene test to pin a ` +
        `locus down, or infer over fewer loci.`,
    )
  }

  let rows: Weighted<Genotype>[] = [
    { value: { sexChromosomes: [sexChromosomes[0], sexChromosomes[1]], loci: {} }, probability: seed },
  ]
  species.loci.forEach((locus, i) => {
    const grown: Weighted<Genotype>[] = []
    for (const row of rows) {
      for (const option of perLocus[i]!) {
        grown.push({
          value: {
            sexChromosomes: row.value.sexChromosomes,
            loci: { ...row.value.loci, [locus.id]: option.pair },
          },
          probability: row.probability * option.probability,
        })
      }
    }
    rows = grown
  })
  return rows
}

// ---------------------------------------------------------------------------
// Likelihoods
// ---------------------------------------------------------------------------

/**
 * P(the offspring that actually hatched | this animal has this genotype).
 *
 * Two nested facts. For a given pairing, each offspring is an independent draw from that
 * pairing's phenotype distribution, so their probabilities multiply — which is why the third
 * normal-looking hatchling moves belief less than the first did, and why the first visibly
 * affected one ends the argument. And the mate may itself be uncertain, so the whole thing is
 * averaged over what is believed about the mate.
 */
function offspringLikelihood<P extends object>(
  animal: { id: IndividualId; genotype: Genotype },
  mate: { id: IndividualId; candidates: readonly Weighted<Genotype>[] },
  offspringKeys: readonly string[],
  species: SpeciesDefinition<P>,
  cache: Map<string, Map<string, number>>,
): number {
  const animalSex = sexOf(animal.genotype, species.sexSystem)

  let total = 0
  for (const candidate of mate.candidates) {
    const pairing =
      animalSex === 'female'
        ? { mother: animal, father: { id: mate.id, genotype: candidate.value } }
        : { mother: { id: mate.id, genotype: candidate.value }, father: animal }

    const outcomes = phenotypeDistribution(pairing.mother, pairing.father, species, cache)
    let likelihood = candidate.probability
    for (const key of offspringKeys) {
      likelihood *= outcomes.get(key) ?? 0
      if (likelihood === 0) break
    }
    total += likelihood
  }
  return total
}

/** `punnett().phenotypes()` as a lookup, memoised — the same pairing recurs constantly. */
function phenotypeDistribution<P extends object>(
  mother: { id: IndividualId; genotype: Genotype },
  father: { id: IndividualId; genotype: Genotype },
  species: SpeciesDefinition<P>,
  cache: Map<string, Map<string, number>>,
): Map<string, number> {
  const key = `${signature(mother.genotype, species)}×${signature(father.genotype, species)}`
  const cached = cache.get(key)
  if (cached) return cached

  const distribution = punnett(
    { id: mother.id, species: species.id, genotype: mother.genotype, parents: null, mutations: [] },
    { id: father.id, species: species.id, genotype: father.genotype, parents: null, mutations: [] },
    species,
  )
  const outcomes = new Map<string, number>()
  for (const outcome of distribution.phenotypes()) {
    outcomes.set(outcome.value.key, outcome.probability)
  }
  cache.set(key, outcomes)
  return outcomes
}

function phenotypeKeyOf<P extends object>(
  id: IndividualId,
  genotype: Genotype,
  species: SpeciesDefinition<P>,
): string {
  const individual: Individual = { id, species: species.id, genotype, parents: null, mutations: [] }
  return species.phenotypeKey(express(individual, species))
}

// ---------------------------------------------------------------------------
// Bookkeeping
// ---------------------------------------------------------------------------

function reweight(
  rows: readonly Weighted<Genotype>[],
  likelihood: (genotype: Genotype) => number,
): Weighted<Genotype>[] {
  const out: Weighted<Genotype>[] = []
  for (const row of rows) {
    const weight = row.probability * likelihood(row.value)
    if (weight > 0) out.push({ value: row.value, probability: weight })
  }
  return out
}

function normalise(
  rows: readonly Weighted<Genotype>[],
  message: string,
): readonly Weighted<Genotype>[] {
  const total = rows.reduce((sum, row) => sum + row.probability, 0)
  if (total < EPSILON) throw new Error(message)
  return rows.map((row) => ({ value: row.value, probability: row.probability / total }))
}

function viableOnly<P extends object>(
  rows: readonly Weighted<Genotype>[],
  species: SpeciesDefinition<P>,
): Weighted<Genotype>[] {
  return rows.filter((row) => checkViability(row.value, species).viable)
}

/** Canonical, order-independent identity of a genotype. Two rows with this key are one row. */
function signature<P extends object>(genotype: Genotype, species: SpeciesDefinition<P>): string {
  return [
    genotype.sexChromosomes.join('/'),
    ...species.loci.map((l) => genotypeKey(genotype.loci[l.id]!)),
  ].join('|')
}

function add<P extends object>(
  into: Map<string, { value: Genotype; probability: number }>,
  genotype: Genotype,
  probability: number,
  species: SpeciesDefinition<P>,
): void {
  const key = signature(genotype, species)
  const seen = into.get(key)
  if (seen) seen.probability += probability
  else into.set(key, { value: genotype, probability })
}

/** One locus at a time, out of the joint posterior. `GeneticKnowledge` stores marginals. */
function marginalise<P extends object>(
  rows: readonly Weighted<Genotype>[],
  species: SpeciesDefinition<P>,
): Record<LocusId, Map<GenotypeKey, { pair: readonly [string | null, string | null]; probability: number }>> {
  const out: Record<LocusId, Map<GenotypeKey, { pair: readonly [string | null, string | null]; probability: number }>> = {}
  for (const locus of species.loci) {
    const merged = new Map<GenotypeKey, { pair: readonly [string | null, string | null]; probability: number }>()
    for (const row of rows) {
      const pair = row.value.loci[locus.id]!
      const key = genotypeKey(pair)
      const seen = merged.get(key)
      if (seen) seen.probability += row.probability
      else merged.set(key, { pair, probability: row.probability })
    }
    out[locus.id] = merged
  }
  return out
}

/**
 * A marginal, as the belief type wants it.
 *
 * Three cases, and the third one is the honest default. A single outcome with all the
 * probability is `certain`. A marginal that has not moved from the uninformed baseline is
 * `unknown` — the evidence exists but says nothing about *this* locus, and saying "unknown" is
 * clearer to a player than a flat posterior. Everything else is a posterior, which is where
 * "66% het" lives, as a distribution rather than as a label.
 */
function toBelief(
  marginal: Map<GenotypeKey, { pair: readonly [string | null, string | null]; probability: number }>,
  baseline: Map<GenotypeKey, { pair: readonly [string | null, string | null]; probability: number }>,
): LocusBelief {
  for (const outcome of marginal.values()) {
    if (outcome.probability > 1 - EPSILON) {
      return { kind: 'certain', pair: [outcome.pair[0], outcome.pair[1]] }
    }
  }

  const unchanged =
    marginal.size === baseline.size &&
    [...marginal.entries()].every(
      ([key, outcome]) => Math.abs((baseline.get(key)?.probability ?? -1) - outcome.probability) < 1e-9,
    )
  if (unchanged) return { kind: 'unknown' }

  const distribution: Record<GenotypeKey, number> = {}
  for (const [key, outcome] of marginal) distribution[key] = outcome.probability
  return { kind: 'posterior', distribution }
}
