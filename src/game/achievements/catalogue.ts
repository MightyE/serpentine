/**
 * Serpentine — the achievement catalogue.
 *
 * ## This file is content, not code
 *
 * Everything below is a data literal. There is no logic here, nothing to register, and no other
 * file to edit when you add one: append an object to `ACHIEVEMENTS`, and the requirement compiles,
 * the reward computes itself from the declared effort, the progress bar draws, and
 * `catalogue.test.ts` starts holding it to the same standards as everything else.
 *
 * The constructors near the top (`morphPage`, `showed`, `counter`, …) exist only to keep an entry
 * to a handful of lines. They add no meaning — every one of them is a shorthand for a
 * `Requirement` literal you could have written out.
 *
 * ## The taxonomy, and how to decide where a new one goes
 *
 * Nine categories on four axes (see `types.ts`). The question to ask about a new achievement is
 * *what kind of claim does earning this make about the player* — not what trait it mentions:
 *
 * | If it says… | it belongs in |
 * |---|---|
 * | "you did this for the first time" | `firsts` |
 * | "you made this specific animal" | `traits` |
 * | "you stacked genes" | `combinations` |
 * | "you have seen a fraction of what exists" | `breadth` |
 * | "your lab has been running a while" | `volume` |
 * | "you understood something" | `mastery` |
 * | "you managed a line over time" | `lineage` |
 * | "you looked after animals who needed it" | `sanctuary` |
 * | "you found out the genetics is weirder than it looks" | `curiosities` |
 *
 * ## Every trait named here exists
 *
 * `catalogue.test.ts` asserts that every species id, locus id and allele id mentioned below is
 * present in `src/species/` — so a renamed allele fails a test rather than producing an
 * achievement nobody can ever earn. Do not add an entry naming a trait you are planning to write.
 */
import type { OddsKey } from './canonicalOdds'
import { coverageId } from './coverage'
import type { EffortStep } from './effort'
import { EXISTING_FLAGS, TALLY } from './tallies'
import type { Achievement, Requirement } from './types'

export const BALL = 'ball-python'
export const CORN = 'corn-snake'
export const HOG = 'hognose'

// ---------------------------------------------------------------------------
// Requirement shorthands. Each is one `Requirement` literal, spelled once.
// ---------------------------------------------------------------------------

/** You have produced or owned `count` animals visibly showing this allele. */
function showed(
  species: string,
  locus: string,
  allele: string,
  morph: string,
  count = 1,
): Requirement {
  return {
    kind: 'atLeast',
    flag: TALLY.trait(species, locus, allele),
    value: count,
    describe: count === 1 ? `produce a ${morph}` : `produce ${count} ${morph}s`,
  }
}

/** One animal showing both of these loci at once. */
function paired(species: string, locusA: string, locusB: string, describe: string): Requirement {
  return { kind: 'atLeast', flag: TALLY.combo(species, locusA, locusB), value: 1, describe }
}

/** One animal showing at least `traits` distinct traits at once. */
function stacked(species: string, traits: number, describe: string): Requirement {
  return { kind: 'atLeast', flag: TALLY.multiTrait(species, traits), value: 1, describe }
}

function counter(flag: string, value: number, describe: string): Requirement {
  return { kind: 'atLeast', flag, value, describe }
}

function cover(set: string, fraction: number): Requirement {
  return { kind: 'coverage', set, fraction }
}

function all(...of: Requirement[]): Requirement {
  return { kind: 'all', of }
}

// ---------------------------------------------------------------------------
// Effort shorthands
// ---------------------------------------------------------------------------

const breed = (odds: OddsKey, note: string, copies?: number): EffortStep =>
  copies === undefined ? { kind: 'breed', odds, note } : { kind: 'breed', odds, copies, note }
const evidence = (odds: OddsKey, confidence: number, note: string): EffortStep => ({
  kind: 'evidence',
  odds,
  confidence,
  note,
})
const stock = (tier: 1 | 2 | 3 | 4, count: number, note: string): EffortStep => ({
  kind: 'stock',
  tier,
  count,
  note,
})
const capacity = (slotSeasons: number, note: string): EffortStep => ({
  kind: 'capacity',
  slotSeasons,
  note,
})
const generations = (n: number, note: string): EffortStep => ({
  kind: 'generations',
  generations: n,
  note,
})
const act = (actions: number, note: string): EffortStep => ({ kind: 'action', actions, note })

// ---------------------------------------------------------------------------
// The morph book — one page per allele in the game
// ---------------------------------------------------------------------------

/**
 * A morph-book page. The whole category is this constructor applied to `src/species/`'s own
 * allele list, one entry per morph, and nothing else.
 *
 * `odds` is the canonical cross for that trait's inheritance pattern — a recessive is
 * `recessiveFromCarrierXCarrier`, a dominant or incomplete-dominant is `dominantHetXWildType`, and
 * the two odd ones out (coral glow on the Y, the ultramel compound) name their own.
 */
function morphPage(input: {
  species: string
  locus: string
  allele: string
  morph: string
  label: string
  description: string
  odds: OddsKey
  note: string
  hidden?: boolean
}): Achievement {
  return {
    id: `traits.${input.species}.${input.allele}`,
    category: 'traits',
    label: input.label,
    description: input.description,
    requires: showed(input.species, input.locus, input.allele, input.morph),
    effort: [breed(input.odds, input.note)],
    ...(input.hidden === true ? { hidden: true } : {}),
  }
}

const RECESSIVE: OddsKey = 'recessiveFromCarrierXCarrier'
const DOMINANT: OddsKey = 'dominantHetXWildType'

