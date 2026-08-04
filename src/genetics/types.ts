/**
 * Serpentine — the genetics engine's type contract.
 *
 * ## What this file is
 *
 * This is the *whole* vocabulary of the genetics engine. Everything in `src/genetics/`
 * implements these types; everything outside it talks to the engine through them.
 *
 * ## The one rule that keeps this engine general
 *
 * **No snake appears in this file. No trait appears in this file.** There is no `albino`,
 * no `pastel`, no `isBallPython`. If you ever find yourself wanting to add one, the thing
 * you actually want is a new *data* file in `src/species/`, or — at most — a new registered
 * function that species data can point at.
 *
 * The engine knows about loci, alleles, chromosomes, probability and inheritance. It does
 * not know what a snake is. That is not academic purity: it is what lets you invent a trait
 * nobody has thought of by writing one data file, instead of editing the engine and hoping
 * you did not break the maths.
 *
 * ## The two pipelines (and why they look the same)
 *
 * Genetics turns a genotype into a phenotype in ordered stages:
 *
 *     locus values  →  base phenotype  →  trait projections  →  modifier rules  →  final
 *
 * Rendering (`src/render/contract.ts`) turns a phenotype into pixels in ordered stages:
 *
 *     base colour   →  pattern        →  mask(s)            →  modifier stage(s) → final
 *
 * That is deliberate. Both halves of the codebase are "start with something simple, then
 * let a list of named rules rewrite it." Learn the shape once, and you know both.
 *
 * ## The genetics engine never touches the renderer
 *
 * Notice that this file never mentions `Phenotype`. Instead, everything phenotype-shaped is
 * generic in `P`. `src/species/` is the only place where the two halves meet: it declares
 * `SpeciesDefinition<Phenotype>`, importing `Phenotype` from `src/render/contract.ts`.
 *
 * So the dependency graph is:
 *
 *     src/genetics/  ──┐
 *                      ├──▶  src/species/  ──▶  src/game/
 *     src/render/    ──┘
 *
 * Genetics does not import render. Render does not import genetics. Neither can break the
 * other, and each can be tested completely on its own.
 *
 * ## What gets saved, and what does not
 *
 * This distinction decides a lot of the design below, so it is worth stating plainly:
 *
 *   - **Save files contain data:** individual ids, genotypes (which alleles, in which slot),
 *     seeds, parentage, and evidence. Numbers and strings. Nothing else.
 *   - **Species definitions are code**, loaded fresh from `src/species/` every time the game
 *     boots. They are never serialised, so they are allowed to contain functions.
 *
 * That is why a locus may carry a real JavaScript function for its expression rule without
 * breaking save/load: the function never has to survive a round-trip through JSON, because
 * it is never in the save file in the first place. See `ExpressionRule` for the full
 * argument, including where we *do* still use names-in-a-registry and why.
 *
 * @see ../render/contract.ts — the other half of the boundary
 * @see ../lib/rng.ts — every random number in this engine comes from there
 */

import type { Rng } from '../lib/rng'

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

/** A gene's address. One locus, one place on one chromosome. e.g. `'pigment-a'`. */
export type LocusId = string

/** One specific version of a gene living at a locus. e.g. `'wild-type'`, `'variant-3'`. */
export type AlleleId = string

/** A named output of expression, e.g. `'melanin'`, `'stripeWidth'`. Species data invents these. */
export type TraitKey = string

/** e.g. `'ball-python'`. */
export type SpeciesId = string

/** A single animal. Also the seed for everything that must look the same every time. */
export type IndividualId = string

/**
 * A chromosome's name. Autosomes get names from species data; sex chromosomes are whatever
 * the species' `SexSystem` calls them — `'X'`/`'Y'` for pythons and boas, `'Z'`/`'W'` for
 * colubrids. The engine has no opinion about which letters you use.
 */
export type ChromosomeId = string

/** Which sex an animal is. Derived from its sex chromosomes; never stored on its own. */
export type Sex = 'male' | 'female'

// ---------------------------------------------------------------------------
// Sex determination — declared per species, never hard-coded
// ---------------------------------------------------------------------------

/**
 * How a species decides sex.
 *
 * Almost every textbook written before 2017 will tell you snakes are ZW: females carry two
 * different sex chromosomes, males carry two of the same. Gamble et al. (2017, *Current
 * Biology*) showed that is wrong for pythons and boas — they are **XY**, males heterogametic,
 * evolved independently from the mammal system. Colubrids, including corn snakes, really are
 * **ZW**. So the two species most likely to be in this game use opposite systems, and a
 * fifty-year consensus was overturned inside your lifetime.
 *
 * The engine therefore hard-codes neither. A species declares its system here, a sex-linked
 * locus declares which of that system's chromosomes it sits on, and all of the inheritance
 * maths falls out of gamete formation without a single `if (isPython)` anywhere.
 *
 * Ball python: `{ homogameticChromosome: 'X', heterogameticChromosome: 'Y',
 * heterogameticSex: 'male' }`.
 * Corn snake:  `{ homogameticChromosome: 'Z', heterogameticChromosome: 'W',
 * heterogameticSex: 'female' }`.
 */
export interface SexSystem {
  /** Free-form label for the UI and for tests, e.g. `'XY'` or `'ZW'`. */
  readonly id: string
  /** The chromosome that appears *twice* in the homogametic sex — X, or Z. */
  readonly homogameticChromosome: ChromosomeId
  /** The chromosome that appears at most *once*, only in the heterogametic sex — Y, or W. */
  readonly heterogameticChromosome: ChromosomeId
  /** Which sex carries one of each. `'male'` for XY; `'female'` for ZW. */
  readonly heterogameticSex: Sex
}

