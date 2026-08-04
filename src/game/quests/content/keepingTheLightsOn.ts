/**
 * Chapter 2 — Keeping The Lights On. The economy, so the rest of the arc is affordable.
 *
 * Still no understanding gate. The economy is a set of controls rather than a concept, and the one
 * idea in here that *is* a concept — a morph's price falling as the market fills with it — is carried
 * by a hint rather than by a predicate, because there is no act in the catalogue that distinguishes
 * "sold three and noticed" from "sold three". A step that claimed otherwise would be exactly the
 * forbidden pattern in §B3.
 */
import { act, count, distinct, gte, type Quest } from '../types'

export const CHAPTER_LIGHTS = 'keeping-the-lights-on'

const whatIsItWorth: Quest = {
  id: 'what-is-it-worth',
  chapter: CHAPTER_LIGHTS,
  title: 'What Is It Worth',
  intent: 'Read what a snake is worth then sell one.',
  offer: { order: 6, when: act('clutch.hatched') },
  steps: [
    {
      id: 'read-value',
      text: 'Open a card and read its value',
      when: act('ui.cardOpened'),
    },
    {
      id: 'sell-one',
      text: 'Sell one snake',
      when: act('snake.sold'),
      hint: 'The store buys as well as sells.',
    },
    {
      id: 'money-up',
      text: 'Watch your money go up',
      when: act('money.changed', [gte('delta', 1)]),
    },
  ],
}

const buyWhatYouLack: Quest = {
  id: 'buy-what-you-lack',
  chapter: CHAPTER_LIGHTS,
  title: 'Buy What You Lack',
  intent: 'Buy a snake you could never have bred yourself.',
  offer: { order: 7, when: act('snake.sold') },
  steps: [
    {
      id: 'card-before-buying',
      text: 'Open a card in the store first',
      when: act('ui.cardOpened'),
    },
    {
      id: 'buy-one',
      text: 'Buy a snake you could not breed',
      when: act('snake.bought'),
    },
    {
      id: 'two-species',
      text: 'Keep two species at once',
      when: distinct('snake.acquired', 'species', 2),
      hint: 'A second species brings a whole new set of genes.',
    },
  ],
}

const pricesFall: Quest = {
  id: 'prices-fall',
  chapter: CHAPTER_LIGHTS,
  title: 'Prices Fall',
  intent: 'Sell often and watch the market pay you less.',
  offer: { order: 8, when: count('snake.sold', 2) },
  steps: [
    {
      id: 'sell-three',
      text: 'Sell three snakes over a few turns',
      when: count('snake.sold', 3),
      hint: 'Prices drop when the market fills up with one morph.',
    },
    {
      id: 'read-value-again',
      text: 'Open a card and read its value again',
      when: act('ui.cardOpened'),
    },
    {
      id: 'buy-back',
      text: 'Buy a snake back from the store',
      when: act('snake.bought'),
    },
  ],
}

export const LIGHTS_QUESTS: readonly Quest[] = [whatIsItWorth, buyWhatYouLack, pricesFall]