const MORPH_BOOK: readonly Achievement[] = [
  // — Ball python ———————————————————————————————————————————————————————
  morphPage({
    species: BALL,
    locus: 'albino',
    allele: 'albino',
    morph: 'albino ball python',
    label: 'Lantern',
    description: 'Hatch an albino ball python.',
    odds: RECESSIVE,
    note: 'two het albino ball pythons',
  }),
  morphPage({
    species: BALL,
    locus: 'albino',
    allele: 'candy',
    morph: 'candy ball python',
    label: 'Sugar',
    description: 'Hatch a candy ball python — the other allele of the albino series.',
    odds: RECESSIVE,
    note: 'two het candy ball pythons',
  }),
  morphPage({
    species: BALL,
    locus: 'piebald',
    allele: 'piebald',
    morph: 'piebald ball python',
    label: 'Patchwork',
    description: 'Hatch a piebald ball python.',
    odds: RECESSIVE,
    note: 'two het piebald ball pythons',
  }),
  morphPage({
    species: BALL,
    locus: 'pinstripe',
    allele: 'pinstripe',
    morph: 'pinstripe ball python',
    label: 'Ruled Paper',
    description: 'Hatch a pinstripe ball python.',
    odds: DOMINANT,
    note: 'a pinstripe × a normal',
  }),
  morphPage({
    species: BALL,
    locus: 'pastel',
    allele: 'pastel',
    morph: 'pastel ball python',
    label: 'Turned Up',
    description: 'Hatch a pastel ball python.',
    odds: DOMINANT,
    note: 'a pastel × a normal',
  }),
  morphPage({
    species: BALL,
    locus: 'champagne',
    allele: 'champagne',
    morph: 'champagne ball python',
    label: 'Toast',
    description: 'Hatch a champagne ball python.',
    odds: DOMINANT,
    note: 'a champagne × a normal — no super to lose this way',
  }),
  morphPage({
    species: BALL,
    locus: 'bel',
    allele: 'lesser',
    morph: 'lesser ball python',
    label: 'Understatement',
    description: 'Hatch a lesser — one of the three alleles of the blue-eyed leucistic complex.',
    odds: DOMINANT,
    note: 'a lesser × a normal',
  }),
  morphPage({
    species: BALL,
    locus: 'bel',
    allele: 'mojave',
    morph: 'mojave ball python',
    label: 'Desert Light',
    description: 'Hatch a mojave.',
    odds: DOMINANT,
    note: 'a mojave × a normal',
  }),
  morphPage({
    species: BALL,
    locus: 'bel',
    allele: 'butter',
    morph: 'butter ball python',
    label: 'Churned',
    description: 'Hatch a butter.',
    odds: DOMINANT,
    note: 'a butter × a normal',
  }),
  morphPage({
    species: BALL,
    locus: 'coral-glow',
    allele: 'coral-glow',
    morph: 'coral glow',
    label: 'Sunrise',
    description: 'Hatch a coral glow. Every one of them is a son — the trait rides the Y.',
    odds: 'yLinkedFromCarrierFather',
    note: 'a coral glow male × any female',
  }),
  morphPage({
    species: BALL,
    locus: 'glimmer-genes',
    allele: 'shimmer-plus',
    morph: 'Shimmer+ ball python',
    label: 'Foil',
    description: 'Hatch a Shimmer+ ball python.',
    odds: RECESSIVE,
    note: 'two het Shimmer+ ball pythons',
  }),
  morphPage({
    species: BALL,
    locus: 'empath',
    allele: 'empath',
    morph: 'empath ball python',
    label: 'Good Listener',
    description: 'Hatch an empath ball python.',
    odds: DOMINANT,
    note: 'an empath × a normal',
  }),
  morphPage({
    species: BALL,
    locus: 'prism',
    allele: 'prism',
    morph: 'prism ball python',
    label: 'Refraction',
    description: 'Hatch a prism ball python.',
    odds: DOMINANT,
    note: 'a prism × a normal',
  }),
  morphPage({
    species: BALL,
    locus: 'sparkle-eyes',
    allele: 'sparkle-eyes',
    morph: 'sparkle eyes ball python',
    label: 'Bright Eyes',
    description: 'Hatch a sparkle eyes ball python.',
    odds: DOMINANT,
    note: 'a sparkle eyes × a normal',
  }),

  // — Corn snake ————————————————————————————————————————————————————————
  morphPage({
    species: CORN,
    locus: 'amel',
    allele: 'amel',
    morph: 'amelanistic corn snake',
    label: 'No Black At All',
    description: 'Hatch an amelanistic corn snake.',
    odds: RECESSIVE,
    note: 'two het amel corn snakes',
  }),
  morphPage({
    species: CORN,
    locus: 'anery',
    allele: 'anery',
    morph: 'anerythristic corn snake',
    label: 'No Red At All',
    description: 'Hatch an anerythristic corn snake.',
    odds: RECESSIVE,
    note: 'two het anery corn snakes',
  }),
  morphPage({
    species: CORN,
    locus: 'pulse-glow',
    allele: 'pulse-glow',
    morph: 'pulse glow corn snake',
    label: 'Heartbeat',
    description: 'Hatch a pulse glow corn snake.',
    odds: DOMINANT,
    note: 'a pulse glow × a normal',
  }),
  morphPage({
    species: CORN,
    locus: 'umbra',
    allele: 'umbra',
    morph: 'umbra corn snake',
    label: 'Eclipse',
    description: 'Hatch an umbra corn snake.',
    odds: RECESSIVE,
    note: 'two het umbra corn snakes',
  }),
  morphPage({
    species: CORN,
    locus: 'confetti',
    allele: 'confetti',
    morph: 'confetti corn snake',
    label: 'Party Trick',
    description: 'Hatch a confetti corn snake.',
    odds: RECESSIVE,
    note: 'two het confetti corn snakes',
  }),

  // — Western hognose ———————————————————————————————————————————————————
  morphPage({
    species: HOG,
    locus: 'hognose-albino',
    allele: 'albino',
    morph: 'albino hognose',
    label: 'Sherbet',
    description: 'Hatch an albino western hognose.',
    odds: RECESSIVE,
    note: 'two het albino hognose',
  }),
  morphPage({
    species: HOG,
    locus: 'hognose-axanthic',
    allele: 'axanthic',
    morph: 'axanthic hognose',
    label: 'Newsprint',
    description: 'Hatch an axanthic western hognose.',
    odds: RECESSIVE,
    note: 'two het axanthic hognose',
  }),
  morphPage({
    species: HOG,
    locus: 'hognose-toffeebelly',
    allele: 'toffeebelly',
    morph: 'toffeebelly hognose',
    label: 'Caramel',
    description: 'Hatch a toffeebelly western hognose.',
    odds: RECESSIVE,
    note: 'two het toffeebelly hognose',
  }),
  morphPage({
    species: HOG,
    locus: 'hognose-lavender',
    allele: 'lavender',
    morph: 'lavender hognose',
    label: 'Dusk',
    description: 'Hatch a lavender western hognose.',
    odds: RECESSIVE,
    note: 'two het lavender hognose',
  }),
  morphPage({
    species: HOG,
    locus: 'hognose-sable',
    allele: 'sable',
    morph: 'sable hognose',
    label: 'Charcoal',
    description: 'Hatch a sable western hognose.',
    odds: RECESSIVE,
    note: 'two het sable hognose',
  }),
  morphPage({
    species: HOG,
    locus: 'hognose-evans-hypo',
    allele: 'evans-hypo',
    morph: 'Evans hypo hognose',
    label: 'Softened',
    description: 'Hatch an Evans hypo western hognose.',
    odds: RECESSIVE,
    note: 'two het Evans hypo hognose',
  }),
  morphPage({
    species: HOG,
    locus: 'hognose-anaconda',
    allele: 'anaconda',
    morph: 'anaconda hognose',
    label: 'Broken Bands',
    description: 'Hatch an anaconda western hognose.',
    odds: DOMINANT,
    note: 'an anaconda × a normal',
  }),
  morphPage({
    species: HOG,
    locus: 'hognose-arctic',
    allele: 'arctic',
    morph: 'arctic hognose',
    label: 'Frost',
    description: 'Hatch an arctic western hognose.',
    odds: DOMINANT,
    note: 'an arctic × a normal',
  }),
]

