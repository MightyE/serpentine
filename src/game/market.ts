/**
 * The market: sell snakes from the roster, buy snakes from a rotating shop stock. Pricing is
 * an invented curve, not a claim about a real snake's worth (see `economy.ts`).
 */
import type { GeneticsEngine, Individual, SpeciesDefinition } from '../genetics/types'
import type { Phenotype } from '../render/contract'
import type { Economy } from './economy'
import type { AcquisitionSource, Roster, SnakeRecord } from './roster'
import type { EventBus } from './seams'

declare module './seams' {
  interface GameEventMap {
    'snake.sold': { individualId: string; price: number }
    'snake.bought': { individualId: string; price: number }
  }
}

/**
 * Invented pricing: a base price, plus a flat bonus per distinct named visual effect the
 * phenotype carries (a rough stand-in for "rarer combos are worth more" without pretending to
 * model a real market). `label` gets a small bonus too — a longer composed name usually means
 * more traits stacked, per `support/phenotypeKey.ts:withLabel`.
 */
export function estimateValue(phenotype: Phenotype): number {
  const base = 60
  const perEffect = 25
  const perLabelWord = 12
  const labelWords = Math.max(0, phenotype.label.split(' ').length - 1) // "Normal" = 0 bonus words
  return base + phenotype.effects.length * perEffect + labelWords * perLabelWord
}

export function sellSnake(
  id: string,
  roster: Roster,
  economy: Economy,
  bus: EventBus,
  engine: GeneticsEngine,
  species: SpeciesDefinition<Phenotype>,
): number {
  const record = roster.get(id)
  if (!record) throw new Error(`sellSnake: no snake with id "${id}" in the roster`)
  const phenotype = engine.express(record.individual, species)
  const price = estimateValue(phenotype)
  roster.remove(id)
  economy.earn(price, `sold:${id}`)
  bus.emit('snake.sold', { individualId: id, price })
  return price
}

export interface ShopListing {
  readonly individual: Individual
  readonly price: number
}

export function buySnake(
  listing: ShopListing,
  roster: Roster,
  economy: Economy,
  bus: EventBus,
  acquiredTurn: number,
  name: string,
  source: AcquisitionSource = 'purchased',
): boolean {
  if (!economy.spend(listing.price, `bought:${listing.individual.id}`)) return false
  const record: SnakeRecord = { individual: listing.individual, name, acquiredTurn, source }
  roster.add(record)
  bus.emit('snake.bought', { individualId: listing.individual.id, price: listing.price })
  bus.emit('snake.acquired', { individualId: listing.individual.id, source })
  return true
}
