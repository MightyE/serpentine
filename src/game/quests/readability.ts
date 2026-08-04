/**
 * Serpentine — quests: the reading-level checker.
 *
 * 7th grade, and nothing above thirty seconds of reading. `readability.test.ts` runs every check
 * here over the shipped catalogue, so the content agent gets told *which step is over budget* by
 * `npm test` rather than by a reviewer's opinion.
 *
 * ## Why a word list does the work and the grade score is only a backstop
 *
 * Check 4 — **any word over three syllables must be a term the game teaches** — is the mechanism
 * that actually holds the reading level. It converts "keep it simple" into "you may only use a hard
 * word the game explicitly explains", which is a rule a writer can obey without judgement and a test
 * can check exactly. `recessive`, `heterozygous` and `incubation` are on the list because they *are*
 * the curriculum; `subsequently` is not, and never will be.
 *
 * Flesch–Kincaid comes last and catches what the word rule cannot: a sentence made entirely of short
 * words can still be long and tangled. It is coarse, its syllable count is a heuristic, and it is
 * cheap enough to run on every quest on every test run — that combination is exactly what a backstop
 * should be, and none of these numbers is worth arguing about to a decimal place.
 *
 * The arguable checks are 4, 5 and 6, and the argument has a price: a word added to the glossary
 * with a gloss of twelve words or fewer. That is the right cost, and it is why the glossary is
 * content rather than code.
 */
import {
  FORBIDDEN_STEP_CHARS,
  IMPERATIVE_VERBS,
  LIMITS,
} from './types'
import type { GlossaryEntry, Quest, QuestSignal } from './types'

export interface ReadabilityProblem {
  readonly questId: string
  readonly stepId?: string
  readonly field: string
  readonly rule: string
  readonly message: string
}

// ---------------------------------------------------------------------------
// Counting
// ---------------------------------------------------------------------------

/** Words, for the budget. Hyphenated compounds count once, which is how a reader meets them. */
export function wordsOf(text: string): readonly string[] {
  return text
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z0-9'’-]/g, ''))
    .filter((word) => word.length > 0)
}

/**
 * Syllables, by the documented heuristic: vowel groups, minus a silent trailing `e`, minimum one.
 *
 * Wrong on `queue`, `fire` and every other word English keeps for itself. It does not need to be
 * right — it feeds a backstop, and being *consistently* slightly high is a safe direction for a
 * limit whose job is to catch the genuinely long word.
 */
export function syllablesOf(word: string): number {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '')
  if (clean.length === 0) return 0
  const groups = clean.match(/[aeiouy]+/g) ?? []
  let count = groups.length
  if (clean.endsWith('e') && !clean.endsWith('le') && count > 1) count -= 1
  return Math.max(1, count)
}

/**
 * Flesch–Kincaid grade level, standard formula.
 *
 * Every field is one sentence — a step is forbidden a comma, let alone a full stop — so the sentence
 * count is the number of non-empty fields rather than a count of periods.
 */
export function fleschKincaid(fields: readonly string[]): number {
  const sentences = fields.filter((field) => field.trim().length > 0).length
  if (sentences === 0) return 0
  const words = fields.flatMap((field) => wordsOf(field))
  if (words.length === 0) return 0
  const syllables = words.reduce((sum, word) => sum + syllablesOf(word), 0)
  return 0.39 * (words.length / sentences) + 11.8 * (syllables / words.length) - 15.59
}

// ---------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------

function labelsIn(signal: QuestSignal): readonly string[] {
  const out: string[] = []
  const walk = (node: QuestSignal): void => {
    if ('label' in node && node.label) out.push(node.label)
    if (node.kind === 'bundle' || node.kind === 'sequence' || node.kind === 'all' || node.kind === 'any') {
      for (const child of node.of) walk(child)
    }
  }
  walk(signal)
  return out
}

/** A canonical form of a signal, for check 7. Key order is normalised so two literals compare equal. */
export function signalKey(signal: QuestSignal): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical)
    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== 'label')
        .sort(([a], [b]) => a.localeCompare(b))
      return entries.map(([key, child]) => [key, canonical(child)])
    }
    return value
  }
  return JSON.stringify(canonical(signal))
}

