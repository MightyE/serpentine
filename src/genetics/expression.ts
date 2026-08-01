/**
 * Expression: turning what an animal *carries* into what an animal *is*.
 *
 * ## The pipeline, in order
 *
 *     1. deriveTraits    every locus's ExpressionRule, plus every PolygenicTrait  →  TraitValues
 *     2. basePhenotype() a fresh, unmodified phenotype for the species
 *     3. projections     one trait  →  its simple effect on the draft. No cross-talk.
 *     4. modifiers       ordered rules that read the whole genotype and rewrite anything
 *
 * Stage 3 is the boring half and that is on purpose: one trait in, one effect out. Stage 4 is
 * where a *combination* becomes more than the sum of its parts — a rule that says "strip all of
 * one pigment no matter what else is going on" runs late and wins, and no amount of stage-3
 * cleverness can express that.
 *
 * **Reordering the modifier array changes the biology.** That is the model, not a leaky
 * implementation detail. The render pipeline in `src/render/contract.ts` has deliberately the
 * same shape — start with something simple, then let a named, ordered list of rules rewrite it.
 * Learn the shape once and you know both halves of the codebase.
 *
 * ## Why there is no `Rng` parameter anywhere in here
 *
 * Expression is a **pure function of `(individual, species)`**. Ask for the same snake's
 * phenotype twice and you must get the same answer, or the same animal changes colour between
 * two renders of one frame.
 *
 * Polygenic traits do use randomness — their environmental term is not inherited — but that
 * randomness is seeded from `individual.id`, so it is fixed the moment the animal exists and
 * never moves again. Nothing here reads a shared world RNG, because a shared stream would make
 * an animal's appearance depend on what *else* the game happened to ask for first.
 *
 * @see ./types.ts — the contract this implements
 * @see ./genotype.ts — the slot rules everything below is built on
 */

import { makeRng, type Rng } from '../lib/rng'
import { alleleCopies, assertNoLinkage, genotypeKey, sexOf } from './genotype'
import type {
  AllelePair,
  ExpressionContext,
  ExpressionPipelineContext,
  ExpressionRule,
  Individual,
  Locus,
  PolygenicContext,
  PolygenicTrait,
  SpeciesDefinition,
  TraitValue,
  TraitValues,
} from './types'

/**
 * Stage 1: work out every trait value this animal expresses, before any phenotype exists.
 *
 * Two sources feed the same bag of values. Each **locus** runs its `ExpressionRule` — a lookup
 * table keyed by genotype in almost every case, or a custom function for the rare rule a table
 * genuinely cannot say. Each **polygenic trait** then adds up small per-copy contributions from
 * across several loci and adds a pinch of non-heritable noise.
 *
 * Loci run first, in the order the species declares them, and polygenic traits run after. If two
 * of them write the same `TraitKey` the later one wins — which is almost always a content bug, so
 * {@link validateSpecies} flags it rather than leaving you to wonder.
 */
export function deriveTraits<P extends object>(
  individual: Individual,
  species: SpeciesDefinition<P>,
): TraitValues {
  const sex = sexOf(individual.genotype, species.sexSystem)
  const out: Record<string, TraitValue> = {}

  for (const locus of species.loci) {
    // A locus that declares linkage would express fine but *inherit* wrong, and a silently wrong
    // probability is the worst thing a teaching tool can produce. Stop here rather than later.
    assertNoLinkage(locus)
    const pair = individual.genotype.loci[locus.id]
    if (pair === undefined) {
      throw new Error(
        `Individual '${individual.id}' has no entry for locus '${locus.id}' of species ` +
          `'${species.id}'. Build genotypes with makeGenotype() so every locus is present.`,
      )
    }
    Object.assign(out, resolveLocus(locus, pair, { genotype: individual.genotype, sex, individualId: individual.id, locus }))
  }

  for (const trait of species.polygenic) {
    out[trait.key] = evaluatePolygenic(trait, {
      genotype: individual.genotype,
      individualId: individual.id,
      rng: polygenicRng(individual.id, trait.key),
    })
  }

  return out
}

