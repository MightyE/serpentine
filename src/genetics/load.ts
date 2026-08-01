/**
 * Genetic load: the hidden recessive alleles every population quietly carries.
 *
 * ## The one idea in this file
 *
 * There is no "gene strength" number here, and there must never be one. Real inbreeding
 * depression is not a stat that decays — it is a *combinatorial* fact:
 *
 *   1. Every founder carries a handful of harmful recessive alleles. Carrying one is invisible;
 *      the wild-type copy on the other chromosome masks it completely.
 *   2. It only shows when an animal inherits **two copies of the same one**.
 *   3. Relatives carry the *same* ones, inherited from a shared ancestor. So breeding relatives
 *      raises the chance of pairing one up — which is exactly what
 *      {@link ./pedigree.ts `inbreedingCoefficient`} measures.
 *   4. Outcrossing to an unrelated line brings in a *different* handful. Nothing pairs up, and
 *      the effect disappears in a single generation.
 *
 * Point 4 is the interesting one, and it is the reason this is modelled honestly rather than as
 * a decaying stat: a stat that went down as you line-bred would have to be given an arbitrary
 * rule to come back up, and no arbitrary rule would recover in one generation the way the real
 * thing does. Here, recovery is not a rule at all — it falls out of the alleles being different.
 *
 * ## Why there is almost no machinery here
 *
 * A deleterious recessive is mechanically **just a het nobody wants**. It is an ordinary allele
 * at an ordinary locus, inherited by ordinary meiosis, tracked by the carrier-probability code
 * that already exists. So this file declares *which* alleles are load and what a homozygote
 * means, and then gets out of the way: `breed()`, `makeGamete()` and `carrierProbability()` do
 * all the actual work, unchanged.
 *
 * ## The two outcomes, and the two that do not exist
 *
 * A homozygous load locus produces either an egg that does not hatch, or a hatchling that
 * **needs extra care** and becomes a resident of the rehab. Those are the only two. Nothing here
 * harms a living animal: there is no third outcome, no disposal, and no health that decays over
 * time — not in this file, not in any file, and not in an identifier or a comment. See
 * `viability.ts` for the same rule stated from the other side.
 */

import { makeRng } from '../lib/rng'
import { genotypeKey } from './genotype'
import type {
  AlleleId,
  AllelePair,
  Genotype,
  Individual,
  IndividualId,
  Locus,
  LocusId,
  SpeciesDefinition,
  TraitValues,
  ViabilityRule,
} from './types'

// ---------------------------------------------------------------------------
// The pool
// ---------------------------------------------------------------------------

/** What a homozygous load locus means for the animal that carries it. */
export type LoadOutcome =
  /** The egg does not hatch. Reported as a genetics fact, with the explanation below. */
  | 'eggDoesNotHatch'
  /** It hatches, and the hatchling needs extra care. It becomes a resident, not a problem. */
  | 'needsExtraCare'

/** One deleterious recessive: an ordinary allele at an ordinary locus, plus what it means. */
export interface LoadAllele {
  readonly locus: LocusId
  readonly allele: AlleleId
  readonly outcome: LoadOutcome
  /** Shown to the player, in full. This is the teaching moment — say *why*, not just *what*. */
  readonly explanation: string
}

/**
 * The set of deleterious recessives that exist in a population.
 *
 * This is data, like a species is data. The engine never invents one.
 */
export interface GeneticLoadPool {
  readonly id: string
  readonly entries: readonly LoadAllele[]
}

/**
 * How many distinct deleterious recessives exist in the population.
 *
 * **This number is load-bearing, and it is the reason outcrossing works.** With a pool of `P`
 * and `k` carried per founder, the chance that two *unrelated* founders happen to carry the same
 * one is about `k²/P`. At `P = 60`, `k = 3` that is 14.5%, so the chance an egg from two
 * unrelated founders is homozygous for anything is about 3.6% — rare enough to read as "healthy
 * outcross", not as background noise.
 *
 * Run the same arithmetic for a full-sib mating and the answer is roughly nine times higher,
 * because the two parents are drawing from the *same* six alleles rather than from sixty. That
 * ratio — not a tuning constant — is the entire inbreeding-depression signal, and shrinking the
 * pool would blur it by making unrelated animals look related.
 */
