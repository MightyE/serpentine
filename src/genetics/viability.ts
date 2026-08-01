/**
 * Viability: whether a genotype produces a living animal.
 *
 * ## Read this before you change anything in here
 *
 * Some real homozygous forms do not hatch. The engine has to be able to say so, because it
 * changes the ratios you actually observe: a pairing whose Punnett square reads 1 : 2 : 1 comes
 * out of the nest box 2 : 1, and *noticing that discrepancy* is precisely how breeders inferred
 * that a non-hatching super form existed in the first place. Quietly making such genotypes viable would
 * delete a real, checkable fact and would put this game at odds with every keeper the player will
 * ever talk to.
 *
 * **The product rule, in force everywhere downstream: a non-viable genotype is an egg that does
 * not hatch, reported as a genetics fact with an explanation.** Some other outcomes are instead
 * "this animal needs extra care", which is a husbandry note, not a viability question, and is
 * handled in the game layer.
 *
 * There is nothing else. No health decay, no cull API, no `die()`. `explanation` is the entire
 * player-facing surface of this feature, and it is written to teach: it should say *why* the
 * combination does not work, in a sentence a person can repeat to someone else.
 *
 * @see ./types.ts — `ViabilityRule`, `Viability`, `UnhatchedEgg`
 */

import { sexOf } from './genotype'
import type { Genotype, SpeciesDefinition, Viability } from './types'

/**
 * Ask the species' viability rules about one genotype.
 *
 * Rules are checked in the order the species lists them and the **first** one that applies wins,
 * so if two rules could both explain an outcome the player is shown the one the author considered
 * most important rather than an arbitrary pick. Most species declare no rules at all, in which
 * case this is a fast `{ viable: true }`.
 *
 * Sex is derived here rather than passed in, because a rule may legitimately depend on it — a
 * combination can be fine in one sex and not in the other when a sex-linked locus is involved —
 * and deriving it from the chromosomes means it can never drift out of step with the genetics.
 */
export function checkViability<P extends object>(
  genotype: Genotype,
  species: SpeciesDefinition<P>,
): Viability {
  const sex = sexOf(genotype, species.sexSystem)

  for (const rule of species.viability) {
    if (rule.isNonViable(genotype, sex)) {
      return { viable: false, ruleId: rule.id, explanation: rule.explanation }
    }
  }

  return { viable: true }
}