// ---------------------------------------------------------------------------
// The rest of the catalogue
// ---------------------------------------------------------------------------

const FIRSTS: readonly Achievement[] = [
  {
    id: 'firsts.clutch',
    category: 'firsts',
    label: 'Eight Weeks Later',
    description: 'Pair two snakes and see the clutch through to hatching.',
    requires: counter(EXISTING_FLAGS.clutchesHatched, 1, 'hatch a clutch'),
    effort: [generations(1, 'one pairing carried to a hatch')],
  },
  {
    id: 'firsts.morph',
    category: 'firsts',
    label: 'Not Just A Snake',
    description: 'Produce a hatchling showing any trait at all.',
    requires: counter(TALLY.traitDistinct, 1, 'produce an animal showing a trait'),
    effort: [breed(DOMINANT, 'a het × a normal, for anything visible')],
  },
  {
    id: 'firsts.sale',
    category: 'firsts',
    label: 'First Invoice',
    description: 'Sell a snake you produced.',
    requires: counter(TALLY.sold, 1, 'sell a snake'),
    effort: [act(1, 'listing and selling one animal')],
  },
  {
    id: 'firsts.resident',
    category: 'firsts',
    label: 'Room For One More',
    description: 'Take in your first rehab resident.',
    requires: counter(TALLY.residentsTaken, 1, 'take in a rehab resident'),
    effort: [capacity(1, 'one slot held for a season')],
  },
  {
    id: 'firsts.prediction',
    category: 'firsts',
    label: 'Called It',
    description: 'Work out what a pairing should give you before you commit to it.',
    requires: counter(TALLY.predictionsCorrect, 1, 'record a prediction that turns out right'),
    effort: [act(2, 'reading the square, then checking it against the nest box')],
  },
  {
    id: 'firsts.gene-test',
    category: 'firsts',
    label: 'Send It To The Lab',
    description: 'Pay for a gene test rather than breeding for the answer.',
    requires: counter(EXISTING_FLAGS.geneTestsRun, 1, 'run a gene test'),
    effort: [act(1, 'one test, paid for out of pocket')],
  },
  {
    id: 'firsts.proof',
    category: 'firsts',
    label: 'Now You Know',
    description: 'Prove what an animal carries by test breeding it.',
    requires: counter(TALLY.proven, 1, 'prove a locus by test breeding'),
    effort: [evidence(RECESSIVE, 0.95, 'test breeding until the answer is settled')],
  },
  {
    id: 'firsts.second-species',
    category: 'firsts',
    label: 'A Second Opinion',
    description: 'Keep a second species. Different sex system, different rules.',
    requires: counter(TALLY.speciesDistinct, 2, 'keep two species'),
    effort: [stock(2, 1, 'a founder of a species you do not keep yet')],
  },
  {
    id: 'firsts.novel-phenotype',
    category: 'firsts',
    label: 'Nobody Has Seen This',
    description: 'Produce an animal whose appearance you have never produced before.',
    requires: counter(TALLY.phenotypeDistinct, 2, 'produce two different-looking animals'),
    effort: [breed(DOMINANT, 'a second look, out of a second project')],
  },
]

const COMBINATIONS: readonly Achievement[] = [
  {
    id: 'combinations.ball.pastel-pinstripe',
    category: 'combinations',
    label: 'Lemonblast',
    description: 'Produce a ball python that is both pastel and pinstripe.',
    requires: paired(BALL, 'pastel', 'pinstripe', 'produce a pastel pinstripe ball python'),
    effort: [
      breed(DOMINANT, 'a pastel out of a pastel × normal'),
      breed(DOMINANT, 'crossing it onto a pinstripe line'),
    ],
  },
  {
    id: 'combinations.ball.pastel-champagne',
    category: 'combinations',
    label: 'Champagne Toast',
    description: 'Produce a ball python that is both pastel and champagne.',
    requires: paired(BALL, 'pastel', 'champagne', 'produce a pastel champagne ball python'),
    effort: [
      breed(DOMINANT, 'a champagne out of a champagne × normal'),
      breed(DOMINANT, 'crossing it onto a pastel line'),
    ],
  },
  {
    id: 'combinations.ball.super-pastel',
    category: 'combinations',
    label: 'Twice Over',
    description: 'Produce a Super Pastel — the homozygous form, which looks like neither parent.',
    requires: showed(BALL, 'pastel', 'pastel', 'pastel ball python', 4),
    effort: [breed('incompleteDomSuperFromHetXHet', 'pastel × pastel, chasing the super')],
    supersedes: 'traits.ball-python.pastel',
  },
  {
    id: 'combinations.ball.bel',
    category: 'combinations',
    label: 'Blue Eyes',
    description:
      'Produce a blue-eyed leucistic by combining any two alleles of the BEL complex — lesser, ' +
      'mojave or butter.',
    requires: showed(BALL, 'bel', 'lesser', 'lesser ball python', 2),
    effort: [
      stock(2, 2, 'two founders carrying different alleles of the same series'),
      breed('compoundFromTwoHeterozygotes', 'lesser × mojave, chasing the compound'),
    ],
  },
  {
    id: 'combinations.ball.ultramel',
    category: 'combinations',
    label: 'Neither Parent',
    description:
      'Produce an Ultramel: albino over candy. Two recessives that turn out to be the same gene.',
    requires: paired(BALL, 'albino', 'albino', 'produce an Ultramel ball python'),
    effort: [
      breed(RECESSIVE, 'an albino to breed from'),
      breed(RECESSIVE, 'a candy to breed from'),
      breed('ultramelFromTwoHomozygotes', 'albino × candy — every hatchling is the compound'),
    ],
  },
  {
    id: 'combinations.ball.piebald-albino',
    category: 'combinations',
    label: 'Two Quarters',
    description: 'Produce a ball python that is both piebald and albino.',
    requires: paired(BALL, 'piebald', 'albino', 'produce an albino piebald ball python'),
    effort: [breed('doubleRecessiveFromDoubleCarriers', 'double carrier × double carrier')],
  },
  {
    id: 'combinations.ball.piebald-pinstripe',
    category: 'combinations',
    label: 'Ruled And Torn',
    description: 'Produce a piebald that is also pinstripe.',
    requires: paired(BALL, 'piebald', 'pinstripe', 'produce a pinstripe piebald ball python'),
    effort: [breed('recessiveOnDominantBackground', 'carriers of both, chasing the pair')],
  },
  {
    id: 'combinations.ball.triple',
    category: 'combinations',
    label: 'Sixty-Four To One',
    description:
      'Produce a ball python homozygous for three independent recessives at once: albino, ' +
      'piebald and Shimmer+.',
    requires: stacked(BALL, 3, 'produce a ball python showing three traits at once'),
    effort: [breed('tripleRecessiveFromTripleCarriers', 'triple carrier × triple carrier')],
    grants: [{ kind: 'unlock', content: 'market.consignment', label: 'Consignment listings' }],
  },
  {
    id: 'combinations.corn.snow',
    category: 'combinations',
    label: 'Snow',
    description: 'Produce a corn snake that is both amelanistic and anerythristic.',
    requires: paired(CORN, 'amel', 'anery', 'produce a snow corn snake'),
    effort: [breed('doubleRecessiveFromDoubleCarriers', 'double carrier × double carrier')],
  },
  {
    id: 'combinations.hognose.snow',
    category: 'combinations',
    label: 'Hognose Snow',
    description: 'Produce a western hognose that is both albino and axanthic.',
    requires: paired(HOG, 'hognose-albino', 'hognose-axanthic', 'produce a snow hognose'),
    effort: [breed('doubleRecessiveFromDoubleCarriers', 'double carrier × double carrier')],
  },
  {
    id: 'combinations.hognose.superconda-albino',
    category: 'combinations',
    label: 'Superconda Albino',
    description:
      'Produce a Superconda that is also albino — a homozygous incomplete-dominant stacked on a ' +
      'recessive.',
    requires: paired(HOG, 'hognose-anaconda', 'hognose-albino', 'produce a superconda albino'),
    effort: [breed('superAndRecessiveFromDoubleHets', 'anaconda × anaconda, both het albino')],
  },
  {
    id: 'combinations.hognose.anaconda-arctic',
    category: 'combinations',
    label: 'Arctic Anaconda',
    description: 'Produce a western hognose that is both anaconda and arctic.',
    requires: paired(HOG, 'hognose-anaconda', 'hognose-arctic', 'produce an arctic anaconda'),
    effort: [
      breed(DOMINANT, 'an anaconda to breed from'),
      breed(DOMINANT, 'crossing it onto an arctic line'),
    ],
  },
  {
    id: 'combinations.ball.four-traits',
    category: 'combinations',
    label: 'Designer',
    description: 'Produce a single ball python showing four different traits at once.',
    requires: stacked(BALL, 4, 'produce a ball python showing four traits at once'),
    effort: [breed('recessiveOnDominantBackground', 'a fourth locus onto the triple you already have')],
    supersedes: 'combinations.ball.triple',
  },
]

