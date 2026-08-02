/**
 * Everything a trading card prints, derived from a real animal.
 *
 * ## The one rule
 *
 * **Nothing on a card is cosmetic noise.** Every visual element is a readable claim about the
 * animal, so a player who learns to read the cards has learned the genetics. The frame tier is
 * computed, the foil is earned by a specific trait, the stats come from real quantities and the
 * flavour text is the trait's own real-vs-modelled note. There is no random rarity roll anywhere
 * in this file, and there must never be one — a card that rolls its own holo is a slot machine
 * wearing a genetics costume.
 *
 * ## The second rule: a card may not leak what the player has not proved
 *
 * The whole game is the gap between what you know and what is true. So every derived number here
 * is computed from the player's **belief** (`session.knowledgeOf`), never from the true genotype:
 *
 *   - Tier reads the *phenotype*, which is what anyone can see by looking at the animal.
 *   - Heterozygosity is an *expected* value under the current posterior, so it moves as you prove
 *     things — it is not a peek at the answer.
 *   - Badges appear only for mechanisms you have actually established are at work.
 *   - HIDDEN is the size of the remaining gap, and is deliberately the most eye-catching thing on
 *     the card: it is the reason to breed the animal.
 *
 * A tier derived from the genotype would quietly announce an unproven het, which is the one thing
 * this game refuses to do.
 */
import { rarityTierOf } from '../game/market'
import { isLoadLocus } from '../game/loadPool'
import type { Session } from '../game/session'
import type { SnakeRecord } from '../game/roster'
import type { AllelePair, Locus, LocusBelief } from '../genetics/types'
import { key as genotypeKey } from '../species/support/genotypeKey'
import { allRealTraitNotes } from '../species'

export type Tier = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
export const TIERS: readonly Tier[] = ['common', 'uncommon', 'rare', 'epic', 'legendary']

export type Foil = 'iridescent' | 'glow' | 'glitter'
export type EscapeLevel = 'none' | 'peek' | 'full'

export type Mechanism = 'recessive' | 'dominant' | 'incomplete' | 'multi' | 'sexlinked' | 'polygenic'

export const MECHANISM_LABEL: Record<Mechanism, string> = {
  recessive: 'Recessive',
  dominant: 'Dominant',
  incomplete: 'Incomplete dominant',
  multi: 'Multi-allele',
  sexlinked: 'Sex-linked',
  polygenic: 'Polygenic',
}

export interface CardStat {
  readonly key: string
  readonly label: string
  /** 0–10, for the segmented bar. */
  readonly score: number
  /** What the number actually means, printed at the end of the row. */
  readonly display: string
}

export interface CardModel {
  readonly id: string
  readonly name: string
  readonly tier: Tier
  readonly foils: readonly Foil[]
  readonly escape: EscapeLevel
  readonly speciesLine: string
  readonly pedigreeLine: string
  readonly mechanisms: readonly Mechanism[]
  readonly stats: readonly CardStat[]
  /** How many of this animal's loci you have not proved. The card's biggest number. */
  readonly hidden: number
  /** How many loci there are in total, so the meter and the numeral agree. */
  readonly hiddenTotal: number
  readonly hiddenSub: string
  readonly flavour: string
  readonly needsCare: boolean
}

/**
 * Foil is earned by a trait, never rolled.
 *
 * The mapping is exactly the renderer's own effect tags (`render/effects.ts`): an animal whose
 * phenotype carries `iridescent` gets the rainbow sheen, `glow` gets the bloom, `glitter` gets the
 * sparkle. A foil card therefore means the animal genuinely carries something special, which is
 * what keeps foils both exciting and informative.
 */
const FOIL_FROM_EFFECT: Readonly<Record<string, Foil>> = {
  iridescent: 'iridescent',
  glow: 'glow',
  glitter: 'glitter',
}

export function foilsFor(effects: readonly string[]): readonly Foil[] {
  const out = new Set<Foil>()
  for (const e of effects) {
    const foil = FOIL_FROM_EFFECT[e]
    if (foil) out.add(foil)
  }
  return [...out]
}

/**
 * Frame tier, from how improbable the animal *looks*.
 *
 * `rarityTierOf` is the game's own measure — how many named morph traits are stacked on it, plus
 * one for each showy effect — and the market already prices against it. The card frame needs five
 * bands where the market has four, so this is the same measure with one more step on top rather
 * than a second, competing idea of rarity: a plain wild-type animal is Common, and each stacked
 * trait moves it one band toward Legendary.
 */
