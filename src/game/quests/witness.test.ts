/**
 * Serpentine — quests: the witness.
 *
 * > *A predicate with no witness does not ship. Unfalsifiability is not a risk you reason about; it
 * > is a test you run.* — `docs/quest-design.md` §B4
 *
 * The file has to answer one question — **can every shipped step actually fire?** — and that question
 * has two halves that are easy to confuse and fatal to conflate:
 *
 * 1. **Is the predicate satisfiable at all?** A signal whose constraints contradict each other can
 *    never complete, and would look exactly like a player who has not got round to it yet.
 * 2. **Can the game produce the acts it asks for?** A perfectly satisfiable predicate over an act
 *    nothing emits is just as dead, and looks the same from the outside.
 *
 * Both halves are here. The first is the synthesiser in `witness.ts`; the second is a scripted
 * `Session` run through the real bus and the real recorder, with an explicit ledger of every act that
 * did *not* turn up and why. The ledger is asserted for equality rather than containment, so wiring
 * an emit without striking its entry fails, and striking an entry without wiring the emit fails.
 */
import { describe, expect, it } from 'vitest'
import { Session } from '../session'
import { ALL_ACTS, ONE_TIME_ACTS } from './acts'
import { evaluateSignal } from './evaluate'
import { createRecorder, PENDING_UI_EMITS } from './observe'
import { gameOnlyRun } from './playthrough'
import { questWorldOf } from './attach'
import { loadForInstruments } from './shipped'
import { crossReferenceKeyMisuses, strengthOf, stepObeysAntiAccidentRule } from './types'
import type { ActKind, Quest, QuestStep } from './types'
import { witnessFor } from './witness'

const catalogue = await loadForInstruments()

function everyStep(quests: readonly Quest[]): readonly { quest: Quest; step: QuestStep }[] {
  return quests.flatMap((quest) => quest.steps.map((step) => ({ quest, step })))
}

const steps = everyStep(catalogue.quests)

describe('witness: every step can fire', () => {
  it('has quests to check', () => {
    // Not ceremony. A suite that passes over an empty catalogue proves nothing, and the reference
    // patterns exist precisely so this cannot happen while `content/` is still being written.
    expect(steps.length).toBeGreaterThan(0)
  })

  for (const { quest, step } of steps) {
    it(`${quest.id}/${step.id} completes on a history that should complete it`, () => {
      const progress = evaluateSignal(step.when, witnessFor(step.when))
      expect(
        progress.done,
        `no history satisfies this step — it can never fire. ` +
          `Best the synthesiser managed: ${progress.satisfied} of ${progress.total} ` +
          `(${progress.parts.map((part) => `${part.label}:${part.done ? 'ok' : 'missing'}`).join(', ')})`,
      ).toBe(true)
    })
  }
})

describe('witness: the anti-accident rule holds over the catalogue', () => {
  for (const { quest, step } of steps) {
    if (step.gates !== 'understanding') continue

    it(`${quest.id}/${step.id} is demonstrative and names its pattern`, () => {
      expect(
        stepObeysAntiAccidentRule(step),
        `marked gates:'understanding' but its signal is ${strengthOf(step.when)}` +
          `${step.pattern ? '' : ' and it names no pattern'}`,
      ).toBe(true)
    })

    it(`${quest.id}/${step.id} uses no time window`, () => {
      // §B5: windows are the classic cause of a predicate that never fires, and the tutorial arc
      // must not use one. A future mechanic that genuinely needs adjacency needs a written reason.
      const windows = JSON.stringify(step.when).includes('"within"')
      expect(windows, 'a demonstrative step must not carry a `within` window').toBe(false)
    })

    it(`${quest.id}/${step.id} uses cross-reference keys only as cross-references`, () => {
      // `offspring` reads `individualId`, the same field `individual` reads, so in a group `bind` it
      // is a silent synonym at best and an unsatisfiable contradiction at worst. Either way the
      // group stops meaning what it looks like it means, which is the failure this key was added to
      // fix rather than to cause.
      const misuses = crossReferenceKeyMisuses(step.when)
      expect(misuses, `${misuses.join('; ')}`).toEqual([])
    })

    it(`${quest.id}/${step.id} depends on no one-time act`, () => {
      // §B5: every act a demonstrative signal references must be repeatable from any reachable
      // state, so a player who missed it can always go and do it.
      const used = ALL_ACTS.filter((act) => JSON.stringify(step.when).includes(`"${act}"`))
      const oneTime = used.filter((act) => ONE_TIME_ACTS.has(act))
      expect(oneTime, `depends on ${oneTime.join(', ')}, which cannot be performed again`).toEqual([])
    })
  }
})

/**
 * Acts a scripted `Session` run cannot produce today, and why.
 *
 * Everything here is either a `ui.*` intent the UI has not been wired for yet (all eleven, listed
 * once in {@link PENDING_UI_EMITS} rather than twice here) or a game-layer act with a documented
 * reason. The assertion below is an equality, so this ledger cannot rot: the day someone emits
 * `trait.discovered`, this test fails until the line comes out.
 */
const NO_EMITTER_YET: Readonly<Partial<Record<ActKind, string>>> = {
  'pairing.introduced':
    'Emitted, but deliberately not journalled — `pairing.committed` says the same thing with a ' +
    'pairing id and the two judgement fields. See observe.ts NOT_RECORDED.',
  'snake.bought':
    'market.ts emits it; nothing on Session buys. Reachable only through Market.tsx, so it arrives ' +
    'with the UI wiring.',
  'trait.discovered': 'Declared in breeding.ts and emitted by nothing. Pre-existing gap, not a quest one.',
  'allele.discovered': 'Declared in seams.ts and emitted by nothing. Pre-existing gap, not a quest one.',
  'egg.notViable':
    'Needs a clutch carrying a lethal genotype, which is a designed cross rather than a scripted ' +
    'one. The recorder path is exercised directly in the runtime test.',
  'genetics.proven':
    'Needs a real test cross to settle a locus that was open at commit time — session.ts now emits ' +
    'it (sweepProven), but making one land takes a designed pairing rather than a script.',
  'pairing.lapsed': 'Needs one of a pair to leave the collection mid-gate.',
  // `snake.unhoused` was here, and came off when `gameOnlyRun` started unhousing the animal it
  // places. The ledger being an equality is what caught it: an entry that stops being true is a
  // failure, not a stale comment nobody reads.
}

describe('witness: every act has an emitter, or a written reason it does not yet', () => {
  const session = new Session({ worldSeed: 'witness', gateMode: 'instant' })
  const seen = new Set<ActKind>()
  const recorder = createRecorder(questWorldOf(session))
  recorder.attach(session.state.bus, (act) => {
    seen.add(act)
  })
  gameOnlyRun(session)

  it('records something', () => {
    expect(seen.size).toBeGreaterThan(8)
  })

  it('accounts for every act in the catalogue', () => {
    const missing = ALL_ACTS.filter((act) => !seen.has(act)).sort()
    const accounted = [
      ...Object.keys(PENDING_UI_EMITS),
      ...Object.keys(NO_EMITTER_YET),
    ].sort() as ActKind[]
    expect(
      missing,
      'an act with no emitter and no entry in PENDING_UI_EMITS or NO_EMITTER_YET is a dead ' +
        'predicate waiting to happen — wire it, or write down why it is not wired',
    ).toEqual(accounted)
  })

  it('claims nothing is pending that the game already emits', () => {
    const lying = Object.keys(PENDING_UI_EMITS).filter((act) => seen.has(act as ActKind))
    expect(lying, 'PENDING_UI_EMITS lists an act that already arrives').toEqual([])
  })
})
