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
 * **Proof.** How much of what the card says about this animal can actually be backed up. Two
 * animals with identical genotypes and identical appearances are worth different money when one
 * has been proven out and the other has not, because the buyer is purchasing the *claim*. See
 * {@link proofOf}.
 *
 * **Trait strength.** How far the animal's continuous, polygenic expression sits above ordinary
 * for its kind — a high-white pied, a strongly iridescent glimmer. See {@link traitStrengthOf}.
 *
 * Prices here are invented. They exist to make running a facility feel like a real decision, not
 * to claim what any animal is worth.
 */
import { alleleCopies } from '../genetics/genotype'
import type {
  GeneticKnowledge,
  GeneticsEngine,
  Individual,
  SpeciesDefinition,
} from '../genetics/types'
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

/**
 * How much of what is claimed about an animal is actually settled: 1 for an animal proven at
 * every locus, down toward 0 for one nobody can say anything about.
 *
 * Per locus, the confidence is **the probability mass sitting on the single most likely
 * genotype** — the number a card would have to print next to its guess. A `certain` belief scores
 * 1; the classic 66% possible het scores 0.667, which is the ratio `economy-design.md` names; an
 * `unknown` locus scores 0, because "uniform over whatever the species allows" is not a claim a
 * seller can make at all. The animal's proof is the mean across the loci it is asked about.
 *
 * **Mean, not product.** The product — P(the whole card is right) — is the quantity a
 * statistician would reach for, and it is unusable: eleven loci at 0.667 multiply out to 0.01,
 * so every animal in the game would price at the floor and proving one locus out would move
 * nothing a player could see. The mean is the readable version of the same idea and it keeps the
 * feedback loop tight — every gene test moves the price, immediately and by a visible amount.
 * What it costs is that `economy-design.md`'s "a 66% possible het sells for 66% of a proven het"
 * only holds locus-for-locus, not animal-for-animal; across a whole ball python that one locus
 * is a nudge, not a two-thirds haircut. The doc was written against a one-locus animal.
 *
 * Pass the *authored* loci only. Sixty invisible load loci nobody has ever tested would swamp
 * this with uncertainty about things the game deliberately never asks the player to resolve.
 */
export function proofOf(knowledge: GeneticKnowledge): number {
  const beliefs = Object.values(knowledge.loci)
  if (beliefs.length === 0) return 1

  let total = 0
  for (const belief of beliefs) {
    if (belief.kind === 'certain') {
      total += 1
    } else if (belief.kind === 'posterior') {
      total += Math.max(0, ...Object.values(belief.distribution))
    }
  }
  return total / beliefs.length
}

/**
 * How strong this animal's continuous traits are, 0 (ordinary for its kind) to 1 (as far as the
 * species' alleles reach) — the **heritable** part of `species.polygenic`, and nothing else.
 *
 * This is Eric's *"strength of certain traits are properties that influence price"*, and the
 * numbers are read rather than invented: a `PolygenicTrait` already declares a baseline and a
 * per-allele contribution per locus, so an animal's score is its own allele copies summed and
 * normalised against the least and most those same contributions could produce. No new stat.
 *
 * ## The environment term is deliberately left out
 *
 * `expression.ts`'s `evaluatePolygenic` adds a non-heritable draw (`environmentSd`) on top of the
 * heritable sum, and that draw is emphatically *not* what a buyer of breeding stock is paying
 * for: it does not breed on, and pricing it would have the market pay a premium for weather. It
 * would also make two animals of identical genotype fetch different money for no reason anyone
 * could act on, which would drown the saturation signal in noise. So the premium tracks breeding
 * value, which is the honest object of selection and the thing a high-white pied is actually
 * worth more for.
 *
 * Because the contributions come off the very loci that switch a trait's visible form on —
 * piebald's white percentage gains 20 per piebald allele — a non-piebald animal scores exactly
 * the minimum, which is 0. An invisible trait therefore costs nothing and earns nothing, with no
 * visibility rule needed anywhere.
 *
 * **The maximum across traits, not the mean.** A buyer reacts to the one thing that stands out;
 * averaging a spectacular white percentage against unremarkable iridescence would price the
 * animal as merely fine. A species with no polygenic traits scores 0 and pays exactly base.
 */
export function traitStrengthOf<P extends object>(
  individual: Individual,
  species: SpeciesDefinition<P>,
): number {
  let best = 0
  for (const trait of species.polygenic) {
    let value = trait.baseline
    let lowest = trait.baseline
    let highest = trait.baseline

    for (const contribution of trait.contributions) {
      const amounts = Object.values(contribution.perAllele)
      // Two copies, so the reachable extremes are twice the best and worst single contribution.
      // Zero is always in range: an animal can carry no contributing allele at this locus.
      lowest += 2 * Math.min(0, ...amounts)
      highest += 2 * Math.max(0, ...amounts)

      const pair = individual.genotype.loci[contribution.locus]
      if (pair === undefined) continue
      for (const allele of alleleCopies(pair)) value += contribution.perAllele[allele] ?? 0
    }

    if (trait.clamp) {
      const [min, max] = trait.clamp
      value = Math.min(max, Math.max(min, value))
      lowest = Math.min(max, Math.max(min, lowest))
      highest = Math.min(max, Math.max(min, highest))
    }
    if (highest <= lowest) continue

    best = Math.max(best, Math.min(1, Math.max(0, (value - lowest) / (highest - lowest))))
  }
  return best
}

export interface ValuationContext {
  /** Units of this phenotype the market has already absorbed. Default 0 — a fresh market. */
  readonly unitsAlreadySold?: number
  /**
   * 0..1 health-and-diversity readout for this animal — `genetics/load.ts`'s display figure.
   * Default 1, which is what an animal with no known pedigree and nothing expressed looks like.
   */
  readonly vigor?: number
  /**
   * 0..1 from {@link proofOf}. Default 1 — price it as if every claim about it were settled,
   * which is the neutral case a caller with no belief in hand should get.
   */
  readonly proof?: number
  /** 0..1 from {@link traitStrengthOf}. Default 0 — no premium, exactly the base price. */
  readonly traitStrength?: number
}

/**
 * What one animal fetches: rarity tier, decayed by saturation, scaled by vigor and by how much
 * of it is proven, plus a premium for a standout polygenic trait. Floored.
 */
export function estimateValue(phenotype: Phenotype, context: ValuationContext = {}): number {
  const tier = rarityTierOf(phenotype)
  return Math.round(
    salePrice(
      tier,
      context.unitsAlreadySold ?? 0,
      context.vigor ?? 1,
      context.proof ?? 1,
      context.traitStrength ?? 0,
    ),
  )
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export interface SellOptions {
  readonly ledger?: SaturationLedger
  readonly turn?: number
  readonly vigor?: number
  /**
   * 0..1 from {@link proofOf}. Supplied by the caller rather than computed here, because belief
   * is derived from the evidence the *session* holds — this file has no way to reach it, and
   * should not grow one.
   */
  readonly proof?: number
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
    proof: options.proof ?? 1,
    traitStrength: traitStrengthOf(record.individual, species),
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
