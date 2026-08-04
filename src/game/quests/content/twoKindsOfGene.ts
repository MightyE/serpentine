/**
 * Chapter 3 — Two Kinds Of Gene. Concept 1 (dominant versus recessive) and concept 3 (odds).
 *
 * The first two understanding gates in the arc are here, and both are worth reading closely because
 * they are the template for the rest.
 *
 * Both lean on one property of the evaluator, and it is worth knowing before writing any group: a
 * `pairing` bind resolves from a `pairingId` where an act has one and from `motherId` + `fatherId`
 * where it does not, so `ui.pairingPreviewed` and `ui.punnettOutcomeInspected` — which carry only
 * their parents — bind to `pairing.committed`, `clutch.hatched`, `egg.hatched` and `ui.cardOpened`
 * without a single explicit cross-reference. Everything below binds by `pairing` for that reason.
 *
 * **P4, in `hidden-parents`.** Four acts in a `sequence`, and every link is real: a preview in which
 * *neither* parent shows the trait, a commit of that same pair, an egg of that pairing hatching, and
 * the notebook on *that hatchling* showing a recessive gene it can see. `motherShows` and
 * `fatherShows` are judgement fields, so the first element is aimed rather than clicked; the last is
 * the payoff, bound to the baby through `egg.hatched`. There is no innocent way to produce that trace.
 *
 * **P1, in `read-the-square` — and it carries no `gates` mark, which is a finding rather than an
 * oversight.** The through-line is the one §B3 describes: `ui.punnettOutcomeInspected` →
 * `pairing.committed` → `ui.cardOpened`, all one pairing. `blind.test.ts` completes it anyway, on
 * three of five seeds, and the reason is worth writing down because it is not fixable from here. A
 * player who previews pairs, clicks an outcome row, breeds about half of them and opens the babies —
 * comprehending nothing — produces exactly that trace, because the `pairing` bind joins those three
 * acts for free. A judgement filter on `probability` does not rescue it either: with the hidden load
 * pool most rows of a real square are low-probability, so a *randomly* chosen row usually passes any
 * threshold that a deliberately chosen one would.
 *
 * What would make it evidence is tying the card the player came back to against the outcome they
 * predicted — but no act carries an offspring's phenotype, so "the answer you predicted arrived"
 * cannot be said. Per §B4, a predicate the blind run completes is not evidence of understanding and
 * the step must be strengthened or lose the mark; strengthening is not expressible, so it loses the
 * mark. Concept 3 stays gated by `two-genes-at-once/predict-the-long-shot`, which is P1 *plus* a
 * `probability` judgement, and which the blind run does not reach.
 *
 * Both remaining sequences are sequences rather than bundles because every link is physically ordered
 * — you cannot open a hatchling before the clutch hatched — which is the only thing §B4 accepts as a
 * licence for order.
 */
import { act, bundle, eq, sequence, type Quest } from '../types'

export const CHAPTER_TWO_GENES = 'two-kinds-of-gene'

const showOrHide: Quest = {
  id: 'show-or-hide',
  chapter: CHAPTER_TWO_GENES,
  title: 'Show Or Hide',
  intent: 'Some genes show with one copy. Some need two.',
  offer: { order: 9, when: act('egg.hatched') },
  teaches: ['expression'],
  steps: [
    {
      id: 'open-notebook',
      text: 'Open the notebook on a snake',
      when: act('ui.notebookOpened'),
      hint: 'The notebook button sits on every snake card.',
    },
    {
      /**
       * Demonstrative without being a gate. Both entries must be the *same animal*, which is what
       * makes it a comparison rather than two clicks — but concept 1 is gated by `hidden-parents`
       * below, and §B3 has no named pattern for this shape, so it carries no `gates` mark.
       */
      id: 'both-kinds',
      text: 'Read a dominant gene and a recessive one',
      when: bundle(
        ['individual'],
        [
          act('ui.notebookLocusOpened', [eq('mechanism', 'dominant')], 'a dominant gene'),
          act('ui.notebookLocusOpened', [eq('mechanism', 'recessive')], 'a recessive gene'),
        ],
        'both kinds on one snake',
      ),
    },
    {
      id: 'find-a-shown-recessive',
      text: 'Find a snake showing a recessive trait',
      when: act('ui.notebookLocusOpened', [
        eq('mechanism', 'recessive'),
        eq('belief', 'visible'),
      ]),
    },
  ],
}

const hiddenParents: Quest = {
  id: 'hidden-parents',
  chapter: CHAPTER_TWO_GENES,
  title: 'Hidden Parents',
  intent: 'Two plain parents can hide a gene between them.',
  offer: { order: 10, when: act('ui.notebookLocusOpened') },
  teaches: ['expression'],
  steps: [
    {
      id: 'two-carriers',
      text: 'Read a recessive gene on two snakes',
      when: act('ui.notebookLocusOpened', [eq('mechanism', 'recessive')]),
    },
    {
      id: 'breed-two-plain',
      text: 'Breed two snakes that show no trait',
      gates: 'understanding',
      pattern: 'P4',
      when: sequence(
        // `locus` is the key that makes this the pattern rather than a rhyme of it: without it the
        // group says *neither parent showed a trait* and *the baby shows a trait*, and never that
        // they are the **same** trait. `ui.pairingPreviewed` only gained a `locusId` to carry it.
        ['pairing', 'individual', 'locus'],
        [
          act(
            'ui.pairingPreviewed',
            [eq('motherShows', false), eq('fatherShows', false)],
            'neither parent shows it',
          ),
          act('pairing.committed', [], 'you bred that pair'),
          act('egg.hatched', [], 'one of their eggs hatched'),
          act(
            'ui.notebookLocusOpened',
            [eq('mechanism', 'recessive'), eq('belief', 'visible')],
            'the baby shows it',
          ),
        ],
        'a hidden gene came out',
      ),
      hint: 'Open the preview first then set that same pair to breed.',
    },
    {
      id: 'baby-shows-it',
      text: 'Find a baby showing the hidden trait',
      when: act('ui.notebookLocusOpened', [
        eq('mechanism', 'recessive'),
        eq('belief', 'visible'),
      ]),
    },
  ],
}

const readTheSquare: Quest = {
  id: 'read-the-square',
  chapter: CHAPTER_TWO_GENES,
  title: 'Read The Square',
  intent: 'Read the odds before you breed. Then check them.',
  offer: { order: 11, when: act('ui.pairingPreviewed') },
  teaches: ['odds'],
  steps: [
    {
      id: 'open-preview',
      text: 'Open the Punnett preview for a pair',
      when: act('ui.pairingPreviewed'),
      hint: 'The preview opens from the breeding screen.',
    },
    {
      id: 'read-one-outcome',
      text: 'Read the odds on one outcome',
      when: act('ui.punnettOutcomeInspected'),
    },
    {
      /**
       * P1's through-line, and deliberately **not** marked as a gate — see the header note. The
       * sequence is still the honest signal for what the text asks, and it is still the shape the
       * capstone gate is built from.
       */
      id: 'predict-then-meet',
      text: 'Predict one outcome then meet the babies',
      when: sequence(
        ['pairing'],
        [
          act('ui.punnettOutcomeInspected', [], 'you read one outcome'),
          act('pairing.committed', [], 'you bred that pair'),
          act('ui.cardOpened', [], 'you met a baby'),
        ],
        'read then bred then looked',
      ),
    },
  ],
}

export const TWO_GENES_QUESTS: readonly Quest[] = [showOrHide, hiddenParents, readTheSquare]
