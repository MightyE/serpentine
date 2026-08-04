/**
 * Serpentine — the canonical pairings, and the exact odds they give.
 *
 * ## Why this file exists
 *
 * Every achievement in the catalogue is priced from how much work it is, and "how much work" is
 * ultimately one number: the probability that a hatchling out of the pairing you would actually
 * make is the animal you were after. Those probabilities are **not** a designer's estimate.
 * Each one is Mendelian arithmetic that `punnett()` computes independently, and
 * `canonicalOdds.test.ts` asserts every entry below against the engine's own answer for a real
 * pairing of real animals of a real species in `src/species/`.
 *
 * That test is the whole point of the file. Achievement data may not contain a bare probability
 * — {@link EffortStep} takes an {@link OddsKey}, not a number — so a reward value that is not
 * traceable to a verified pairing is a type error rather than a judgement call.
 *
 * ## Read the numbers, they are more interesting than they look
 *
 * Two of these are not what a first guess would say, and both are the reason the engine computes
 * them rather than a human writing them down:
 *
 * - **`champagneHetXHet` is 2/3, not 1/2.** A quarter of that pairing is super champagne, which
 *   does not hatch, and what you count in a nest box is conditioned on hatching. So the eggs that
 *   do hatch are one wild-type to two champagne. The lethal locus makes the *visible* trait
 *   commoner, which is the opposite of what people expect a lethal to do.
 * - **`ultramelFromTwoHomozygotes` is 1.0.** Albino × candy gives a clutch where *every* animal is
 *   the compound heterozygote. The work is not in the cross, it is in owning two different
 *   homozygotes to make it with — which is exactly why effort is a sum over steps and not a single
 *   probability.
 *
 * ## Adding one
 *
 * Add the entry here, then add a case to the verification table in `canonicalOdds.test.ts`. The
 * test asserts the two key sets are equal, so an unverified entry fails rather than sneaking in.
 */

/** Where the number came from, so a reader never has to take it on trust. */
export interface CanonicalOdds {
  /** Player-facing: the pairing you would actually make. */
  readonly pairing: string
  /** Probability one hatchling from that pairing is the target, conditioned on hatching. */
  readonly probabilityPerHatchling: number
  /** Why it is that number, in one sentence. Shown in the design doc and the planning UI. */
  readonly reasoning: string
}

/**
 * Every pairing the achievement catalogue prices work against.
 *
 * Keys are named for the *genetics*, never for a trait, so one entry serves every trait with that
 * inheritance pattern — which is what stops this table growing a row per morph.
 */