// ---------------------------------------------------------------------------
// Genotype — what an animal actually carries
// ---------------------------------------------------------------------------

/**
 * One allele copy, or `null` for "there is no chromosome here to carry one."
 *
 * `null` is not "missing data" — it is a real biological state called *hemizygosity*. A
 * Y-linked locus in a ZZ/female animal has nowhere to live, so it is `null`. A Y-linked locus
 * in an XY animal has exactly one copy, so its pair is `[allele, null]`.
 */
export type AlleleSlot = AlleleId | null

/**
 * The two copies of a locus an animal carries, one per chromosome copy.
 *
 * **The slots are positional, not sorted.** Slot 0 holds whatever came in on chromosome copy
 * 0, slot 1 on copy 1. For an autosomal locus the two slots are interchangeable and you
 * should not read meaning into the order — compare and look up through the canonical
 * {@link GenotypeKey} form (non-null alleles, sorted) instead.
 *
 * For a **sex-linked** locus the slots line up with `Genotype.sexChromosomes`: the allele
 * lives in slot *i* only if `sexChromosomes[i]` is the chromosome the locus sits on. That one
 * rule is the whole of sex-linkage. It also means every locus on a given chromosome copy
 * travels together into a gamete, which is exactly the hook linkage will need later.
 */
export type AllelePair = readonly [AlleleSlot, AlleleSlot]

/**
 * The canonical string form of an allele pair — non-null alleles, sorted, joined by `/`.
 *
 *   - homozygous: `'variant-a/variant-a'`
 *   - heterozygous: `'variant-a/wild-type'` (sorted, so the order you wrote it does not matter)
 *   - hemizygous: `'variant-a'` (one allele, because there is only one chromosome)
 *
 * Sorting is what makes a lookup table possible: `albino × candy` and `candy × albino` are
 * the same animal, so they must be the same key.
 */
export type GenotypeKey = string

/**
 * Everything heritable about one animal.
 *
 * Note what is *not* here: no sex field, no phenotype, no name, no age. Sex is derived from
 * `sexChromosomes`; phenotype is derived by expression; the rest belongs to the game layer.
 * A genotype is pure data and is safe to put straight into a save file.
 */
export interface Genotype {
  /**
   * The two sex chromosomes this animal carries, in slot order. For an XY species a male is
   * some ordering of `['X', 'Y']` and a female is `['X', 'X']`.
   */
  readonly sexChromosomes: readonly [ChromosomeId, ChromosomeId]
  /** Every locus the species declares, mapped to the two copies this animal carries. */
  readonly loci: Readonly<Record<LocusId, AllelePair>>
}

// ---------------------------------------------------------------------------
// Loci and alleles
// ---------------------------------------------------------------------------

/**
 * Where a locus lives. This is the *only* thing that decides whether a trait is sex-linked.
 */
export type LocusPlacement =
  | {
      readonly kind: 'autosomal'
      /**
       * **Deferred — declared so the seam exists, not yet implemented.** Two loci on the same
       * chromosome do not assort independently; they are inherited together unless a crossover
       * happens between them, and how often that happens depends on how far apart they are.
       *
       * Version 1 of the engine treats every autosomal locus as independently assorting. If
       * this field is present, the engine must **throw** rather than silently ignore it —
       * quietly pretending linked genes are unlinked would produce wrong probabilities with
       * no warning, which is the worst thing a teaching tool can do.
       */
      readonly linkage?: LinkageSpec
    }
  | {
      readonly kind: 'sexLinked'
      /**
       * Which of the species' sex chromosomes carries this locus. Must be either the
       * `homogameticChromosome` or the `heterogameticChromosome` of the species' `SexSystem`.
       *
       * On the heterogametic chromosome (Y or W) the locus exists in exactly one copy, and
       * only in the heterogametic sex — that is how a real Y-linked colour trait behaves, and
       * why a male carrier passes it to all his sons and none of his daughters.
       */
      readonly chromosome: ChromosomeId
    }

/** **Deferred.** See {@link LocusPlacement}. Kept as a type so the shape is agreed in advance. */
export interface LinkageSpec {
  /** Loci sharing a group name sit on the same chromosome. */
  readonly group: string
  /** Map distance to the next locus in the group. 50 cM or more behaves as unlinked. */
  readonly centimorgans: number
}

/**
 * One version of a gene.
 *
 * `origin` matters for honesty as much as for mechanics: a trait you invented should say so,
 * so the UI can label it, and so nobody ever reads this game as a claim about real biology
 * that it cannot support.
 */
export interface Allele {
  readonly id: AlleleId
  /** Shown to the player. */
  readonly label: string
  /** Where this allele came from. `'discovered'` means a mutation event created it in play. */
  readonly origin: 'wild-type' | 'authored' | 'discovered'
  /**
   * `true` if this allele does not correspond to a real, documented mutation. Fictional
   * traits are welcome and fun — they just have to be *labelled* fictional everywhere they
   * are shown, so the real ones stay trustworthy.
   */
  readonly invented?: boolean
  /** Free-form note for the UI: what it is, who found it, what it does. */
  readonly notes?: string
}

