/**
 * Mutation — where new morphs actually come from.
 *
 * Every named ball python morph on the market started as one animal that hatched looking wrong.
 * Somebody noticed, kept it, bred it, and read the ratios until they knew what they had. This
 * file is the first half of that loop: the moment an allele changes into one that was not
 * there before. The second half is `knowledge.ts` — the player finding out.
 *
 * ## A named simplification
 *
 * Real per-locus mutation rates are on the order of 10⁻⁸ per generation. At that rate nobody
 * playing this game would ever see one. `MutationSpec.ratePerAllele` is therefore a *game*
 * number, deliberately millions of times too high, and the UI should say so wherever it
 * mentions mutation. Getting the mechanism right while getting the rate deliberately wrong is
 * honest; quietly implying that novel morphs turn up every other clutch is not.
 *
 * ## Two module-level registries, and why that is the right call here
 *
 * Nearly everything in `src/genetics/` is a pure function of its arguments. These two maps are
 * the exception, and only because the alternative is worse:
 *
 *   - **Generators** are code. Code cannot go in a save file, so a save refers to a generator
 *     by id and the program supplies the function. That is unavoidable.
 *   - **Discovered alleles** are the alleles those generators produced during play. They have
 *     to be reachable by everything that looks up an allele — expression, the UI, a Punnett
 *     square — from a save that only stored `{ locus, generatorId, seed }`.
 *
 * What is *not* stored is the allele object itself. Storing `{ generatorId, seed }` and
 * rebuilding means that if you fix a bug in a generator, every existing save gets the fix. If
 * you had stored the allele, old saves would keep the bug forever. That is the whole reason
 * {@link DiscoveredAllele} has the shape it does.
 */

import type { Rng } from '../lib/rng'
import type {
  Allele,
  AlleleId,
  DiscoveredAllele,
  IndividualId,
  Locus,
  LocusId,
  MutationEvent,
  NovelAlleleGenerator,
} from './types'

/** Generator id → the function that builds alleles. Populated by content at start-up. */
const generators = new Map<string, NovelAlleleGenerator>()

/** Locus id → alleles discovered in play there, keyed by allele id so re-discovery is a no-op. */
const discovered = new Map<LocusId, Map<AlleleId, Allele>>()

/** The `{ locus, generatorId, seed }` records to write to the save file, keyed by allele id. */
const provenance = new Map<AlleleId, DiscoveredAllele>()

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Register a generator so mutation can invent alleles that did not exist when the game shipped.
 *
 * The generator **must be deterministic in its seed** — same seed, same allele, every run, on
 * every machine. Reach for `makeRng(seed)` inside it and nothing else; a `Date.now()` or a
 * `Math.random()` in there breaks save-file compatibility in a way that is very hard to notice
 * and impossible to repair after the fact.
 */
export function registerNovelAlleleGenerator(generator: NovelAlleleGenerator): void {
  const existing = generators.get(generator.id)
  if (existing && existing.create !== generator.create) {
    throw new Error(
      `A different novel-allele generator is already registered as '${generator.id}'. ` +
        `Ids are written into save files, so two generators may never share one — ` +
        `an old save would rebuild the wrong allele.`,
    )
  }
  generators.set(generator.id, generator)
}

/**
 * Rebuild alleles discovered in a previous session, from the save file.
 *
 * Call this once at load, after registering generators and before touching any genotype: a
 * saved animal's genotype refers to these alleles by id, and until they are back, that id
 * points at nothing.
 */
export function restoreDiscoveredAlleles(records: readonly DiscoveredAllele[]): void {
  for (const record of records) {
    const generator = generators.get(record.generatorId)
    if (!generator) {
      throw new Error(
        `Cannot restore a discovered allele at locus '${record.locus}': no generator is ` +
          `registered as '${record.generatorId}'. Register every generator before loading a ` +
          `save — silently dropping the allele would corrupt the animals that carry it.`,
      )
    }
    // The locus is looked up lazily: `create` needs the real Locus, and the caller has it at
    // hand. Records restored without one are rebuilt on first use via `hydrateDiscovered`.
    pendingRestores.push(record)
  }
}

/** Restores that still need a real `Locus` before their generator can run. */
const pendingRestores: DiscoveredAllele[] = []

/**
 * Every allele available at a locus right now: the authored ones plus anything discovered in
 * play. Callers that look up an allele by id should go through this, not `locus.alleles`,
 * or they will fail to find a morph the player discovered last week.
 */
export function allelesAt(locus: Locus): readonly Allele[] {
  hydrateDiscovered(locus)
  const extra = discovered.get(locus.id)
  if (!extra || extra.size === 0) return locus.alleles
  return [...locus.alleles, ...extra.values()]
}

/** Everything discovered so far, in save-file form. Hand this straight to the serialiser. */
export function discoveredAlleleRecords(): DiscoveredAllele[] {
  return [...provenance.values()]
}

