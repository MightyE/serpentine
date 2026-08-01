/**
 * Offspring probability — exact, closed form, never sampled.
 *
 * ## What this file is for
 *
 * Given two parents, what will the eggs be? A simulator would breed ten thousand virtual
 * clutches and report "about 25%". This file computes 25% — as a fraction, from the same
 * reasoning a person does with a Punnett square on paper. That difference is the whole point:
 * a teaching tool that says "about" has taught nothing, and the tests here assert exact values.
 *
 * ## How the maths works, in three steps
 *
 * 1. **Each parent makes gametes.** A gamete carries one of the two copies of each locus, and
 *    one of the two sex chromosomes. Each copy is equally likely — that is meiosis, and it is
 *    the only random thing in genetics.
 * 2. **Two gametes meet.** Multiply the probabilities. Slot 0 of the offspring's genotype comes
 *    from the mother, slot 1 from the father — the convention `genotype.ts` sets out, and the
 *    reason sex-linkage needs no special case anywhere below.
 * 3. **Some eggs do not hatch.** Whatever is left is renormalised, because what you count in a
 *    nest box is *conditioned on hatching*. This step is the only reason the file is longer
 *    than a page.
 *
 * ## Why the distribution is factored instead of one big list
 *
 * Ten two-allele loci make over a million distinct offspring genotypes. Nobody wants that list,
 * and no UI panel shows it. Unlinked loci are *independent*, so the distribution is stored one
 * locus at a time and joined only on demand.
 *
 * The exception, and it is the interesting one: **conditioning on "the egg hatched" is
 * conditioning on a joint event.** If a viability rule reads two loci, those two loci are no
 * longer independent once you throw away the eggs that did not hatch. So every locus that any
 * viability rule names — plus every sex-linked locus, plus the sex draw itself, since a
 * viability rule is handed the animal's sex — is computed as one joint **block**, and every
 * other locus stays factored. Nothing else needs to know about this.
 *
 * ## Sex-linkage and multi-allele loci are not special cases
 *
 * A sex-linked locus rides along with the sex chromosome it sits on: the gamete draws a
 * chromosome, and whatever allele that chromosome was carrying comes with it. That is one
 * `if` inside {@link sexGameteDraws}, and it is the entire implementation. Two loci on the
 * *same* sex chromosome therefore travel together automatically — which is real linkage,
 * falling out of the model rather than being coded.
 *
 * A locus with seven alleles is no harder than one with two: a gamete carries one of the two
 * copies the parent happens to have, whatever they are. No allele is named anywhere in here.
 */

import type {
  AlleleId,
  AllelePair,
  AlleleSlot,
  ChromosomeId,
  Genotype,
  GenotypeKey,
  Individual,
  IndividualId,
  Locus,
  LocusId,
  Observation,
  OffspringDistribution,
  PhenotypeOutcome,
  PunnettOptions,
  Sex,
  SpeciesDefinition,
  Weighted,
} from './types'
import { assertNoLinkage, genotypeKey, lociById, pairCarries, sexOf, wildTypePair } from './genotype'
import { express } from './expression'
import { checkViability } from './viability'

/** Suggested by the type contract. Exceeding it throws; a truncated distribution is a wrong one. */
const DEFAULT_MAX_JOINT_OUTCOMES = 50_000

/** Renormalising by a number this close to zero would be noise divided by noise. */
const EPSILON = 1e-12

// ---------------------------------------------------------------------------
// Internal representation
// ---------------------------------------------------------------------------

/**
 * One row of the joint block: a complete sex-chromosome draw plus the block loci.
 *
 * Everything outside the block is independent of this, which is why it is not in here.
 */
interface BlockEntry {
  readonly sexChromosomes: readonly [ChromosomeId, ChromosomeId]
  readonly pairs: Readonly<Record<LocusId, AllelePair>>
  readonly probability: number
}

/**
 * The state behind an {@link OffspringDistribution}.
 *
 * `OffspringDistribution` is a plain interface with two closures on it, so there is nowhere to
 * hang implementation state. It is kept in a `WeakMap` keyed by the distribution object, which
 * means `conditionOn` can take a distribution *it* produced and narrow it further without the
 * public type growing an implementation detail.
 */