/**
 * A gene: one address on one chromosome, with a set of possible alleles and a rule for what
 * happens when you have two of them.
 *
 * **An allele set is a set, not a pair.** A locus may declare two alleles or twenty. This is
 * not a stretch goal: the blue-eyed-leucistic complex in ball pythons is one locus with at
 * least seven named alleles that combine pairwise. Modelling those as seven independent
 * on/off genes would be simpler and would let the game produce animals that cannot exist. An
 * individual carries **at most two** alleles from a locus, always, because it has at most two
 * copies of the chromosome — that cap is structural here, not a rule the engine has to
 * remember to enforce.
 */
export interface Locus {
  readonly id: LocusId
  readonly label: string
  readonly placement: LocusPlacement
  /** Every allele that can exist at this locus. Two or more. */
  readonly alleles: readonly Allele[]
  /** The "normal" allele. Must appear in `alleles`. Used as the default and by mutation. */
  readonly wildType: AlleleId
  /** How a pair of alleles becomes trait values. See {@link ExpressionRule}. */
  readonly expression: ExpressionRule
  /** Optional. If absent, this locus never mutates. */
  readonly mutation?: MutationSpec
}

// ---------------------------------------------------------------------------
// Expression — dominance as a rule you supply, not an enum the engine knows
// ---------------------------------------------------------------------------

/** What a trait can be worth. Deliberately small: it has to survive being saved and shown. */
export type TraitValue = string | number | boolean | null

/** The bag of values a genotype expresses, before any modifier rules run. */
export type TraitValues = Readonly<Record<TraitKey, TraitValue>>

/**
 * The context an expression rule may read.
 *
 * It gets the *whole* genotype, which means a custom rule technically could look at other
 * loci. Please do not: cross-locus interaction belongs in {@link ModifierRule}, where it is
 * ordered, named, listed in `reads`, and therefore visible to the probability engine. A
 * custom expression rule that secretly reads another locus will produce Punnett squares that
 * disagree with the animals that actually hatch.
 *
 * There is no `Rng` here on purpose. **Expression is a pure function.** The same genotype in
 * the same animal must express the same way every single time it is asked, or the same snake
 * will change colour between two renders of the same frame.
 */
export interface ExpressionContext {
  readonly genotype: Genotype
  readonly sex: Sex
  readonly individualId: IndividualId
  /** The locus being expressed, so a shared custom rule can be reused across loci. */
  readonly locus: Locus
}

/**
 * Dominance written as a **lookup table**, keyed by {@link GenotypeKey}.
 *
 * This is the default and should cover almost everything, because every classical inheritance
 * mode is just a different table over the same two-slot genotype:
 *
 * | Mode | Table |
 * |---|---|
 * | simple recessive | `wt/wt` → normal, `wt/v` → normal, `v/v` → affected |
 * | dominant, no super form | `wt/wt` → normal, `wt/v` → affected, `v/v` → *the same* affected |
 * | incomplete dominant | `wt/wt` → normal, `wt/v` → intermediate, `v/v` → a third, stronger value |
 * | true co-dominance | `wt/v` → a value that carries *both* markers, not a blend |
 * | compound heterozygote | `v1/v2` → its own row, unrelated to `v1/v1` or `v2/v2` |
 * | multi-allele complex | a row per pair you care about, plus `otherwise` for the rest |
 *
 * Two reasons a table is the default rather than a function. First, it is the thing a person
 * can read: the table *is* the genetics, written out, and a teaching UI can print it verbatim
 * next to a Punnett square. Second, "co-dominant" versus "incomplete dominant" stops being an
 * argument about labels — you just write the row you mean.
 *
 * (The hobby says "co-dominant" for what geneticists call incomplete dominance. Both names
 * describe rows in this table, so the engine never has to take a side; the docs explain the
 * difference.)
 */
export interface ExpressionTable {
  readonly kind: 'table'
  /**
   * Keyed by canonical genotype key: non-null alleles, sorted, `/`-joined.
   * `'wild-type/wild-type'`, `'variant-a/wild-type'`, `'variant-a'` (hemizygous).
   */
  readonly entries: Readonly<Record<GenotypeKey, TraitValues>>
  /**
   * Used for any pair with no row of its own. For a big allelic complex this is where the
   * "any two different complex members together look like *this*" rule lives.
   */
  readonly otherwise: TraitValues
}

/**
 * Dominance written as a **function**, for the inheritance behaviour nobody has thought of yet.
 *
 * Use this when a table genuinely cannot say it — dosage that scales with copy number across
 * a large allele set, a value computed from allele metadata, something invented. Everything
 * else should be a table.
 *
 * `describe` is not optional politeness: it is what the teaching UI shows where it would
 * otherwise print a table, so a custom rule is not a black box to the player.
 */
export interface ExpressionFunction {
  readonly kind: 'custom'
  /** One sentence, player-facing, explaining the rule in words. */
  readonly describe: string
  /** Must be pure: same inputs, same outputs, forever. */
  readonly resolve: (pair: AllelePair, ctx: ExpressionContext) => TraitValues
}

