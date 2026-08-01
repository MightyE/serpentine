/**
 * Meiosis and breeding: how one animal makes a gamete, and how two gametes make a clutch.
 *
 * ## The one idea in this file
 *
 * A gamete is **one chromosome copy's worth of alleles**. Building one is a single loop over
 * the species' loci, picking slot 0 or slot 1 at each. Sex-linkage is not a special case in
 * that loop — it is the ordinary rule applied to the sex chromosome:
 *
 *   1. Pick which sex chromosome this gamete carries, slot 0 or slot 1. Call it `S`.
 *   2. A locus that lives on chromosome `C` rides along **only if `S === C`**. Otherwise the
 *      gamete simply has no copy of that locus, and the slot is `null`.
 *
 * Work that through for an XY father (`['X', 'Y']`) and a ZW mother (`['W', 'Z']`) and you get
 * correct — and *different* — inheritance out of the same two lines. That is why you will not
 * find `if (system.id === 'ZW')` anywhere in this file, and must never add one. The engine is
 * never told which system it is looking at; the answer falls out of the chromosome letters the
 * species declared. `breeding.test.ts` proves this by running one locus definition under both
 * systems and asserting the results differ in exactly the way biology says they should.
 *
 * ## Why the child's slots line up for free
 *
 * Everywhere in this engine, **slot 0 comes from the mother and slot 1 comes from the father**.
 * So when we build a child, `sexChromosomes[0]` is the mother's contribution and the maternal
 * gamete's alleles go in slot 0. The alignment `AllelePair` needs — "the allele is in slot *i*
 * iff `sexChromosomes[i]` is the chromosome the locus sits on" — is therefore automatic. We
 * never have to fix it up afterwards, and it is the reason that invariant was worth having.
 */

import type { Rng } from '../lib/rng'
import { makeRng } from '../lib/rng'
import type {
  AllelePair,
  AlleleSlot,
  ChromosomeId,
  Clutch,
  ClutchRequest,
  Gamete,
  Genotype,
  Individual,
  Locus,
  LocusId,
  MutationEvent,
  SpeciesDefinition,
  UnhatchedEgg,
} from './types'
import { assertNoLinkage, sexOf } from './genotype'
import { applyMutation } from './mutation'
import { checkViability } from './viability'

// ---------------------------------------------------------------------------
// Meiosis
// ---------------------------------------------------------------------------

/**
 * One meiosis: reduce a parent's two copies of everything to the single copy a gamete carries.
 *
 * Deterministic in `rng` — the same parent and the same generator always yield the same gamete.
 *
 * ### How the randomness is wired, and why it looks over-engineered
 *
 * Every draw comes from a *fork* of `rng` labelled with what it is for, never from `rng`
 * itself. Two separate reasons, both of which bite you later if you skip them:
 *
 *   - **`'meiosis'` vs `'mutation'` are separate streams.** Mutation is a rare event, so the
 *     number of mutation draws varies from gamete to gamete. If both shared one stream, a
 *     mutation in one egg would shift every segregation *after* it, and adding a mutation
 *     roll to the code would silently change which alleles every existing save inherited.
 *   - **Each locus gets its own sub-stream, labelled by locus id.** This means adding a new
 *     locus to a species does not change how any *existing* locus is inherited. That matters
 *     for a game meant to be extended: you can add a trait next month without invalidating
 *     every clutch already in the save file.
 *
 * `fork()` does not advance the stream it forks from, so the order these appear in below is
 * irrelevant — which is exactly the property we want.
 */
export function makeGamete<P extends object>(
  parent: Individual,
  species: SpeciesDefinition<P>,
  rng: Rng,
): Gamete {
  const meiosisRng = rng.fork('meiosis')
  const mutationRng = rng.fork('mutation')

  // Step 1: which of the parent's two sex chromosomes goes into this gamete.
  const sexSlot = meiosisRng.fork('sex-chromosome').int(0, 1)
  const sexChromosome = parent.genotype.sexChromosomes[sexSlot]!

  const alleles: Record<LocusId, AlleleSlot> = {}
  const mutations: MutationEvent[] = []

  // Step 2: one copy of every locus. This loop is the whole of Mendel and the whole of
  // sex-linkage; the only difference between the two is which slot is allowed to be chosen.
  for (const locus of species.loci) {
    assertNoLinkage(locus)
    const pair = pairAt(parent.genotype, locus, parent.id)
    const slot = chooseSlot(locus, parent.genotype.sexChromosomes, sexSlot, meiosisRng)

    let allele: AlleleSlot = slot === null ? null : pair[slot]

    // Step 3: mutation, on the copy that is actually going into this gamete. `null` means the
    // gamete has no copy of this locus at all, and there is nothing there to mutate.
    if (allele !== null && locus.mutation) {
      const event = applyMutation(locus, allele, parent.id, mutationRng.fork(locus.id))
      if (event) {
        allele = event.to
        mutations.push(event)
      }
    }

    alleles[locus.id] = allele
  }

  return { sexChromosome, alleles, mutations }
}

/**
 * Which of the parent's two slots this gamete draws from, or `null` for "no copy travels".
 *
 * Read the two branches side by side: they are the same rule. An autosomal locus sits on a
 * chromosome the parent has two of, so either slot is fair game and we flip a coin. A
 * sex-linked locus sits on a *named* chromosome, so it can only travel on the sex chromosome
 * this gamete already picked — and if that chromosome is not the one the locus lives on, no
 * copy travels. There is no third case, and no mention of X, Y, Z or W.
 */