const BREADTH: readonly Achievement[] = [
  // — every morph in the game ————————————————————————————————————————————
  {
    id: 'breadth.all-morphs.10',
    category: 'breadth',
    label: 'Opening The Book',
    description: 'Produce a tenth of every morph in the game.',
    requires: cover(coverageId.allMorphs, 0.1),
    effort: [stock(1, 2, 'founders outside the project you started with')],
  },
  {
    id: 'breadth.all-morphs.25',
    category: 'breadth',
    label: 'A Quarter Of It',
    description: 'Produce a quarter of every morph in the game.',
    requires: cover(coverageId.allMorphs, 0.25),
    effort: [stock(2, 2, 'founders you would not have bought for one project')],
    supersedes: 'breadth.all-morphs.10',
  },
  {
    id: 'breadth.all-morphs.50',
    category: 'breadth',
    label: 'Halfway',
    description: 'Produce half of every morph in the game.',
    requires: cover(coverageId.allMorphs, 0.5),
    effort: [
      stock(2, 3, 'founders across all three species'),
      stock(3, 1, 'one rare founder for a line you do not have'),
    ],
    supersedes: 'breadth.all-morphs.25',
  },
  {
    id: 'breadth.all-morphs.75',
    category: 'breadth',
    label: 'Three Quarters',
    description: 'Produce three quarters of every morph in the game.',
    requires: cover(coverageId.allMorphs, 0.75),
    effort: [stock(3, 2, 'the rare founders the last quarter of the book needs')],
    supersedes: 'breadth.all-morphs.50',
  },
  {
    id: 'breadth.all-morphs.100',
    category: 'breadth',
    label: 'The Whole Book',
    description: 'Produce every morph in the game. Every allele, every species.',
    requires: cover(coverageId.allMorphs, 1),
    effort: [stock(4, 1, 'the last founder, and it is never a cheap one')],
    capstone: true,
    supersedes: 'breadth.all-morphs.75',
    grants: [
      { kind: 'talentPoint', points: 1 },
      { kind: 'stockOffer', offerId: 'breeder.archive', label: 'An introduction to an archive collection' },
    ],
  },

  // — recessives ————————————————————————————————————————————————————————
  {
    id: 'breadth.recessives.25',
    category: 'breadth',
    label: 'Carriers',
    description: 'Produce a quarter of every recessive trait in the game.',
    requires: cover(coverageId.allRecessives, 0.25),
    effort: [stock(2, 1, 'a founder carrying a recessive you do not work with')],
  },
  {
    id: 'breadth.recessives.50',
    category: 'breadth',
    label: 'Half The Hidden Ones',
    description: 'Produce half of every recessive trait in the game.',
    requires: cover(coverageId.allRecessives, 0.5),
    effort: [stock(2, 2, 'two more recessive lines started from scratch')],
    supersedes: 'breadth.recessives.25',
  },
  {
    id: 'breadth.recessives.75',
    category: 'breadth',
    label: 'Three In Four Hidden',
    description: 'Produce three quarters of every recessive trait in the game.',
    requires: cover(coverageId.allRecessives, 0.75),
    effort: [stock(3, 1, 'a rare carrier for a line nobody sells cheaply')],
    supersedes: 'breadth.recessives.50',
  },
  {
    id: 'breadth.recessives.100',
    category: 'breadth',
    label: 'Nothing Left Hidden',
    description: 'Produce every recessive trait in the game.',
    requires: cover(coverageId.allRecessives, 1),
    effort: [stock(3, 1, 'the last recessive line')],
    capstone: true,
    supersedes: 'breadth.recessives.75',
    grants: [{ kind: 'talentPoint', points: 1 }],
  },

  // — dominants —————————————————————————————————————————————————————————
  {
    id: 'breadth.dominants.25',
    category: 'breadth',
    label: 'Visible From The Start',
    description: 'Produce a quarter of every dominant and incomplete-dominant trait in the game.',
    requires: cover(coverageId.allDominants, 0.25),
    effort: [stock(1, 2, 'two visible-trait founders')],
  },
  {
    id: 'breadth.dominants.50',
    category: 'breadth',
    label: 'Half On Sight',
    description: 'Produce half of every dominant and incomplete-dominant trait in the game.',
    requires: cover(coverageId.allDominants, 0.5),
    effort: [stock(2, 1, 'another visible-trait line')],
    supersedes: 'breadth.dominants.25',
  },
  {
    id: 'breadth.dominants.75',
    category: 'breadth',
    label: 'Three Quarters On Sight',
    description: 'Produce three quarters of every dominant and incomplete-dominant trait.',
    requires: cover(coverageId.allDominants, 0.75),
    effort: [stock(2, 2, 'the lines the first half did not cover')],
    supersedes: 'breadth.dominants.50',
  },
  {
    id: 'breadth.dominants.100',
    category: 'breadth',
    label: 'All On Sight',
    description: 'Produce every dominant and incomplete-dominant trait in the game.',
    requires: cover(coverageId.allDominants, 1),
    effort: [stock(3, 1, 'the last one, and it is on the Y')],
    capstone: true,
    supersedes: 'breadth.dominants.75',
    grants: [
      { kind: 'unlock', content: 'lab.morphBookExport', label: 'Print your morph book' },
      { kind: 'title', titleId: 'on-sight', label: 'On Sight' },
    ],
  },

  // — per species ————————————————————————————————————————————————————————
  {
    id: 'breadth.ball.50',
    category: 'breadth',
    label: 'Half A Ball Python Collection',
    description: 'Produce half of every ball python morph.',
    requires: cover(coverageId.morphs(BALL), 0.5),
    effort: [stock(2, 2, 'ball python founders across several loci')],
  },
  {
    id: 'breadth.ball.100',
    category: 'breadth',
    label: 'Every Ball Python',
    description: 'Produce every ball python morph, invented ones included.',
    requires: cover(coverageId.morphs(BALL), 1),
    effort: [stock(3, 1, 'the last ball python line')],
    capstone: true,
    supersedes: 'breadth.ball.50',
    grants: [
      { kind: 'unlock', content: 'lab.ballPythonWing', label: 'A wing of the lab for ball pythons' },
      { kind: 'title', titleId: 'python-regius', label: 'Python regius' },
    ],
  },
  {
    id: 'breadth.hognose.50',
    category: 'breadth',
    label: 'Half A Hognose Collection',
    description: 'Produce half of every western hognose morph.',
    requires: cover(coverageId.morphs(HOG), 0.5),
    effort: [stock(2, 2, 'hognose founders across several loci')],
  },
  {
    id: 'breadth.hognose.100',
    category: 'breadth',
    label: 'Every Hognose',
    description: 'Produce every western hognose morph. All of them are real ones.',
    requires: cover(coverageId.morphs(HOG), 1),
    effort: [stock(3, 1, 'the last hognose line')],
    capstone: true,
    supersedes: 'breadth.hognose.50',
    grants: [
      { kind: 'unlock', content: 'lab.hognoseWing', label: 'A wing of the lab for hognose' },
      { kind: 'title', titleId: 'heterodon', label: 'Heterodon' },
    ],
  },
  {
    id: 'breadth.corn.100',
    category: 'breadth',
    label: 'Every Corn Snake',
    description: 'Produce every corn snake morph.',
    requires: cover(coverageId.morphs(CORN), 1),
    effort: [stock(2, 2, 'the last corn snake lines')],
    capstone: true,
    grants: [
      { kind: 'unlock', content: 'lab.cornSnakeWing', label: 'A wing of the lab for corn snakes' },
      { kind: 'title', titleId: 'pantherophis', label: 'Pantherophis' },
    ],
  },
  {
    id: 'breadth.ball.real',
    category: 'breadth',
    label: 'The Ones That Exist',
    description:
      'Produce every real-world ball python morph — the ten you could go and photograph.',
    requires: cover(coverageId.realMorphs(BALL), 1),
    effort: [stock(3, 1, 'the last of the real lines')],
    capstone: true,
    grants: [{ kind: 'talentPoint', points: 1 }],
  },
  {
    id: 'breadth.species.all',
    category: 'breadth',
    label: 'Three Sex Systems Walk Into A Lab',
    description: 'Keep all three species. Two of them do sex determination the other way round.',
    requires: cover(coverageId.allSpecies, 1),
    effort: [stock(2, 2, 'founders of the two species you did not start with')],
  },
]