/**
 * How a locus turns a genotype into trait values.
 *
 * ### Why this is not an enum, and why functions here do not break save/load
 *
 * The obvious design is `dominance: 'recessive' | 'dominant' | 'incompleteDominant'`. It is
 * also a dead end: the first allelic complex you add produces a compound heterozygote that is
 * its own third phenotype, and no enum value describes it. So dominance is a *resolution rule*
 * supplied by data.
 *
 * The usual objection is serialisability — "you cannot put a function in a save file." True,
 * and irrelevant, because the function is never in the save file. Saves hold genotypes:
 * allele ids in slots. Species definitions are TypeScript modules under `src/species/`,
 * re-imported from source every time the game starts. A save that says
 * `pigment-a: ['variant-a', 'wild-type']` reconstitutes perfectly against whatever
 * `src/species/` currently says, with no function ever crossing the boundary.
 *
 * Drawing the line at the *save file* rather than at the species definition is what buys us
 * both properties at once: full expressive power in content, and saves that are just JSON.
 *
 * It costs two things, and they are real:
 *
 *   1. **Saves are versioned against content.** Delete an allele from `src/species/` and old
 *      saves referencing it will not load. The engine must fail loudly with the missing id,
 *      never silently substitute wild-type. Migration is a content problem, not an engine one.
 *   2. **A custom rule is opaque to tooling** in a way a table is not — hence `describe`, and
 *      hence tables being the default.
 *
 * Names-in-a-registry (`{ rule: 'someName', params: {...} }`) is still used, but only where a
 * reference genuinely has to survive serialisation: render stage names inside a `Phenotype`
 * (see `../render/contract.ts`) and {@link NovelAlleleSpec} generators, whose output must be
 * regenerable from a saved seed. Everywhere else, the indirection would buy nothing and cost
 * a layer of lookup for a reader to trace.
 */
export type ExpressionRule = ExpressionTable | ExpressionFunction

// ---------------------------------------------------------------------------
// Polygenic traits — many small pushes, plus the weather
// ---------------------------------------------------------------------------

/**
 * A continuous trait built from many small contributions instead of one gene.
 *
 * This is the other half of genetics, and the half that makes *breeding programmes* a real
 * mechanic rather than a slot machine. A single-locus trait either shows or does not. A
 * polygenic trait is a number: two high parents tend toward a high offspring, but nothing is
 * guaranteed, and it takes generations of selection to move the average. That is exactly how
 * "white percentage" behaves in real animals, and it is why breeders talk about *lines*.
 *
 * The environmental term is deliberate. Part of the value is not inherited at all, which is
 * the honest reason selective breeding is slow. It is derived from the animal's id (not from
 * its genotype and not from the world clock), so it is stable forever and does not make the
 * trait heritable by accident.
 */
export interface PolygenicTrait {
  readonly key: TraitKey
  readonly label: string
  /** Value with zero contributions and no noise. */
  readonly baseline: number
  readonly contributions: readonly PolygenicContribution[]
  /**
   * Standard deviation of the non-heritable term, drawn from `rng.gaussian()`. Set to 0 for
   * a purely additive trait. Raise it and selection gets slower and more frustrating —
   * which is the lesson.
   */
  readonly environmentSd: number
  /** Final value is clamped into this range. `[min, max]`. */
  readonly clamp: readonly [number, number]
}

/** How much each allele copy at one locus adds to a polygenic trait. */
export interface PolygenicContribution {
  readonly locus: LocusId
  /**
   * Added once per copy present. An animal homozygous for a `+3` allele gets `+6`. Alleles
   * not listed contribute 0.
   */
  readonly perAllele: Readonly<Record<AlleleId, number>>
}

/** Everything a polygenic evaluation needs. The `rng` is derived from `individualId`. */
export interface PolygenicContext {
  readonly genotype: Genotype
  readonly individualId: IndividualId
  /** Already forked for this trait; do not fork it again or values will drift. */
  readonly rng: Rng
}

// ---------------------------------------------------------------------------
// The expression pipeline — base values, then ordered rules that rewrite them
// ---------------------------------------------------------------------------

/**
 * Shared context for the phenotype-building stages. Everything here is read-only; the only
 * thing a stage may write to is its `draft`.
 */
export interface ExpressionPipelineContext {
  readonly genotype: Genotype
  readonly sex: Sex
  readonly individualId: IndividualId
  /** Locus values and polygenic values, already computed. */
  readonly traits: TraitValues
}

/**
 * Stage 3 of the pipeline: pour one trait value into the phenotype draft.
 *
 * This is where "melanin: 0" becomes "the base colour is pale and the eyes are pink." It is
 * the *simple* half — one trait, one effect, no cross-talk. If you find yourself reading
 * `ctx.genotype` in here, you want a {@link ModifierRule} instead.
 *
 * Compare `src/render/contract.ts`: this is the genetics-side equivalent of the `base` and
 * `pattern` render stages.
 */
export interface TraitProjection<P extends object> {
  readonly key: TraitKey
  /** Mutates `draft` in place. Called once per trait, in species-declared order. */
  readonly apply: (draft: P, value: TraitValue, ctx: ExpressionPipelineContext) => void
}

/**
 * Stage 4 of the pipeline: an ordered rule that may rewrite anything.
 *
 * This is where combination effects live, and where a combo morph becomes more than the sum
 * of its parts. A modifier sees the whole genotype and the whole draft phenotype, and may
 * overwrite colours, delete render stages another rule added, or add its own. "Strip all
 * melanin no matter what else is going on" is a modifier that runs late and wins.
 *
 * Modifiers run in the order the species lists them, and later rules see earlier rules' work.
 * That ordering *is* the model — reorder the array and you change the biology. Exactly the
 * same statement is true of the render stage list, on purpose.
 *
 * ### `reads` is load-bearing — get it right
 *
 * `reads` declares every locus this rule looks at. The probability engine uses it to work out
 * which loci interact, and therefore which ones it must consider *jointly* rather than one at
 * a time. Under-declare it and `punnett()` will hand back confident, wrong numbers. If in
 * doubt, list the locus.
 */