function chooseSlot(
  locus: Locus,
  sexChromosomes: readonly [ChromosomeId, ChromosomeId],
  sexSlot: number,
  meiosisRng: Rng,
): number | null {
  if (locus.placement.kind === 'autosomal') {
    return meiosisRng.fork(locus.id).int(0, 1)
  }
  return sexChromosomes[sexSlot] === locus.placement.chromosome ? sexSlot : null
}

/** Read a locus out of a genotype, complaining loudly rather than inventing a wild-type. */
function pairAt(genotype: Genotype, locus: Locus, parentId: string): AllelePair {
  const pair = genotype.loci[locus.id]
  if (!pair) {
    throw new Error(
      `Individual '${parentId}' has no entry for locus '${locus.id}'. ` +
        `Build genotypes with makeGenotype() so every locus the species declares is present — ` +
        `a missing locus would otherwise be silently inherited as wild-type.`,
    )
  }
  return pair
}

// ---------------------------------------------------------------------------
// Breeding
// ---------------------------------------------------------------------------

/**
 * Breed one pairing into one clutch. Same request in, byte-identical clutch out, forever.
 *
 * Determinism here is a product feature, not a test convenience: a clutch is reproducible from
 * `{ parents, seed }` alone, so the game can store four short strings instead of a pile of
 * animals, a player can share a seed, and a bug report can be replayed exactly.
 *
 * Each egg gets its own forked stream keyed by its index, so eggs do not depend on each other.
 * Fetching egg 5 gives the same animal whether or not eggs 0–4 were ever computed — which
 * matters the moment the UI wants to reveal a clutch one egg at a time.
 *
 * ### Eggs that do not hatch
 *
 * Some allele combinations produce an egg that does not hatch. That is a genetics result, and
 * it is reported here the same way a Punnett square reports a ratio: an {@link UnhatchedEgg}
 * carrying the genotype and the rule's own explanation, so the player learns *why*. Nothing in
 * this engine harms a living animal, and nothing here should ever be rewritten to.
 */
export function breed<P extends object>(
  request: ClutchRequest,
  species: SpeciesDefinition<P>,
): Clutch {
  const { mother, father, clutchSize, seed } = request

  assertBreedable(request, species)

  const clutchRng = makeRng(seed)
  const hatched: Individual[] = []
  const unhatched: UnhatchedEgg[] = []

  for (let i = 0; i < clutchSize; i++) {
    const eggRng = clutchRng.fork(`egg:${i}`)
    const maternal = makeGamete(mother, species, eggRng.fork('maternal'))
    const paternal = makeGamete(father, species, eggRng.fork('paternal'))
    const genotype = fuse(maternal, paternal, species)

    const viability = checkViability(genotype, species)
    if (!viability.viable) {
      unhatched.push({
        genotype,
        explanation: viability.explanation ?? 'This combination does not produce a viable egg.',
        ruleId: viability.ruleId ?? 'unknown',
      })
      continue
    }

    hatched.push({
      // Keyed on the egg's index, not on how many hatched before it. An individual's id seeds
      // its markings and its polygenic environment, so it has to stay put even if a viability
      // rule changes and an earlier egg starts hatching.
      id: `${seed}:hatchling:${i}`,
      species: species.id,
      genotype,
      parents: [mother.id, father.id],
      mutations: [...maternal.mutations, ...paternal.mutations],
    })
  }

  return { seed, mother: mother.id, father: father.id, hatched, unhatched }
}

/**
 * Fertilisation: two gametes become one genotype.
 *
 * Slot 0 is the mother's contribution and slot 1 is the father's, at every locus and for the
 * sex chromosomes alike. Holding to that one convention is what makes sex-linked slots line up
 * without a fix-up pass — see the file header.
 */
function fuse<P extends object>(
  maternal: Gamete,
  paternal: Gamete,
  species: SpeciesDefinition<P>,
): Genotype {
  const loci: Record<LocusId, AllelePair> = {}
  for (const locus of species.loci) {
    loci[locus.id] = [maternal.alleles[locus.id] ?? null, paternal.alleles[locus.id] ?? null]
  }
  return {
    sexChromosomes: [maternal.sexChromosome, paternal.sexChromosome],
    loci,
  }
}

/**
 * Refuse pairings that cannot happen, with a message that says which assumption broke.
 *
 * The sex check is not pedantry: `breed()` relies on `mother` really being the homogametic-or-
 * not parent the species' system expects. Swap the two and you would get plausible-looking
 * animals with quietly wrong sex ratios — the worst failure mode a teaching tool has.
 */
function assertBreedable<P extends object>(
  request: ClutchRequest,
  species: SpeciesDefinition<P>,
): void {
  const { mother, father, clutchSize } = request

  for (const [role, parent] of [
    ['mother', mother],
    ['father', father],
  ] as const) {
    if (parent.species !== species.id) {
      throw new Error(
        `breed(): the ${role} '${parent.id}' is a '${parent.species}', ` +
          `but this clutch is being bred as '${species.id}'.`,
      )
    }
  }

  const motherSex = sexOf(mother.genotype, species.sexSystem)
  const fatherSex = sexOf(father.genotype, species.sexSystem)
  if (motherSex !== 'female' || fatherSex !== 'male') {
    throw new Error(
      `breed(): expected a female mother and a male father, but '${mother.id}' is ${motherSex} ` +
        `and '${father.id}' is ${fatherSex}. Sex is read from the sex chromosomes using the ` +
        `'${species.sexSystem.id}' system this species declares.`,
    )
  }

  if (!Number.isInteger(clutchSize) || clutchSize < 0) {
    throw new Error(`breed(): clutchSize must be a non-negative whole number, got ${clutchSize}.`)
  }
}
