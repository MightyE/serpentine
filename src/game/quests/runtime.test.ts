/**
 * Serpentine — quests: the evaluator, the journal, the runtime, and the save slice.
 *
 * The evaluator half runs against hand-written observations and no game at all, which is the property
 * the whole design is built on: a predicate is a pure function of a recorded history. The runtime half
 * runs against a real `Session`, because offering, retirement and persistence are claims about the
 * game and cannot be checked against a fake.
 */
import { describe, expect, it } from 'vitest'
import { Session } from '../session'
import { pairingIdOf } from '../pairingId'
import { attachQuests } from './attach'
import { evaluateSignal, type EvalContext } from './evaluate'
import { createJournal } from './journal'
import { emitIntent } from './observe'
import {
  LIMITS,
  QUEST_FLAGS,
  act,
  bound,
  bundle,
  count,
  distinct,
  eq,
  flagAtLeast,
  questStatusFlag,
  questStepFlag,
  rosterHas,
  sequence,
  strengthOf,
} from './types'
import type { ActKind, ActPayloadMap, Observation, Quest, QuestStep } from './types'

// ---------------------------------------------------------------------------
// A history, by hand
// ---------------------------------------------------------------------------

let seq = 0
function obs<K extends ActKind>(act: K, fields: ActPayloadMap[K], at = 1): Observation {
  return { act, at, seq: seq++, fields }
}

function ctx(journal: readonly Observation[], flags: Record<string, number | boolean | string> = {}): EvalContext {
  return {
    journal,
    state: {
      flag: (id) => flags[id],
      roster: () => [
        { individualId: 'a', speciesId: 'ball-python', sex: 'female', mature: true },
        { individualId: 'b', speciesId: 'ball-python', sex: 'male', mature: false },
      ],
    },
  }
}

describe('evaluate: the simple signals', () => {
  it('matches an act, with and without a filter', () => {
    const journal = [obs('snake.sold', { individualId: 'a', speciesId: 'ball-python', price: 500 })]
    expect(evaluateSignal(act('snake.sold'), ctx(journal)).done).toBe(true)
    expect(evaluateSignal(act('snake.sold', [eq('speciesId', 'corn-snake')]), ctx(journal)).done).toBe(false)
  })

  it('counts repeats and reports partial progress', () => {
    const journal = [
      obs('snake.sold', { individualId: 'a', speciesId: 'ball-python', price: 1 }),
      obs('snake.sold', { individualId: 'b', speciesId: 'ball-python', price: 2 }),
    ]
    const progress = evaluateSignal(count('snake.sold', 3), ctx(journal))
    expect(progress.done).toBe(false)
    expect(progress.satisfied).toBe(2)
    expect(progress.total).toBe(3)
  })

  it('counts distinct subjects, not distinct acts', () => {
    const twice = [
      obs('snake.sold', { individualId: 'a', speciesId: 'ball-python', price: 1 }),
      obs('snake.sold', { individualId: 'a', speciesId: 'ball-python', price: 2 }),
    ]
    expect(evaluateSignal(distinct('snake.sold', 'individual', 2), ctx(twice)).done).toBe(false)
  })

  it('reads flags and the roster for the incidental tier', () => {
    expect(evaluateSignal(flagAtLeast('clutchesHatched', 2), ctx([], { clutchesHatched: 3 })).done).toBe(true)
    expect(evaluateSignal(rosterHas({ sex: 'female', mature: true }), ctx([])).done).toBe(true)
    expect(evaluateSignal(rosterHas({ speciesId: 'corn-snake' }), ctx([])).done).toBe(false)
  })
})