export interface ModifierRule<P extends object> {
  readonly id: string
  readonly label: string
  /** Player-facing sentence. Shown in the "why does this snake look like that?" panel. */
  readonly describe: string
  /** Every locus `apply` reads. See the warning above. */
  readonly reads: readonly LocusId[]
  /** Mutates `draft` in place. */
  readonly apply: (draft: P, ctx: ExpressionPipelineContext) => void
}

// ---------------------------------------------------------------------------
// Viability — an egg that does not hatch, reported as a genetics fact
// ---------------------------------------------------------------------------

/**
 * A declaration that some genotype does not produce a living animal.
 *
 * Some real homozygous forms are lethal in the egg. The engine has to be able to say so,
 * because it changes the ratios you actually observe — a pairing whose Punnett square reads
 * 1 : 2 : 1 hatches out 2 : 1, and noticing that discrepancy is exactly how a breeder infers
 * a lethal super form exists. Silently making such genotypes viable would delete a real,
 * checkable fact and quietly disagree with every breeder in the hobby.
 *
 * **Product rule, in force everywhere downstream: a non-viable genotype is an egg that does
 * not hatch, reported as a genetics fact with an explanation.** There is no death in this
 * game. There is no culling. No living snake is ever harmed. You will not find a `die()`
 * anywhere in this codebase, and you should not add one — `explanation` is the entire
 * player-facing surface of this feature.
 */
export interface ViabilityRule {
  readonly id: string
  readonly label: string
  /**
   * Every locus `isNonViable` reads. Same warning as `ModifierRule.reads`: the probability
   * engine needs this to compute hatch ratios correctly.
   */
  readonly involves: readonly LocusId[]
  /** Shown to the player, in full, when it applies. This is the teaching moment. */
  readonly explanation: string
  readonly isNonViable: (genotype: Genotype, sex: Sex) => boolean
}

/** The answer for one genotype. */
export interface Viability {
  readonly viable: boolean
  /** Set only when `viable` is false. */
  readonly ruleId?: string
  /** Set only when `viable` is false. Copied from the rule, ready to show. */
  readonly explanation?: string
}

// ---------------------------------------------------------------------------
// Mutation — where new morphs actually come from
// ---------------------------------------------------------------------------

/** How often, and into what, a locus mutates when a gamete is made. */
export interface MutationSpec {
  /**
   * Probability per allele copy, per gamete. Real rates are astronomically small; pick a
   * game-scale number and say in the docs that you did.
   */
  readonly ratePerAllele: number
  /** Pre-declared alleles a mutation can produce, with relative weights. May be empty. */
  readonly outcomes: readonly Weighted<AlleleId>[]
  /** Optional: allow a genuinely new allele to be invented in play. */
  readonly novel?: NovelAlleleSpec
}

/**
 * Lets mutation produce an allele that did not exist when the game shipped.
 *
 * This is the one place the engine really does need a name-in-a-registry, because the result
 * has to survive a save. What gets written to the save file is `{ generatorId, seed }`; on
 * load, the same generator with the same seed rebuilds a byte-identical allele. Storing the
 * generated allele itself would work too, but then a fixed bug in a generator could never
 * reach existing saves.
 */
export interface NovelAlleleSpec {
  /** Key into the novel-allele generator registry. */
  readonly generatorId: string
  /** Weight of "invent something new" against the entries in `outcomes`. */
  readonly weight: number
}

/** Registered by content; must be deterministic in `seed`. */
export interface NovelAlleleGenerator {
  readonly id: string
  readonly create: (seed: string, locus: Locus) => Allele
}

/** A novel allele as it appears in a save file: enough to rebuild it exactly. */
export interface DiscoveredAllele {
  readonly locus: LocusId
  readonly generatorId: string
  readonly seed: string
}

/**
 * A mutation that happened, recorded on the animal it happened to.
 *
 * Kept because it makes "proving it out" possible as a game mechanic. A mutant hatchling
 * looks like anything or nothing; the player does not know what they have. They find out by
 * breeding it and reading the ratios — which is what a real breeder does, and what
 * {@link Evidence} and {@link GeneticKnowledge} exist to support. The engine knows the truth;
 * the player has to earn it.
 */
export interface MutationEvent {
  readonly locus: LocusId
  readonly from: AlleleId
  readonly to: AlleleId
  /** Which parent's gamete carried it. */
  readonly parent: IndividualId
}

// ---------------------------------------------------------------------------
// Species
// ---------------------------------------------------------------------------

/**
 * Everything the engine needs to know about one kind of animal.
 *
 * `P` is the phenotype type. The engine never looks inside it — it only ever hands it to the
 * projections and modifiers *you* supplied. `src/species/` instantiates this as
 * `SpeciesDefinition<Phenotype>` using the `Phenotype` from `src/render/contract.ts`, and
 * that single line is the only place genetics and rendering are aware of each other.
 *
 * A species is data. Adding one is adding a file here — never editing `src/genetics/`.
 */
