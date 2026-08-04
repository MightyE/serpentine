/**
 * Serpentine — quests: the glossary.
 *
 * Every word longer than {@link LIMITS.maxSyllables} syllables that quest text is allowed to use
 * lives here with a gloss of twelve words or fewer. That is the mechanism that actually enforces the
 * reading level (`docs/quest-design.md` §D2, check 4): "keep it simple" is unenforceable, but "you
 * may only use a hard word the game explicitly explains" is a test.
 *
 * The list is wider than the strict requirement on purpose. A term is here if it is *curriculum* —
 * the words a player has to own to read a notebook — not only if some step happens to use it today.
 * The quest list browses this, and `ui.glossaryTermOpened` fires with a {@link GlossaryEntry.term}
 * as its `termId`, which is why the terms a step points at are single words.
 *
 * Imports nothing but `../types`. See `docs/quest-design.md` §E3.
 */
import type { GlossaryEntry } from '../types'

/**
 * The hard words quest text may use.
 *
 * Ordered as a curriculum rather than alphabetically: a player reading the list top to bottom meets
 * each idea after the one it depends on.
 */
export const TEACHABLE_TERMS: readonly GlossaryEntry[] = [
  {
    term: 'gene',
    gloss: 'A spot in a snake that sets one trait.',
  },
  {
    term: 'morph',
    gloss: 'The look a snake gets from the genes it has.',
  },
  {
    term: 'dominant',
    gloss: 'A gene that shows even when a snake has one copy.',
    concept: 'expression',
  },
  {
    term: 'recessive',
    gloss: 'A gene that only shows when a snake has two copies.',
    concept: 'expression',
  },
  {
    term: 'het',
    gloss: 'A snake that carries a hidden gene without showing it.',
    concept: 'carriers',
  },
  {
    term: 'carrier',
    gloss: 'Another word for a het. It holds a gene it hides.',
    concept: 'carriers',
  },
  {
    term: 'heterozygous',
    gloss: 'Two different copies of one gene. The long word for het.',
    concept: 'carriers',
  },
  {
    term: 'homozygous',
    gloss: 'Two matching copies of one gene.',
    concept: 'carriers',
  },
  {
    term: 'genotype',
    gloss: 'Every gene a snake carries even the hidden ones.',
  },
  {
    term: 'phenotype',
    gloss: 'What a snake looks like on the outside.',
  },
  {
    term: 'Punnett',
    gloss: 'A grid showing the odds for each kind of baby.',
    concept: 'odds',
  },
  {
    term: 'proven',
    gloss: 'Known for sure because a test breeding showed it.',
    concept: 'provingOut',
  },
  {
    term: 'clutch',
    gloss: 'All the eggs one pairing lays at the same time.',
  },
  {
    term: 'incubation',
    gloss: 'The weeks a clutch sits before the eggs hatch.',
  },
  {
    term: 'viable',
    gloss: 'An egg that can hatch. Some gene pairs stop that.',
    concept: 'viability',
  },
  {
    term: 'pedigree',
    gloss: 'The family tree of one snake.',
    concept: 'relatedness',
  },
  {
    term: 'relatedness',
    gloss: 'How much family two snakes share. Zero means none at all.',
    concept: 'relatedness',
  },
  {
    term: 'inbreeding',
    gloss: 'Breeding two snakes that share close family.',
    concept: 'relatedness',
  },
  {
    term: 'outcross',
    gloss: 'Breeding two snakes from lines that share no family.',
    concept: 'relatedness',
  },
]

/** Lookup by `termId`, which is the {@link GlossaryEntry.term} itself, lowercased. */
export const GLOSSARY: ReadonlyMap<string, GlossaryEntry> = new Map(
  TEACHABLE_TERMS.map((entry) => [entry.term.toLowerCase(), entry]),
)

/**
 * Every individual word covered by a glossary entry, lowercased.
 *
 * The readability check tests one word of quest text at a time, so a multi-word term has to be
 * reachable a word at a time too.
 */
export const TEACHABLE_WORDS: ReadonlySet<string> = new Set(
  TEACHABLE_TERMS.flatMap((entry) => entry.term.toLowerCase().split(/\s+/)),
)

/** True when a hard word is one the game explicitly teaches. */
export function isTeachableWord(word: string): boolean {
  return TEACHABLE_WORDS.has(word.toLowerCase())
}