const VOLUME: readonly Achievement[] = [
  {
    id: 'volume.piebald.5',
    category: 'volume',
    label: 'A Piebald Project',
    description: 'Produce five piebald ball pythons.',
    requires: showed(BALL, 'piebald', 'piebald', 'piebald ball python', 5),
    effort: [breed(RECESSIVE, 'four more out of the same pairing', 4)],
    supersedes: 'traits.ball-python.piebald',
  },
  {
    id: 'volume.piebald.10',
    category: 'volume',
    label: 'A Piebald Line',
    description: 'Produce ten piebald ball pythons.',
    requires: showed(BALL, 'piebald', 'piebald', 'piebald ball python', 10),
    effort: [breed(RECESSIVE, 'five more, once the line is established', 5)],
    supersedes: 'volume.piebald.5',
  },
  {
    id: 'volume.pastel.5',
    category: 'volume',
    label: 'A Pastel Project',
    description: 'Produce five pastel ball pythons.',
    requires: showed(BALL, 'pastel', 'pastel', 'pastel ball python', 5),
    effort: [breed(DOMINANT, 'four more out of the same pairing', 4)],
    supersedes: 'traits.ball-python.pastel',
  },
  {
    id: 'volume.pastel.10',
    category: 'volume',
    label: 'A Pastel Line',
    description: 'Produce ten pastel ball pythons.',
    requires: showed(BALL, 'pastel', 'pastel', 'pastel ball python', 10),
    effort: [breed(DOMINANT, 'five more, once the line is established', 5)],
    supersedes: 'volume.pastel.5',
  },
  {
    id: 'volume.hognose-albino.5',
    category: 'volume',
    label: 'A Hognose Project',
    description: 'Produce five albino western hognose.',
    requires: showed(HOG, 'hognose-albino', 'albino', 'albino hognose', 5),
    effort: [breed(RECESSIVE, 'four more out of the same pairing', 4)],
    supersedes: 'traits.hognose.albino',
  },
  {
    id: 'volume.hognose-albino.10',
    category: 'volume',
    label: 'A Hognose Line',
    description: 'Produce ten albino western hognose.',
    requires: showed(HOG, 'hognose-albino', 'albino', 'albino hognose', 10),
    effort: [breed(RECESSIVE, 'five more, once the line is established', 5)],
    supersedes: 'volume.hognose-albino.5',
  },
  {
    id: 'volume.ball.10',
    category: 'volume',
    label: 'Ten Ball Pythons',
    description: 'Hatch ten ball pythons, of any kind.',
    requires: counter(TALLY.hatchedOf(BALL), 10, 'hatch ten ball pythons'),
    effort: [act(10, 'ten hatchlings, whatever they turned out to be')],
  },
  {
    id: 'volume.ball.25',
    category: 'volume',
    label: 'Twenty-Five Ball Pythons',
    description: 'Hatch twenty-five ball pythons.',
    requires: counter(TALLY.hatchedOf(BALL), 25, 'hatch twenty-five ball pythons'),
    effort: [act(15, 'fifteen more hatchlings')],
    supersedes: 'volume.ball.10',
  },
  {
    id: 'volume.ball.50',
    category: 'volume',
    label: 'Fifty Ball Pythons',
    description: 'Hatch fifty ball pythons.',
    requires: counter(TALLY.hatchedOf(BALL), 50, 'hatch fifty ball pythons'),
    effort: [act(25, 'twenty-five more hatchlings')],
    supersedes: 'volume.ball.25',
  },
  {
    id: 'volume.ball.100',
    category: 'volume',
    label: 'A Hundred Ball Pythons',
    description: 'Hatch a hundred ball pythons. About nineteen clutches, over a long while.',
    requires: counter(TALLY.hatchedOf(BALL), 100, 'hatch a hundred ball pythons'),
    effort: [act(50, 'fifty more hatchlings, across every project you run')],
    supersedes: 'volume.ball.50',
    grants: [{ kind: 'title', titleId: 'hundred-royals', label: 'A Hundred Royals' }],
  },
  {
    id: 'volume.corn.25',
    category: 'volume',
    label: 'Twenty-Five Corn Snakes',
    description: 'Hatch twenty-five corn snakes.',
    requires: counter(TALLY.hatchedOf(CORN), 25, 'hatch twenty-five corn snakes'),
    effort: [act(25, 'twenty-five hatchlings')],
  },
  {
    id: 'volume.hognose.25',
    category: 'volume',
    label: 'Twenty-Five Hognose',
    description: 'Hatch twenty-five western hognose.',
    requires: counter(TALLY.hatchedOf(HOG), 25, 'hatch twenty-five western hognose'),
    effort: [act(25, 'twenty-five hatchlings')],
  },
  {
    id: 'volume.phenotypes.10',
    category: 'volume',
    label: 'Ten Different Animals',
    description: 'Produce ten animals that do not look like each other.',
    requires: counter(TALLY.phenotypeDistinct, 10, 'produce ten distinct appearances'),
    effort: [breed(RECESSIVE, 'ten separate results, not ten of one', 8)],
  },
  {
    id: 'volume.phenotypes.25',
    category: 'volume',
    label: 'Twenty-Five Different Animals',
    description: 'Produce twenty-five animals that do not look like each other.',
    requires: counter(TALLY.phenotypeDistinct, 25, 'produce twenty-five distinct appearances'),
    effort: [breed('doubleRecessiveFromDoubleCarriers', 'fifteen more, and the easy ones are gone', 5)],
    supersedes: 'volume.phenotypes.10',
    grants: [{ kind: 'stockOffer', offerId: 'breeder.variety', label: 'An introduction to a variety breeder' }],
  },
]

