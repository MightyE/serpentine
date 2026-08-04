/**
 * Serpentine — the tally: the counters achievements are allowed to read.
 *
 * ## The one architectural claim in the achievement system
 *
 * **An achievement never looks at the roster.** It reads counters, and the counters are
 * maintained incrementally by the event bus — one animal's worth of work when an animal hatches,
 * nothing at all the rest of the time. That is what makes evaluation cheap enough to run on every
 * event without thinking about it, and it is why `Requirement` (see `types.ts`) is deliberately
 * incapable of expressing anything but a counter read.
 *
 * The counters are ordinary `FlagSet` entries, which means:
 *
 * - **They are already in the save file.** `flagSet.all()` *is* the save shape, so nothing here
 *   needs a serialiser, a migration, or a second place to go wrong.
 * - **They survive an achievement being added later.** This is the retroactivity mechanism, and
 *   it is worth being precise about what it does and does not buy. A new achievement written next
 *   month evaluates against counters that have been accumulating since the save was created, so a
 *   player who already did the thing gets it on the next sweep. What it cannot do is invent
 *   history: an achievement needing a counter that did not exist when the save was played can only
 *   start counting from now. That is why the tally schema below is deliberately *broad* — per
 *   species, per phenotype, per trait, per pair of traits — rather than exactly what today's
 *   catalogue happens to need. Recording a counter nobody reads yet costs a few bytes. Failing to
 *   record one costs a player's history.
 *
 * ## Namespacing
 *
 * Everything lives under `ach.`, so a save file reads clearly and no game flag can collide with a
 * tally. Two counters are deliberately **not** re-implemented here because the game already keeps
 * them: `clutchesHatched` (`breeding.ts`), `totalCareGiven` (`rehab.ts`) and `geneTestsRun`
 * (`session.ts`). Achievements read those directly. A second counter for the same fact is a
 * counter that will eventually disagree.
 */
import type { EventBus, FlagId, FlagSet, Unsubscribe } from '../seams'
import type { VisibleAllele } from './traits'

// ---------------------------------------------------------------------------
// Flag ids
// ---------------------------------------------------------------------------

export const TALLY_PREFIX = 'ach.'

/** Counters the game already keeps under its own names. Achievements read these as-is. */
export const EXISTING_FLAGS = {
  clutchesHatched: 'clutchesHatched',
  totalCareGiven: 'totalCareGiven',
  geneTestsRun: 'geneTestsRun',
} as const

