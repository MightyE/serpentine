/**
 * Serpentine — quests: the six patterns, written out.
 *
 * **These are fixtures and worked examples, not the tutorial arc.** The arc lives in `content/` and
 * belongs to the content agent; this file exists so that:
 *
 * - the two instruments have something to prove themselves against on a day when `content/` is empty
 *   or half-written — a test that silently passes over zero quests is not a test;
 * - each of the six named shapes in `docs/quest-design.md` §B3 has exactly one canonical spelling to
 *   copy, which §B4 says the witness should double as.
 *
 * Every quest here obeys every rule the shipped catalogue obeys — the reading budget, the imperative
 * form, the anti-accident rule — because an example that would fail the checks is worse than none.
 *
 * ---
 *
 * ## Four of the six patterns carry a `gates: 'understanding'` mark. Two do not, and that is the finding
 *
 * §B3 presents six demonstrative patterns. When the blind playthrough was made to click everything a
 * player can actually click — all eleven `ui.*` intents, with real belief values rather than coin
 * flips — **five of the six completed without comprehension.** §B4 gives exactly two honest responses
 * to that: strengthen the predicate, or admit the step does not gate understanding. Both were used,
 * and which one applied was settled by measurement rather than by argument. Every rate below is over
 * the same sample: 43 seeds at 24 rounds and at 120 rounds, 106 runs.
 *
 * | Pattern | Before | After | Resolution |
 * | ------- | ------ | ----- | ---------- |
 * | P1 | 2 / 106 | 0 / 106 | strengthened — `phenotype` bind **and** a long-shot `probability` filter |
 * | P2 | 11 / 106 | 0 / 106 | strengthened — `offspring` bind key, plus an aimed opening read |
 * | P3 | 0 / 106 | 0 / 106 | nothing to do; `genetics.proven` cannot be produced by clicking |
 * | P4 | 3 / 106 | 0 / 106 | strengthened — `locusId` on `ui.pairingPreviewed` |
 * | P5 | 5 / 106 | — | **mark dropped.** Not expressible; see the step's own note |
 * | P6 | 10 / 106 | — | **mark dropped.** Not demonstrative; a correction to §B3 |
 *
 * P3 was never at risk, for a structural reason rather than a lucky one: `genetics.proven` cannot be
 * produced without having designed and run a test cross. §B1 says as much — *"a locus cannot be proven
 * by accident"* — and it remains the only act in the catalogue of which that is true on its own.
 *
 * **Nothing here was weakened.** The three strengthenings each added a field or a key that the emit
 * site already had and the predicate could not see; the two demotions removed a claim the predicate
 * could not support, and each says so at the step rather than in a table.
 *
 * ## The three contract changes these needed, and what they cost
 *
 * All three are in `types.ts`. Each is a field or a key rather than a mechanism, and each was already
 * computable at the emit site — in two of the three cases `playthrough.ts` was computing the value and
 * throwing it away, which is a reliable sign that a payload is missing a field rather than that a
 * pattern is over-ambitious.
 *
 * 1. **`locusId` on `ui.pairingPreviewed`** — a bug fix. The payload carried `motherShows` /
 *    `fatherShows`, documented as "whether each parent visibly shows the trait at the locus in view",
 *    and then never said which locus that was.
 * 2. **`offspring`, a second individual bind key** — a `bind` holds one value per key, so following a
 *    gene from a parent into its baby means naming two animals in one group. `egg.hatched` already
 *    carries both `pairingId` and `individualId`, so no new *act* was needed for the join, only a
 *    second name.
 * 3. **`phenotypeKey` on `ui.cardOpened`, and a `phenotype` bind key** — so that "the outcome you
 *    predicted is the animal you came back for" is expressible. Same key space as
 *    `ui.punnettOutcomeInspected.phenotypeKey`: both are `SpeciesDefinition.phenotypeKey`.
 *
 * The consequence for the arc, stated plainly: **four of §B2's six concepts can now be mechanically
 * proven taught** — dominant versus recessive (P4), what a carrier is (P2), proving out (P3) and the
 * odds (P1). **Relatedness and viability are taught and not proven**, and neither is a predicate
 * waiting on a field. P5 needs an act that records a *rejection*; P6 needs §B3 to concede that reading
 * a disclosure is attention rather than comprehension.
 */