const MASTERY: readonly Achievement[] = [
  {
    id: 'mastery.prove.3',
    category: 'mastery',
    label: 'Three Answers',
    description: 'Prove what an animal carries, at three separate loci, by test breeding.',
    requires: counter(TALLY.proven, 3, 'prove three loci by test breeding'),
    effort: [evidence(RECESSIVE, 0.95, 'two more test-breeding projects run to a conclusion')],
    supersedes: 'firsts.proof',
  },
  {
    id: 'mastery.prove.10',
    category: 'mastery',
    label: 'Nothing Assumed',
    description: 'Prove ten loci by test breeding.',
    requires: counter(TALLY.proven, 10, 'prove ten loci by test breeding'),
    effort: [
      evidence(RECESSIVE, 0.95, 'seven more proofs'),
      evidence('recessiveFromCarrierXHomozygote', 0.97, 'and the harder ones, run to higher confidence'),
    ],
    supersedes: 'mastery.prove.3',
    grants: [{ kind: 'title', titleId: 'nothing-assumed', label: 'Nothing Assumed' }],
  },
  {
    id: 'mastery.clear',
    category: 'mastery',
    label: 'Ruling It Out',
    description:
      'Establish that an animal is *not* a carrier. Absence of evidence is never proof, only ' +
      'enough evidence to act on.',
    requires: counter(TALLY.provenOf('piebald'), 1, 'settle the piebald question on one animal'),
    effort: [evidence('recessiveFromCarrierXHomozygote', 0.97, 'clean offspring, to 97% confidence')],
  },
  {
    id: 'mastery.predict.5',
    category: 'mastery',
    label: 'Reading The Square',
    description: 'Correctly call five clutches before committing to the pairing.',
    requires: counter(TALLY.predictionsCorrect, 5, 'call five clutches correctly'),
    effort: [act(8, 'four more predictions, and the pairings to check them against')],
    supersedes: 'firsts.prediction',
  },
  {
    id: 'mastery.predict.15',
    category: 'mastery',
    label: 'Ahead Of The Nest Box',
    description: 'Correctly call fifteen clutches.',
    requires: counter(TALLY.predictionsCorrect, 15, 'call fifteen clutches correctly'),
    effort: [act(20, 'ten more predictions, on crosses that are no longer obvious')],
    supersedes: 'mastery.predict.5',
  },
  {
    id: 'mastery.gene-tests.5',
    category: 'mastery',
    label: 'Buying The Answer',
    description:
      'Run five gene tests. Sometimes paying for certainty beats spending two seasons on it.',
    requires: counter(EXISTING_FLAGS.geneTestsRun, 5, 'run five gene tests'),
    effort: [act(4, 'four more tests, each one instead of a test-breeding project')],
    supersedes: 'firsts.gene-test',
  },
  {
    id: 'mastery.discover-allele',
    category: 'mastery',
    label: 'That Is New',
    description: 'Notice and record an allele that was not in the game when you started.',
    requires: counter(TALLY.allelesDiscovered, 1, 'discover a novel allele'),
    effort: [act(1, 'recognising it, and writing it down — you cannot breed for this')],
    grants: [{ kind: 'title', titleId: 'first-describer', label: 'First Describer' }],
    hidden: true,
  },
  {
    id: 'mastery.stacked-proof',
    category: 'mastery',
    label: 'Three At Once',
    description: 'Prove three loci on one single animal.',
    requires: all(
      counter(TALLY.proven, 6, 'prove six loci in total'),
      counter(TALLY.provenOf('piebald'), 2, 'and two of them on the piebald locus'),
    ),
    effort: [evidence('doubleRecessiveFromDoubleCarriers', 0.95, 'a test breeding that answers three questions at once')],
    supersedes: 'mastery.prove.3',
  },
  {
    id: 'mastery.champagne-odds',
    category: 'mastery',
    label: 'Two In Three',
    description:
      'Produce champagne out of a champagne × champagne pairing, having worked out first that ' +
      'the lethal super makes the trait commoner, not rarer.',
    requires: all(
      showed(BALL, 'champagne', 'champagne', 'champagne ball python', 3),
      counter(TALLY.viabilityFactsRead, 1, 'read the explanation for a non-viable egg'),
    ),
    effort: [
      breed('champagneHetXHet', 'champagne × champagne', 3),
      act(1, 'reading why a quarter of the clutch did not hatch'),
    ],
    supersedes: 'traits.ball-python.champagne',
  },
  {
    id: 'mastery.viability.3',
    category: 'mastery',
    label: 'The Eggs That Do Not Hatch',
    description:
      'Read the genetics behind three *different* non-viable outcomes. Each one is a fact about a ' +
      'genotype, not a loss.',
    requires: counter(TALLY.viabilityFactsRead, 3, 'read three viability explanations'),
    effort: [act(3, 'three separate genotypes explained — the same egg twice is one fact')],
  },
]