export interface SpeciesDefinition<P extends object> {
  readonly id: SpeciesId
  readonly label: string
  /** XY, ZW, or anything else you can describe. Declared, never assumed. */
  readonly sexSystem: SexSystem
  readonly loci: readonly Locus[]
  readonly polygenic: readonly PolygenicTrait[]
  /** Stage 2: a fresh, unmodified phenotype for this species. Must return a new object. */
  readonly basePhenotype: () => P
  /** Stage 3, in order. */
  readonly projections: readonly TraitProjection<P>[]
  /** Stage 4, in order. Later rules see earlier rules' work. */
  readonly modifiers: readonly ModifierRule<P>[]
  /** Usually empty. See {@link ViabilityRule}. */
  readonly viability: readonly ViabilityRule[]
  /**
   * A stable string for "these two animals look the same."
   *
   * The probability engine groups outcomes by this, so it decides what a phenotype *is* for
   * teaching purposes. Make it coarse enough that trivial numeric jitter does not split one
   * visual result into fifty rows in a Punnett table.
   */
  readonly phenotypeKey: (p: P) => string
  /** Player-facing name for a phenotype, e.g. what you would write on a listing. */
  readonly phenotypeLabel: (p: P) => string
}

// ---------------------------------------------------------------------------
// Individuals
// ---------------------------------------------------------------------------

/**
 * One animal, genetically speaking.
 *
 * Deliberately thin. Name, age, weight, temperament, enclosure, care history and everything
 * else the game cares about live in `src/game/` and reference this by `id`. The engine should
 * never grow a field it does not do maths with.
 */
export interface Individual {
  /**
   * Also the seed for everything that must look identical every time: markings, the
   * environmental term of polygenic traits, idle animation phase. Never re-derive appearance
   * from a shared world RNG — draw order would change it.
   */
  readonly id: IndividualId
  readonly species: SpeciesId
  readonly genotype: Genotype
  /** `null` for founders. `[motherId, fatherId]` otherwise. */
  readonly parents: readonly [IndividualId, IndividualId] | null
  /** Empty for almost every animal. See {@link MutationEvent}. */
  readonly mutations: readonly MutationEvent[]
}

// ---------------------------------------------------------------------------
// Known vs. actual — the "possible het" problem
// ---------------------------------------------------------------------------

/**
 * What the *player* believes about one locus, which is not the same thing as what is true.
 *
 * This split is the best teaching device in the whole design, and it comes straight from real
 * practice. A normal-looking animal out of a carrier × carrier pairing is genuinely 66% likely
 * to be a carrier: of the four equally likely outcomes, one is visibly affected and is removed
 * from consideration the moment you look at the animal, leaving two carriers out of the three
 * that look normal. Breeders write this on price tags as "66% het," and it is a posterior
 * probability, not a measurement.
 *
 * The engine keeps ground truth in {@link Genotype} and belief in {@link GeneticKnowledge},
 * and never lets the UI read the former for an unproven animal. Turning belief into knowledge
 * requires evidence — a test breeding, or a gene test — which is exactly the loop that makes
 * the mechanic a game rather than a lecture.
 */
export type LocusBelief =
  /** Nothing is known. Uniform over whatever the species allows. */
  | { readonly kind: 'unknown' }
  /** Proven, by a gene test or by an unambiguous observation. */
  | { readonly kind: 'certain'; readonly pair: AllelePair }
  /** A probability distribution over possible pairs. Sums to 1. This is where "66%" lives. */
  | { readonly kind: 'posterior'; readonly distribution: Readonly<Record<GenotypeKey, number>> }

/** Belief across every locus of one animal. Derived from {@link Evidence}; not authoritative. */
export interface GeneticKnowledge {
  readonly individual: IndividualId
  readonly loci: Readonly<Record<LocusId, LocusBelief>>
}

/**
 * One thing the player has learned. **Evidence is what gets saved, not belief.**
 *
 * Storing the evidence and recomputing belief means a fixed inference bug reaches old saves,
 * the UI can show *why* it believes something ("both parents were carriers; this one hatched
 * normal-looking"), and there is no way for a stored probability to drift out of sync with
 * the facts that produced it.
 */
export type Evidence =
  /** Who the parents were, and what was believed about them at the time. */
  | { readonly kind: 'parentage'; readonly mother: IndividualId; readonly father: IndividualId }
  /** The animal was looked at. Rules out every genotype that would have looked different. */
  | { readonly kind: 'observedPhenotype'; readonly phenotypeKey: string }
  /**
   * The animal was sexed.
   *
   * A separate kind from `observedPhenotype` because sex is not part of a phenotype key — two
   * animals of different sexes can look identical, and a species is free to leave sex out of its
   * key entirely. Yet it is the single most reliably observed fact about an animal in hand, and
   * without it every belief about a sex-linked locus stays smeared across the possibility that
   * the animal is the other sex. That is the one place `unknown` was being reported about
   * something a keeper can simply look at.
   */
  | { readonly kind: 'observedSex'; readonly sex: Sex }
  /** A test breeding. The heart of "proving it out". */
  | {
      readonly kind: 'offspring'
      readonly mate: IndividualId
      readonly offspringPhenotypeKeys: readonly string[]
    }
  /** A direct read of the genotype. Instant certainty; make it expensive in the game economy. */
  | { readonly kind: 'geneTest'; readonly locus: LocusId; readonly pair: AllelePair }

// ---------------------------------------------------------------------------
// Probability — exact answers, no sampling
// ---------------------------------------------------------------------------

/** A value and how likely it is. Probabilities in a list should sum to 1. */
export interface Weighted<T> {
  readonly value: T
  readonly probability: number
}

/** One visually distinct outcome, as the teaching UI wants to show it. */
export interface PhenotypeOutcome {
  /** From `SpeciesDefinition.phenotypeKey`. */
  readonly key: string
  /** From `SpeciesDefinition.phenotypeLabel`. */
  readonly label: string
}