describe('evaluate: binding is what makes a group evidence', () => {
  const preview = (motherId: string, fatherId: string) =>
    obs('ui.pairingPreviewed', {
      motherId,
      fatherId,
      speciesId: 'ball-python',
      relatedness: 0,
      nonViableProbability: 0,
      locusId: 'albino',
      motherShows: false,
      fatherShows: false,
    })
  const committed = (motherId: string, fatherId: string) =>
    obs('pairing.committed', {
      pairingId: pairingIdOf(motherId, fatherId),
      motherId,
      fatherId,
      speciesId: 'ball-python',
      relatedness: 0,
      nonViableProbability: 0,
    })

  it('binds a preview to a commitment through a derived pairing id', () => {
    const signal = sequence(['pairing'], [act('ui.pairingPreviewed'), act('pairing.committed')])
    expect(evaluateSignal(signal, ctx([preview('m', 'f'), committed('m', 'f')])).done).toBe(true)
  })

  it('refuses to bind two acts about different pairings', () => {
    const signal = sequence(['pairing'], [act('ui.pairingPreviewed'), act('pairing.committed')])
    const progress = evaluateSignal(signal, ctx([preview('m', 'f'), committed('x', 'y')]))
    expect(progress.done).toBe(false)
    // Partial progress is the point: the player can see which half is missing.
    expect(progress.satisfied).toBe(1)
    expect(progress.parts).toHaveLength(2)
  })

  it('requires order in a sequence and not in a bundle', () => {
    const history = [committed('m', 'f'), preview('m', 'f')]
    const ordered = sequence(['pairing'], [act('ui.pairingPreviewed'), act('pairing.committed')])
    const unordered = bundle(['pairing'], [act('ui.pairingPreviewed'), act('pairing.committed')])
    expect(evaluateSignal(ordered, ctx(history)).done).toBe(false)
    expect(evaluateSignal(unordered, ctx(history)).done).toBe(true)
  })

  it('cross-references a field to a key captured by a sibling', () => {
    // P2 in miniature: the notebook visit and the pairing must concern the same animal.
    const signal = sequence(
      ['locus'],
      [
        act('ui.notebookLocusOpened', [bound('individualId', 'individual')]),
        act('pairing.committed', [bound('motherId', 'individual')]),
      ],
    )
    const notebook = (individualId: string) =>
      obs('ui.notebookLocusOpened', {
        individualId,
        speciesId: 'ball-python',
        locusId: 'albino',
        mechanism: 'recessive',
        belief: 'possibleHet',
      })
    expect(evaluateSignal(signal, ctx([notebook('m'), committed('m', 'f')])).done).toBe(true)
    expect(evaluateSignal(signal, ctx([notebook('other'), committed('m', 'f')])).done).toBe(false)
  })

  it('computes strength from the shape, so an author cannot claim it', () => {
    expect(strengthOf(act('ui.cardOpened'))).toBe('deliberate')
    expect(strengthOf(act('egg.hatched'))).toBe('incidental')
    expect(strengthOf(bundle(['pairing'], [act('ui.cardOpened'), act('clutch.hatched')]))).toBe('demonstrative')
  })
})

describe('journal: bounded, ordered, and save-stable', () => {
  it('keeps only the most recent observations', () => {
    const journal = createJournal()
    for (let i = 0; i < LIMITS.journalSize + 25; i++) {
      journal.record('turn.advanced', { turn: i }, i)
    }
    expect(journal.all()).toHaveLength(LIMITS.journalSize)
    expect((journal.all()[0]?.fields as { turn: number }).turn).toBe(25)
  })

  it('never reissues a sequence number across a reload', () => {
    const first = createJournal()
    first.record('turn.advanced', { turn: 1 }, 1)
    const restored = createJournal(first.toSave())
    const next = restored.record('turn.advanced', { turn: 2 }, 2)
    expect(next.seq).toBeGreaterThan(first.all()[0]?.seq ?? 0)
  })
})

// ---------------------------------------------------------------------------
// The runtime, against a real session
// ---------------------------------------------------------------------------

const simple: Quest = {
  id: 'q.simple',
  chapter: 'test',
  title: 'A Test Quest',
  intent: 'Take one animal in and name it',
  offer: { order: 1 },
  steps: [
    { id: 'take', text: 'take one snake in', when: act('snake.acquired') },
    { id: 'name', text: 'name that snake', when: act('snake.named') },
    { id: 'sell', text: 'sell one snake', when: act('snake.sold') },
  ],
}

function testSession(seed = 'runtime'): Session {
  return new Session({ worldSeed: seed, gateMode: 'instant' })
}