const LINEAGE: readonly Achievement[] = [
  {
    id: 'lineage.f2',
    category: 'lineage',
    label: 'Second Generation',
    description: 'Breed an animal whose parents you also bred.',
    requires: counter(TALLY.deepestPedigree, 2, 'reach two generations of your own breeding'),
    effort: [generations(2, 'two pairings, and they cannot be run in parallel')],
  },
  {
    id: 'lineage.f4',
    category: 'lineage',
    label: 'Fourth Generation',
    description: 'Reach four generations of your own breeding in one line.',
    requires: counter(TALLY.deepestPedigree, 4, 'reach four generations'),
    effort: [generations(2, 'two more generations, in sequence')],
    supersedes: 'lineage.f2',
  },
  {
    id: 'lineage.f6',
    category: 'lineage',
    label: 'Sixth Generation',
    description: 'Reach six generations. By now the pedigree panel is telling you things.',
    requires: counter(TALLY.deepestPedigree, 6, 'reach six generations'),
    effort: [generations(2, 'two more generations, and the inbreeding coefficient is climbing')],
    supersedes: 'lineage.f4',
  },
  {
    id: 'lineage.f8',
    category: 'lineage',
    label: 'Eighth Generation',
    description: 'Reach eight generations in one line.',
    requires: counter(TALLY.deepestPedigree, 8, 'reach eight generations'),
    effort: [generations(2, 'two more, on a line you are now managing rather than just breeding')],
    supersedes: 'lineage.f6',
    grants: [{ kind: 'title', titleId: 'studbook-keeper', label: 'Studbook Keeper' }],
  },
  {
    id: 'lineage.outcross',
    category: 'lineage',
    label: 'Fresh Blood',
    description: 'Bring in an unrelated animal and measurably restore vigor to a narrowed line.',
    requires: counter(TALLY.outcrossRecoveries, 1, 'recover a narrowed line by outcrossing'),
    effort: [
      stock(2, 1, 'an unrelated founder, bought for what it is not related to'),
      generations(2, 'the outcross, then breeding back toward the type you wanted'),
    ],
  },
  {
    id: 'lineage.outcross.3',
    category: 'lineage',
    label: 'Managing A Population',
    description: 'Recover three separate lines by outcrossing.',
    requires: counter(TALLY.outcrossRecoveries, 3, 'recover three lines by outcrossing'),
    effort: [
      stock(2, 2, 'two more unrelated founders'),
      generations(4, 'four more generations of recovery work'),
    ],
    supersedes: 'lineage.outcross',
    grants: [{ kind: 'title', titleId: 'population-manager', label: 'Population Manager' }],
  },
  {
    id: 'lineage.deep-and-broad',
    category: 'lineage',
    label: 'Depth And Width',
    description:
      'Run a six-generation line while keeping all three species. Depth in one place, breadth ' +
      'everywhere else — they compete for the same slots.',
    requires: all(
      counter(TALLY.deepestPedigree, 6, 'reach six generations'),
      cover(coverageId.allSpecies, 1),
    ),
    effort: [capacity(4, 'four slot-seasons the deep line took that the wide collection wanted')],
  },
]

const SANCTUARY: readonly Achievement[] = [
  {
    id: 'sanctuary.residents.5',
    category: 'sanctuary',
    label: 'Five Through The Door',
    description: 'Take in five rehab residents.',
    requires: counter(TALLY.residentsTaken, 5, 'take in five residents'),
    effort: [capacity(4, 'four more slot-seasons held for animals who needed them')],
    supersedes: 'firsts.resident',
  },
  {
    id: 'sanctuary.residents.15',
    category: 'sanctuary',
    label: 'Fifteen Through The Door',
    description: 'Take in fifteen rehab residents.',
    requires: counter(TALLY.residentsTaken, 15, 'take in fifteen residents'),
    effort: [capacity(10, 'ten more slot-seasons')],
    supersedes: 'sanctuary.residents.5',
    grants: [{ kind: 'unlock', content: 'habitat.vetRoom', label: 'A treatment room' }],
  },
  {
    id: 'sanctuary.residents.40',
    category: 'sanctuary',
    label: 'Forty Through The Door',
    description: 'Take in forty rehab residents over the life of the lab.',
    requires: counter(TALLY.residentsTaken, 40, 'take in forty residents'),
    effort: [capacity(25, 'twenty-five more slot-seasons — a quarter of the lab, for years')],
    supersedes: 'sanctuary.residents.15',
    grants: [
      { kind: 'unlock', content: 'habitat.quarantineWing', label: 'A proper quarantine wing' },
      { kind: 'stockOffer', offerId: 'rescue.network', label: 'A place in the regional rescue network' },
      { kind: 'title', titleId: 'open-door', label: 'The Open Door' },
    ],
  },
  {
    id: 'sanctuary.placed.1',
    category: 'sanctuary',
    label: 'A Permanent Home',
    description: 'Place a resident in a permanent home.',
    requires: counter(TALLY.residentsPlaced, 1, 'place a resident'),
    effort: [act(2, 'finding the home, and the paperwork')],
  },
  {
    id: 'sanctuary.placed.10',
    category: 'sanctuary',
    label: 'Ten Permanent Homes',
    description: 'Place ten residents in permanent homes.',
    requires: counter(TALLY.residentsPlaced, 10, 'place ten residents'),
    effort: [act(18, 'nine more placements')],
    supersedes: 'sanctuary.placed.1',
  },
  {
    id: 'sanctuary.placed.25',
    category: 'sanctuary',
    label: 'Twenty-Five Permanent Homes',
    description: 'Place twenty-five residents in permanent homes.',
    requires: counter(TALLY.residentsPlaced, 25, 'place twenty-five residents'),
    effort: [act(30, 'fifteen more placements, and the ones left are the hard ones')],
    supersedes: 'sanctuary.placed.10',
    grants: [{ kind: 'title', titleId: 'twenty-five-homes', label: 'Twenty-Five Homes' }],
  },
  {
    id: 'sanctuary.extra-care.1',
    category: 'sanctuary',
    label: 'The Ones Who Need More',
    description: 'Take in a resident who needs extra care.',
    requires: counter(TALLY.extraCareResidents, 1, 'take in a resident needing extra care'),
    effort: [capacity(2, 'a slot held twice as long, because that is what extra care costs')],
  },
  {
    id: 'sanctuary.extra-care.5',
    category: 'sanctuary',
    label: 'Five Who Needed More',
    description: 'Take in five residents who need extra care.',
    requires: counter(TALLY.extraCareResidents, 5, 'take in five residents needing extra care'),
    effort: [capacity(8, 'eight more slot-seasons, on the animals nobody else wanted')],
    supersedes: 'sanctuary.extra-care.1',
    grants: [{ kind: 'title', titleId: 'no-easy-cases', label: 'No Easy Cases' }],
  },
  {
    /**
     * A ritual, priced as one (charter principle 8's own distinction).
     *
     * This read `totalCareGiven >= 50` alone and declared six slot-seasons of capacity for it,
     * which was wrong twice over: `giveCare` costs no money, no slot and no turn, so the effort
     * declaration was a fiction, and paying 200 money plus 14 reputation for fifty free clicks put
     * the cheapest reputation in the game behind a button you can hold down. Principle 1 says
     * clicks are not a currency the player spends; the corollary is that they are not a currency
     * the game pays in either. The fifteen residents are the cost, and they are what the
     * requirement now names; the care itself is the ritual on top, worth pocket change.
     */
    id: 'sanctuary.care.50',
    category: 'sanctuary',
    label: 'Fifty Weeks Of Care',
    description:
      'Give fifty weeks of care across a rehab of fifteen residents. The attention is free — the ' +
      'fifteen slots are what it cost you.',
    requires: all(
      counter(TALLY.residentsTaken, 15, 'take in fifteen residents'),
      counter(EXISTING_FLAGS.totalCareGiven, 50, 'give fifty weeks of care'),
    ),
    effort: [act(2, 'sitting with them, which costs attention and nothing else')],
  },
  {
    id: 'sanctuary.both',
    category: 'sanctuary',
    label: 'Both At Once',
    description:
      'Run a full rehab and a full breeding programme at the same time — fifteen residents taken ' +
      'in, and half the morph book produced.',
    requires: all(
      counter(TALLY.residentsTaken, 15, 'take in fifteen residents'),
      cover(coverageId.allMorphs, 0.5),
    ),
    effort: [capacity(8, 'the slot-seasons the rehab took while the projects were running')],
  },
]