/**
 * The exact expected offspring of one pairing. **Computed, never sampled.**
 *
 * Sampling ten thousand virtual clutches would be easier to write and would be wrong in a way
 * that matters here: a teaching tool that says "about 25%" has taught nothing. These are
 * closed-form probabilities, and the tests assert them exactly.
 *
 * ### Why this is factored instead of one big list
 *
 * A species with ten two-allele loci has over a million distinct offspring genotypes.
 * Enumerating them for a UI panel that only ever shows three of them is absurd. So the
 * distribution is stored **per locus**, and joined only across loci that actually interact —
 * where "interact" means some modifier rule or viability rule reads both (that is what
 * `ModifierRule.reads` and `ViabilityRule.involves` are for). Those sets are
 * `interactionGroups`.
 *
 * Independence is not an approximation here, it is a fact about unlinked loci — with one
 * exception, which is why viability is handled the way it is. A non-viable combination makes
 * the surviving loci statistically *dependent*, because conditioning on "it hatched" is
 * conditioning on a joint event. That is why viability rules declare `involves`, and why the
 * marginals below are the post-conditioning ones.
 */
export interface OffspringDistribution {
  readonly species: SpeciesId
  /**
   * Probability a conceived egg does not hatch. Usually 0.
   * The UI should show this as a genetics fact with the rules' explanations attached.
   */
  readonly nonViableProbability: number
  /** Which rules account for that probability, and how much each contributes. */
  readonly nonViableReasons: readonly Weighted<string>[]
  /**
   * Per-locus genotype probabilities, **conditioned on the egg hatching** — i.e. these are
   * the ratios you would actually observe in a nest box, which is the whole point.
   */
  readonly lociMarginals: Readonly<Record<LocusId, readonly Weighted<AllelePair>[]>>
  /**
   * Sex ratio, conditioned on hatching. Normally 50/50, but not if a sex-linked locus is
   * involved in a viability rule — another thing that falls out rather than being special-cased.
   */
  readonly sexRatio: Readonly<Record<Sex, number>>
  /** Loci that must be considered together. Loci in different groups are independent. */
  readonly interactionGroups: readonly (readonly LocusId[])[]
  /**
   * Exact joint distribution over the requested loci. Cost grows multiplicatively, so the
   * implementation must enforce `PunnettOptions.maxJointOutcomes` and throw a message that
   * names the loci rather than hanging the browser.
   */
  readonly joint: (loci: readonly LocusId[]) => readonly Weighted<Genotype>[]
  /**
   * Probability of each *visible* outcome, grouped by `SpeciesDefinition.phenotypeKey`.
   * Necessarily materialises the joint within each interaction group — the same guard applies.
   */
  readonly phenotypes: () => readonly Weighted<PhenotypeOutcome>[]
}

/** Tuning for {@link GeneticsEngine.punnett}. */
export interface PunnettOptions {
  /** Guard against a combinatorial blow-up. Throw, do not truncate. Suggested default 50_000. */
  readonly maxJointOutcomes?: number
  /** Restrict the calculation to these loci. Omit for all of them. */
  readonly loci?: readonly LocusId[]
}

/** Something the player observed, used to narrow a distribution. */
export type Observation =
  | { readonly kind: 'phenotype'; readonly phenotypeKey: string }
  | { readonly kind: 'sex'; readonly sex: Sex }

// ---------------------------------------------------------------------------
// Breeding
// ---------------------------------------------------------------------------

/** One gamete: one copy of each locus, plus one sex chromosome, all from the same meiosis. */
export interface Gamete {
  readonly sexChromosome: ChromosomeId
  /** `null` where the chosen sex chromosome does not carry that locus. */
  readonly alleles: Readonly<Record<LocusId, AlleleSlot>>
  /** Mutations that happened during this meiosis. Usually empty. */
  readonly mutations: readonly MutationEvent[]
}

/** Ask for a clutch. */
export interface ClutchRequest {
  readonly mother: Individual
  readonly father: Individual
  readonly clutchSize: number
  /**
   * The whole clutch is reproducible from this. Convention:
   * `` `${worldSeed}:clutch:${motherId}:${fatherId}:${clutchIndex}` ``.
   * Same seed, same parents, same eggs — every time, forever. Store it.
   */
  readonly seed: string
}

/**
 * An egg that did not hatch, and why.
 *
 * Note the shape of this type: it carries an *explanation*, not a cause of death. This is a
 * genetics result being reported, in the same register as a Punnett square. See
 * {@link ViabilityRule}.
 */
export interface UnhatchedEgg {
  readonly genotype: Genotype
  readonly explanation: string
  readonly ruleId: string
}

/** The result of one pairing. */
export interface Clutch {
  readonly seed: string
  readonly mother: IndividualId
  readonly father: IndividualId
  readonly hatched: readonly Individual[]
  readonly unhatched: readonly UnhatchedEgg[]
}

// ---------------------------------------------------------------------------
// The engine's public surface
// ---------------------------------------------------------------------------