export const CANONICAL_ODDS = {
  // --- single locus, one generation -------------------------------------------------------
  dominantHetXWildType: {
    pairing: 'a heterozygote for a dominant trait × a wild-type animal',
    probabilityPerHatchling: 1 / 2,
    reasoning: 'Half the gametes from the heterozygous parent carry the variant; one copy shows.',
  },
  dominantHetXHet: {
    pairing: 'two heterozygotes for a dominant trait',
    probabilityPerHatchling: 3 / 4,
    reasoning: 'Only the wild-type/wild-type quarter does not show the trait.',
  },
  incompleteDomSuperFromHetXHet: {
    pairing: 'two heterozygotes for an incomplete-dominant trait, chasing the super form',
    probabilityPerHatchling: 1 / 4,
    reasoning: 'The super form is the homozygote, and homozygotes are a quarter of that cross.',
  },
  recessiveFromCarrierXCarrier: {
    pairing: 'two carriers of a simple recessive',
    probabilityPerHatchling: 1 / 4,
    reasoning: 'The classic 3:1 — one quarter inherits the variant from both parents.',
  },
  recessiveFromCarrierXHomozygote: {
    pairing: 'a carrier × a visibly recessive animal',
    probabilityPerHatchling: 1 / 2,
    reasoning: 'The homozygous parent gives a variant copy to every egg; the carrier gives one to half.',
  },

  // --- more than one locus ----------------------------------------------------------------
  doubleRecessiveFromDoubleCarriers: {
    pairing: 'two double carriers, for two independent recessives',
    probabilityPerHatchling: 1 / 16,
    reasoning: 'Unlinked loci are independent, so the two quarters multiply.',
  },
  tripleRecessiveFromTripleCarriers: {
    pairing: 'two triple carriers, for three independent recessives',
    probabilityPerHatchling: 1 / 64,
    reasoning: 'Three independent quarters. This is what "exceptional" means as arithmetic.',
  },
  superAndRecessiveFromDoubleHets: {
    pairing:
      'two animals each heterozygous for an incomplete-dominant trait and carrying a recessive, ' +
      'chasing the super form on the recessive background (anaconda + albino → superconda albino)',
    probabilityPerHatchling: 1 / 16,
    reasoning:
      'A super form is a homozygote and so is a recessive, so both targets are a quarter each and ' +
      'the quarters multiply. Expression differs — one shows with a single copy, the other does ' +
      'not — but transmission does not care, which is why this is the same 1/16 as a double ' +
      'recessive rather than something rarer.',
  },
  recessiveOnDominantBackground: {
    pairing: 'two carriers of a recessive, both also heterozygous for a dominant',
    probabilityPerHatchling: 3 / 16,
    reasoning: 'A quarter for the recessive times three quarters for the dominant.',
  },

  // --- allelic series and compounds -------------------------------------------------------
  ultramelFromTwoHomozygotes: {
    pairing: 'two different homozygotes of one allelic series (albino × candy)',
    probabilityPerHatchling: 1,
    reasoning:
      'Each parent has only one kind of gamete to give, so every hatchling is the compound ' +
      'heterozygote. All the work was in owning both homozygotes.',
  },
  compoundFromTwoHeterozygotes: {
    pairing: 'two heterozygotes carrying different alleles of one series (lesser × mojave)',
    probabilityPerHatchling: 1 / 4,
    reasoning:
      'Only the eggs that take the variant from both parents are the compound — and because the ' +
      'series has no wild-type dominance over itself, that quarter is the blue-eyed leucistic.',
  },

  // --- viability changes the ratios you actually count -------------------------------------
  champagneHetXHet: {
    pairing: 'two champagne animals (both heterozygous — there is no other kind)',
    probabilityPerHatchling: 2 / 3,
    reasoning:
      'A quarter of the eggs are the super, which does not hatch. Renormalising over the eggs ' +
      'that do leaves one wild-type to two champagne. The lethal makes the trait commoner, not rarer.',
  },
  wildTypeFromChampagneHetXHet: {
    pairing: 'two champagne animals, chasing a wild-type sibling',
    probabilityPerHatchling: 1 / 3,
    reasoning: 'The other side of the same renormalisation.',
  },

  // --- sex linkage ------------------------------------------------------------------------
  yLinkedFromCarrierFather: {
    pairing: 'a coral glow male × any female',
    probabilityPerHatchling: 1 / 2,
    reasoning:
      'The trait rides the Y, so every son has it and no daughter can. Half a clutch is male, ' +
      'so half the clutch is the target — and no pairing will ever give you a female one.',
  },

  // --- epistasis --------------------------------------------------------------------------
  maskedTraitRevealed: {
    pairing: 'two carriers of a masking recessive and a masked one, chasing the unmasked animal',
    probabilityPerHatchling: 3 / 16,
    reasoning:
      'A quarter of the clutch is the masked trait, but the three quarters that are clear of the ' +
      'masking allele are the only ones where you can see it.',
  },
} as const satisfies Readonly<Record<string, CanonicalOdds>>

export type OddsKey = keyof typeof CANONICAL_ODDS

export function odds(key: OddsKey): CanonicalOdds {
  return CANONICAL_ODDS[key]
}

export const ODDS_KEYS = Object.keys(CANONICAL_ODDS) as readonly OddsKey[]
