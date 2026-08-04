/**
 * Chapter 6 — Your Own Project. Where the tutorial stops leading.
 *
 * Two quests. The first is the capstone and the hardest predicate in the arc: P1 again, but with a
 * judgement filter on `probability`, so the outcome the player inspected before committing has to
 * have been a long shot. Reading a one-in-sixteen off a square and staking a clutch on it anyway is
 * the whole of concepts 1 through 4 used at once, which is why it is the seventh and last gate.
 *
 * Its `bind` is `['pairing']` and not `['individual', 'pairing']` for a reason worth reading before
 * editing any group: the evaluator applies a bind key to *every* element that carries a value for it,
 * so `individual` would reach `ui.cardOpened` — a hatchling — and demand it equal the mother. A key
 * added to `bind` for the sake of one element constrains all of them.
 *
 * The second is deliberately the loosest quest in the game. By this point the player sets the goal and
 * the game has nothing left to teach them — every step is a plain deliberate act, and the quest exists
 * to say "now go", not to check anything.
 */
import { act, bound, count, distinct, eq, lt, sequence, type Quest } from '../types'

export const CHAPTER_OWN_PROJECT = 'your-own-project'

const twoGenesAtOnce: Quest = {
  id: 'two-genes-at-once',
  chapter: CHAPTER_OWN_PROJECT,
  title: 'Two Genes At Once',
  intent: 'Aim at a rare double morph before you breed for it.',
  offer: { order: 19, when: count('genetics.proven', 2) },
  teaches: ['odds', 'expression'],
  steps: [
    {
      id: 'two-recessives',
      text: 'Read two different recessive genes',
      when: distinct('ui.notebookLocusOpened', 'locus', 2, [eq('mechanism', 'recessive')]),
    },
    {
      id: 'predict-the-long-shot',
      text: 'Predict a long shot then breed for it',
      gates: 'understanding',
      pattern: 'P1',
      when: sequence(
        // `pairing` and `phenotype`, and **not** `individual`: the mother travels on the explicit
        // `bound` filters below, which cross-reference without joining the group bind. That matters
        // — `individual` in the bind would be applied to `ui.cardOpened` too, whose `individualId`
        // is the *hatchling*, so it could never equal the mother and the gate would never fire.
        //
        // `phenotype` is what turns "you came back and looked at the babies" into "the outcome you
        // called is the one you opened", and both halves of this predicate were measured: with the
        // probability filter alone the blind playthrough completes it on 2 runs in 106, and with the
        // phenotype bind alone on 17. Together, none.
        //
        // The cost is real and worth naming rather than burying: this now gates on the long shot
        // *arriving*, so a player who predicted correctly and drew badly does not tick it. That is
        // defensible here — the quest is offered only after two genes are proven, by which point the
        // player is breeding many clutches, and nothing in the game sits behind a quest, so the
        // price of a bad run of luck is an unticked box. It is still a design call rather than a
        // free one, and it belongs to whoever owns §B3.
        ['pairing', 'phenotype'],
        [
          act(
            'ui.punnettOutcomeInspected',
            [bound('motherId', 'individual'), lt('probability', 0.1)],
            'a one in sixteen outcome',
          ),
          act(
            'pairing.committed',
            [bound('motherId', 'individual'), bound('pairingId', 'pairing')],
            'you bred for it anyway',
          ),
          act('ui.cardOpened', [bound('pairingId', 'pairing')], 'the long shot arrived'),
        ],
        'a long shot read and taken',
      ),
      hint: 'Look for an outcome under ten percent in the square.',
    },
    {
      id: 'check-them-all',
      text: 'Hatch the clutch and check every baby',
      when: act('clutch.hatched'),
      // Causal: the clutch has to hatch before there is anything to check.
      after: ['predict-the-long-shot'],
    },
  ],
}

const setYourOwnGoal: Quest = {
  id: 'set-your-own-goal',
  chapter: CHAPTER_OWN_PROJECT,
  title: 'Set Your Own Goal',
  intent: 'Pick a morph you want. Then go and make it.',
  offer: { order: 20, when: count('clutch.hatched', 5) },
  steps: [
    {
      id: 'find-a-target',
      text: 'Look for the morph you want most',
      when: act('ui.punnettOutcomeInspected'),
      hint: 'Any preview will show you what a pair can make.',
    },
    {
      id: 'three-clutches',
      text: 'Breed three clutches toward that morph',
      when: count('clutch.hatched', 3),
    },
    {
      id: 'prove-something',
      text: 'Prove a gene you were unsure about',
      when: act('genetics.proven'),
    },
    {
      id: 'sell-your-own',
      text: 'Sell a snake you bred yourself',
      when: act('snake.sold'),
    },
  ],
}

export const OWN_PROJECT_QUESTS: readonly Quest[] = [twoGenesAtOnce, setYourOwnGoal]