interface Internal {
  /**
   * The species, with its phenotype type erased. Safe because the only phenotypes that ever go
   * back into `phenotypeKey` / `phenotypeLabel` are ones this same species just produced.
   */
  readonly species: SpeciesDefinition<object>
  /** Loci this distribution reports on — every locus, unless `PunnettOptions.loci` narrowed it. */
  readonly reportedLoci: readonly LocusId[]
  /** False when `PunnettOptions.loci` narrowed the calculation; `phenotypes()` then cannot run. */
  readonly coversEveryLocus: boolean
  /** Loci computed jointly. See the header note on why conditioning on hatching couples loci. */
  readonly blockLoci: readonly LocusId[]
  /** The block, already conditioned on hatching and renormalised. Sums to 1. */
  readonly block: readonly BlockEntry[]
  /** Every other reported locus, one independent distribution each. */
  readonly independent: Readonly<Record<LocusId, readonly Weighted<AllelePair>[]>>
  readonly nonViableProbability: number
  readonly nonViableReasons: readonly Weighted<string>[]
  readonly interactionGroups: readonly (readonly LocusId[])[]
  /**
   * The id given to the hypothetical offspring when `phenotypes()` has to express one. Fixed
   * for the whole distribution on purpose: a polygenic trait's environmental term is derived
   * from an animal's id, and a Punnett square is a statement about genetics, not about weather.
   * Holding it constant keeps the environment out of the histogram instead of smearing it.
   */
  readonly representativeId: IndividualId
  readonly maxJointOutcomes: number
}

const internals = new WeakMap<OffspringDistribution, Internal>()

// ---------------------------------------------------------------------------
// Gametes
// ---------------------------------------------------------------------------

/**
 * One possible sex-chromosome draw from one parent, and everything that rides along with it.
 *
 * The sex chromosome and every sex-linked allele are a *single* draw, not several — they are
 * physically the same chromosome. That is why they are one object.
 */
interface SexGameteDraw {
  readonly chromosome: ChromosomeId
  /** `null` where this chromosome does not carry that locus at all. */
  readonly alleles: Readonly<Record<LocusId, AlleleSlot>>
  readonly probability: number
}

/**
 * The gametes a parent can make, as far as the sex chromosomes are concerned.
 *
 * Meiosis puts chromosome copy 0 or copy 1 into the gamete, half the time each. A parent with
 * two identical copies makes one kind of gamete, so the two halves merge back into a single
 * outcome with probability 1 — which is exactly why an XX mother contributes nothing to the
 * sex of her offspring, without anything here having to know that.
 */
function sexGameteDraws(genotype: Genotype, sexLinked: readonly Locus[]): SexGameteDraw[] {
  const merged = new Map<string, { chromosome: ChromosomeId; alleles: Record<LocusId, AlleleSlot>; probability: number }>()

  for (const slot of [0, 1] as const) {
    const chromosome = genotype.sexChromosomes[slot]
    const alleles: Record<LocusId, AlleleSlot> = {}
    for (const locus of sexLinked) {
      if (locus.placement.kind !== 'sexLinked') continue
      // The allele lives in this slot only if this slot's chromosome is the one it sits on.
      alleles[locus.id] =
        chromosome === locus.placement.chromosome ? (genotype.loci[locus.id]?.[slot] ?? null) : null
    }
    const key = `${chromosome}|${sexLinked.map((l) => String(alleles[l.id])).join(',')}`
    const seen = merged.get(key)
    if (seen) seen.probability += 0.5
    else merged.set(key, { chromosome, alleles, probability: 0.5 })
  }

  return [...merged.values()]
}

/**
 * The gametes a parent can make at one ordinary locus: one copy or the other, half each.
 *
 * Homozygous parents merge to a single outcome for the same reason as above.
 */