export const TALLY = {
  /** Hatchlings you produced, ever. Not animals acquired — those are a different fact. */
  hatched: 'ach.hatched' as FlagId,
  hatchedOf: (speciesId: string): FlagId => `ach.hatched.${speciesId}`,

  /** Animals that joined the collection from anywhere. */
  acquired: 'ach.acquired' as FlagId,
  acquiredFrom: (source: string): FlagId => `ach.acquired.source.${source}`,

  /** Animals of a species that have ever been in your collection, bred or acquired. */
  speciesSeen: (speciesId: string): FlagId => `ach.species.${speciesId}`,
  /** How many distinct species you have kept. */
  speciesDistinct: 'ach.speciesDistinct' as FlagId,

  sold: 'ach.sold' as FlagId,

  /**
   * Animals you have produced or owned that visibly showed this allele.
   *
   * These are the members of every coverage set, which is why they are per-allele rather than
   * per-locus: an allelic series has several morphs at one locus and the morph book wants a page
   * for each.
   */
  trait: (speciesId: string, locusId: string, alleleId: string): FlagId =>
    `ach.trait.${speciesId}.${locusId}.${alleleId}`,
  traitDistinct: 'ach.traitDistinct' as FlagId,
  traitDistinctOf: (speciesId: string): FlagId => `ach.traitDistinct.${speciesId}`,

  /** How many animals of this exact appearance you have produced. Feeds the volume category. */
  phenotype: (speciesId: string, phenotypeKey: string): FlagId =>
    `ach.phen.${speciesId}.${phenotypeKey}`,
  phenotypeDistinct: 'ach.phenDistinct' as FlagId,
  phenotypeDistinctOf: (speciesId: string): FlagId => `ach.phenDistinct.${speciesId}`,

  /**
   * Animals showing two named traits at once, keyed by the two **loci** with ids sorted.
   *
   * Locus-level rather than allele-level on purpose: a combination achievement is about two
   * traits stacking, and a compound heterozygote at one locus is not that — it has its own morph
   * page under `trait` instead.
   */
  combo: (speciesId: string, locusA: string, locusB: string): FlagId => {
    const [a, b] = [locusA, locusB].sort()
    return `ach.combo.${speciesId}.${a}+${b}`
  },
  /** Animals showing at least `n` distinct traits at once. `n` from 2 upward. */
  multiTrait: (speciesId: string, n: number): FlagId => `ach.multi.${speciesId}.${n}`,

  // --- things you found out, rather than made ---------------------------------
  /** Loci proven on an animal by test breeding. Not once per animal — once per animal per locus. */
  proven: 'ach.proven' as FlagId,
  provenOf: (locusId: string): FlagId => `ach.proven.${locusId}`,
  allelesDiscovered: 'ach.allelesDiscovered' as FlagId,
  /** Clutch outcomes the player called correctly before committing to the pairing. */
  predictionsCorrect: 'ach.predictionsCorrect' as FlagId,
  /**
   * *Distinct* non-viable outcomes whose genetics explanation the player has read. Never framed as
   * a loss.
   *
   * Distinct, and keyed by the genotype the explanation is about, because the alternative is a
   * click counter: re-opening the same egg's explanation three times would satisfy
   * `mastery.viability.3` for nothing, and an achievement that pays for repeating a free action is
   * the corrosive half of charter principle 8. Each distinct key costs a pairing that produced that
   * genotype, which is a real cost the effort model can honestly price.
   */
  viabilityFactsRead: 'ach.viabilityFactsRead' as FlagId,
  /** Member flag behind {@link TALLY.viabilityFactsRead}. One per non-viable genotype. */
  viabilityFact: (genotypeKey: string): FlagId => `ach.viabilityFact.${genotypeKey}`,

  // --- lineage ---------------------------------------------------------------
  /** The deepest pedigree you have bred, in generations. A high-water mark, not a counter. */
  deepestPedigree: 'ach.deepestPedigree' as FlagId,
  /** Outcrosses that measurably restored vigor to a narrowed line. */
  outcrossRecoveries: 'ach.outcrossRecoveries' as FlagId,

  // --- the rehab -------------------------------------------------------------
  residentsTaken: 'ach.residentsTaken' as FlagId,
  residentsPlaced: 'ach.residentsPlaced' as FlagId,
  extraCareResidents: 'ach.extraCareResidents' as FlagId,
} as const

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

/**
 * Everything the tally needs to know about one animal.
 *
 * A flat record rather than an `Individual` and a `SpeciesDefinition`, so this module needs
 * nothing from the genetics engine or the renderer — the caller, which already has both, computes
 * it once. `subjectOf` in `index.ts` is the two-line helper that does so.
 */
export interface TallySubject {
  readonly speciesId: string
  readonly phenotypeKey: string
  readonly visible: readonly VisibleAllele[]
}

export type TallyLookup = (individualId: string) => TallySubject | undefined

export interface TallyRecorder {
  /**
   * Facts the game does not yet emit an event for. Each one is a single call the owning system
   * makes when it lands; until then the counter simply stays at zero and the achievements that
   * read it stay pending, which is the correct behaviour for a mechanic that does not exist.
   */
  noteResidentPlaced(): void
  notePredictionCorrect(): void
  /**
   * @param genotypeKey identifies *which* non-viable outcome was explained — the super-champagne
   * genotype, say. Reading the same one twice counts once, which is what keeps this a record of
   * things learned rather than of buttons pressed.
   */
  noteViabilityFactRead(genotypeKey: string): void
  noteOutcrossRecovery(): void
  notePedigreeDepth(generations: number): void
  noteExtraCareResident(): void
  /**
   * Fold one animal into the tally by hand, for a caller that has an animal but no event —
   * `cheats.ts` conjuring a snake, or a save migration rebuilding counters from a roster.
   *
   * Not idempotent: it counts an animal, so calling it twice counts twice. The bus handlers are
   * the normal path and each event fires once.
   */
  record(subject: TallySubject, origin: 'bred' | 'acquired'): void
  dispose(): void
}