export const LOAD_POOL_SIZE = 60

/**
 * How many load alleles a founder carries.
 *
 * Real vertebrate populations carry more than this. Three keeps the pool arithmetic above in a
 * range where a player can hold it in their head, and it is enough to make line-breeding bite
 * within the handful of generations a game session covers.
 */
export const FOUNDER_LOAD_ALLELES = 3

// ---------------------------------------------------------------------------
// Seeding founders
// ---------------------------------------------------------------------------

/**
 * Draw this founder's share of the population's genetic load, as genotype overrides ready to
 * hand to `makeGenotype()`.
 *
 * Every drawn locus comes back **heterozygous** — one load allele, one wild-type — because that
 * is what a founder is: a healthy-looking animal quietly carrying a few things. A founder is
 * never seeded homozygous.
 *
 * Randomness is derived from the founder's own id rather than taken as a parameter, following
 * the rule the engine states in `types.ts`: anything about an individual derives from that
 * individual's id. The same founder id always draws the same alleles, so a save file does not
 * have to store them and two callers cannot disagree about what a founder carries.
 */
export function seedFounderLoad<P extends object>(
  pool: GeneticLoadPool,
  species: SpeciesDefinition<P>,
  founderId: IndividualId,
  count: number = FOUNDER_LOAD_ALLELES,
): Readonly<Record<LocusId, AllelePair>> {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`seedFounderLoad: count must be a non-negative whole number, got ${count}.`)
  }
  if (count > pool.entries.length) {
    throw new Error(
      `seedFounderLoad: asked for ${count} load alleles but pool '${pool.id}' declares only ` +
        `${pool.entries.length}. A founder cannot carry a deleterious recessive that does not exist.`,
    )
  }

  const byId = new Map(species.loci.map((l) => [l.id, l]))
  const rng = makeRng(founderId).fork('genetic-load')
  const drawn = rng.shuffle(pool.entries).slice(0, count)

  const overrides: Record<LocusId, AllelePair> = {}
  for (const entry of drawn) {
    const locus = requireLoadLocus(byId, entry, pool.id)
    overrides[entry.locus] = [entry.allele, locus.wildType]
  }
  return overrides
}

/**
 * Which load alleles this animal is **homozygous** for — the ones that actually show.
 *
 * Carriers are not listed, because a carrier is indistinguishable from a clear animal without a
 * test breeding or a gene test. That asymmetry is the mechanic, not an oversight: the player has
 * to infer what a line carries the same way a breeder does.
 */
export function expressedLoad(
  individual: Individual,
  pool: GeneticLoadPool,
): readonly LoadAllele[] {
  return pool.entries.filter((entry) => isHomozygousFor(individual.genotype, entry))
}

/**
 * The viability rules a species must declare to make its `'eggDoesNotHatch'` load real.
 *
 * Handing these to `SpeciesDefinition.viability` is the whole integration. `breed()` then reports
 * such an egg exactly the way it reports any other non-viable genotype — with the explanation
 * attached — and `punnett()` folds it into the hatch ratios automatically, because both already
 * know how to do that. No new code path, and no second way for an egg not to hatch.
 *
 * `'needsExtraCare'` entries produce no rule here. Those animals hatch; reporting them is
 * {@link expressedLoad}'s job and caring for them is the game layer's.
 */
export function loadViabilityRules(pool: GeneticLoadPool): readonly ViabilityRule[] {
  return pool.entries
    .filter((entry) => entry.outcome === 'eggDoesNotHatch')
    .map((entry) => ({
      id: `${pool.id}:${entry.locus}:${entry.allele}`,
      label: `Two copies of ${entry.allele}`,
      involves: [entry.locus],
      explanation: entry.explanation,
      isNonViable: (genotype: Genotype) => isHomozygousFor(genotype, entry),
    }))
}

