/**
 * Congenital conditions: what an expressed load allele actually looks like on the animal.
 *
 * Genetics stays pure. `genetics/load.ts` knows that a hatchling is homozygous for a deleterious
 * recessive and that the outcome is `'needsExtraCare'`; it does not know what that *is*, and it
 * must not — the engine states inheritance, not anatomy. Whether a doubled-up recessive shows as
 * oversized eyes is a content decision, and this file is where it is made, the same way
 * `moodOverlay.ts` is where "does an empath glow" is made.
 *
 * ## The one thing this file will not do
 *
 * It never rolls against `vigor`, `F`, or any other summary number to decide whether an animal is
 * affected. The alleles decide, and they have already decided by the time anything here is
 * called — `genetics/load.ts` says so in as many words, and `load.test.ts` enforces the half of
 * it that can be enforced mechanically. Inbreeding causes this the way it causes it in life: by
 * making it likely that both parents hand over the same recessive, not by a die rolled against a
 * coefficient. The only randomness here is which affected adults lose their sight, and that is a
 * second, genuinely stochastic outcome of the same condition, not a re-roll of whether they have
 * it.
 *
 * ## Framing
 *
 * A bug-eyed snake is a rehab resident. The balance charter's third principle is that no animal
 * in this game is ever a problem to be disposed of, and nothing here — no label, no number, no
 * code path — treats one as anything other than an animal that needs more from you. The market
 * pays less for it because the market is a market; that is the player's constraint, not a
 * judgement about the snake.
 */
import { makeRng } from '../lib/rng'
import { rgba } from '../render/colour'
import type { Phenotype } from '../render/contract'
import { BUG_EYES_LOCUS } from './loadPool'

/**
 * How much bigger the eyes are drawn. Doubled — this is meant to be unmistakable at a glance in
 * a binder full of thumbnails, because a condition you can only find by opening a card is a
 * condition the player never learns to breed away from.
 */
export const BUG_EYE_SCALE = 2

/**
 * How many affected animals have lost their sight by the time they are grown.
 *
 * Not all of them, and that is the whole reason this is a separate roll: an outcome that always
 * follows is just part of the condition, whereas one that sometimes follows is a thing the player
 * watches for as a clutch matures.
 */
export const BLINDNESS_RATE = 0.45

/** Age at which the eyes have finished changing — the same "grown" the card shows. */
const ADULT = 1

/** True if this animal is homozygous for the bug-eyes recessive. */
export function hasBugEyes(expressedLoadLoci: readonly string[]): boolean {
  return expressedLoadLoci.includes(BUG_EYES_LOCUS)
}

/**
 * Whether an affected animal's sight has gone.
 *
 * Derived from the individual's own id, never from a shared world RNG — the rule `genetics/
 * types.ts` states for anything about an individual. So it needs no save-file field, it cannot
 * drift between two callers asking the same question, and reloading a save does not re-roll it.
 */
export function isBlind(individualId: string, expressedLoadLoci: readonly string[], age: number): boolean {
  if (!hasBugEyes(expressedLoadLoci)) return false
  if (age < ADULT) return false
  return makeRng(individualId).fork('bug-eyes-sight').chance(BLINDNESS_RATE)
}

/**
 * Lay a congenital condition over an expressed phenotype.
 *
 * Applied by `Session.phenotype()`, which is the single place the game and the UI get a look
 * from. Deliberately **not** applied inside `geneticsEngine.express`: belief inference enumerates
 * candidate genotypes and compares their expressed phenotype keys, and it has no way to know an
 * individual's expressed load — overlaying there would make every candidate fail to match the
 * animal in front of it.
 */
export function applyCongenitalOverlay(
  phenotype: Phenotype,
  individualId: string,
  expressedLoadLoci: readonly string[],
  age: number,
): Phenotype {
  if (!hasBugEyes(expressedLoadLoci)) return phenotype

  const blind = isBlind(individualId, expressedLoadLoci, age)
  return {
    ...phenotype,
    eye: {
      ...phenotype.eye,
      sizeScale: phenotype.eye.sizeScale * BUG_EYE_SCALE,
      // A clouded eye is a flat, pale, blue-grey one with no catchlight in it. The catchlight is
      // what `head.ts` calls the difference between "alive" and "taxidermy", and removing it is
      // the whole cue — the animal is very much alive, it is just not looking back at you.
      ...(blind
        ? { irisColour: rgba(186, 192, 196), pupilColour: rgba(150, 158, 164), highlight: false }
        : {}),
    },
  }
}