const CURIOSITIES: readonly Achievement[] = [
  {
    id: 'curiosities.champagne-sibling',
    category: 'curiosities',
    label: 'The Normal One',
    description:
      'Produce a wild-type sibling out of champagne × champagne. It is a third of what hatches, ' +
      'not a quarter — the missing super changes the ratio you actually count.',
    requires: all(
      showed(BALL, 'champagne', 'champagne', 'champagne ball python', 2),
      counter(TALLY.viabilityFactsRead, 1, 'read the explanation for a non-viable egg'),
    ),
    effort: [breed('wildTypeFromChampagneHetXHet', 'champagne × champagne, counting what hatches')],
    hidden: true,
  },
  {
    id: 'curiosities.no-daughters',
    category: 'curiosities',
    label: 'All Sons',
    description:
      'Produce three coral glows and notice that no pairing in the game will ever give you a ' +
      'female one. The trait is on the Y.',
    requires: showed(BALL, 'coral-glow', 'coral-glow', 'coral glow', 3),
    effort: [breed('yLinkedFromCarrierFather', 'a coral glow father, three times over', 3)],
    supersedes: 'traits.ball-python.coral-glow',
    hidden: true,
  },
  {
    id: 'curiosities.umbra-mask',
    category: 'curiosities',
    label: 'Hidden In Plain Sight',
    description:
      'Produce an amelanistic corn snake out of a line carrying umbra — the ones that also got ' +
      'umbra are amel too, and you will never see it.',
    requires: paired(CORN, 'amel', 'umbra', 'produce an amel out of an umbra line'),
    effort: [breed('maskedTraitRevealed', 'carriers of both, chasing the one you can actually see')],
    hidden: true,
  },
  {
    id: 'curiosities.two-recessives-one-gene',
    category: 'curiosities',
    label: 'Same Gene All Along',
    description:
      'Produce albino, candy, and the Ultramel that is both — and find out the two recessives ' +
      'you were treating as separate projects are alleles of one locus.',
    requires: all(
      showed(BALL, 'albino', 'albino', 'albino ball python'),
      showed(BALL, 'albino', 'candy', 'candy ball python'),
    ),
    effort: [breed('ultramelFromTwoHomozygotes', 'albino × candy, once you own both')],
    supersedes: 'combinations.ball.ultramel',
    hidden: true,
  },
  {
    id: 'curiosities.super-that-hatches',
    category: 'curiosities',
    label: 'Not Every Super Is Lethal',
    description:
      'Produce a Superconda after learning that super champagne does not hatch. Two incomplete ' +
      'dominants, two different answers.',
    requires: all(
      showed(HOG, 'hognose-anaconda', 'anaconda', 'anaconda hognose', 4),
      counter(TALLY.viabilityFactsRead, 1, 'read the explanation for a non-viable egg'),
    ),
    effort: [breed('incompleteDomSuperFromHetXHet', 'anaconda × anaconda, chasing the super')],
    supersedes: 'traits.hognose.anaconda',
    hidden: true,
  },
  {
    id: 'curiosities.piebald-white',
    category: 'curiosities',
    label: 'How Much White',
    description:
      'Produce eight piebalds and see for yourself that the amount of white is not the piebald ' +
      'gene — it is everything else.',
    requires: showed(BALL, 'piebald', 'piebald', 'piebald ball python', 8),
    effort: [breed(RECESSIVE, 'three more piebalds, selecting on something no single locus controls', 3)],
    supersedes: 'volume.piebald.5',
    hidden: true,
  },
  {
    id: 'curiosities.compound-not-super',
    category: 'curiosities',
    label: 'Neither Is Dominant',
    description:
      'Produce a blue-eyed leucistic and a Super Pastel, and notice they are different kinds of ' +
      'thing: one is two different alleles, one is the same allele twice.',
    requires: all(
      showed(BALL, 'bel', 'mojave', 'mojave ball python'),
      showed(BALL, 'pastel', 'pastel', 'pastel ball python', 4),
    ),
    effort: [breed('compoundFromTwoHeterozygotes', 'lesser × mojave, alongside the pastel project')],
    supersedes: 'combinations.ball.bel',
    hidden: true,
  },
  {
    id: 'curiosities.sex-systems',
    category: 'curiosities',
    label: 'ZW, Not XY',
    description:
      'Keep ball pythons and corn snakes at once, and find out that the heterogametic sex is not ' +
      'the same one in both.',
    requires: all(
      counter(TALLY.speciesSeen(BALL), 1, 'keep ball pythons'),
      counter(TALLY.speciesSeen(CORN), 1, 'keep corn snakes'),
    ),
    effort: [act(2, 'noticing, which costs nothing but attention')],
    hidden: true,
  },
]

/**
 * The whole set, in the order a browsable list should show it.
 *
 * Append to the category array your achievement belongs to. Nothing else needs editing.
 */
export const ACHIEVEMENTS: readonly Achievement[] = [
  ...FIRSTS,
  ...MORPH_BOOK,
  ...COMBINATIONS,
  ...BREADTH,
  ...VOLUME,
  ...MASTERY,
  ...LINEAGE,
  ...SANCTUARY,
  ...CURIOSITIES,
]