/**
 * The whole pipeline: genotype → trait values → base phenotype → projections → modifiers.
 *
 * Pure with respect to `(individual, species)`, so call it as often as you like — once per
 * frame is fine, and the answer is identical every time.
 *
 * Note what this function does *not* do: it never looks inside `P`. The engine has no idea what
 * a phenotype is made of; it only hands the draft to the projections and modifiers the species
 * itself supplied. That is what lets `src/genetics/` know nothing about snakes, and it is why
 * final tidying of a phenotype (sorting render stages, clamping, freezing) belongs to the
 * renderer, which is the only side that knows the shape.
 */
export function express<P extends object>(
  individual: Individual,
  species: SpeciesDefinition<P>,
): P {
  const traits = deriveTraits(individual, species)
  const ctx: ExpressionPipelineContext = {
    genotype: individual.genotype,
    sex: sexOf(individual.genotype, species.sexSystem),
    individualId: individual.id,
    traits,
  }

  const draft = species.basePhenotype()

  // Stage 3 — simple, one trait at a time. A projection for a trait nobody expressed still runs,
  // with `null`, so a species can give a trait a defined "absent" appearance instead of the
  // projection silently never firing.
  for (const projection of species.projections) {
    projection.apply(draft, traits[projection.key] ?? null, ctx)
  }

  // Stage 4 — the interesting one. Later rules see earlier rules' work, so the array order is
  // itself part of the species definition.
  for (const modifier of species.modifiers) {
    modifier.apply(draft, ctx)
  }

  return draft
}

// ---------------------------------------------------------------------------
// Locus expression
// ---------------------------------------------------------------------------

/**
 * Run one locus's rule. Both rule kinds land here so callers never have to branch.
 *
 * For a **table**, the pair is reduced to its canonical {@link genotypeKey} — non-null alleles,
 * sorted — and looked up. Sorting is what makes `variant-a/variant-b` and `variant-b/variant-a`
 * the same row, and `otherwise` is what covers every pair in a big allelic complex that does not
 * deserve a row of its own.
 *
 * Exported for the validator and the probability engine, which need to express a *hypothetical*
 * pair that no animal is carrying yet.
 */
export function resolveLocus(
  locus: Locus,
  pair: AllelePair,
  ctx: ExpressionContext,
): TraitValues {
  const rule: ExpressionRule = locus.expression
  if (rule.kind === 'table') {
    return rule.entries[genotypeKey(pair)] ?? rule.otherwise
  }
  return rule.resolve(pair, ctx)
}

// ---------------------------------------------------------------------------
// Polygenic traits
// ---------------------------------------------------------------------------

/**
 * The random stream for one polygenic trait on one animal.
 *
 * Seeded from the animal's id and nothing else, so the environmental term is stable forever and
 * is *not* heritable — which is the honest reason selective breeding is slow. The extra fork on
 * the trait key means adding a second polygenic trait next month cannot shift the values of the
 * first one, which would otherwise silently rewrite every animal already in the save file.
 */
function polygenicRng(individualId: string, traitKey: string): Rng {
  return makeRng(individualId).fork('polygenic').fork(traitKey)
}

/**
 * One polygenic value: a baseline, plus a small push per allele copy, plus the weather.
 *
 * `baseline + Σ perAllele[allele] over every copy present + gaussian() × environmentSd`, clamped.
 *
 * **Per copy, not per genotype.** An animal homozygous for a `+3` allele gets `+6`. That is what
 * "additive" means, and it is exactly why two high parents *tend* toward a high offspring without
 * anything being guaranteed. Set `environmentSd` to 0 for the clean, purely-heritable case; raise
 * it and selection gets slower and more frustrating, which is the lesson.
 */
function evaluatePolygenic(trait: PolygenicTrait, ctx: PolygenicContext): number {
  let value = trait.baseline

  for (const contribution of trait.contributions) {
    const pair = ctx.genotype.loci[contribution.locus]
    if (pair === undefined) continue
    for (const allele of alleleCopies(pair)) {
      value += contribution.perAllele[allele] ?? 0
    }
  }

  if (trait.environmentSd > 0) {
    value += ctx.rng.gaussian() * trait.environmentSd
  }

  const [min, max] = trait.clamp
  return Math.min(max, Math.max(min, value))
}