/**
 * Forget every generator and every discovered allele.
 *
 * Exists for tests and for "start a new game" — module-level state that cannot be reset is a
 * trap, because the second run in the same process inherits the first run's discoveries.
 */
export function resetMutationRegistry(): void {
  generators.clear()
  discovered.clear()
  provenance.clear()
  pendingRestores.length = 0
}

/** Run any restores that were waiting for this particular locus to show up. */
function hydrateDiscovered(locus: Locus): void {
  if (pendingRestores.length === 0) return
  for (let i = pendingRestores.length - 1; i >= 0; i--) {
    const record = pendingRestores[i]!
    if (record.locus !== locus.id) continue
    const generator = generators.get(record.generatorId)!
    remember(locus, generator.create(record.seed, locus), record)
    pendingRestores.splice(i, 1)
  }
}

/** File a discovered allele under its locus, and its provenance under its id. */
function remember(locus: Locus, allele: Allele, record: DiscoveredAllele): Allele {
  let atLocus = discovered.get(locus.id)
  if (!atLocus) {
    atLocus = new Map()
    discovered.set(locus.id, atLocus)
  }
  const already = atLocus.get(allele.id)
  if (already) return already
  if (locus.alleles.some((a) => a.id === allele.id)) {
    throw new Error(
      `Generator '${record.generatorId}' produced allele id '${allele.id}', which locus ` +
        `'${locus.id}' already declares. A discovered allele must be genuinely new — ` +
        `colliding with an authored one would rewrite existing animals.`,
    )
  }
  atLocus.set(allele.id, allele)
  provenance.set(allele.id, record)
  return allele
}

// ---------------------------------------------------------------------------
// The mutation roll itself
// ---------------------------------------------------------------------------

/**
 * Roll once for the allele copy going into a gamete. Returns the event, or `null` for the
 * overwhelmingly common case where nothing happened.
 *
 * One roll per locus per gamete, because a gamete carries one copy of each locus — that is
 * what `ratePerAllele` counts. Mutating to the allele you already had is not a mutation, so
 * the current allele is dropped from the candidate list before choosing; if that empties the
 * list and the locus cannot invent anything new, nothing happens.
 *
 * `rng` must be a stream dedicated to mutation at this locus. `makeGamete` forks one for you.
 */
export function applyMutation(
  locus: Locus,
  from: AlleleId,
  parent: IndividualId,
  rng: Rng,
): MutationEvent | null {
  const spec = locus.mutation
  if (!spec || spec.ratePerAllele <= 0) return null
  if (!rng.chance(spec.ratePerAllele)) return null

  const to = chooseOutcome(locus, from, rng)
  if (to === null) return null
  return { locus: locus.id, from, to, parent }
}

/**
 * Pick what the allele became.
 *
 * The pre-declared outcomes carry `probability` and the novel option carries `weight`; both are
 * treated here as **relative weights** and normalised together. That is deliberate — an author
 * writing `outcomes: [{ value: 'x', probability: 1 }]` alongside `novel: { weight: 0.1 }` means
 * "novel is a tenth as likely as x", and having to keep a hand-summed 1.0 across two differently
 * named fields would be a needless way to get quietly wrong odds.
 */
function chooseOutcome(locus: Locus, from: AlleleId, rng: Rng): AlleleId | null {
  const spec = locus.mutation!
  const declared = spec.outcomes.filter((o) => o.value !== from && o.probability > 0)
  const novelWeight = spec.novel && spec.novel.weight > 0 ? spec.novel.weight : 0

  const total = declared.reduce((sum, o) => sum + o.probability, 0) + novelWeight
  if (total <= 0) return null

  let roll = rng.next() * total
  for (const outcome of declared) {
    roll -= outcome.probability
    if (roll < 0) return outcome.value
  }
  return inventAllele(locus, rng)
}

/**
 * Invent a genuinely new allele.
 *
 * The seed is drawn from the mutation stream, which is itself derived from the clutch seed — so
 * "which new allele appeared" is as reproducible as everything else in the clutch, and replaying
 * a saved seed produces the same discovery rather than a different one.
 *
 * Two mutations that happen to draw the same seed produce the same allele, and `remember()`
 * collapses them into one entry. That is the right answer biologically as well as mechanically:
 * the same mutation arising twice is the same allele.
 */
function inventAllele(locus: Locus, rng: Rng): AlleleId | null {
  const novel = locus.mutation?.novel
  if (!novel) return null
  const generator = generators.get(novel.generatorId)
  if (!generator) {
    throw new Error(
      `Locus '${locus.id}' can produce novel alleles via generator '${novel.generatorId}', ` +
        `but no such generator is registered. Call registerNovelAlleleGenerator() at start-up ` +
        `for every generator any species mentions.`,
    )
  }
  const seed = `${locus.id}:${rng.int(0, 0x7fffffff).toString(36)}`
  const record: DiscoveredAllele = { locus: locus.id, generatorId: novel.generatorId, seed }
  return remember(locus, generator.create(seed, locus), record).id
}
