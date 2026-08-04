/**
 * Serpentine — quests: the blind playthrough.
 *
 * > *It should be difficult to accomplish a quest by accident if it gates critical understanding
 * > that completing the quest doesn't demonstrate.*
 *
 * This is that requirement, as a test, and it is the whole anti-accident guarantee. A fixed-seed
 * fixture plays a long run of legal-but-uncomprehending game: it opens cards, opens notebook rows at
 * random, previews whatever pair is to hand, commits about half of them without reading anything,
 * advances time and sells at random. Then it asserts that **no step marked `gates: 'understanding'`
 * completed.**
 *
 * Three things make this a real test rather than a ritual, and each of them is a lesson from a way
 * this file previously passed while proving nothing:
 *
 * - **The run is a full `Session` with the real bus, the real recorder and the real runtime.** The
 *   only thing standing in for the UI is the `ui.*` emits, and they are emitted with the payloads a
 *   wired UI would send — including a real `pairingId` on a bred animal's card, which is the field
 *   patterns P1 and P4 bind on. Faking that field empty would make this test pass for a reason that
 *   will stop being true the week the UI lands.
 * - **It asserts the catalogue it is testing actually loaded.** `content/index.ts` once exported the
 *   arc under a name `shipped.ts` did not read, so this file spent a while asserting the
 *   anti-accident rule over six reference fixtures and zero shipped quests, and passing. An empty
 *   corpus is not a green test, and {@link catalogueComplaint} is what says so.
 * - **It asserts that ordinary steps *did* complete.** A blind run that completes nothing at all
 *   proves the fixture is broken, not that the predicates are strong, and that failure mode is
 *   invisible unless it is asserted against.
 *
 * ## Why the sample is what it is
 *
 * Ten seeds rather than five, because the two most interesting findings this instrument has produced
 * appeared on three seeds out of ten and would have been a coin toss at five. And long runs on top of
 * the short ones, because a predicate whose safety depends on the player getting bored is not safe:
 * the short sweep is what an hour of play looks like, and the long sweep is what a weekend looks like.
 * The distinction is kept visible rather than averaged away because it is load-bearing — every leak
 * this instrument has found since the sample was widened showed up only at 120 rounds. See
 * {@link LONG_SEEDS} for why there are now twelve of them.
 *
 * When this test and `witness.test.ts` disagree about a predicate, the witness wins and the predicate
 * is loosened (§B4) — a predicate that cannot fire is not protecting anything. When *this* test
 * fails, the predicate is not evidence of understanding and must be strengthened, or the step must
 * lose its `gates` mark. **Making this test pass by making the fixture click less is the one
 * resolution that is never available.**
 */
import { describe, expect, it } from 'vitest'
import { Session } from '../session'
import { attachQuests } from './attach'
import { blindRun } from './playthrough'
import { catalogueComplaint, loadForInstruments } from './shipped'
import { questStepFlag, type Quest, type QuestStep } from './types'

const catalogue = await loadForInstruments()

/**
 * Ten seeds at ordinary length, and twelve played far past the point of interest.
 *
 * The long list grew from three, and the reason is the sharpest lesson this file has taught. A
 * candidate P2 predicate measured **zero** blind completions across the thirteen seeds this test used
 * to run, and **five in 106** once the sample was widened — the difference between a predicate that is
 * safe and one that is merely lucky in the seeds someone happened to type. Every leak the wider sweep
 * found but the narrow one missed was at 120 rounds, not 24, which says where the evidence lives: an
 * hour of play is not what a predicate has to survive, a weekend is.
 *
 * The `s*` and `p*` names are regression seeds — each one caught a real leak in a predicate that has
 * since been strengthened. They are here so it cannot come back quietly. Widen this list when a
 * predicate changes; never narrow it to make the suite faster.
 */
const SHORT_SEEDS = ['blind-a', 'blind-b', 'blind-c', 'blind-d', 'blind-e', 'blind-f', 'blind-g', 'blind-h', 'blind-i', 'blind-j']
const LONG_SEEDS = [
  'long-a',
  'long-b',
  'long-c',
  's6',
  's7',
  's8',
  's11',
  's13',
  's19',
  'p3',
  'p15',
  'p16',
]
const LONG_ROUNDS = 120

interface Sweep {
  readonly label: string
  /** `questId/stepId (pattern)` → how many seeds it fired on. */
  readonly gatingFired: Map<string, number>
  readonly ordinaryCompletions: number
  readonly journalSizes: readonly number[]
}