describe('runtime: offering, completion and the flags it writes', () => {
  it('offers, ticks a step, and finishes the quest', () => {
    const session = testSession()
    const ticked: string[] = []
    const finished: string[] = []
    attachQuests(session, [simple], {
      onStepCompleted: (_quest, step) => ticked.push(step.id),
      onQuestCompleted: (quest) => finished.push(quest.id),
    })

    expect(session.state.flags.get(questStatusFlag('q.simple'))).toBe('offered')
    const record = session.spawnRandom('ball-python')
    expect(session.state.flags.get(questStepFlag('q.simple', 'take'))).toBe(true)
    expect(session.state.flags.get(questStatusFlag('q.simple'))).toBe('active')

    session.rename(record.individual.id, 'Named')
    session.sell(record.individual.id)

    expect(finished).toEqual(['q.simple'])
    expect(session.state.flags.get(questStatusFlag('q.simple'))).toBe('done')
    expect(session.state.flags.get(QUEST_FLAGS.completed)).toBe(1)
    expect(ticked).toEqual(['take', 'name', 'sell'])
  })

  /**
   * Retirement, on the two paths the game can actually reach it by — and why the obvious third one
   * is not a path at all.
   *
   * The first version of this test performed the acts on a live session and *then* called
   * `attachQuests`, expecting the runtime to find them. It cannot, and no amount of runtime work
   * would let it: the journal is written by the recorder, the recorder starts at `attach()`, and
   * there is no other record of the past for it to consult. That is not a gap — a save's `quests`
   * slice *is* the memory, and asking the runtime to see acts from before it existed is asking it to
   * invent evidence, which is the one thing §A4's replay-everything policy relies on it never doing.
   *
   * So the precondition is built the way the game builds it, twice over. Both assert the same rule:
   * marked done, no ceremony, never shown.
   */
  it('retires a quest silently when a restored journal already satisfies it', () => {
    // A journal recorded with no catalogue at all — so it holds the acts and not one `quest.` flag.
    // This is "a quest added to the catalogue in a later build meets an old save", which is the
    // scenario `runtime.ts` claims to handle and the reason the replay runs at offer time.
    const first = testSession()
    attachQuests(first, [])
    const record = first.spawnRandom('ball-python')
    first.rename(record.individual.id, 'Named')
    first.sell(record.individual.id)
    const save = first.toSaveFile()
    expect(save.quests?.journal.length ?? 0).toBeGreaterThan(0)
    expect(save.quests?.journal.some((entry) => entry.act === 'snake.sold')).toBe(true)

    const finished: string[] = []
    const offered: string[] = []
    const session = new Session({ restore: save, gateMode: 'instant' })
    const quests = attachQuests(session, [simple], {
      onQuestCompleted: (quest) => finished.push(quest.id),
      onOffered: (quest) => offered.push(quest.id),
    })

    expect(session.state.flags.get(questStatusFlag('q.simple'))).toBe('done')
    // Marked done, never shown, no ceremony: a congratulation for the past is noise.
    expect(finished).toEqual([])
    expect(offered).toEqual([])
    expect(quests.runtime.view('q.simple')?.retiredSilently).toBe(true)
    // Retirement still counts, because `quest.completed` is what an achievement reads and a counter
    // that skips early-satisfied quests makes such an achievement quietly unreachable.
    expect(session.state.flags.get(QUEST_FLAGS.completed)).toBe(1)
  })

  it('retires a quest silently when it is offered late in a session that already did the work', () => {
    // The same rule on the within-session path: a quest gated behind another is offered only once
    // the first is done, by which time the journal it replays is the one this session wrote.
    const late: Quest = { ...simple, id: 'q.late', offer: { order: 2, after: ['q.gate'] } }
    const gate: Quest = {
      id: 'q.gate',
      chapter: 'test',
      title: 'A Gate',
      intent: 'Advance time once so the next quest unlocks',
      offer: { order: 1 },
      steps: [{ id: 'wait', text: 'advance one week', when: act('turn.advanced') }],
    }

    const session = testSession()
    const offered: string[] = []
    const finished: string[] = []
    const quests = attachQuests(session, [gate, late], {
      onQuestCompleted: (quest) => finished.push(quest.id),
      onOffered: (quest) => offered.push(quest.id),
    })

    const record = session.spawnRandom('ball-python')
    session.rename(record.individual.id, 'Named')
    session.sell(record.individual.id)
    expect(quests.runtime.statusOf('q.late')).toBeUndefined()

    session.advance(1)

    expect(session.state.flags.get(questStatusFlag('q.late'))).toBe('done')
    expect(quests.runtime.view('q.late')?.retiredSilently).toBe(true)
    // The gate finished live and is announced; the late quest is retired and is not.
    expect(finished).toEqual(['q.gate'])
    expect(offered).toEqual(['q.gate'])
  })

  it('retires silently even when `after` points at a later step', () => {
    // The replay at offer time has to run to a fixpoint. In declaration order `sell` is blocked by a
    // step that has not been visited yet, so a single pass leaves it undone, the quest fails to
    // retire, and it is offered and then congratulated for work the player did before it existed —
    // exactly the ceremony-for-the-past §A4 forbids.
    //
    // `content/catalogue.test.ts` does require the arc's `after` to point backwards, and that rule is
    // worth keeping. It is not what makes this correct: it is a content test, it does not run over
    // `reference.ts` or over a catalogue a later build adds, and nothing in `types.ts` promises it.
    const backward: Quest = {
      ...simple,
      id: 'q.backward',
      steps: [
        simple.steps[0] as QuestStep,
        { ...(simple.steps[2] as QuestStep), after: ['name'] },
        simple.steps[1] as QuestStep,
      ],
    }

    const first = testSession()
    attachQuests(first, [])
    const record = first.spawnRandom('ball-python')
    first.rename(record.individual.id, 'Named')
    first.sell(record.individual.id)

    const offered: string[] = []
    const finished: string[] = []
    const session = new Session({ restore: first.toSaveFile(), gateMode: 'instant' })
    const quests = attachQuests(session, [backward], {
      onQuestCompleted: (quest) => finished.push(quest.id),
      onOffered: (quest) => offered.push(quest.id),
    })

    expect(session.state.flags.get(questStatusFlag('q.backward'))).toBe('done')
    expect(offered).toEqual([])
    expect(finished).toEqual([])
    expect(quests.runtime.view('q.backward')?.retiredSilently).toBe(true)
  })

  it('remembers that a quest was retired across a save round trip', () => {
    // Held in memory this was true for the session that retired the quest and false for every session
    // after it, so "never shown" quietly became "shown from the second launch onwards". The list
    // affordance is the whole point of the flag, and a reload is the ordinary case, not the edge one.
    const first = testSession()
    attachQuests(first, [])
    const record = first.spawnRandom('ball-python')
    first.rename(record.individual.id, 'Named')
    first.sell(record.individual.id)

    const second = new Session({ restore: first.toSaveFile(), gateMode: 'instant' })
    const retiring = attachQuests(second, [simple])
    expect(retiring.runtime.view('q.simple')?.retiredSilently).toBe(true)

    const third = new Session({ restore: second.toSaveFile(), gateMode: 'instant' })
    const reloaded = attachQuests(third, [simple])
    expect(reloaded.runtime.view('q.simple')?.retiredSilently).toBe(true)
    expect(third.state.flags.get(questStatusFlag('q.simple'))).toBe('done')
  })

  it('keeps completing steps for a dismissed quest, so restoring shows honest progress', () => {
    const session = testSession()
    const quests = attachQuests(session, [simple])
    quests.runtime.dismiss('q.simple')

    const record = session.spawnRandom('ball-python')
    session.rename(record.individual.id, 'Named')

    expect(session.state.flags.get(questStepFlag('q.simple', 'name'))).toBe(true)
    expect(quests.runtime.strip()).toBeNull()
    quests.runtime.restore('q.simple')
    expect(quests.runtime.view('q.simple')?.completed).toBe(2)
  })

  it('shows one step at a time on the strip, and nothing at all when turned off', () => {
    const session = testSession()
    const quests = attachQuests(session, [simple])
    expect(quests.runtime.strip()?.stepId).toBe('take')

    session.spawnRandom('ball-python')
    expect(quests.runtime.strip()?.stepId).toBe('name')

    quests.runtime.setEnabled(false)
    expect(quests.runtime.strip()).toBeNull()
    expect(session.state.flags.get(QUEST_FLAGS.off)).toBe(true)
  })

  it('blocks a step behind an unmet `after` without hiding it', () => {
    const ordered: Quest = {
      ...simple,
      id: 'q.ordered',
      steps: [
        { id: 'take', text: 'take one snake in', when: act('snake.acquired') },
        { id: 'name', text: 'name that snake', when: act('snake.named'), after: ['take'] },
        { id: 'sell', text: 'sell one snake', when: act('snake.sold') },
      ],
    }
    const session = testSession()
    const quests = attachQuests(session, [ordered])
    const view = quests.runtime.view('q.ordered')
    expect(view?.steps[1]?.blocked).toBe(true)
    expect(view?.steps[1]?.text).toBe('name that snake')
  })
})

