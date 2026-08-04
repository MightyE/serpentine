/**
 * The shipped quest catalogue, checked as content.
 *
 * Two jobs. It runs the reading-level checker (`../readability.ts`, `docs/quest-design.md` §D2) over
 * every quest, so an over-budget step fails a test rather than a review. And it asserts the structural
 * rules a *writer* can break — the anti-accident rule, `after` pointing at a real step, one pattern
 * per gate, no id collisions — which are the ones no type can catch.
 *
 * It does not test the runtime. `witness.test.ts` proves each demonstrative predicate can fire and
 * `blind.test.ts` proves it does not fire by accident; both live with the evaluator, because both need
 * a `Session`.
 */
import { describe, expect, it } from 'vitest'

import { checkCatalogue, describeProblems } from '../readability'
import {
  LIMITS,
  stepObeysAntiAccidentRule,
  strengthOf,
  type ConceptId,
  type PatternId,
} from '../types'
import { ALL_QUESTS, CHAPTERS, TEACHABLE_TERMS } from './index'

const GATED = ALL_QUESTS.flatMap((quest) =>
  quest.steps.filter((step) => step.gates === 'understanding').map((step) => ({ quest, step })),
)

describe('reading level', () => {
  it('every quest is inside the budget', () => {
    const problems = checkCatalogue(ALL_QUESTS, TEACHABLE_TERMS)
    expect(problems.length === 0 ? '' : `\n${describeProblems(problems)}\n`).toBe('')
  })
})

describe('the anti-accident rule', () => {
  it('every step that gates understanding is demonstrative and names a pattern', () => {
    for (const { quest, step } of GATED) {
      expect(stepObeysAntiAccidentRule(step), `${quest.id}/${step.id}`).toBe(true)
      expect(strengthOf(step.when), `${quest.id}/${step.id}`).toBe('demonstrative')
    }
  })

  it('gates the four patterns the blind playthrough can back, once each', () => {
    const patterns = new Set<PatternId>(GATED.map(({ step }) => step.pattern!))
    // Four, not the seven §F budgeted for, and the missing three are a finding rather than a
    // shortfall — each is written up at its own step, and `blind.test.ts` is what settled it:
    //
    //   `read-the-square/predict-then-meet` (P1)  — a second P1 with no probability judgement;
    //       the blind run completes its through-line on 17 of 106 runs even with the phenotype
    //       bind that rescued the capstone. Concept 3 is gated by the capstone instead.
    //   `outcross/aim-a-wide-pairing` (P5)        — the contrast is not expressible over two
    //       different pairings. Relatedness is taught and not proven.
    //   `why-some-eggs-wait/read-the-reason` (P6) — one click on an open screen. Viability is
    //       taught and not proven.
    //
    // This number goes up when the act catalogue can say "instead" (P5) or when §B3 concedes that
    // reading a disclosure is attention rather than comprehension (P6). It must never go up because
    // a predicate was relaxed until the blind run stopped noticing.
    expect([...patterns].sort()).toEqual(['P1', 'P2', 'P3', 'P4'])
    expect(GATED).toHaveLength(4)
    expect(GATED.map(({ step }) => step.pattern)).toHaveLength(new Set(GATED).size)

    const taught = new Set<ConceptId>(ALL_QUESTS.flatMap((quest) => quest.teaches ?? []))
    expect([...taught].sort()).toEqual([
      'carriers',
      'expression',
      'odds',
      'provingOut',
      'relatedness',
      'viability',
    ])
  })

  it('marks nothing as gating that a state read could satisfy', () => {
    // The forbidden pattern in §B3: a concept step whose evidence is a roster or tally read.
    for (const { quest, step } of GATED) {
      const kind = step.when.kind
      expect(
        ['flagAtLeast', 'flagIsTrue', 'rosterHas'].includes(kind),
        `${quest.id}/${step.id} is a state read`,
      ).toBe(false)
    }
  })

  it('never puts a time window on a gate', () => {
    // §B5: `within` is the classic cause of a step that never fires. The tutorial must not use it.
    const json = JSON.stringify(ALL_QUESTS)
    expect(json).not.toContain('"within"')
  })
})

describe('structure', () => {
  it('has unique quest ids and unique offer orders', () => {
    const ids = ALL_QUESTS.map((quest) => quest.id)
    expect(new Set(ids).size).toBe(ids.length)
    const orders = ALL_QUESTS.map((quest) => quest.offer.order)
    expect(new Set(orders).size).toBe(orders.length)
  })

  it('has unique step ids within each quest', () => {
    for (const quest of ALL_QUESTS) {
      const ids = quest.steps.map((step) => step.id)
      expect(new Set(ids).size, quest.id).toBe(ids.length)
    }
  })

  it('only ever points `after` at a real earlier step', () => {
    for (const quest of ALL_QUESTS) {
      const seen = new Set<string>()
      for (const step of quest.steps) {
        for (const dependency of step.after ?? []) {
          // Earlier in the array as well as present: a forward or circular `after` is a step that
          // renders dimmed forever.
          expect(seen.has(dependency), `${quest.id}/${step.id} -> ${dependency}`).toBe(true)
        }
        seen.add(step.id)
      }
    }
  })

  it('names a chapter that exists, and every chapter has quests', () => {
    const chapters = new Set(CHAPTERS.map((chapter) => chapter.id))
    for (const quest of ALL_QUESTS) {
      expect(chapters.has(quest.chapter), quest.id).toBe(true)
    }
    for (const chapter of CHAPTERS) {
      expect(
        ALL_QUESTS.some((quest) => quest.chapter === chapter.id),
        chapter.id,
      ).toBe(true)
    }
  })

  it('runs three to five steps per quest', () => {
    for (const quest of ALL_QUESTS) {
      expect(quest.steps.length, quest.id).toBeGreaterThanOrEqual(3)
      expect(quest.steps.length, quest.id).toBeLessThanOrEqual(LIMITS.stepsPerQuest)
    }
  })

  it('offers the arc in order', () => {
    const orders = ALL_QUESTS.map((quest) => quest.offer.order)
    expect(orders).toEqual([...orders].sort((a, b) => a - b))
  })
})

describe('the glossary', () => {
  it('glosses every term in twelve words or fewer', () => {
    for (const entry of TEACHABLE_TERMS) {
      const words = entry.gloss.trim().split(/\s+/).filter(Boolean)
      expect(words.length, entry.term).toBeGreaterThan(0)
      expect(words.length, entry.term).toBeLessThanOrEqual(LIMITS.glossWords)
    }
  })

  it('has a term for every `termId` a step points at', () => {
    const terms = new Set(TEACHABLE_TERMS.map((entry) => entry.term.toLowerCase()))
    const pointed = [...JSON.stringify(ALL_QUESTS).matchAll(/"field":"termId","op":"eq","value":"([^"]+)"/g)]
    // Guard against the regex silently matching nothing if the filter shape ever changes.
    expect(pointed.length).toBeGreaterThan(0)
    for (const [, termId] of pointed) {
      expect(terms.has(termId.toLowerCase()), termId).toBe(true)
    }
  })

  it('has unique terms', () => {
    const terms = TEACHABLE_TERMS.map((entry) => entry.term.toLowerCase())
    expect(new Set(terms).size).toBe(terms.length)
  })
})
