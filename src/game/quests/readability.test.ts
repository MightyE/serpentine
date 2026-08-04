/**
 * Serpentine — quests: reading level, enforced.
 *
 * 7th grade, and nothing above thirty seconds of reading. The content agent runs `npm test` and is
 * told exactly which step is over budget, which is the whole point: every check in `docs/quest-
 * design.md` §D2 is mechanical, so none of this is a matter of a reviewer's taste.
 *
 * The checker itself is tested first, against text written to fail each rule. A checker that has
 * never been shown to reject anything is a checker nobody should trust — and the failure mode of a
 * silently-passing style test is that a year of prose drifts past it.
 */
import { describe, expect, it } from 'vitest'
import { checkCatalogue, checkQuest, describeProblems, fleschKincaid, signalKey, syllablesOf, wordsOf } from './readability'
import { loadForInstruments } from './shipped'
import { act, count } from './types'
import type { GlossaryEntry, Quest } from './types'

const catalogue = await loadForInstruments()

const GLOSSARY: readonly GlossaryEntry[] = [
  { term: 'recessive', gloss: 'A gene that only shows when both copies match.' },
]

function quest(overrides: Partial<Quest> = {}): Quest {
  return {
    id: 'test',
    chapter: 'test',
    title: 'A Short Title',
    intent: 'Learn one thing about your snakes',
    offer: { order: 1 },
    steps: [
      { id: 'a', text: 'buy a snake', when: act('snake.bought') },
      { id: 'b', text: 'name that snake', when: act('snake.named') },
      { id: 'c', text: 'sell one snake', when: act('snake.sold') },
    ],
    ...overrides,
  }
}

describe('readability: the counters', () => {
  it('counts words without counting punctuation', () => {
    expect(wordsOf("open the snake's card")).toHaveLength(4)
    expect(wordsOf('  ')).toHaveLength(0)
  })

  it('counts syllables by vowel groups, silent trailing e, minimum one', () => {
    expect(syllablesOf('snake')).toBe(1)
    expect(syllablesOf('recessive')).toBe(3)
    expect(syllablesOf('relatedness')).toBe(4)
    expect(syllablesOf('a')).toBe(1)
  })

  it('scores plain instructions below 7th grade', () => {
    expect(fleschKincaid(['buy a snake', 'name that snake'])).toBeLessThan(7)
  })

  it('treats two spellings of the same signal as the same signal', () => {
    expect(signalKey(act('snake.sold', undefined, 'one'))).toBe(signalKey(act('snake.sold', undefined, 'two')))
    expect(signalKey(act('snake.sold'))).not.toBe(signalKey(count('snake.sold', 2)))
  })
})

describe('readability: the checker rejects what it should', () => {
  const rules = (problems: readonly { rule: string }[]) => problems.map((problem) => problem.rule)

  it('passes clean content', () => {
    expect(checkQuest(quest(), GLOSSARY)).toEqual([])
  })

  it('catches a step that is not an instruction', () => {
    const bad = quest({
      steps: [
        { id: 'a', text: 'the corn snake needs a habitat', when: act('snake.placed') },
        { id: 'b', text: 'name that snake', when: act('snake.named') },
        { id: 'c', text: 'sell one snake', when: act('snake.sold') },
      ],
    })
    expect(rules(checkQuest(bad, GLOSSARY))).toContain('imperative')
  })

  it('catches a clause, and a full stop', () => {
    const bad = quest({
      steps: [
        { id: 'a', text: 'buy a snake, then name it.', when: act('snake.bought') },
        { id: 'b', text: 'name that snake', when: act('snake.named') },
        { id: 'c', text: 'sell one snake', when: act('snake.sold') },
      ],
    })
    expect(rules(checkQuest(bad, GLOSSARY))).toContain('punctuation')
  })

  it('catches a hard word the game does not teach', () => {
    const bad = quest({ intent: 'Subsequently examine the animal' })
    expect(rules(checkQuest(bad, GLOSSARY))).toContain('hardWord')
  })

  it('allows a hard word the game does teach', () => {
    const fine = quest({ intent: 'Find a recessive gene in your snakes' })
    expect(checkQuest(fine, GLOSSARY)).toEqual([])
  })

  it('catches a gloss that is itself too long to read', () => {
    const wordy: readonly GlossaryEntry[] = [
      {
        term: 'recessive',
        gloss: 'A gene that only shows itself when an animal happens to carry two copies of it',
      },
    ]
    const problems = checkQuest(quest({ intent: 'Find a recessive gene' }), wordy)
    expect(rules(problems)).toContain('gloss')
  })

  it('catches a step over the word budget', () => {
    const bad = quest({
      steps: [
        {
          id: 'a',
          text: 'buy a snake and then name it and then sell it again',
          when: act('snake.bought'),
        },
        { id: 'b', text: 'name that snake', when: act('snake.named') },
        { id: 'c', text: 'sell one snake', when: act('snake.sold') },
      ],
    })
    expect(rules(checkQuest(bad, GLOSSARY))).toContain('counts')
  })

  it('catches two steps with the same signal', () => {
    const bad = quest({
      steps: [
        { id: 'a', text: 'buy a snake', when: act('snake.bought') },
        { id: 'b', text: 'buy one more snake', when: act('snake.bought') },
        { id: 'c', text: 'sell one snake', when: act('snake.sold') },
      ],
    })
    expect(rules(checkQuest(bad, GLOSSARY))).toContain('duplicate')
  })
})

describe('readability: the shipped catalogue', () => {
  it('is within budget, everywhere', () => {
    const problems = checkCatalogue(catalogue.quests, catalogue.glossary)
    expect(problems.length, `\n${describeProblems(problems)}\n`).toBe(0)
  })
})