import {
  act,
  bound,
  bundle,
  count,
  eq,
  gte,
  lt,
  sequence,
} from './types'
import type { GlossaryEntry, Quest } from './types'

/**
 * Glossary for the fixtures above, in the shape `content/glossary.ts` uses.
 *
 * Only `relatedness` is here, and it earns its place the hard way: it is four syllables, so the
 * reading checker refuses it until it has a gloss of twelve words or fewer. That is the mechanism
 * working exactly as intended — the word is allowed *because* the game explains it.
 */
export const REFERENCE_GLOSSARY: readonly GlossaryEntry[] = [
  {
    term: 'relatedness',
    gloss: 'How much family two animals share. Higher means more shared genes.',
    concept: 'relatedness',
  },
]

/** P1 — predict, commit, look. The odds concept. */
const readTheSquare: Quest = {
  id: 'ref.readTheSquare',
  chapter: 'reference',
  title: 'Read The Square',
  intent: 'Read the odds before you commit to a pairing',
  offer: { order: 1 },
  teaches: ['odds'],
  steps: [
    { id: 'preview', text: 'open a pairing preview', when: act('ui.pairingPreviewed') },
    {
      id: 'outcome',
      text: 'check one outcome and its odds',
      when: act('ui.punnettOutcomeInspected'),
    },
    {
      id: 'predict',
      text: 'predict a long shot then open the hatchling',
      hint: 'The breeding screen lists every outcome and its odds',
      gates: 'understanding',
      pattern: 'P1',
      /**
       * Two things carry this, and neither is optional — that is the finding, measured rather than
       * argued (see the table in the file header).
       *
       * `phenotype` in the `bind` is what makes the last element *the outcome that was predicted*
       * rather than any animal of that pairing. And `lt('probability', 0.1)` is what makes the
       * prediction a call: at one in four the predicted phenotype turns up among four eggs most of
       * the time, so a player who reads a row at random and then opens the babies produces this
       * trace by luck. Below one in ten they do not. Drop either and the blind run completes it.
       */
      when: sequence(
        ['pairing', 'phenotype'],
        [
          act('ui.pairingPreviewed', undefined, 'open the preview'),
          act('ui.punnettOutcomeInspected', [lt('probability', 0.1)], 'read a long shot'),
          act('pairing.committed', undefined, 'commit that pairing'),
          act('ui.cardOpened', undefined, 'open that outcome'),
        ],
      ),
    },
  ],
}

/** P2 — locus round trip. Expression, and carriers. */
const followOneGene: Quest = {
  id: 'ref.followOneGene',
  chapter: 'reference',
  title: 'Follow One Gene',
  intent: 'Watch one locus pass from a parent to its baby',
  offer: { order: 2 },
  teaches: ['expression', 'carriers'],
  steps: [
    { id: 'open', text: 'open the notebook on a parent', when: act('ui.notebookOpened') },
    {
      id: 'roundTrip',
      text: 'watch one locus from mother to hatchling',
      hint: 'Open the same locus row on the mother and her baby',
      gates: 'understanding',
      pattern: 'P2',
      /**
       * The canonical P2, and it needs **two** individuals in one group — which is what `offspring`
       * exists for. `bind` holds one value per key, so binding the mother under `individual` used to
       * force the closing notebook read onto the mother as well; the read that matters is the one on
       * the baby, so earlier spellings gave up the mother link instead and became "the same locus
       * twice", a one-in-four coincidence a blind run hits repeatedly.
       *
       * `egg.hatched` is the join that needs no new act: it carries both `pairingId` and
       * `individualId`, so the pairing the mother was bred in and the animal that came out of it meet
       * on one observation.
       *
       * The two filters on the opening read are load-bearing and were measured: with the mother link
       * alone the blind run still completes this on 5 runs in 106. Requiring that the row be a
       * *recessive* locus the mother *visibly shows* takes it to zero, and it is also the teaching —
       * she has two copies, so every hatchling has one, and that is what a carrier is.
       *
       * It is the mother rather than either parent because `pairing.committed` names the two parents
       * in separate fields and one `bound` filter reads one field. The father form is the same shape
       * with `fatherId`; an `anyOf` of both is legitimate and costs a second spelling.
       */
      when: sequence(
        ['pairing', 'locus'],
        [
          act(
            'ui.notebookLocusOpened',
            [
              bound('individualId', 'individual'),
              bound('locusId', 'locus'),
              eq('mechanism', 'recessive'),
              eq('belief', 'visible'),
            ],
            'a mother that shows it',
          ),
          act('pairing.committed', [bound('motherId', 'individual')], 'breed that mother'),
          act('egg.hatched', [bound('individualId', 'offspring')], 'her egg hatches'),
          act(
            'ui.notebookLocusOpened',
            [bound('individualId', 'offspring'), bound('locusId', 'locus')],
            'the same locus on the baby',
          ),
        ],
      ),
    },
    {
      id: 'baby',
      text: 'open one locus on the hatchling',
      when: act('ui.notebookLocusOpened'),
    },
  ],
}