function autosomalGameteDraws(pair: AllelePair): Weighted<AlleleSlot>[] {
  const merged = new Map<string, number>()
  for (const slot of [0, 1] as const) {
    const allele = pair[slot]
    merged.set(String(allele), (merged.get(String(allele)) ?? 0) + 0.5)
  }
  return [...merged.entries()].map(([value, probability]) => ({
    value: value === 'null' ? null : value,
    probability,
  }))
}

/**
 * Two gametes meet: the offspring's pair distribution at one ordinary locus.
 *
 * Merged by canonical key, because for an autosomal locus the two slots are interchangeable —
 * `variant/wild-type` and `wild-type/variant` are the same animal and must be one row.
 */
function autosomalOffspringPairs(mother: AllelePair, father: AllelePair): Weighted<AllelePair>[] {
  const merged = new Map<GenotypeKey, { value: AllelePair; probability: number }>()
  for (const m of autosomalGameteDraws(mother)) {
    for (const f of autosomalGameteDraws(father)) {
      const pair: AllelePair = [m.value, f.value]
      const key = genotypeKey(pair)
      const seen = merged.get(key)
      const probability = m.probability * f.probability
      if (seen) seen.probability += probability
      else merged.set(key, { value: pair, probability })
    }
  }
  return sortByKey([...merged.values()])
}

// ---------------------------------------------------------------------------
// punnett
// ---------------------------------------------------------------------------

/**
 * The exact expected offspring of one pairing.
 *
 * Throws if the parents are the same sex or belong to different species — those are not
 * pairings, and quietly returning something for them would be worse than stopping.
 */
export function punnett<P extends object>(
  mother: Individual,
  father: Individual,
  species: SpeciesDefinition<P>,
  options: PunnettOptions = {},
): OffspringDistribution {
  const system = species.sexSystem

  if (mother.species !== father.species) {
    throw new Error(
      `punnett: '${mother.id}' is a ${mother.species} and '${father.id}' is a ${father.species}. ` +
        `Different species do not interbreed in this engine.`,
    )
  }
  if (mother.species !== species.id) {
    throw new Error(
      `punnett: both parents are ${mother.species}, but the species definition supplied is ` +
        `'${species.id}'.`,
    )
  }

  const motherSex = sexOf(mother.genotype, system)
  const fatherSex = sexOf(father.genotype, system)
  if (motherSex === fatherSex) {
    throw new Error(
      `punnett: '${mother.id}' and '${father.id}' are both ${motherSex}, so they are not a pairing.`,
    )
  }
  if (motherSex !== 'female') {
    throw new Error(
      `punnett: the arguments are (mother, father) and '${mother.id}' is male. ` +
        `Slot 0 of an offspring's genotype comes from its mother, so the order matters — swap them.`,
    )
  }

  const byId = lociById(species)
  for (const locus of species.loci) assertNoLinkage(locus)

  const reportedLoci = resolveReportedLoci(species, options)
  const maxJointOutcomes = options.maxJointOutcomes ?? DEFAULT_MAX_JOINT_OUTCOMES

  // --- which loci have to be computed jointly ------------------------------
  const blockLoci = collectBlockLoci(species, byId)
  const sexLinked = species.loci.filter((l) => l.placement.kind === 'sexLinked')
  const blockAutosomal = blockLoci.filter((id) => byId.get(id)!.placement.kind === 'autosomal')

  // --- the block, before viability -----------------------------------------
  const conceived = enumerateBlock(
    mother.genotype,
    father.genotype,
    sexLinked,
    blockAutosomal,
    maxJointOutcomes,
  )

  // --- viability: some eggs do not hatch ------------------------------------
  const hatched: BlockEntry[] = []
  const reasons = new Map<string, number>()
  let nonViableProbability = 0

  for (const entry of conceived) {
    const genotype = completeGenotype(entry, species, byId)
    const viability = checkViability(genotype, species)
    if (viability.viable) {
      hatched.push(entry)
      continue
    }
    nonViableProbability += entry.probability
    const reason = viability.explanation ?? viability.ruleId ?? 'This combination is not viable.'
    reasons.set(reason, (reasons.get(reason) ?? 0) + entry.probability)
  }

  if (nonViableProbability > 1 - EPSILON) {
    throw new Error(
      `punnett: no egg from '${mother.id}' × '${father.id}' can hatch — every possible ` +
        `genotype is ruled non-viable. There is no distribution to report.`,
    )
  }

  // Everything below is conditioned on hatching, which is what you would actually count.
  const survival = 1 - nonViableProbability
  const block: BlockEntry[] = hatched.map((entry) => ({
    ...entry,
    probability: entry.probability / survival,
  }))

  // --- the loci that stayed independent ------------------------------------
  const independent: Record<LocusId, readonly Weighted<AllelePair>[]> = {}
  for (const id of reportedLoci) {
    if (blockLoci.includes(id)) continue
    independent[id] = autosomalOffspringPairs(mother.genotype.loci[id]!, father.genotype.loci[id]!)
  }

  return buildDistribution({
    species: species as unknown as SpeciesDefinition<object>,
    reportedLoci,
    coversEveryLocus: reportedLoci.length === species.loci.length,
    blockLoci,
    block,
    independent,
    nonViableProbability,
    nonViableReasons: [...reasons.entries()]
      .map(([value, probability]) => ({ value, probability }))
      .sort((a, b) => b.probability - a.probability || a.value.localeCompare(b.value)),
    interactionGroups: computeInteractionGroups(species, reportedLoci),
    representativeId: `punnett:${mother.id}x${father.id}`,
    maxJointOutcomes,
  })
}

