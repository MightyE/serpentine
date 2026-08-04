/**
 * Chapter 5 — Lines. Concept 5 (relatedness and outcrossing) and concept 6 (why an egg is not viable).
 *
 * **Neither of this chapter's two patterns carries a `gates` mark, and both lost it to measurement
 * rather than to taste.** The reasoning lives on each step; the short version is that P5 needs a word
 * the signal language does not have and P6 needs a click that is harder than the one it asks for. This
 * is the chapter where the arc teaches two concepts it cannot prove it taught, which is worth knowing
 * before editing either quest into looking stronger than it is.
 *
 * **P6, in `why-some-eggs-wait`.** A `bundle` bound by `clutch`: the game reported that an egg would
 * not hatch, and the player opened the reason *for that clutch*. Unordered because the report and the
 * reading are not physically ordered, and safe unordered because the two elements are different act
 * kinds. Framing note, and it is a repo rule rather than a preference (`CLAUDE.md`): a non-viable egg
 * is a genetics fact with an explanation, never death, harm or culling. Nothing in this chapter says
 * otherwise and nothing in it should be edited to.
 *
 * **P5, in `outcross`.** `allOf` rather than a group, and this is the one place the doc's own wording
 * needed resolving. P5 asks for a commit with a low `relatedness` "*after* a step in which the player
 * previewed a related pairing" — but §A2 forbids `after` for pedagogy, and the two acts concern two
 * *different* pairs, so there is no bind key that could hold them together and no physical ordering
 * to license a `sequence`. `allOf` says exactly what is true: both happened, in either order. The
 * contrast is the teaching, and it is also precisely what `allOf` cannot assert — which is why the
 * judgement filter on `relatedness` does not make this an aimed call, and why the mark came off.
 */
import { act, allOf, bound, bundle, count, distinct, eq, gte, lt, type Quest } from '../types'

export const CHAPTER_LINES = 'lines'

const closeRelations: Quest = {
  id: 'close-relations',
  chapter: CHAPTER_LINES,
  title: 'Close Relations',
  intent: 'Every pair has a number for how much family they share.',
  offer: { order: 16, when: count('egg.hatched', 3) },
  teaches: ['relatedness'],
  steps: [
    {
      id: 'open-pedigree',
      text: 'Open the pedigree for a snake',
      when: act('ui.pedigreeOpened'),
      hint: 'The pedigree is the family tree on a snake card.',
    },
    {
      id: 'preview-close-kin',
      text: 'Open a preview for two close kin',
      when: act('ui.pairingPreviewed', [gte('relatedness', 0.125)]),
    },
    {
      id: 'read-the-gloss',
      text: 'Read the glossary note on relatedness',
      when: act('ui.glossaryTermOpened', [eq('termId', 'relatedness')]),
    },
  ],
}

const whySomeEggsWait: Quest = {
  id: 'why-some-eggs-wait',
  chapter: CHAPTER_LINES,
  title: 'Why Some Eggs Wait',
  intent: 'Some eggs never hatch and the game says why.',
  offer: { order: 17, when: act('egg.notViable') },
  teaches: ['viability'],
  steps: [
    {
      id: 'hatch-a-clutch',
      text: 'Wait for a clutch to hatch',
      when: act('clutch.hatched'),
    },
    {
      /**
       * **No `gates` mark.** The bind on `clutch` is real — the player read the reason for the egg
       * the game reported, not some other egg — but that is the whole of it, and the whole of it is
       * one click on a screen already open. §B3 argues reading a reported fact is demonstrative
       * "when the content is the concept"; the blind playthrough completes this on 10 runs in 106,
       * because a player who clicks everything clicks the disclosure too and nothing about clicking
       * it requires having understood the answer. That is the *deliberate* tier by definition.
       *
       * There is nothing to strengthen: both elements are things the game puts in front of the
       * player, and no filter separates reading them with comprehension from reading them without.
       * Viability is taught here and not proven, and the correction is owed to §B3 rather than to
       * this file. The step is still the honest signal for what its text asks.
       */
      id: 'read-the-reason',
      text: 'Read why one egg did not hatch',
      when: bundle(
        ['clutch'],
        [
          act('egg.notViable', [bound('clutchSeed', 'clutch')], 'an egg stayed shut'),
          act(
            'ui.viabilityExplanationRead',
            [bound('clutchSeed', 'clutch')],
            'you read the reason',
          ),
        ],
        'the reason for that clutch',
      ),
      hint: 'The clutch shows a note beside any egg that waited.',
    },
    {
      id: 'read-the-gloss',
      text: 'Read the glossary note on viable eggs',
      when: act('ui.glossaryTermOpened', [eq('termId', 'viable')]),
    },
  ],
}

const outcross: Quest = {
  id: 'outcross',
  chapter: CHAPTER_LINES,
  title: 'Outcross',
  intent: 'Close family carries a cost. A wider pairing helps.',
  offer: { order: 18, when: act('ui.pedigreeOpened') },
  teaches: ['relatedness'],
  steps: [
    {
      id: 'two-pedigrees',
      text: 'Open the pedigree on two related snakes',
      when: distinct('ui.pedigreeOpened', 'individual', 2),
    },
    {
      /**
       * **No `gates` mark**, and the reason is that the contrast P5 teaches is not sayable here.
       *
       * "You previewed a close pairing and committed a wide one **instead**" turns on the word
       * *instead*, and the two acts concern two different pairings, so no bind key holds them
       * together and all `allOf` can assert is that both happened. A player who previews everything
       * and commits half satisfies that by volume: the blind playthrough completes this on 19 runs
       * in 106, and the tighter `bundle` spelling in `reference.ts` on 5.
       *
       * Two rescues were measured and both failed. Tightening the thresholds does nothing — at
       * `gte 0.25` against `lt 0.03125` the blind run completes it on exactly the same runs, so the
       * predicate was never near its boundary. And negation would make it *easier*, not harder: an
       * uncomprehending player previews far more pairs than they commit, so "previewed and did not
       * commit" describes them better than it describes someone choosing deliberately. What would
       * gate concept 5 is an act recording a *rejection*, which the catalogue does not have.
       */
      id: 'aim-a-wide-pairing',
      text: 'Compare a close pair against a far one',
      when: allOf(
        act('ui.pairingPreviewed', [gte('relatedness', 0.125)], 'you looked at close kin'),
        act('pairing.committed', [lt('relatedness', 0.0625)], 'you bred a far pair'),
      ),
      hint: 'Preview the close pair then breed the distant one.',
    },
    {
      id: 'read-the-gloss',
      text: 'Read the glossary note on outcrossing',
      when: act('ui.glossaryTermOpened', [eq('termId', 'outcross')]),
    },
  ],
}

export const LINES_QUESTS: readonly Quest[] = [closeRelations, whySomeEggsWait, outcross]
