/**
 * The market: sell snakes from the roster, buy snakes from a rotating shop stock.
 *
 * ## Pricing is `tuning.ts`'s model, not a second one
 *
 * This file used to carry an independent pricing curve — a base plus a flat bonus per visual
 * effect — with neither of the two terms the balance charter's economy is actually built on. It
 * now calls {@link salePrice} directly, so the invariants in `tuning.test.ts` are protecting the
 * function the game runs rather than a model beside it.
 *
 * The two terms that matter:
 *
 * **Saturation.** A morph's price decays with how many of it the market has already absorbed
 * (`SATURATION_HALFLIFE_SALES`), recovering slowly over time (`SATURATION_RECOVERY_PER_YEAR`).
 * This is the economy's sink, and it is deliberately *not* per-resident care costs: taxing care
 * would make the rehab's own mission the tax and put callousness on the optimal line, which is
 * bad design before it is bad tone. Saturation taxes scale instead — and it is what actually
 * happened to real morph prices, which is the better reason.
 *
 * **Vigor.** An animal out of a narrow, line-bred pedigree is worth less than the same morph out
 * of a diverse one, because a buyer of breeding stock cares. That is what keys value to health as
 * well as rarity, and it is what stops fixation from being free.
 *
 * Prices here are invented. They exist to make running a facility feel like a real decision, not
 * to claim what any animal is worth.
 */
import type { GeneticsEngine, Individual, SpeciesDefinition } from '../genetics/types'
import type { Phenotype } from '../render/contract'
import type { Economy } from './economy'
import type { AcquisitionSource, Roster, SnakeRecord } from './roster'
import type { EventBus } from './seams'
import { SATURATION_RECOVERY_PER_YEAR, WEEKS_PER_YEAR, salePrice } from './tuning'

declare module './seams' {
  interface GameEventMap {
    'snake.sold': { individualId: string; price: number }
    'snake.bought': { individualId: string; price: number }
  }
}

// ---------------------------------------------------------------------------
// Saturation
// ---------------------------------------------------------------------------

/** How many of each phenotype the market has absorbed, and when it last heard about it. */
export interface SaturationEntry {
  units: number
  lastTurn: number
}

/** Plain data so it drops straight into a save file with no translation layer. */
export type SaturationLedger = Record<string, SaturationEntry>

/**
 * Units of `key` the market still counts as absorbed, as of `turn`.
 *
 * Markets recover: animals get sold on, keepers leave the hobby, new ones arrive. Without that
 * every morph would decay permanently to the floor and the only viable play would be an endless
 * treadmill of new morphs — a grind wearing a genetics costume. With it, each morph settles at an
 * equilibrium where your sales rate matches the market's recovery rate, which is the actual bound
 * on compounding: flood the market and the price falls until flooding it stops being worth doing.
 */
export function unitsAbsorbed(ledger: SaturationLedger, key: string, turn: number): number {
  const entry = ledger[key]
  if (!entry) return 0
  const years = Math.max(0, (turn - entry.lastTurn) / WEEKS_PER_YEAR)
  return entry.units * Math.pow(1 - SATURATION_RECOVERY_PER_YEAR, years)
}

export function recordSale(ledger: SaturationLedger, key: string, turn: number): void {
  ledger[key] = { units: unitsAbsorbed(ledger, key, turn) + 1, lastTurn: turn }
}

// ---------------------------------------------------------------------------
// Valuation
// ---------------------------------------------------------------------------

/**
 * Which of `RARITY_TIERS` an animal reads as, from its appearance alone.
 *
 * Counted off the composed label rather than the genotype on purpose: the market is a buyer
 * looking at an animal, and a buyer cannot see a carrier. That is the same asymmetry the
 * knowledge layer is built on, and it means a proven het is worth what you can *demonstrate*,
 * not what it secretly is.
 */
export function rarityTierOf(phenotype: Phenotype): number {
  const traits = phenotype.label === 'Normal' ? 0 : phenotype.label.trim().split(/\s+/).length
  const showy = phenotype.effects.some((e) => e !== 'needsExtraCare') ? 1 : 0
  return Math.min(4, Math.max(1, traits + showy))
}

export interface ValuationContext {
  /** Units of this phenotype the market has already absorbed. Default 0 — a fresh market. */
  readonly unitsAlreadySold?: number
  /**
   * 0..1 health-and-diversity readout for this animal — `genetics/load.ts`'s display figure.
   * Default 1, which is what an animal with no known pedigree and nothing expressed looks like.
   */
  readonly vigor?: number
}

/** What one animal fetches: rarity tier, decayed by saturation, scaled by vigor, floored. */
export function estimateValue(phenotype: Phenotype, context: ValuationContext = {}): number {
  const tier = rarityTierOf(phenotype)
  return Math.round(salePrice(tier, context.unitsAlreadySold ?? 0, context.vigor ?? 1))
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export interface SellOptions {
  readonly ledger?: SaturationLedger
  readonly turn?: number
  readonly vigor?: number
}

export function sellSnake(
  id: string,
  roster: Roster,
  economy: Economy,
  bus: EventBus,
  engine: GeneticsEngine,
  species: SpeciesDefinition<Phenotype>,
  options: SellOptions = {},
): number {
  const record = roster.get(id)
  if (!record) throw new Error(`sellSnake: no snake with id "${id}" in the roster`)
  const phenotype = engine.express(record.individual, species)
  const key = species.phenotypeKey(phenotype)
  const turn = options.turn ?? 0
  const price = estimateValue(phenotype, {
    unitsAlreadySold: options.ledger ? unitsAbsorbed(options.ledger, key, turn) : 0,
    vigor: options.vigor ?? 1,
  })
  roster.remove(id)
  if (options.ledger) recordSale(options.ledger, key, turn)
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
