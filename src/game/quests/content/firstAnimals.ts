/**
 * Chapter 1 — First Animals. The mechanics, nothing genetic.
 *
 * Five quests that get a player from an empty sanctuary to a hatchling in their hand. **No step here
 * gates understanding**, and that is the design rather than an omission: selecting, placing, sexing,
 * advancing the clock and hatching are mechanical, and `docs/quest-design.md` §B2 is explicit that a
 * demonstrative predicate spent on "put a snake in a habitat" is friction unavailable later where
 * something is actually being taught.
 *
 * Note what is deliberately *not* ordered. "Place a male" and "Place a female" carry no `after`,
 * because either can come first — §A2 uses this exact pair as its worked example of the rule that
 * `after` is for causality and never for reading order.
 */
import {
  act,
  count,
  eq,
  type Quest,
} from '../types'

export const CHAPTER_FIRST_ANIMALS = 'first-animals'

const yourFirstSnake: Quest = {
  id: 'first-snake',
  chapter: CHAPTER_FIRST_ANIMALS,
  title: 'Your First Snake',
  intent: 'Take in one snake and give it a name.',
  offer: { order: 1 },
  steps: [
    {
      id: 'choose-species',
      text: 'Pick a species you like',
      when: act('species.chosen'),
    },
    {
      id: 'take-in',
      text: 'Take one snake into your care',
      when: act('snake.acquired'),
      hint: 'The store sells snakes and the spawn control makes them.',
    },
    {
      id: 'open-card',
      text: 'Open your new snake card',
      when: act('ui.cardOpened'),
      // Causal: there is no card to open until an animal exists.
      after: ['take-in'],
    },
    {
      id: 'name-it',
      text: 'Give your snake a name',
      when: act('snake.named'),
      after: ['take-in'],
    },
  ],
}

const aPlaceToLive: Quest = {
  id: 'a-place-to-live',
  chapter: CHAPTER_FIRST_ANIMALS,
  title: 'A Place To Live',
  intent: 'Open a habitat and move a snake in and out.',
  offer: { order: 2, when: act('snake.acquired') },
  steps: [
    {
      id: 'open-habitat',
      text: 'Open a habitat',
      when: act('ui.habitatOpened'),
    },
    {
      id: 'place-one',
      text: 'Put a snake in a habitat',
      when: act('snake.placed'),
      hint: 'Habitats sit on the main screen.',
    },
    {
      id: 'move-one-out',
      text: 'Move a snake back out again',
      when: act('snake.unhoused'),
    },
  ],
}

const aPair: Quest = {
  id: 'a-pair',
  chapter: CHAPTER_FIRST_ANIMALS,
  title: 'A Pair',
  intent: 'Keep a male and a female of one species.',
  offer: { order: 3, when: act('snake.placed') },
  steps: [
    // No `after` between these two on purpose. Either sex can go in first.
    {
      id: 'place-male',
      text: 'Place a male in a habitat',
      when: act('snake.placed', [eq('sex', 'male')]),
    },
    {
      id: 'place-female',
      text: 'Place a female in a habitat',
      when: act('snake.placed', [eq('sex', 'female')]),
    },
    {
      id: 'wait-for-adult',
      text: 'Wait for a snake to grow up',
      when: act('snake.matured'),
      hint: 'Growing up takes many turns. The card shows how many.',
    },
    {
      id: 'introduce',
      text: 'Bring two adults together as a pair',
      when: act('pairing.introduced'),
    },
  ],
}

const letTimePass: Quest = {
  id: 'let-time-pass',
  chapter: CHAPTER_FIRST_ANIMALS,
  title: 'Let Time Pass',
  intent: 'One turn is one week. See what a week costs.',
  offer: { order: 4, when: act('pairing.introduced') },
  steps: [
    {
      id: 'advance-one',
      text: 'Advance the clock one turn',
      when: act('turn.advanced'),
    },
    {
      id: 'give-care',
      text: 'Give a snake some care',
      when: act('snake.comforted'),
    },
    {
      id: 'watch-money',
      text: 'Watch your money go up or down',
      when: act('money.changed'),
    },
    {
      id: 'wait-for-eggs',
      text: 'Wait for a pairing to lay eggs',
      when: act('clutch.laid'),
    },
  ],
}

const theFirstClutch: Quest = {
  id: 'first-clutch',
  chapter: CHAPTER_FIRST_ANIMALS,
  title: 'The First Clutch',
  intent: 'Breed a pair and meet what hatches.',
  offer: { order: 5, when: count('turn.advanced', 3) },
  steps: [
    {
      id: 'commit-pairing',
      text: 'Set a pairing to breed',
      when: act('pairing.committed'),
    },
    {
      id: 'hatch-it',
      text: 'Wait until the eggs hatch',
      when: act('clutch.hatched'),
      // Causal: no clutch hatches that was not committed first.
      after: ['commit-pairing'],
      hint: 'Eggs sit for eight or nine turns before they hatch.',
    },
    {
      id: 'open-hatchling',
      text: 'Open a hatchling card',
      when: act('ui.cardRevealed'),
      after: ['hatch-it'],
    },
    {
      id: 'name-hatchling',
      text: 'Name one of the babies',
      when: act('snake.named'),
      after: ['hatch-it'],
    },
  ],
}

export const FIRST_ANIMALS_QUESTS: readonly Quest[] = [
  yourFirstSnake,
  aPlaceToLive,
  aPair,
  letTimePass,
  theFirstClutch,
]