/**
 * A hidden locus carrying one deleterious recessive, ready to drop into a species' `loci`.
 *
 * "Hidden" is literal: the expression rule produces no trait values at all, so nothing about
 * carrying this allele is visible in the phenotype. That is what makes it a load allele rather
 * than a morph — you find out it is there by breeding, not by looking.
 *
 * A pool of {@link LOAD_POOL_SIZE} needs that many loci, which is far too many to hand-write.
 * This exists so species data can generate them in a loop. The ids are supplied by the caller;
 * this file knows no trait names and no species.
 */
export function loadLocus(entry: LoadAllele, wildType: AlleleId = 'wild-type'): Locus {
  const silent: TraitValues = {}
  return {
    id: entry.locus,
    label: entry.locus,
    placement: { kind: 'autosomal' },
    alleles: [
      { id: wildType, label: wildType, origin: 'wild-type' },
      { id: entry.allele, label: entry.allele, origin: 'authored', notes: entry.explanation },
    ],
    wildType,
    expression: {
      kind: 'table',
      entries: {
        [`${wildType}/${wildType}`]: silent,
        [genotypeKey([entry.allele, wildType])]: silent,
        [`${entry.allele}/${entry.allele}`]: silent,
      },
      otherwise: silent,
    },
  }
}

// ---------------------------------------------------------------------------
// Vigor — a readout, and nothing else
// ---------------------------------------------------------------------------

/**
 * How much each expressed load locus reduces the *displayed* vigor figure. Pure presentation.
 */
const VIGOR_LOAD_STEP = 0.25

/**
 * A friendly 0..1 summary of an animal's genetic diversity and expressed load, for display.
 *
 * **Nothing in the engine consumes this, and nothing ever may.** Delete this function and the
 * biology is bit-for-bit unchanged: hatch rates come from viability rules, inheritance comes
 * from meiosis, and both read the genotype directly. `load.test.ts` asserts that no module under
 * `src/genetics/`, `src/species/` or `src/render/` so much as mentions it, and that assertion is
 * the point of the function existing in a file by itself rather than being inlined into a UI
 * component where it could quietly acquire a caller.
 *
 * The reason for the rule: the moment something simulates a summary number, the summary *is* the
 * model, and the model stops being genetics. `F` and the load alleles are the model. This is a
 * label on it.
 */
export function vigor(individual: Individual, pool: GeneticLoadPool, f: number): number {
  const expressed = expressedLoad(individual, pool)
  const fromDiversity = 1 - clamp01(f)
  const fromLoad = Math.pow(1 - VIGOR_LOAD_STEP, expressed.length)
  return clamp01(fromDiversity * fromLoad)
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function isHomozygousFor(genotype: Genotype, entry: LoadAllele): boolean {
  const pair = genotype.loci[entry.locus]
  if (!pair) return false
  return pair[0] === entry.allele && pair[1] === entry.allele
}

function requireLoadLocus(
  byId: ReadonlyMap<LocusId, Locus>,
  entry: LoadAllele,
  poolId: string,
): Locus {
  const locus = byId.get(entry.locus)
  if (!locus) {
    throw new Error(
      `Load pool '${poolId}' names locus '${entry.locus}', which this species does not declare.`,
    )
  }
  if (locus.placement.kind !== 'autosomal') {
    throw new Error(
      `Load pool '${poolId}' puts a deleterious recessive at '${entry.locus}', which is sex-linked. ` +
        `A sex-linked recessive shows in the heterogametic sex from a single copy, so it is not a ` +
        `hidden load allele and must not be modelled as one — declare it as an ordinary trait.`,
    )
  }
  if (!locus.alleles.some((a) => a.id === entry.allele)) {
    throw new Error(
      `Load pool '${poolId}' names allele '${entry.allele}' at locus '${entry.locus}', ` +
        `which does not declare it.`,
    )
  }
  return locus
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}