export function checkQuest(
  quest: Quest,
  glossary: readonly GlossaryEntry[],
): readonly ReadabilityProblem[] {
  const problems: ReadabilityProblem[] = []
  const terms = new Set(glossary.map((entry) => entry.term.toLowerCase()))
  const add = (
    field: string,
    rule: string,
    message: string,
    stepId?: string,
  ): void => {
    problems.push({ questId: quest.id, stepId, field, rule, message })
  }

  const budget = (
    field: string,
    text: string,
    maxWords: number,
    maxChars: number,
    stepId?: string,
  ): void => {
    const count = wordsOf(text).length
    if (count > maxWords) add(field, 'counts', `${count} words, limit ${maxWords}: "${text}"`, stepId)
    if (text.length > maxChars) {
      add(field, 'counts', `${text.length} characters, limit ${maxChars}: "${text}"`, stepId)
    }
  }

  // 1. Counts.
  budget('title', quest.title, LIMITS.titleWords, LIMITS.titleChars)
  budget('intent', quest.intent, LIMITS.intentWords, LIMITS.intentChars)
  if (quest.steps.length > LIMITS.stepsPerQuest) {
    add('steps', 'counts', `${quest.steps.length} steps, limit ${LIMITS.stepsPerQuest}`)
  }
  if (quest.steps.length < 3) {
    add('steps', 'counts', `${quest.steps.length} steps, a quest is three to five`)
  }

  const allText: string[] = [quest.title, quest.intent]

  for (const step of quest.steps) {
    allText.push(step.text)
    if (step.hint) allText.push(step.hint)
    budget('text', step.text, LIMITS.stepWords, LIMITS.stepChars, step.id)
    if (step.hint) budget('hint', step.hint, LIMITS.hintWords, LIMITS.hintChars, step.id)
    for (const label of labelsIn(step.when)) {
      budget('label', label, LIMITS.labelWords, LIMITS.labelChars, step.id)
    }

    // 2. Imperative form.
    const first = (wordsOf(step.text)[0] ?? '').toLowerCase()
    if (!IMPERATIVE_VERBS.has(first)) {
      add(
        'text',
        'imperative',
        `starts with "${first}", which is not in IMPERATIVE_VERBS — a step is an instruction`,
        step.id,
      )
    }

    // 3. Punctuation.
    for (const char of FORBIDDEN_STEP_CHARS) {
      if (step.text.includes(char)) {
        add('text', 'punctuation', `contains "${char}" — a step that needs a clause is two steps`, step.id)
      }
    }
    if (step.text.trimEnd().endsWith('.')) {
      add('text', 'punctuation', 'ends with a full stop — a step is a line, not a sentence', step.id)
    }
  }

  // 7. No duplicate signals. Two steps with the same predicate present as a step that ticks itself.
  const seen = new Map<string, string>()
  for (const step of quest.steps) {
    const key = signalKey(step.when)
    const twin = seen.get(key)
    if (twin) add('when', 'duplicate', `has the same signal as step "${twin}"`, step.id)
    else seen.set(key, step.id)
  }

  // 4. Hard words are only teachable words.
  for (const text of allText) {
    for (const word of wordsOf(text)) {
      if (syllablesOf(word) <= LIMITS.maxSyllables) continue
      if (terms.has(word.toLowerCase())) continue
      add(
        'text',
        'hardWord',
        `"${word}" is ${syllablesOf(word)} syllables and is not a glossary term — ` +
          'either simplify it or add it with a gloss',
      )
    }
  }

  // 5. Every teachable term used has a gloss, and the gloss is short enough to read in passing.
  const used = new Set(allText.flatMap((text) => wordsOf(text)).map((word) => word.toLowerCase()))
  for (const entry of glossary) {
    if (!used.has(entry.term.toLowerCase())) continue
    const count = wordsOf(entry.gloss).length
    if (count === 0) add('glossary', 'gloss', `"${entry.term}" has no gloss`)
    else if (count > LIMITS.glossWords) {
      add('glossary', 'gloss', `"${entry.term}" gloss is ${count} words, limit ${LIMITS.glossWords}`)
    }
  }

  // 1 (whole-quest budget) and 6 (the backstop).
  const total = allText.reduce((sum, text) => sum + wordsOf(text).length, 0)
  if (total > LIMITS.questWords) {
    add('quest', 'counts', `${total} words in all, limit ${LIMITS.questWords} — the 30-second budget`)
  }
  const grade = fleschKincaid(allText)
  if (grade > LIMITS.fkGrade) {
    add('quest', 'grade', `Flesch–Kincaid grade ${grade.toFixed(1)}, limit ${LIMITS.fkGrade}`)
  }

  return problems
}

export function checkCatalogue(
  quests: readonly Quest[],
  glossary: readonly GlossaryEntry[],
): readonly ReadabilityProblem[] {
  return quests.flatMap((quest) => checkQuest(quest, glossary))
}

/** One line per problem, for a test failure message that says what to change. */
export function describeProblems(problems: readonly ReadabilityProblem[]): string {
  return problems
    .map((problem) => {
      const where = problem.stepId ? `${problem.questId}/${problem.stepId}` : problem.questId
      return `  ${where} [${problem.rule}] ${problem.field}: ${problem.message}`
    })
    .join('\n')
}