/** `PunnettOptions.loci` narrows the report. Unknown ids are a typo, so they throw. */
function resolveReportedLoci<P extends object>(
  species: SpeciesDefinition<P>,
  options: PunnettOptions,
): LocusId[] {
  const all = species.loci.map((l) => l.id)
  if (!options.loci) return all
  for (const id of options.loci) {
    if (!all.includes(id)) {
      throw new Error(`punnett: '${id}' is not a locus of species '${species.id}'.`)
    }
  }
  return all.filter((id) => options.loci!.includes(id))
}

/**
 * The loci that cannot be computed one at a time.
 *
 * Two sources, and they are different in kind. Sex-linked loci are joint with the sex draw
 * because they are physically on the same chromosome. Loci named by a viability rule are joint
 * because conditioning on hatching is conditioning on a joint event — and since a viability
 * rule is handed the animal's sex as well as its genotype, sex joins that block too. The block
 * therefore always contains the sex draw, which is why {@link BlockEntry} always has
 * `sexChromosomes`.
 *
 * Loci in the block are computed jointly even when `PunnettOptions.loci` excluded them from the
 * report: a viability rule still changes the hatch ratios of everything it is coupled to.
 */
function collectBlockLoci<P extends object>(
  species: SpeciesDefinition<P>,
  byId: Map<string, Locus>,
): LocusId[] {
  const block = new Set<LocusId>()
  for (const locus of species.loci) {
    if (locus.placement.kind === 'sexLinked') block.add(locus.id)
  }
  for (const rule of species.viability) {
    for (const id of rule.involves) {
      if (!byId.has(id)) {
        throw new Error(
          `Viability rule '${rule.id}' says it involves locus '${id}', which species ` +
            `'${species.id}' does not declare.`,
        )
      }
      block.add(id)
    }
  }
  return species.loci.map((l) => l.id).filter((id) => block.has(id))
}