describe('runtime: persistence', () => {
  it('round-trips the journal through a save file and keeps its progress', () => {
    const session = testSession('persist')
    const quests = attachQuests(session, [simple])
    const record = session.spawnRandom('ball-python')
    session.rename(record.individual.id, 'Named')

    const save = session.toSaveFile()
    expect(save.quests?.journal.length).toBeGreaterThan(0)
    expect(JSON.parse(JSON.stringify(save))).toEqual(save)

    const reloaded = new Session({ restore: save, gateMode: 'instant' })
    const revived = attachQuests(reloaded, [simple])
    expect(revived.runtime.observations().length).toBe(quests.runtime.observations().length)
    // The flags came back with the save, so the finished steps are still finished.
    expect(reloaded.state.flags.get(questStepFlag('q.simple', 'name'))).toBe(true)
    // ...and the journal came back too, so a quest offered for the first time after the reload
    // still gets its retroactive credit.
    const late: Quest = { ...simple, id: 'q.late' }
    const lateQuests = attachQuests(reloaded, [late])
    expect(lateQuests.runtime.view('q.late')?.completed).toBe(2)
  })

  it('writes no quest slice when no runtime is attached', () => {
    expect(testSession().toSaveFile().quests).toBeUndefined()
  })
})

describe('runtime: the ui intents reach the journal', () => {
  it('records a deliberate act emitted by a component', () => {
    const session = testSession()
    const quests = attachQuests(session, [simple])
    emitIntent(session.state.bus, 'ui.glossaryTermOpened', { termId: 'het' })
    expect(quests.runtime.observations().some((entry) => entry.act === 'ui.glossaryTermOpened')).toBe(true)
  })
})
