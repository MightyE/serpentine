/**
 * Chapter 4 — Carriers. Concept 2 (what a het is) and concept 4 (proving out).
 *
 * **P2, in `follow-one-gene`.** One locus, tracked across a generation: locus L on a named mother, a
 * pairing she is committed to, an egg of *that* pairing hatching, then locus L again on *that
 * hatchling*. The `locus` bind is the gene; the `pairing` bind and the two individual
 * cross-references are the generation.
 *
 * **It follows the gene out of a named mother and into her baby, which needed a second individual
 * bind key to say.** §B3's P2 wants both links, and `bind` holds one value per key — `individual`
 * resolves from `individualId`, so a group that captured the parent under `individual` would force
 * the closing notebook read onto the parent too. Earlier spellings gave the parent link up rather
 * than the offspring one and became "the same locus twice", which a blind run completes by
 * coincidence. `offspring` is the second name, and it is a cross-reference key only: in a group
 * `bind` it would be a synonym for `individual` (see `CROSS_REFERENCE_ONLY_KEYS`).
 *
 * The mother rather than either parent because `pairing.committed` names the two parents in separate
 * fields and one `bound` filter reads one field. The step text and hint both say "mother" — guidance
 * may ask for more than a predicate verifies, never for something else.
 *
 * It is a `sequence` rather than the `bundle` §B4 prefers because every link is physically ordered —
 * an egg cannot hatch before the pairing that laid it — which is the one licence §B4 grants. It also
 * keeps the two notebook opens from collapsing onto a single observation, since one act cannot sit
 * both before and after the commit.
 *
 * **P3, in `prove-it`.** A `bundle`, not a sequence: the notebook visit that establishes the animal
 * was a *possible het* can happen either side of the cross, and `genetics.proven` is demonstrative on
 * its own. The notebook element is what makes the step about the concept rather than about a lucky
 * outcome.
 */
import { act, bound, bundle, count, eq, lt, sequence, type Quest } from '../types'

export const CHAPTER_CARRIERS = 'carriers'

const possibleHet: Quest = {
  id: 'possible-het',
  chapter: CHAPTER_CARRIERS,
  title: 'Possible Het',
  intent: 'A het carries a gene it does not show.',
  offer: { order: 12, when: act('ui.notebookLocusOpened', [eq('belief', 'possibleHet')]) },
  teaches: ['carriers'],
  steps: [
    {
      id: 'open-notebook',
      text: 'Open the notebook on a young snake',
      when: act('ui.notebookOpened'),
    },
    {
      id: 'find-possible-het',
      text: 'Find a gene marked as a possible het',
      when: act('ui.notebookLocusOpened', [eq('belief', 'possibleHet')]),
      hint: 'A baby from a carrier pair is the usual place to look.',
    },
    {
      id: 'read-the-gloss',
      text: 'Read the glossary note on hets',
      when: act('ui.glossaryTermOpened', [eq('termId', 'het')]),
    },
  ],
}

/**
 * Two animals in one group, which is what the `offspring` bind key is for: `individual` holds the
 * mother and `offspring` holds her hatchling, and `egg.hatched` is the join that carries both a
 * `pairingId` and an `individualId` so no new act is needed to connect them.
 *
 * The two filters on the opening read are not decoration. With the mother link alone the blind
 * playthrough still completes this on 5 runs in 106 — "the same locus twice" is a one-in-four
 * coincidence when a species has four authored loci. Requiring that the row be a *recessive* gene the
 * mother *visibly shows* takes it to zero, and it is also the concept: she has two copies, so every
 * hatchling of hers has one, which is exactly what a carrier is.
 */
const followOneGene = sequence(
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
      'a gene the mother shows',
    ),
    act('pairing.committed', [bound('motherId', 'individual')], 'you bred that mother'),
    act('egg.hatched', [bound('individualId', 'offspring')], 'one of her eggs hatched'),
    act(
      'ui.notebookLocusOpened',
      [bound('locusId', 'locus'), bound('individualId', 'offspring')],
      'the same gene on the baby',
    ),
  ],
  'one gene across two lives',
)

const followOneGeneQuest: Quest = {
  id: 'follow-one-gene',
  chapter: CHAPTER_CARRIERS,
  title: 'Follow One Gene',
  intent: 'Track one gene from a parent into its baby.',
  offer: { order: 13, when: count('clutch.hatched', 2) },
  teaches: ['carriers', 'expression'],
  steps: [
    {
      id: 'open-parent-notebook',
      text: 'Open the notebook on a parent',
      when: act('ui.notebookOpened'),
    },
    {
      id: 'same-gene-twice',
      text: 'Read one gene on a mother and her baby',
      gates: 'understanding',
      pattern: 'P2',
      when: followOneGene,
      hint: 'Open the same notebook row on the mother then the baby.',
    },
    {
      id: 'baby-shows-or-hides',
      text: 'Check whether the baby shows that trait',
      when: act('ui.notebookLocusOpened', [eq('belief', 'visible')]),
    },
  ],
}

const proveIt: Quest = {
  id: 'prove-it',
  chapter: CHAPTER_CARRIERS,
  title: 'Prove It',
  intent: 'Turn a maybe into a fact by test breeding.',
  offer: { order: 14, when: count('pairing.committed', 2) },
  teaches: ['provingOut', 'carriers'],
  steps: [
    {
      id: 'plan-the-cross',
      text: 'Pair a possible het with a plain mate',
      when: act('pairing.committed'),
      hint: 'A plain mate keeps the result easy to read.',
    },
    {
      id: 'prove-the-gene',
      text: 'Prove a hidden gene by test breeding',
      gates: 'understanding',
      pattern: 'P3',
      when: bundle(
        ['individual', 'locus'],
        [
          act(
            'ui.notebookLocusOpened',
            [
              bound('individualId', 'individual'),
              bound('locusId', 'locus'),
              eq('belief', 'possibleHet'),
            ],
            'a possible het',
          ),
          act(
            'genetics.proven',
            [bound('individualId', 'individual'), bound('locusId', 'locus')],
            'proven by breeding',
          ),
        ],
        'a maybe turned into a fact',
      ),
    },
    {
      id: 'read-it-proven',
      text: 'Read the gene now marked proven',
      when: act('ui.notebookLocusOpened', [eq('belief', 'provenHet')]),
    },
  ],
}

const buyingAFact: Quest = {
  id: 'buying-a-fact',
  chapter: CHAPTER_CARRIERS,
  title: 'Buying A Fact',
  intent: 'A gene test buys the answer. Breeding earns it.',
  offer: { order: 15, when: act('genetics.proven') },
  teaches: ['provingOut'],
  steps: [
    {
      id: 'run-a-test',
      text: 'Run a gene test on one snake',
      when: act('geneTest.run'),
      hint: 'The test costs money and answers one gene.',
    },
    {
      id: 'see-the-cost',
      text: 'Check what that test cost you',
      when: act('money.changed', [lt('delta', 0)]),
    },
    {
      id: 'prove-one-free',
      text: 'Prove another gene by breeding instead',
      when: count('genetics.proven', 2),
    },
  ],
}

export const CARRIERS_QUESTS: readonly Quest[] = [
  possibleHet,
  followOneGeneQuest,
  proveIt,
  buyingAFact,
]