/** Every combination of the sex draw and the block's ordinary loci, before viability. */
function enumerateBlock(
  mother: Genotype,
  father: Genotype,
  sexLinked: readonly Locus[],
  blockAutosomal: readonly LocusId[],
  maxJointOutcomes: number,
): BlockEntry[] {
  const motherDraws = sexGameteDraws(mother, sexLinked)
  const fatherDraws = sexGameteDraws(father, sexLinked)

  const perLocus = blockAutosomal.map((id) =>
    autosomalOffspringPairs(mother.loci[id]!, father.loci[id]!),
  )
  const size = perLocus.reduce((n, d) => n * d.length, motherDraws.length * fatherDraws.length)
  if (size > maxJointOutcomes) {
    const named = [...sexLinked.map((l) => l.id), ...blockAutosomal].join(', ')
    throw new Error(
      `punnett: computing viability jointly over [${named}] needs ${size} outcomes, over the ` +
        `limit of ${maxJointOutcomes}. Raise PunnettOptions.maxJointOutcomes, or narrow the ` +
        `loci a viability rule declares in 'involves'.`,
    )
  }

  let entries: BlockEntry[] = []
  for (const m of motherDraws) {
    for (const f of fatherDraws) {
      const pairs: Record<LocusId, AllelePair> = {}
      for (const locus of sexLinked) {
        // Slot 0 from the mother, slot 1 from the father — the same rule as the chromosomes,
        // which is precisely why the slots line up with `sexChromosomes` without being told to.
        pairs[locus.id] = [m.alleles[locus.id] ?? null, f.alleles[locus.id] ?? null]
      }
      entries.push({
        sexChromosomes: [m.chromosome, f.chromosome],
        pairs,
        probability: m.probability * f.probability,
      })
    }
  }

  blockAutosomal.forEach((id, i) => {
    const distribution = perLocus[i]!
    const grown: BlockEntry[] = []
    for (const entry of entries) {
      for (const outcome of distribution) {
        grown.push({
          sexChromosomes: entry.sexChromosomes,
          pairs: { ...entry.pairs, [id]: outcome.value },
          probability: entry.probability * outcome.probability,
        })
      }
    }
    entries = grown
  })

  return entries
}

/**
 * A full genotype for one block entry, so a viability rule can be asked about it.
 *
 * Loci outside the block are filled with wild-type. That is safe **only** because a viability
 * rule promises, via `involves`, to read nothing else — and it is the concrete reason that
 * promise is load-bearing rather than documentation.
 */
function completeGenotype<P extends object>(
  entry: BlockEntry,
  species: SpeciesDefinition<P>,
  byId: Map<string, Locus>,
): Genotype {
  const loci: Record<LocusId, AllelePair> = {}
  for (const locus of species.loci) {
    loci[locus.id] = entry.pairs[locus.id] ?? wildTypePair(byId.get(locus.id)!, entry.sexChromosomes)
  }
  return { sexChromosomes: entry.sexChromosomes, loci }
}

/**
 * Which loci a reader must think about together.
 *
 * Wider than the block on purpose: a modifier rule that reads two loci does not change any
 * probability, but it does mean the two loci produce one visible result between them, and that
 * is what a player needs told. Sex-linked loci are grouped with each other because they share a
 * chromosome. Every reported locus appears in exactly one group, singletons included.
 */
function computeInteractionGroups<P extends object>(
  species: SpeciesDefinition<P>,
  reportedLoci: readonly LocusId[],
): LocusId[][] {
  const parent = new Map<string, string>()
  const find = (a: string): string => {
    let root = a
    while (parent.get(root) !== undefined && parent.get(root) !== root) root = parent.get(root)!
    return root
  }
  const union = (a: string, b: string): void => {
    parent.set(find(a), find(b))
  }
  for (const id of reportedLoci) parent.set(id, id)

  const SEX = '\u0000sex'
  parent.set(SEX, SEX)
  for (const locus of species.loci) {
    if (locus.placement.kind === 'sexLinked' && reportedLoci.includes(locus.id)) {
      union(locus.id, SEX)
    }
  }
  for (const rule of species.viability) {
    const involved = rule.involves.filter((id) => reportedLoci.includes(id))
    for (const id of involved) union(id, SEX)
  }
  for (const rule of species.modifiers) {
    const read = rule.reads.filter((id) => reportedLoci.includes(id))
    for (let i = 1; i < read.length; i++) union(read[0]!, read[i]!)
  }

  const groups = new Map<string, LocusId[]>()
  for (const id of reportedLoci) {
    const root = find(id)
    const group = groups.get(root)
    if (group) group.push(id)
    else groups.set(root, [id])
  }
  return [...groups.values()]
}

