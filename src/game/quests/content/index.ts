/**
 * Serpentine — the shipped quest catalogue.
 *
 * Twenty quests in six chapters, from an empty sanctuary to a player running their own breeding
 * project. **Four steps in the whole arc carry `gates: 'understanding'`**, and the number is a result
 * rather than a budget: §B2's second half says to spend a demonstrative predicate only where something
 * is actually being taught, and `blind.test.ts` then decides which of those spends the game can back.
 *
 * | Gate | Quest | Pattern | Concept |
 * | --- | --- | --- | --- |
 * | `breed-two-plain` | Hidden Parents | P4 | dominant versus recessive |
 * | `same-gene-twice` | Follow One Gene | P2 | what a carrier is |
 * | `prove-the-gene` | Prove It | P3 | proving out |
 * | `predict-the-long-shot` | Two Genes At Once | P1 | the odds, and all of the above at once |
 *
 * §F budgeted seven, one per concept plus the capstone. Three did not survive the blind playthrough,
 * and each says at its own step why it gave the mark up rather than claim what it could not show:
 *
 * - `read-the-square/predict-then-meet` (a second P1) — a through-line an uncomprehending player
 *   produces by clicking. Concept 3 is gated by the capstone instead, so nothing is lost.
 * - `outcross/aim-a-wide-pairing` (P5) — the teaching is a *contrast* and "instead" is not sayable
 *   over two different pairings. **Relatedness is taught and not proven.**
 * - `why-some-eggs-wait/read-the-reason` (P6) — opening a disclosure on a screen already in front of
 *   the player is attention, not comprehension. **Viability is taught and not proven.**
 *
 * The last two are the ones to carry forward: they are not predicates waiting on a field, they are two
 * concepts the arc currently cannot demonstrate it landed. P5 would need an act that records a
 * *rejection*; P6 needs §B3 to concede its own argument.
 *
 * Everything else — selecting, placing, sexing, advancing the clock, hatching, naming, buying,
 * selling — is mechanical and gets the weakest predicate that is honest.
 *
 * These files import `../types` and `./glossary` and nothing else, which is what
 * `contentBoundary.test.ts` asserts and what lets the whole catalogue be written and typechecked
 * before any of the runtime exists.
 */
import type { Chapter, Quest } from '../types'
import { CARRIERS_QUESTS, CHAPTER_CARRIERS } from './carriers'
import { CHAPTER_FIRST_ANIMALS, FIRST_ANIMALS_QUESTS } from './firstAnimals'
import { CHAPTER_LIGHTS, LIGHTS_QUESTS } from './keepingTheLightsOn'
import { CHAPTER_LINES, LINES_QUESTS } from './lines'
import { CHAPTER_TWO_GENES, TWO_GENES_QUESTS } from './twoKindsOfGene'
import { CHAPTER_OWN_PROJECT, OWN_PROJECT_QUESTS } from './yourOwnProject'

export { TEACHABLE_TERMS, GLOSSARY, TEACHABLE_WORDS, isTeachableWord } from './glossary'

export const CHAPTERS: readonly Chapter[] = [
  { id: CHAPTER_FIRST_ANIMALS, label: 'First Animals', order: 1 },
  { id: CHAPTER_LIGHTS, label: 'Keeping The Lights On', order: 2 },
  { id: CHAPTER_TWO_GENES, label: 'Two Kinds Of Gene', order: 3 },
  { id: CHAPTER_CARRIERS, label: 'Carriers', order: 4 },
  { id: CHAPTER_LINES, label: 'Lines', order: 5 },
  { id: CHAPTER_OWN_PROJECT, label: 'Your Own Project', order: 6 },
]

/** Every quest, in arc order. The runtime's only entry point into content. */
export const ALL_QUESTS: readonly Quest[] = [
  ...FIRST_ANIMALS_QUESTS,
  ...LIGHTS_QUESTS,
  ...TWO_GENES_QUESTS,
  ...CARRIERS_QUESTS,
  ...LINES_QUESTS,
  ...OWN_PROJECT_QUESTS,
]

/**
 * The name `shipped.ts` looks for when it loads this directory.
 *
 * An alias rather than a rename: `ALL_QUESTS` is what reads correctly at a call site inside the
 * content, and `QUESTS` is the name the loader on the other side of the seam asks for. Without it
 * the loader's `quests.QUESTS ?? quests.default ?? []` silently yields an empty arc, and the witness
 * and blind instruments pass over nothing — the exact failure `shipped.ts` says it wants to avoid.
 */
export const QUESTS: readonly Quest[] = ALL_QUESTS

export const QUESTS_BY_ID: ReadonlyMap<string, Quest> = new Map(
  ALL_QUESTS.map((quest) => [quest.id, quest]),
)

export function questsInChapter(chapter: string): readonly Quest[] {
  return ALL_QUESTS.filter((quest) => quest.chapter === chapter)
}