/** P3 — prove it. Proving out, by test cross. */
const proveIt: Quest = {
  id: 'ref.proveIt',
  chapter: 'reference',
  title: 'Prove It',
  intent: 'Turn a possible het into a proven one',
  offer: { order: 3 },
  teaches: ['provingOut', 'carriers'],
  steps: [
    {
      id: 'find',
      text: 'find a possible het in the notebook',
      when: act('ui.notebookLocusOpened', [eq('belief', 'possibleHet')]),
    },
    { id: 'plan', text: 'plan a test cross', when: act('pairing.committed') },
    {
      id: 'prove',
      text: 'prove one locus on that animal',
      hint: 'Breed it to an animal that shows the trait',
      gates: 'understanding',
      pattern: 'P3',
      when: bundle(
        ['individual', 'locus'],
        [
          act('ui.notebookLocusOpened', [eq('belief', 'possibleHet')], 'read the maybe'),
          act('genetics.proven', undefined, 'prove the locus'),
        ],
      ),
    },
  ],
}

/** P4 — hidden parents. Expression, and the best evidence in the arc. */
const hiddenParents: Quest = {
  id: 'ref.hiddenParents',
  chapter: 'reference',
  title: 'Hidden Parents',
  intent: 'Two plain parents can hide a gene between them',
  offer: { order: 4 },
  teaches: ['expression'],
  steps: [
    { id: 'pick', text: 'pick two plain parents', when: act('ui.pairingPreviewed') },
    { id: 'wait', text: 'wait for the clutch', when: act('clutch.laid') },
    {
      id: 'hidden',
      text: 'hatch a baby from two plain parents',
      hint: 'Neither parent may show the trait you are after',
      gates: 'understanding',
      pattern: 'P4',
      /**
       * `locus` in the `bind` is the entire pattern, and it only became expressible when
       * `ui.pairingPreviewed` gained a `locusId`. Without it the group could say *neither parent
       * showed a trait* and *the baby shows a trait* but not that the two were the **same** trait,
       * which is what "hidden between them" means. Measured: 3 blind completions in 106 without the
       * key, none with it.
       */
      when: sequence(
        ['pairing', 'locus'],
        [
          act(
            'ui.pairingPreviewed',
            [eq('motherShows', false), eq('fatherShows', false)],
            'two plain parents',
          ),
          act('clutch.hatched', undefined, 'that clutch hatches'),
          act('ui.cardOpened', [bound('individualId', 'individual')], 'open what hatched'),
          act(
            'ui.notebookLocusOpened',
            [bound('individualId', 'individual'), eq('belief', 'visible')],
            'it shows the trait',
          ),
        ],
      ),
    },
  ],
}