// ---------------------------------------------------------------------------
// Assembling the public object
// ---------------------------------------------------------------------------

function buildDistribution(internal: Internal): OffspringDistribution {
  const lociMarginals: Record<LocusId, readonly Weighted<AllelePair>[]> = {}
  for (const id of internal.reportedLoci) {
    lociMarginals[id] = internal.blockLoci.includes(id)
      ? marginaliseBlock(internal.block, id)
      : internal.independent[id]!
  }

  const distribution: OffspringDistribution = {
    species: internal.species.id,
    nonViableProbability: internal.nonViableProbability,
    nonViableReasons: internal.nonViableReasons,
    lociMarginals,
    sexRatio: sexRatioOf(internal),
    interactionGroups: internal.interactionGroups,
    joint: (loci) => enumerateJoint(internal, loci),
    phenotypes: () => phenotypesOf(internal),
  }

  internals.set(distribution, internal)
  return distribution
}

/** One locus's own probabilities, read out of the joint block. */
function marginaliseBlock(block: readonly BlockEntry[], locus: LocusId): Weighted<AllelePair>[] {
  const merged = new Map<GenotypeKey, { value: AllelePair; probability: number }>()
  for (const entry of block) {
    const pair = entry.pairs[locus] ?? ([null, null] as AllelePair)
    const key = genotypeKey(pair)
    const seen = merged.get(key)
    if (seen) seen.probability += entry.probability
    else merged.set(key, { value: pair, probability: entry.probability })
  }
  return sortByKey([...merged.values()])
}

/**
 * The sex ratio, conditioned on hatching.
 *
 * Normally 50/50 and not worth a function — except when a viability rule touches something
 * sex-linked, in which case the ratio shifts, and it shifts by exactly the right amount without
 * anything here knowing that could happen.
 */
function sexRatioOf(internal: Internal): Record<Sex, number> {
  const ratio: Record<Sex, number> = { male: 0, female: 0 }
  for (const entry of internal.block) {
    const sex = sexOf({ sexChromosomes: entry.sexChromosomes, loci: {} }, internal.species.sexSystem)
    ratio[sex] += entry.probability
  }
  return ratio
}

/**
 * The exact joint distribution over some loci.
 *
 * Two things worth knowing about the result. **The genotypes are partial**: they carry the loci
 * you asked for and no others, so a missing key means "not asked about", never "wild-type".
 * And **rows are split by sex chromosomes**, because a genotype includes them and because
 * expression is allowed to depend on sex; add the pairs of rows together if you do not care.
 */
function enumerateJoint(internal: Internal, loci: readonly LocusId[]): Weighted<Genotype>[] {
  for (const id of loci) {
    if (!internal.reportedLoci.includes(id)) {
      throw new Error(
        `joint: this distribution does not cover locus '${id}'. It reports on ` +
          `[${internal.reportedLoci.join(', ')}] — PunnettOptions.loci may have narrowed it.`,
      )
    }
  }

  const fromBlock = loci.filter((id) => internal.blockLoci.includes(id))
  const independent = loci.filter((id) => !internal.blockLoci.includes(id))

  let rows = collapseBlock(internal.block, fromBlock)
  const size = independent.reduce((n, id) => n * internal.independent[id]!.length, rows.length)
  if (size > internal.maxJointOutcomes) {
    throw new Error(
      `joint: [${loci.join(', ')}] would produce ${size} outcomes, over the limit of ` +
        `${internal.maxJointOutcomes}. Ask for fewer loci, or raise ` +
        `PunnettOptions.maxJointOutcomes if you really want them all.`,
    )
  }

  for (const id of independent) {
    const grown: typeof rows = []
    for (const row of rows) {
      for (const outcome of internal.independent[id]!) {
        grown.push({
          sexChromosomes: row.sexChromosomes,
          loci: { ...row.loci, [id]: outcome.value },
          probability: row.probability * outcome.probability,
        })
      }
    }
    rows = grown
  }

  return rows.map((row) => ({
    value: { sexChromosomes: row.sexChromosomes, loci: row.loci },
    probability: row.probability,
  }))
}