export function tierFor(session: Session, record: SnakeRecord): Tier {
  const phenotype = session.phenotype(record)
  const named = phenotype.label === 'Normal' ? 0 : phenotype.label.trim().split(/\s+/).length
  const showy = phenotype.effects.filter((e) => e !== 'needsExtraCare').length
  const band = Math.min(5, Math.max(1, 1 + named + showy))
  return TIERS[band - 1]!
}

/** The market's four-band tier, kept in sync for anywhere that wants the priced version. */
export function marketTierOf(session: Session, record: SnakeRecord): number {
  return rarityTierOf(session.phenotype(record))
}

// ---------------------------------------------------------------------------
// Inheritance mechanisms
// ---------------------------------------------------------------------------

function sameTraits(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

/**
 * What kind of inheritance a locus runs on, read off its own expression table.
 *
 * Derived rather than declared because the table *is* the declaration: if the heterozygote looks
 * like the wild-type homozygote it is recessive, if it looks like the mutant homozygote it is
 * dominant, and if it looks like neither it is incomplete dominant. A locus with a custom
 * expression rule cannot be classified this way and gets no badge, which is the honest answer.
 */
export function mechanismOf(locus: Locus): Mechanism | null {
  if (locus.placement.kind === 'sexLinked') return 'sexlinked'
  if (locus.alleles.length > 2) return 'multi'
  if (locus.expression.kind !== 'table') return null

  const wild = locus.wildType
  const mutant = locus.alleles.find((a) => a.id !== wild)?.id
  if (!mutant) return null

  const entries = locus.expression.entries
  const homWild = entries[genotypeKey(wild, wild)] ?? locus.expression.otherwise
  const het = entries[genotypeKey(wild, mutant)] ?? locus.expression.otherwise
  const homMutant = entries[genotypeKey(mutant, mutant)] ?? locus.expression.otherwise

  if (sameTraits(het, homWild)) return 'recessive'
  if (sameTraits(het, homMutant)) return 'dominant'
  return 'incomplete'
}

function isNonWildPair(pair: AllelePair | undefined, wildType: string): boolean {
  if (!pair) return false
  return pair.some((slot) => slot !== null && slot !== wildType)
}

/**
 * How sure the player is that this animal carries *something* at this locus.
 *
 * A badge should appear when you know the mechanism is at work, which is not the same as knowing
 * the genotype. A visibly pinstriped animal is 50% `pinstripe/wild-type` and 50%
 * `pinstripe/pinstripe`: nothing is proven, and yet you are certain it carries pinstripe. That
 * earns the badge. A 33% possible het does not.
 */
function certaintyOfCarrying(belief: LocusBelief | undefined, wildType: string): number {
  if (!belief || belief.kind === 'unknown') return 0
  if (belief.kind === 'certain') return isNonWildPair(belief.pair, wildType) ? 1 : 0
  let p = 0
  for (const [key, probability] of Object.entries(belief.distribution)) {
    if (key.split('/').some((allele) => allele !== wildType)) p += probability
  }
  return p
}

// ---------------------------------------------------------------------------
// Belief-derived quantities
// ---------------------------------------------------------------------------

/** True when a genotype key names two different alleles, i.e. the animal is a heterozygote. */
function keyIsHet(key: string): boolean {
  const parts = key.split('/')
  return parts.length === 2 && parts[0] !== parts[1]
}

function heterozygosityFrom(belief: LocusBelief | undefined): number | null {
  if (!belief || belief.kind === 'unknown') return null
  if (belief.kind === 'certain') {
    const [a, b] = belief.pair
    return a !== null && b !== null && a !== b ? 1 : 0
  }
  let p = 0
  for (const [key, probability] of Object.entries(belief.distribution)) {
    if (keyIsHet(key)) p += probability
  }
  return p
}

/** How many generations of recorded pedigree stand behind this animal. */
function lineageDepth(session: Session, record: SnakeRecord, guard = 0): number {
  if (guard > 24) return guard
  const parents = record.individual.parents
  if (!parents) return 0
  let deepest = 0
  for (const id of parents) {
    const parent = session.record(id)
    if (!parent) continue
    deepest = Math.max(deepest, 1 + lineageDepth(session, parent, guard + 1))
  }
  return parents.length > 0 ? Math.max(1, deepest) : 0
}

/** The name of the furthest-back ancestor still on record — the line this animal comes from. */
function foundingAncestor(session: Session, record: SnakeRecord, guard = 0): string | null {
  if (guard > 24) return null
  const parents = record.individual.parents
  if (!parents) return null
  for (const id of parents) {
    const parent = session.record(id)
    if (!parent) continue
    return foundingAncestor(session, parent, guard + 1) ?? parent.name
  }
  return null
}

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

export interface CardModelOptions {
  /**
   * Override the fourth-wall escape. Escape is **rare and opt-in**: the default rule below grants
   * one only to an animal carrying a brand-new mutation, which `tuning.ts` sizes at roughly once
   * per long playthrough. Tier raises the ceiling on how far an escape may go and never triggers
   * one, so a Legendary with `none` still reveals beautifully inside its own frame.
   */
  readonly escape?: EscapeLevel
}

export function cardModelFor(session: Session, record: SnakeRecord, options: CardModelOptions = {}): CardModel {
  const species = session.speciesOf(record)
  const phenotype = session.phenotype(record)
  const knowledge = session.knowledgeOf(record)
  const notes = allRealTraitNotes[record.individual.species] ?? {}

  const loci = species.authored.loci.filter((locus) => !isLoadLocus(locus.id))

  const mechanisms = new Set<Mechanism>()
  let hetSum = 0
  let hetKnown = 0
  let unread = 0
  let flavourLocus: string | null = null

  for (const locus of loci) {
    const belief = knowledge.loci[locus.id]
    if (!belief || belief.kind !== 'certain') unread += 1

    const het = heterozygosityFrom(belief)
    if (het !== null) {
      hetSum += het
      hetKnown += 1
    }

    if (certaintyOfCarrying(belief, locus.wildType) > 0.999) {
      const mechanism = mechanismOf(locus)
      if (mechanism) mechanisms.add(mechanism)
      if (!flavourLocus && notes[locus.id]) flavourLocus = locus.id
    }
  }
  if (species.authored.polygenic.length > 0) mechanisms.add('polygenic')

  const heterozygosity = hetKnown > 0 ? hetSum / hetKnown : 0
  const depth = lineageDepth(session, record)
  const line = foundingAncestor(session, record)
  const tier = tierFor(session, record)
  const vigor = session.vigorOf(record)
  const f = session.inbreedingOf(record)

  const stats: CardStat[] = [
    {
      key: 'vigor',
      label: 'Vigor',
      score: Math.round(vigor * 10),
      display: `${Math.round(vigor * 100)}%`,
    },
    {
      key: 'rarity',
      label: 'Rarity',
      score: (TIERS.indexOf(tier) + 1) * 2,
      display: `${TIERS.indexOf(tier) + 1}/5`,
    },
    {
      key: 'het',
      label: 'Heteroz.',
      score: Math.round(heterozygosity * 10),
      display: heterozygosity.toFixed(2),
    },
    {
      key: 'lineage',
      label: 'Lineage',
      score: Math.min(10, depth * 2),
      display: depth === 0 ? 'F0' : `F${depth}`,
    },
  ]

  const note = flavourLocus ? notes[flavourLocus] : undefined
  const flavour =
    note?.real ??
    (f > 0
      ? `Bred here. It carries an inbreeding coefficient of ${f.toFixed(3)}, and every number above knows it.`
      : 'Arrived from the wild population with no known parents — the most useful thing in the building for outcrossing.')

  return {
    id: record.individual.id,
    name: record.name,
    tier,
    foils: foilsFor(phenotype.effects),
    // Escape is opt-in and rare. A novel mutation is the one thing rare enough to earn it.
    escape: options.escape ?? (record.individual.mutations.length > 0 ? 'full' : 'none'),
    speciesLine: `${species.authored.label} · ${phenotype.label}`,
    pedigreeLine: depth === 0 ? 'Founder · wild-caught' : `F${depth} · ${line ?? 'unknown'} line`,
    mechanisms: [...mechanisms],
    stats,
    hidden: unread,
    hiddenTotal: loci.length,
    hiddenSub: `of ${loci.length} loci still unread`,
    flavour,
    needsCare: session.expressedLoadOf(record).length > 0,
  }
}
