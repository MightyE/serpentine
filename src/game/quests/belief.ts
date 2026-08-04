/**
 * Serpentine — quests: the two derivations the `ui.*` emits need.
 *
 * `ActPayloadMap` asks two questions of the game that no existing helper answers, and both are asked
 * at the moment a component emits an intent rather than during evaluation:
 *
 * - `ui.notebookLocusOpened.belief` — which of the five {@link BeliefState}s the notebook row the
 *   player just opened was showing. `observe.ts`'s handover note already names the function the UI
 *   should call for it (`beliefStateOf`); this is that function.
 * - `ui.pairingPreviewed.motherShows` / `fatherShows` — whether each parent visibly expresses the
 *   locus in view. Pattern P4 rests entirely on these two booleans.
 *
 * ## Why they live here and not in `cardModel.ts`
 *
 * `src/ui/cardModel.ts` has most of the machinery already — `mechanismOf` reads inheritance off a
 * locus's own expression table, which is the same trick {@link mechanismNameOf} uses. But `src/game/`
 * may not import `src/ui/`, and these two derivations are needed by a test fixture that runs with no
 * renderer at all. Duplicating twenty lines of table comparison is the cheaper of the two wrongs; the
 * alternative is a game-layer module that cannot be exercised without React.
 *
 * ## Why the blind playthrough uses these and not invented values
 *
 * This is the load-bearing reason the file exists. An earlier version of `playthrough.ts` filled
 * `belief` and `motherShows` with coin flips, because the fixture had no way to compute them — which
 * put a uniform 20% chance of `belief: 'visible'` on every notebook row a blind player opened. The
 * real rate is far lower, since most animals are wild-type at most loci, so the fixture was
 * *inflating* the very signal pattern P4 depends on and any predicate strengthened against it would
 * have been strengthened against noise. A fixture that guesses at a field is a fixture whose findings
 * have to be argued about; one that computes it the same way the UI will is one whose findings can
 * only be argued with by fixing the game.
 */
import { genotypeKey } from '../../genetics/genotype'
import type { AllelePair, Individual, Locus, LocusBelief } from '../../genetics/types'
import type { BeliefState, MechanismName } from './types'

/** Structural comparison of two trait sets. Same approach as `cardModel.ts`'s `sameTraits`. */
function sameTraits(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

function traitsFor(locus: Locus, pair: AllelePair): unknown {
  if (locus.expression.kind !== 'table') return undefined
  return locus.expression.entries[genotypeKey(pair)] ?? locus.expression.otherwise
}

/**
 * Does this allele pair look different from wild type at this locus?
 *
 * The whole of "shows the trait", and derived from the expression table rather than declared,
 * because the table *is* the declaration. A locus with a custom expression rule cannot be compared
 * this way and reports `false`, which is the honest answer rather than a guess.
 */
export function pairShows(locus: Locus, pair: AllelePair | undefined): boolean {
  if (!pair || locus.expression.kind !== 'table') return false
  const wild = [locus.wildType, locus.wildType] as unknown as AllelePair
  return !sameTraits(traitsFor(locus, pair), traitsFor(locus, wild))
}

/** Whether this animal visibly expresses the locus. The source for `motherShows` / `fatherShows`. */
export function individualShows(individual: Individual, locus: Locus): boolean {
  return pairShows(locus, individual.genotype.loci[locus.id])
}

/**
 * What kind of inheritance a locus runs on, narrowed to the four names the act catalogue has.
 *
 * `cardModel.ts`'s `mechanismOf` additionally reports `sexlinked` and `polygenic`, which
 * `MechanismName` does not carry. A sex-linked recessive is still a recessive as far as the thing
 * being taught goes, so placement is deliberately not consulted here.
 */
export function mechanismNameOf(locus: Locus): MechanismName {
  if (locus.alleles.length > 2) return 'multi'
  if (locus.expression.kind !== 'table') return 'multi'
  const wild = locus.wildType
  const mutant = locus.alleles.find((allele) => allele.id !== wild)?.id
  if (!mutant) return 'multi'

  const homWild = traitsFor(locus, [wild, wild] as unknown as AllelePair)
  const het = traitsFor(locus, [mutant, wild] as unknown as AllelePair)
  const homMutant = traitsFor(locus, [mutant, mutant] as unknown as AllelePair)

  if (sameTraits(het, homWild)) return 'recessive'
  if (sameTraits(het, homMutant)) return 'dominant'
  return 'incomplete'
}

/**
 * Which of the five belief states the notebook is showing for one locus on one animal.
 *
 * The mapping, and the reasoning for the two cases that are not obvious:
 *
 * - `unknown` and a missing belief both mean nothing is known. A load locus returns no belief at
 *   all (`Session.beliefAt` filters them), and "nothing known" is the right report for it.
 * - `posterior` is **`possibleHet`**, and that is the whole of it: a distribution over pairs is
 *   exactly where "66%" lives, and a row showing a percentage is a row showing a possible het.
 * - `certain` splits three ways, and *showing* wins over the rest. A proven `variant/variant` at a
 *   recessive locus and a proven `variant/wild` at a dominant one are both animals the player can
 *   see the trait on, and `visible` is what the notebook row says. Only a certain pair that looks
 *   like wild type falls through to `homozygous` or `provenHet`.
 */
export function beliefStateOf(belief: LocusBelief | undefined, locus: Locus): BeliefState {
  if (!belief || belief.kind === 'unknown') return 'unknown'
  if (belief.kind === 'posterior') return 'possibleHet'
  if (pairShows(locus, belief.pair)) return 'visible'
  const [left, right] = belief.pair
  if (left === right) return 'homozygous'
  return 'provenHet'
}