interface JointRow {
  sexChromosomes: readonly [ChromosomeId, ChromosomeId]
  loci: Record<LocusId, AllelePair>
  probability: number
}

/** Drop the block loci nobody asked about, adding up the rows that become identical. */
function collapseBlock(block: readonly BlockEntry[], keep: readonly LocusId[]): JointRow[] {
  const merged = new Map<string, JointRow>()
  for (const entry of block) {
    const loci: Record<LocusId, AllelePair> = {}
    for (const id of keep) loci[id] = entry.pairs[id] ?? ([null, null] as AllelePair)
    const key = `${entry.sexChromosomes.join('/')}|${keep.map((id) => genotypeKey(loci[id]!)).join('|')}`
    const seen = merged.get(key)
    if (seen) seen.probability += entry.probability
    else
      merged.set(key, {
        sexChromosomes: entry.sexChromosomes,
        loci,
        probability: entry.probability,
      })
  }
  return [...merged.values()]
}

/**
 * What the clutch will *look* like, which is the only thing a player can actually observe.
 *
 * This has to materialise the full joint, because a phenotype key is a statement about a whole
 * animal — an epistatic modifier can read two loci and collapse both into one appearance, so
 * there is no way to build this histogram one locus at a time. The outcome limit still applies.
 */
function phenotypesOf(internal: Internal): Weighted<PhenotypeOutcome>[] {
  if (!internal.coversEveryLocus) {
    throw new Error(
      `phenotypes: a phenotype depends on every locus, but this distribution was narrowed to ` +
        `[${internal.reportedLoci.join(', ')}] by PunnettOptions.loci. Recompute without it.`,
    )
  }

  const merged = new Map<string, { value: PhenotypeOutcome; probability: number }>()
  for (const row of enumerateJoint(internal, internal.reportedLoci)) {
    const individual: Individual = {
      id: internal.representativeId,
      species: internal.species.id,
      genotype: row.value,
      parents: null,
      mutations: [],
    }
    const phenotype = express(individual, internal.species)
    const key = internal.species.phenotypeKey(phenotype)
    const seen = merged.get(key)
    if (seen) seen.probability += row.probability
    else
      merged.set(key, {
        value: { key, label: internal.species.phenotypeLabel(phenotype) },
        probability: row.probability,
      })
  }

  return [...merged.values()].sort(
    (a, b) => b.probability - a.probability || a.value.key.localeCompare(b.value.key),
  )
}

// ---------------------------------------------------------------------------
// conditionOn — where "66% het" comes from
// ---------------------------------------------------------------------------

/**
 * Narrow a distribution by something the player observed, and renormalise.
 *
 * This is the function that turns a Punnett square into genetics. Cross two carriers of a
 * recessive: a quarter of the offspring show the trait, a half carry one copy, a quarter carry
 * none. Now *look* at a hatchling and see that it looks normal. The quarter that show the trait
 * are gone — they are not this animal — so three outcomes remain, carrying probabilities ¼, ½
 * and ¼ that no longer add to 1. Divide each by ¾, and the animal is two-thirds likely to be a
 * carrier.
 *
 * That is where the hobby's "66% het" comes from, and it is worth seeing that nothing in this
 * function knows about it. It filters and divides. The 2/3 is arithmetic.
 *
 * Note what does *not* change: `nonViableProbability` is a fact about the pairing, not about the
 * animal you are looking at, so observing a hatchling tells you nothing new about it.
 */
export function conditionOn(
  distribution: OffspringDistribution,
  observation: Observation,
): OffspringDistribution {
  const internal = internals.get(distribution)
  if (!internal) {
    throw new Error(
      `conditionOn: this distribution did not come from punnett() or conditionOn(), so there is ` +
        `nothing behind it to narrow.`,
    )
  }

  if (observation.kind === 'sex') {
    return conditionOnSex(internal, observation.sex)
  }
  return conditionOnPhenotype(internal, observation.phenotypeKey)
}