/** P5 — aimed choice. Relatedness, and when to outcross. */
const outcross: Quest = {
  id: 'ref.outcross',
  chapter: 'reference',
  title: 'Outcross',
  intent: 'Fresh blood keeps a line healthy',
  offer: { order: 5 },
  teaches: ['relatedness'],
  steps: [
    {
      id: 'compare',
      text: 'compare two pairings',
      when: count('ui.pairingPreviewed', 2),
    },
    {
      /**
       * **No `gates` mark, and the reason is that P5 is not a demonstrative shape at all.**
       *
       * P5's teaching is a *contrast* — you previewed a close pairing and committed a wide one
       * **instead** — and "instead" is the part that cannot be said. The two acts concern two
       * different pairings, so no bind key holds them together; all the group can assert is that both
       * happened, and a player who previews everything and commits half satisfies that by volume. The
       * blind run completes this on 5 runs in 106, and 19 in 106 for the looser `allOf` spelling.
       *
       * Two things were tried before giving the mark up, and it is worth recording that both failed.
       * Tightening the thresholds does nothing: at `gte(relatedness, 0.25)` against
       * `lt(relatedness, 0.03125)` the blind run completes it on **exactly the same five runs**, so
       * the predicate was never close to the boundary. And **negation would not rescue it either** — a
       * previous note in this file claimed a "did not commit the close one" operator would restore
       * P5, and that is wrong on the arithmetic: the blind run previews far more pairs than it
       * commits, so *previewed and never committed* is more often true of uncomprehending play than of
       * comprehending play. A negation would have made this predicate easier, not harder.
       *
       * What would actually gate concept 5 is an act that records a *rejection* — the player closing a
       * preview having decided against it — and no such act exists or obviously should. So relatedness
       * is taught here and not proven, and this step is the honest signal for what its text asks.
       */
      id: 'aim',
      text: 'aim a pairing with low relatedness',
      hint: 'The preview shows relatedness before you commit',
      when: bundle(
        ['species'],
        [
          act(
            'ui.pairingPreviewed',
            [bound('motherId', 'individual'), gte('relatedness', 0.125)],
            'a close pair',
          ),
          act(
            'pairing.committed',
            [bound('motherId', 'individual'), lt('relatedness', 0.0625)],
            'an outcross',
          ),
        ],
      ),
    },
    { id: 'hatch', text: 'hatch that clutch', when: act('clutch.hatched') },
  ],
}

/** P6 — read the fact. Why an egg is not viable. */
const whySomeEggsWait: Quest = {
  id: 'ref.whySomeEggsWait',
  chapter: 'reference',
  title: 'Why Some Eggs Wait',
  intent: 'Some eggs do not hatch and the game says why',
  offer: { order: 6 },
  teaches: ['viability'],
  steps: [
    { id: 'hatch', text: 'wait for a clutch to hatch', when: act('clutch.hatched') },
    {
      /**
       * **No `gates` mark, and this one is a correction to §B3 rather than a gap in the catalogue.**
       *
       * §B3 argues that reading a fact the game reported is demonstrative "when the content is the
       * concept". That argument does not survive contact with the UI it implies. The explanation is a
       * disclosure on a report the player is already looking at, so opening it is one click on an open
       * screen — which is the definition of the *deliberate* tier, not the demonstrative one. The bind
       * on `clutch` is real and worth keeping, but all it establishes is that the player read the
       * reason for the egg the game just told them about, which is the only reason there was to read.
       *
       * The blind run completes it on 10 runs in 106 and there is nothing to strengthen: both elements
       * are things the game puts in front of the player, and no filter distinguishes reading them with
       * comprehension from reading them without. Viability is taught and not proven.
       */
      id: 'read',
      text: 'read why an egg did not hatch',
      hint: 'Open the clutch report and read the reason',
      when: bundle(
        ['clutch'],
        [
          act('egg.notViable', undefined, 'an egg waited'),
          act('ui.viabilityExplanationRead', undefined, 'read the reason'),
        ],
      ),
    },
    { id: 'open', text: 'open the clutch report', when: act('ui.viabilityExplanationRead') },
  ],
}

export const REFERENCE_PATTERNS: readonly Quest[] = [
  readTheSquare,
  followOneGene,
  proveIt,
  hiddenParents,
  outcross,
  whySomeEggsWait,
]