function gatingSteps(quests: readonly Quest[]): readonly { quest: Quest; step: QuestStep }[] {
  return quests.flatMap((quest) =>
    quest.steps.filter((step) => step.gates === 'understanding').map((step) => ({ quest, step })),
  )
}

function sweep(label: string, seeds: readonly string[], rounds: number): Sweep {
  const gatingFired = new Map<string, number>()
  const journalSizes: number[] = []
  let ordinaryCompletions = 0

  for (const seed of seeds) {
    const session = new Session({ worldSeed: seed, gateMode: 'instant' })
    const quests = attachQuests(session, catalogue.quests)
    blindRun(session, seed, { rounds })
    journalSizes.push(quests.runtime.observations().length)

    for (const quest of catalogue.quests) {
      for (const step of quest.steps) {
        if (session.state.flags.get(questStepFlag(quest.id, step.id)) !== true) continue
        if (step.gates !== 'understanding') {
          ordinaryCompletions += 1
          continue
        }
        const key = `${quest.id}/${step.id} (${step.pattern ?? 'no pattern'})`
        gatingFired.set(key, (gatingFired.get(key) ?? 0) + 1)
      }
    }
    quests.stop()
  }

  return { label, gatingFired, ordinaryCompletions, journalSizes }
}

const sweeps: readonly Sweep[] = [
  sweep(`${SHORT_SEEDS.length} seeds × 24 rounds`, SHORT_SEEDS, 24),
  sweep(`${LONG_SEEDS.length} seeds × ${LONG_ROUNDS} rounds`, LONG_SEEDS, LONG_ROUNDS),
]

describe('blind playthrough: uncomprehending play completes nothing that claims comprehension', () => {
  it('is testing the real catalogue and not just the reference fixtures', () => {
    // First, because every other assertion in this file is worthless if this one is false.
    expect(catalogueComplaint(catalogue)).toBeNull()
  })

  it('has understanding steps to protect', () => {
    expect(gatingSteps(catalogue.quests).length).toBeGreaterThan(0)
  })

  for (const { label, gatingFired, ordinaryCompletions, journalSizes } of sweeps) {
    describe(label, () => {
      it('completed no step that gates understanding', () => {
        // Reported as one aggregated list with a seed count each, rather than one failure per seed.
        // A step that fires on three seeds out of ten and a step that fires on ten are different
        // problems, and the per-seed form hid that behind whichever seed failed first.
        const fired = [...gatingFired.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([step, seeds]) => `${step} — fired on ${seeds} seed(s)`)
        expect(
          fired,
          'clicking around completed a step that claims to prove understanding. Either the ' +
            'predicate is too weak and must be strengthened, or the step should not carry the ' +
            'gates mark and should say so out loud. Weakening this fixture is not a resolution',
        ).toEqual([])
      })

      it('did complete ordinary steps, so the fixture is really playing', () => {
        expect(ordinaryCompletions, 'a blind run that completes nothing is a broken fixture').toBeGreaterThan(0)
      })

      it('recorded a journal within its bound', () => {
        for (const size of journalSizes) {
          expect(size).toBeGreaterThan(20)
          expect(size).toBeLessThanOrEqual(200)
        }
      })
    })
  }

  it('exercised every ui intent, so no predicate is protected by a surface the fixture skips', () => {
    // The failure this guards against is the subtle one: an intent the fixture never emits is an
    // intent whose predicate it silently exempts. P6 passed for exactly that reason until the
    // viability explanation was added to the run.
    const session = new Session({ worldSeed: 'coverage', gateMode: 'instant' })
    const quests = attachQuests(session, catalogue.quests)
    blindRun(session, 'coverage', { rounds: 60 })
    const seen = new Set(quests.runtime.observations().map((entry) => entry.act))
    quests.stop()

    // `ui.cardRevealed` is one-time per animal and the rest are repeatable; all eleven are things a
    // player who clicks everything performs, so all eleven belong in an uncomprehending run.
    const uiIntents = [
      'ui.screenOpened',
      'ui.cardOpened',
      'ui.cardRevealed',
      'ui.notebookOpened',
      'ui.notebookLocusOpened',
      'ui.pairingPreviewed',
      'ui.punnettOutcomeInspected',
      'ui.habitatOpened',
      'ui.glossaryTermOpened',
      'ui.pedigreeOpened',
    ] as const
    const skipped = uiIntents.filter((act) => !seen.has(act))
    expect(
      skipped,
      'the blind fixture never performs these acts, so any predicate resting on one is being ' +
        'protected by the fixture rather than tested by it',
    ).toEqual([])
  })
})