/**
 * Keep the offspring of one sex.
 *
 * Cheap, because the sex draw lives in the block: the independent loci are, by construction,
 * independent of sex and do not move at all. A sex-linked locus does move — which is the whole
 * of "why are the affected ones always male?", answered by filtering rather than by a rule.
 */
function conditionOnSex(internal: Internal, sex: Sex): OffspringDistribution {
  const kept = internal.block.filter(
    (entry) =>
      sexOf({ sexChromosomes: entry.sexChromosomes, loci: {} }, internal.species.sexSystem) === sex,
  )
  const total = kept.reduce((sum, entry) => sum + entry.probability, 0)
  if (total < EPSILON) {
    throw new Error(`conditionOn: no offspring of this pairing can be ${sex}.`)
  }
  return buildDistribution({
    ...internal,
    block: kept.map((entry) => ({ ...entry, probability: entry.probability / total })),
  })
}

/**
 * Keep the offspring that look a particular way.
 *
 * Everything collapses into one block afterwards, and that is not an implementation shortcut —
 * it is the actual consequence. Two loci that were independent before you looked at the animal
 * are not independent after: if either one of them could have produced what you are seeing,
 * learning that you are seeing it tells you something about both at once. So the result reports
 * a single interaction group, honestly.
 */
function conditionOnPhenotype(internal: Internal, phenotypeKey: string): OffspringDistribution {
  if (!internal.coversEveryLocus) {
    throw new Error(
      `conditionOn: judging what an animal looks like needs every locus, but this distribution ` +
        `was narrowed to [${internal.reportedLoci.join(', ')}] by PunnettOptions.loci.`,
    )
  }

  const kept: BlockEntry[] = []
  let total = 0
  for (const row of enumerateJoint(internal, internal.reportedLoci)) {
    const individual: Individual = {
      id: internal.representativeId,
      species: internal.species.id,
      genotype: row.value,
      parents: null,
      mutations: [],
    }
    if (internal.species.phenotypeKey(express(individual, internal.species)) !== phenotypeKey) {
      continue
    }
    kept.push({
      sexChromosomes: row.value.sexChromosomes,
      pairs: row.value.loci,
      probability: row.probability,
    })
    total += row.probability
  }

  if (total < EPSILON) {
    throw new Error(
      `conditionOn: no offspring of this pairing looks like '${phenotypeKey}', so there is ` +
        `nothing to condition on. Check the key against phenotypes().`,
    )
  }

  return buildDistribution({
    ...internal,
    blockLoci: internal.reportedLoci,
    block: kept.map((entry) => ({ ...entry, probability: entry.probability / total })),
    independent: {},
    interactionGroups: [internal.reportedLoci],
  })
}

// ---------------------------------------------------------------------------
// carrierProbability
// ---------------------------------------------------------------------------

/**
 * How likely the animal is to carry at least one copy of an allele.
 *
 * "Carrier" means exactly this and nothing more: one copy is enough, two copies still counts.
 * Ask this of a conditioned distribution and you get the number breeders write on price tags —
 * 66% out of two carriers, 50% out of one carrier and one clear animal — with no table of
 * hobby vocabulary anywhere in this engine.
 */
export function carrierProbability(
  distribution: OffspringDistribution,
  locus: LocusId,
  allele: AlleleId,
): number {
  const marginal = distribution.lociMarginals[locus]
  if (!marginal) {
    throw new Error(
      `carrierProbability: this distribution does not cover locus '${locus}'. It reports on ` +
        `[${Object.keys(distribution.lociMarginals).join(', ')}].`,
    )
  }
  return marginal.reduce(
    (sum, outcome) => (pairCarries(outcome.value, allele) ? sum + outcome.probability : sum),
    0,
  )
}

// ---------------------------------------------------------------------------

/** Stable output order, so a UI table and a test both read the same way twice. */
function sortByKey(outcomes: { value: AllelePair; probability: number }[]): Weighted<AllelePair>[] {
  return outcomes.sort((a, b) => genotypeKey(a.value).localeCompare(genotypeKey(b.value)))
}