/**
 * Subscribe to the bus and keep the tally current.
 *
 * Every handler is O(traits on one animal), which is a handful of loop iterations. Nothing here
 * walks the collection, and nothing here is allowed to start.
 */
export function createTallyRecorder(bus: EventBus, flags: FlagSet, lookup: TallyLookup): TallyRecorder {
  const subscriptions: Unsubscribe[] = []

  /** Bump a member flag; bump its distinct-counter only the first time it leaves zero. */
  function bumpWithDistinct(member: FlagId, distinctCounters: readonly FlagId[]): void {
    const before = flags.get(member)
    flags.bump(member)
    if (typeof before === 'number' && before > 0) return
    for (const counter of distinctCounters) flags.bump(counter)
  }

  function record(subject: TallySubject, origin: 'bred' | 'acquired'): void {
    const { speciesId, phenotypeKey, visible } = subject

    if (origin === 'bred') {
      flags.bump(TALLY.hatched)
      flags.bump(TALLY.hatchedOf(speciesId))
      bumpWithDistinct(TALLY.phenotype(speciesId, phenotypeKey), [
        TALLY.phenotypeDistinct,
        TALLY.phenotypeDistinctOf(speciesId),
      ])
    } else {
      flags.bump(TALLY.acquired)
    }

    bumpWithDistinct(TALLY.speciesSeen(speciesId), [TALLY.speciesDistinct])

    for (const trait of visible) {
      bumpWithDistinct(TALLY.trait(speciesId, trait.locusId, trait.alleleId), [
        TALLY.traitDistinct,
        TALLY.traitDistinctOf(speciesId),
      ])
    }

    // Combinations. `loci` is deduplicated because a compound heterozygote contributes two
    // visible alleles at one locus, and that is one trait, not two.
    const loci = [...new Set(visible.map((t) => t.locusId))].sort()
    for (let i = 0; i < loci.length; i++) {
      for (let j = i + 1; j < loci.length; j++) {
        flags.bump(TALLY.combo(speciesId, loci[i]!, loci[j]!))
      }
    }
    for (let n = 2; n <= loci.length; n++) {
      flags.bump(TALLY.multiTrait(speciesId, n))
    }
  }

  subscriptions.push(
    bus.on('egg.hatched', ({ individualId }) => {
      const subject = lookup(individualId)
      if (subject) record(subject, 'bred')
    }),
  )

  subscriptions.push(
    bus.on('snake.acquired', ({ individualId, source }) => {
      flags.bump(TALLY.acquiredFrom(source))
      if (source === 'rescued') flags.bump(TALLY.residentsTaken)
      const subject = lookup(individualId)
      if (subject) record(subject, 'acquired')
    }),
  )

  subscriptions.push(
    bus.on('snake.sold', () => {
      flags.bump(TALLY.sold)
    }),
  )

  subscriptions.push(
    bus.on('genetics.proven', ({ locusId }) => {
      flags.bump(TALLY.proven)
      flags.bump(TALLY.provenOf(locusId))
    }),
  )

  subscriptions.push(
    bus.on('allele.discovered', () => {
      flags.bump(TALLY.allelesDiscovered)
    }),
  )

  return {
    record,
    noteResidentPlaced: () => void flags.bump(TALLY.residentsPlaced),
    notePredictionCorrect: () => void flags.bump(TALLY.predictionsCorrect),
    noteViabilityFactRead: (genotypeKey) =>
      bumpWithDistinct(TALLY.viabilityFact(genotypeKey), [TALLY.viabilityFactsRead]),
    noteOutcrossRecovery: () => void flags.bump(TALLY.outcrossRecoveries),
    noteExtraCareResident: () => void flags.bump(TALLY.extraCareResidents),
    notePedigreeDepth: (generations) => {
      const current = flags.get(TALLY.deepestPedigree)
      const best = typeof current === 'number' ? current : 0
      if (generations > best) flags.set(TALLY.deepestPedigree, generations)
    },
    dispose: () => {
      for (const unsubscribe of subscriptions) unsubscribe()
      subscriptions.length = 0
    },
  }
}