/**
 * Everything `src/genetics/` provides.
 *
 * Declared as an interface rather than as loose function declarations so the contract is one
 * object you can read top to bottom, mock in a test, and check an implementation against.
 *
 * ### Determinism rules — the whole set, in one place
 *
 * Every random number comes from `src/lib/rng.ts`. `Math.random()` anywhere is a bug.
 *
 * | What | Seeded from | Why |
 * |---|---|---|
 * | a clutch | `ClutchRequest.seed` | same parents + seed → identical eggs, so a result can be shared, saved, replayed |
 * | meiosis | `clutchRng.fork('meiosis')` | isolated so adding a mutation roll later cannot shift which alleles segregate |
 * | mutation | `clutchRng.fork('mutation')` | same reason, other direction |
 * | polygenic environment | `makeRng(individual.id).fork('polygenic')` | must not change when the world RNG advances, and must not be heritable |
 * | markings / appearance | `makeRng(individual.id).fork('render')`, carried as `Phenotype.seed` | a snake looks the same on every frame and after every reload, with nothing stored |
 *
 * The one rule underneath all of those: **anything about an individual derives from that
 * individual's id; anything about an event derives from that event's seed.** Never from a
 * shared stream, because a shared stream makes results depend on call order, and call order
 * is not something you control.
 */
export interface GeneticsEngine {
  // -- sex -------------------------------------------------------------------

  /** Reads sex off the sex chromosomes, using the species' declared system. */
  sexOf(genotype: Genotype, system: SexSystem): Sex

  // -- expression ------------------------------------------------------------

  /** Runs stage 1: every locus's expression rule, plus every polygenic trait. */
  deriveTraits<P extends object>(
    individual: Individual,
    species: SpeciesDefinition<P>,
  ): TraitValues

  /**
   * Runs the whole pipeline: locus values → base phenotype → projections → modifiers.
   * Pure with respect to `(individual, species)` — call it as often as you like.
   */
  express<P extends object>(individual: Individual, species: SpeciesDefinition<P>): P

  // -- viability -------------------------------------------------------------

  checkViability<P extends object>(
    genotype: Genotype,
    species: SpeciesDefinition<P>,
  ): Viability

  // -- probability -----------------------------------------------------------

  /**
   * The exact expected offspring of a pairing. No sampling.
   *
   * Handles multiple independent loci (factored — see {@link OffspringDistribution}),
   * sex-linked loci (they ride along with the sex chromosome, so nothing special happens),
   * multi-allele loci (a gamete carries one of the two copies, whatever they are), and
   * non-viable genotypes (removed from the hatched distribution and reported separately).
   *
   * Throws if the two parents are the same sex, or belong to different species.
   */
  punnett<P extends object>(
    mother: Individual,
    father: Individual,
    species: SpeciesDefinition<P>,
    options?: PunnettOptions,
  ): OffspringDistribution

  /**
   * Narrow a distribution by something you observed, and renormalise.
   *
   * This is where "66% het" comes from, and it is one function rather than a special case:
   * take the offspring distribution, condition it on "looks normal", then ask
   * {@link carrierProbability} for the variant allele. The answer is 2/3, and it is 2/3
   * because of arithmetic the player can follow, not because someone typed 0.66.
   */
  conditionOn(
    distribution: OffspringDistribution,
    observation: Observation,
  ): OffspringDistribution

  /** P(the animal carries at least one copy of `allele` at `locus`), given the distribution. */
  carrierProbability(
    distribution: OffspringDistribution,
    locus: LocusId,
    allele: AlleleId,
  ): number

  // -- knowledge -------------------------------------------------------------

  /**
   * Turn accumulated evidence into belief. Bayes, computed exactly.
   *
   * Parentage gives a prior; looking at the animal rules out genotypes that would have looked
   * different; a test breeding multiplies in the likelihood of the offspring you actually got,
   * given each candidate genotype; a gene test collapses the whole thing to certainty.
   *
   * `others` supplies the knowledge already held about parents and mates, since belief about
   * one animal depends on belief about its relatives.
   */
  inferKnowledge<P extends object>(
    individual: IndividualId,
    evidence: readonly Evidence[],
    species: SpeciesDefinition<P>,
    others: Readonly<Record<IndividualId, GeneticKnowledge>>,
  ): GeneticKnowledge

  // -- breeding --------------------------------------------------------------

  /** One meiosis. Deterministic in `rng`. Applies mutation. */
  makeGamete<P extends object>(
    parent: Individual,
    species: SpeciesDefinition<P>,
    rng: Rng,
  ): Gamete

  /**
   * Actually breed. Same request, same clutch, forever.
   *
   * The observed ratios here will match `punnett()` in the limit, and *not* match it in any
   * single clutch of six — which is itself worth showing the player, because it is the single
   * most common way people misunderstand probability.
   */
  breed<P extends object>(
    request: ClutchRequest,
    species: SpeciesDefinition<P>,
  ): Clutch

  // -- registries ------------------------------------------------------------

  /** Register a generator so mutation can invent new alleles. See {@link NovelAlleleSpec}. */
  registerNovelAlleleGenerator(generator: NovelAlleleGenerator): void

  /** Rebuild alleles discovered in a previous session, from the save file. */
  restoreDiscoveredAlleles(discovered: readonly DiscoveredAllele[]): void
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * A problem found in species data.
 *
 * Content is data, and data has typos. The engine should validate a `SpeciesDefinition` once
 * at boot and say exactly what is wrong, because the alternative — a wrong probability, silently
 * — is much worse than a crash. Things worth catching: an allele id that is not in the locus's
 * allele list, a `wildType` that does not exist, a sex-linked locus naming a chromosome the
 * species' `SexSystem` does not have, an expression table key referencing an unknown allele, a
 * `linkage` block (deferred, must throw), a modifier whose `reads` omits a locus it touches.
 */
export interface ValidationIssue {
  readonly severity: 'error' | 'warning'
  /** Where the problem is, e.g. `'loci.pigment-a.expression.entries'`. */
  readonly path: string
  readonly message: string
}
