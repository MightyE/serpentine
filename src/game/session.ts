/**
 * The session: one running game, assembled.
 *
 * `game.ts` builds the shell — flags, roster, economy, care log — and deliberately holds no
 * species data and no engine. This file is the thing that supplies both and adds the state a
 * *playing* game needs on top: which species are loaded, what the market has absorbed, what the
 * player has actually learned about each animal, and which time gates are ticking.
 *
 * It is plain TypeScript with no React in it, on purpose. The UI reads a session and calls
 * methods on it; nothing here knows a component exists. That means the whole game loop can be
 * driven from a test, or from the browser console, without rendering anything — which is also
 * the shortest path to debugging it.
 *
 * ## What is stored versus what is derived
 *
 * Stored: the roster, money, flags, the saturation ledger, and the *evidence* the player has
 * gathered. Derived on every read: belief (`inferKnowledge`), inbreeding (`kinship`), value
 * (`estimateValue`), appearance (`express`). The split follows `genetics/types.ts`'s rule that
 * evidence is what gets saved and belief is what gets recomputed — so a fixed inference bug
 * reaches an old save instead of being baked into it.
 *
 * The one exception is `SnakeRecord.inbreeding`, which is written once at hatch. See its doc
 * comment: that number is a statement about the pedigree *at the moment the animal hatched*, and
 * it is the same number the pairing screen showed before you committed.
 */
import { geneticsEngine } from '../genetics'
import { expressedLoad, seedFounderLoad, vigor as vigorOf, type GeneticLoadPool } from '../genetics/load'
import { inbreedingCoefficient, kinship } from '../genetics/pedigree'
import type {
  Evidence,
  GeneticKnowledge,
  Individual,
  IndividualId,
  OffspringDistribution,
  Sex,
  SpeciesDefinition,
} from '../genetics/types'
import { makeGenotype, possiblePairs, sexOf } from '../genetics/genotype'
import { makeRng } from '../lib/rng'
import type { Phenotype } from '../render/contract'
import { allSpecies } from '../species'
import { breedPair, clutchSeed } from './breeding'
import { createGame, type GameState } from './game'
import {
  describeBand,
  incubationBand,
  isResolved,
  maturityBand,
  openGate,
  receptivityBand,
  turnsToNextDecision,
  type Gate,
  type GateMode,
} from './gates'
import { isLoadLocus, makeLoadPool, playableSpecies } from './loadPool'
import { estimateValue, sellSnake, unitsAbsorbed, type SaturationLedger } from './market'
import {
  canPlace,
  habitatOf,
  pairingIn,
  place,
  startingStore,
  withdraw,
  type AnimalFacts,
  type HabitatState,
  type PlacementOptions,
  type PlacementWorld,
  type StoreState,
} from './placement'
import type { PlacementRefusal } from '../habitat/provisions'
import type { LifeStage } from './tuning'
import type { SnakeRecord } from './roster'
import { advanceTurn, currentTurn } from './time'
import {
  CLUTCH_SIZE_TYPICAL,
  GENE_TEST_COST,
  WEEKS_PER_YEAR,
  WEEKS_TO_MATURITY_FEMALE,
  WEEKS_TO_MATURITY_MALE,
} from './tuning'

// ---------------------------------------------------------------------------
// Species, as the running game sees them
// ---------------------------------------------------------------------------

export interface LoadedSpecies {
  /** As authored under `src/species/`. What a person edits, and what the trait cookbook means. */
  readonly authored: SpeciesDefinition<Phenotype>
  /** Authored plus the population's genetic load. What the running game actually breeds. */
  readonly playable: SpeciesDefinition<Phenotype>
  readonly pool: GeneticLoadPool
}

function loadSpecies(): Record<string, LoadedSpecies> {
  const out: Record<string, LoadedSpecies> = {}
  for (const authored of allSpecies) {
    const pool = makeLoadPool(`${authored.id}-wild-population`)
    out[authored.id] = { authored, playable: playableSpecies(authored, pool), pool }
  }
  return out
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export interface SessionOptions {
  readonly worldSeed?: string
  readonly gateMode?: GateMode
  /**
   * Eggs per clutch. One, for the first playable milestone — "breed X and Y, get a baby" is the
   * loop, and six cards to read on the first hatch is six times the reading before the loop has
   * proved itself. `CLUTCH_SIZE_TYPICAL` is what the balance model is written against.
   */
  readonly clutchSize?: number
}

/** Why a pairing cannot go ahead, in words a player can act on. */
export interface PairingCheck {
  readonly ok: boolean
  readonly reason?: string
}

export interface PairingPreview {
  readonly check: PairingCheck
  readonly mother?: SnakeRecord
  readonly father?: SnakeRecord
  /** `kinship(dam, sire)` — exactly the `F` any hatchling from this pairing would carry. */
  readonly relatedness: number
  readonly distribution?: OffspringDistribution
  /** `distribution.phenotypes()`, or `undefined` if the joint was too large to enumerate. */
  readonly outcomes?: readonly { key: string; label: string; probability: number }[]
  readonly nonViableProbability: number
  readonly nonViableReasons: readonly { value: string; probability: number }[]
  readonly incubation: string
  readonly receptivity: string
}

export class Session {
  readonly state: GameState
  readonly species: Record<string, LoadedSpecies>
  readonly saturation: SaturationLedger = {}
  readonly gateMode: GateMode
  readonly clutchSize: number

  /**
   * The store floor: which habitats are built, and who lives in each.
   *
   * Held here rather than in a component for the same reason as everything else in this class —
   * the whole of placement is drivable from a test with no renderer. The *rules* live in
   * `placement.ts` as pure functions over this value; the session only owns the current one and
   * tells its listeners when it changes.
   */
  store: StoreState = startingStore()

  /** Evidence, by individual. Belief is recomputed from this; see the file header. */
  private readonly evidence: Record<IndividualId, Evidence[]> = {}
  private gates: Gate[] = []
  private listeners = new Set<() => void>()

  constructor(options: SessionOptions = {}) {
    this.state = createGame(options.worldSeed ?? 'serpentine')
    this.species = loadSpecies()
    this.gateMode = options.gateMode ?? 'instant'
    this.clutchSize = options.clutchSize ?? 1
  }

  // -- reactivity ------------------------------------------------------------

  /** Subscribe to "something changed". Coarse on purpose — the whole app is one screen of data. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private changed(): void {
    for (const listener of [...this.listeners]) listener()
  }

  // -- reading the world -----------------------------------------------------

  get turn(): number {
    return currentTurn(this.state.flags)
  }

  get money(): number {
    return this.state.economy.balance()
  }

  residents(): readonly SnakeRecord[] {
    return this.state.roster.all()
  }

  record(id: IndividualId): SnakeRecord | undefined {
    return this.state.roster.get(id)
  }

  speciesOf(record: SnakeRecord): LoadedSpecies {
    const loaded = this.species[record.individual.species]
    if (!loaded) throw new Error(`Session: no species loaded for '${record.individual.species}'`)
    return loaded
  }

  phenotype(record: SnakeRecord): Phenotype {
    return geneticsEngine.express(record.individual, this.speciesOf(record).playable)
  }

  sexOf(record: SnakeRecord): Sex {
    return sexOf(record.individual.genotype, this.speciesOf(record).playable.sexSystem)
  }

  /** Resolves an id to the individual, for `PedigreeLookup`. Only animals still on the roster. */
  private lookup = (id: IndividualId): Individual | undefined =>
    this.state.roster.get(id)?.individual

  inbreedingOf(record: SnakeRecord): number {
    return record.inbreeding ?? inbreedingCoefficient(record.individual, this.lookup)
  }

  /**
   * The 0..1 health readout. Display only — `genetics/load.ts` is explicit that nothing in the
   * engine may consume it, and nothing here does: it feeds the card and the sale price, both of
   * which are things a *buyer* would judge, never a rule the biology runs on.
   */
  vigorOf(record: SnakeRecord): number {
    return vigorOf(record.individual, this.speciesOf(record).pool, this.inbreedingOf(record))
  }

  expressedLoadOf(record: SnakeRecord) {
    return expressedLoad(record.individual, this.speciesOf(record).pool)
  }

  /** Age 0..1 for the renderer: a hatchling grows into its adult proportions over the turns. */
  ageOf(record: SnakeRecord): number {
    if (record.source !== 'bred') return 1
    const band = this.sexOf(record) === 'female' ? WEEKS_TO_MATURITY_FEMALE : WEEKS_TO_MATURITY_MALE
    const elapsed = this.turn - record.acquiredTurn
    return Math.max(0, Math.min(1, elapsed / band[0]))
  }

  valueOf(record: SnakeRecord): number {
    const phenotype = this.phenotype(record)
    const key = this.speciesOf(record).playable.phenotypeKey(phenotype)
    return estimateValue(phenotype, {
      unitsAlreadySold: unitsAbsorbed(this.saturation, key, this.turn),
      vigor: this.vigorOf(record),
    })
  }

  /**
   * The species as the belief engine sees it when asked about **one** locus.
   *
   * `inferKnowledge` enumerates the joint candidate space across every locus, which for a ball
   * python with eleven authored loci is already six figures of genotypes and with the population's
   * sixty load loci is a number with 34 digits in it. It refuses, correctly, rather than hanging
   * the browser. So the card asks its question one locus at a time — which is also the only form
   * of the question a player ever asks: *is this one a het for albino?*
   *
   * Viability rules come off with the other loci, because a rule cannot be evaluated against a
   * locus that is not in the narrowed definition. Nothing is lost: the animal is standing in front
   * of you, so it hatched.
   */
  private narrowedTo(record: SnakeRecord, locusId: string): SpeciesDefinition<Phenotype> | undefined {
    const authored = this.speciesOf(record).authored
    const locus = authored.loci.find((l) => l.id === locusId)
    if (!locus) return undefined
    return { ...authored, loci: [locus], viability: [] }
  }

  /**
   * Evidence about one animal, re-keyed for a narrowed species.
   *
   * An `observedPhenotype` key computed over the whole species means nothing to a definition with
   * one locus in it, so the key is recomputed here from the animal's own appearance under that
   * definition. Both sides of the comparison are then produced the same way, which is what makes
   * the inference honest — the question becomes "what does how it looks, at this locus, tell me".
   */
  private evidenceUnder(id: IndividualId, species: SpeciesDefinition<Phenotype>): Evidence[] {
    const individual = this.lookup(id)
    return (this.evidence[id] ?? []).map((item) => {
      if (item.kind !== 'observedPhenotype' || !individual) return item
      return {
        kind: 'observedPhenotype',
        phenotypeKey: species.phenotypeKey(geneticsEngine.express(individual, species)),
      }
    })
  }

  /**
   * What the player believes about this animal's genotype at one authored locus.
   *
   * Load loci never appear here. They are real and they are inherited, but a panel listing sixty
   * invisible recessives teaches nothing; what the player sees of the population's load is the
   * hatch rate on the pairing screen and the vigor figure on the card.
   */
  beliefAt(record: SnakeRecord, locusId: string): GeneticKnowledge['loci'][string] | undefined {
    if (isLoadLocus(locusId)) return undefined
    const species = this.narrowedTo(record, locusId)
    if (!species) return undefined

    const others: Record<IndividualId, GeneticKnowledge> = {}
    for (const parentId of record.individual.parents ?? []) {
      if (!this.state.roster.get(parentId)) continue
      others[parentId] = geneticsEngine.inferKnowledge(
        parentId,
        this.evidenceUnder(parentId, species),
        species,
        {},
      )
    }
    return geneticsEngine.inferKnowledge(
      record.individual.id,
      this.evidenceUnder(record.individual.id, species),
      species,
      others,
    ).loci[locusId]
  }

  /** Belief across every authored locus. One narrowed inference per locus; see {@link beliefAt}. */
  knowledgeOf(record: SnakeRecord): GeneticKnowledge {
    const loci: Record<string, GeneticKnowledge['loci'][string]> = {}
    for (const locus of this.speciesOf(record).authored.loci) {
      const belief = this.beliefAt(record, locus.id)
      if (belief) loci[locus.id] = belief
    }
    return { individual: record.individual.id, loci }
  }

  evidenceFor(id: IndividualId): readonly Evidence[] {
    return this.evidence[id] ?? []
  }

  // -- pairing ---------------------------------------------------------------

  /**
   * Can these two breed, and what would come out?
   *
   * The refusal reasons are the point of this returning a `PairingCheck` rather than a boolean:
   * "these are both male" and "a ball python and a corn snake cannot produce offspring" are two
   * different lessons, and a greyed-out button teaches neither.
   */
  previewPairing(aId: IndividualId | null, bId: IndividualId | null): PairingPreview {
    const empty = {
      relatedness: 0,
      nonViableProbability: 0,
      nonViableReasons: [],
      incubation: describeBand(incubationBand()),
      receptivity: describeBand(receptivityBand()),
    }
    const a = aId ? this.state.roster.get(aId) : undefined
    const b = bId ? this.state.roster.get(bId) : undefined
    if (!a || !b) return { ...empty, check: { ok: false, reason: 'Pick two snakes.' } }
    if (a === b) return { ...empty, check: { ok: false, reason: 'A snake cannot be paired with itself.' } }
    if (a.individual.species !== b.individual.species) {
      return {
        ...empty,
        mother: a,
        father: b,
        check: {
          ok: false,
          reason: `A ${this.speciesOf(a).authored.label} and a ${this.speciesOf(b).authored.label} are different species — they cannot produce offspring.`,
        },
      }
    }
    const sexA = this.sexOf(a)
    const sexB = this.sexOf(b)
    if (sexA === sexB) {
      return {
        ...empty,
        mother: a,
        father: b,
        check: { ok: false, reason: `Both of these are ${sexA}. A pairing needs one of each.` },
      }
    }

    const mother = sexA === 'female' ? a : b
    const father = sexA === 'female' ? b : a
    const species = this.speciesOf(mother).playable
    const relatedness = kinship(mother.individual, father.individual, this.lookup)

    const distribution = geneticsEngine.punnett(mother.individual, father.individual, species, {
      maxJointOutcomes: 200_000,
    })

    let outcomes: PairingPreview['outcomes']
    try {
      outcomes = distribution
        .phenotypes()
        .map((w) => ({ key: w.value.key, label: w.value.label, probability: w.probability }))
    } catch {
      // A pairing polymorphic at enough loci to blow the joint is a real thing that can happen
      // late in a line. Losing the histogram is survivable; refusing to show the pairing is not.
      outcomes = undefined
    }

    return {
      ...empty,
      check: { ok: true },
      mother,
      father,
      relatedness,
      distribution,
      outcomes,
      nonViableProbability: distribution.nonViableProbability,
      nonViableReasons: distribution.nonViableReasons.map((w) => ({
        value: w.value,
        probability: w.probability,
      })),
    }
  }

  /**
   * The "66% possible het" panel: for one locus, the belief distribution and where it came from.
   *
   * Returns the per-outcome probabilities rather than a single number, because the single number
   * is the part a player can already read off a price tag. The arithmetic under it is the part
   * the game exists to show.
   */
  carrierBreakdown(
    record: SnakeRecord,
    locusId: string,
  ): readonly { key: string; label: string; probability: number }[] {
    const belief = this.beliefAt(record, locusId)
    if (!belief) return []
    if (belief.kind === 'certain') {
      return [{ key: belief.pair.join('/'), label: describePair(belief.pair), probability: 1 }]
    }
    if (belief.kind === 'posterior') {
      return Object.entries(belief.distribution)
        .filter(([, p]) => p > 1e-9)
        .sort((x, y) => y[1] - x[1])
        .map(([key, probability]) => ({ key, label: describePairKey(key), probability }))
    }
    const species = this.speciesOf(record).playable
    const locus = species.loci.find((l) => l.id === locusId)
    if (!locus) return []
    const pairs = possiblePairs(locus, record.individual.genotype.sexChromosomes)
    return pairs.map((pair) => ({
      key: pair.join('/'),
      label: describePair(pair),
      probability: 1 / pairs.length,
    }))
  }

  // -- acting ----------------------------------------------------------------

  /**
   * A new unrelated animal, drawn from the wild population.
   *
   * Its morph loci are drawn with a heavy thumb on wild-type, because a rehab that hands you a
   * rainbow on day one has spent the whole game's reward budget in its first minute. Its load
   * alleles come from `seedFounderLoad`, so it quietly carries three of the population's hidden
   * recessives like any real animal would.
   */
  spawnRandom(speciesId?: string, name?: string): SnakeRecord {
    const index = this.state.flags.bump('snakesSpawned')
    const rng = makeRng(`${this.state.worldSeed}:spawn:${index}`)
    const loaded = speciesId
      ? this.species[speciesId]
      : this.species[rng.pick(Object.keys(this.species))]
    if (!loaded) throw new Error(`spawnRandom: no species '${speciesId}'`)

    const id = `wild-${index}`
    const sex: Sex = rng.chance(0.5) ? 'female' : 'male'
    const sexChromosomes = loaded.playable.sexSystem
    const overrides: Record<string, [string | null, string | null]> = {}
    for (const locus of loaded.authored.loci) {
      if (!rng.chance(0.22)) continue
      const chromosomes =
        sex === sexChromosomes.heterogameticSex
          ? ([sexChromosomes.homogameticChromosome, sexChromosomes.heterogameticChromosome] as const)
          : ([sexChromosomes.homogameticChromosome, sexChromosomes.homogameticChromosome] as const)
      const pairs = possiblePairs(locus, chromosomes)
      const pick = rng.pick(pairs)
      overrides[locus.id] = [pick[0], pick[1]]
    }
    const load = seedFounderLoad(loaded.pool, loaded.playable, id)

    const individual: Individual = {
      id,
      species: loaded.authored.id,
      genotype: makeGenotype(loaded.playable, sex, { ...overrides, ...load }),
      parents: null,
      mutations: [],
    }

    const phenotype = geneticsEngine.express(individual, loaded.playable)
    const record: SnakeRecord = {
      individual,
      name: name ?? `${phenotype.label} ${loaded.authored.label}`,
      acquiredTurn: this.turn,
      source: 'rescued',
      inbreeding: 0,
      expressedLoad: expressedLoad(individual, loaded.pool).map((e) => e.locus),
    }
    this.state.roster.add(record)
    this.noteEvidence(id, { kind: 'observedPhenotype', phenotypeKey: loaded.playable.phenotypeKey(phenotype) })
    this.state.bus.emit('snake.acquired', { individualId: id, source: 'rescued' })
    this.changed()
    return record
  }

  /**
   * Breed a pairing, right now.
   *
   * Opens the incubation gate as it goes — in `'instant'` mode that gate resolves on the turn it
   * opens, which is why a hatchling is on the roster by the time this returns. Flip the session
   * to `'timed'` and the same call schedules instead.
   */
  breed(motherId: IndividualId, fatherId: IndividualId, seedOverride?: string): readonly SnakeRecord[] {
    const preview = this.previewPairing(motherId, fatherId)
    if (!preview.check.ok || !preview.mother || !preview.father) {
      throw new Error(`breed: ${preview.check.reason ?? 'this pairing is not possible'}`)
    }
    const { mother, father } = preview
    const species = this.speciesOf(mother)
    const clutchIndex = this.state.flags.bump('clutchesAttempted')

    const before = new Set(this.state.roster.all().map((r) => r.individual.id))
    breedPair(
      geneticsEngine,
      species.playable,
      {
        mother: mother.individual,
        father: father.individual,
        clutchSize: this.clutchSize,
        seed:
          seedOverride ??
          clutchSeed(this.state.worldSeed, mother.individual.id, father.individual.id, clutchIndex),
      },
      this.state.roster,
      this.state.bus,
      this.state.flags,
      this.turn,
    )

    this.gates.push(
      openGate('incubation', `${mother.individual.id}:${clutchIndex}`, incubationBand(), this.turn, this.gateMode),
    )

    const hatchlings: SnakeRecord[] = []
    for (const record of this.state.roster.all()) {
      if (before.has(record.individual.id)) continue
      const phenotype = geneticsEngine.express(record.individual, species.playable)
      // Item 14: `F` and expressed load are computed at hatch and stored here, because the game
      // layer is what owns a pedigree. `kinship(dam, sire)` — the number the pairing screen
      // showed — is the same number, by construction.
      const finished: SnakeRecord = {
        ...record,
        name: `${phenotype.label} ${species.authored.label}`,
        inbreeding: inbreedingCoefficient(record.individual, this.lookup),
        expressedLoad: expressedLoad(record.individual, species.pool).map((e) => e.locus),
      }
      this.state.roster.remove(record.individual.id)
      this.state.roster.add(finished)
      this.noteEvidence(record.individual.id, {
        kind: 'parentage',
        mother: mother.individual.id,
        father: father.individual.id,
      })
      this.noteEvidence(record.individual.id, {
        kind: 'observedPhenotype',
        phenotypeKey: species.playable.phenotypeKey(phenotype),
      })
      this.gates.push(
        openGate('maturity', record.individual.id, maturityBand(this.sexOf(finished)), this.turn, this.gateMode),
      )
      hatchlings.push(finished)
    }

    this.changed()
    return hatchlings
  }

  /**
   * Buy certainty about one locus. This is the loop's information reward, and it is what turns a
   * "possible het" into a fact.
   *
   * Recorded as `geneTest` **evidence**, not as a stored probability — belief is recomputed from
   * evidence every time it is read, so a fixed inference bug reaches an old save rather than being
   * baked into it. It also means the animal's offspring get sharper numbers for free, which is the
   * whole reason anyone would pay for a test on a breeder: the classic "66% het" is exactly what a
   * normal-looking hatchling out of two *proven* carriers is worth, and you cannot get there
   * without proving the parents first.
   */
  geneTest(id: IndividualId, locusId: string): boolean {
    const record = this.state.roster.get(id)
    if (!record) return false
    const pair = record.individual.genotype.loci[locusId]
    if (!pair) return false
    if (!this.state.economy.spend(GENE_TEST_COST, `geneTest:${id}:${locusId}`)) return false
    this.noteEvidence(id, { kind: 'geneTest', locus: locusId, pair })
    this.state.flags.bump('geneTestsRun')
    this.changed()
    return true
  }

  get geneTestCost(): number {
    return GENE_TEST_COST
  }

  sell(id: IndividualId): number {
    const record = this.state.roster.get(id)
    if (!record) throw new Error(`sell: no snake with id '${id}'`)
    const price = sellSnake(
      id,
      this.state.roster,
      this.state.economy,
      this.state.bus,
      geneticsEngine,
      this.speciesOf(record).playable,
      { ledger: this.saturation, turn: this.turn, vigor: this.vigorOf(record) },
    )
    // An animal that has left must not keep holding a slot nothing can free.
    this.store = withdraw(this.store, id)
    this.changed()
    return price
  }

  rename(id: IndividualId, name: string): void {
    const record = this.state.roster.get(id)
    if (!record) return
    this.state.roster.remove(id)
    this.state.roster.add({ ...record, name })
    this.changed()
  }

  giveCareTo(id: IndividualId): void {
    const total = (this.state.careLog[id] ?? 0) + 1
    this.state.careLog[id] = total
    this.state.flags.bump('totalCareGiven')
    this.state.bus.emit('snake.comforted', { individualId: id, totalCareGiven: total })
    this.changed()
  }

  // -- the store floor -------------------------------------------------------

  /**
   * Which life stage an animal is at, for housing purposes.
   *
   * Derived from age rather than stored, so it is right after any number of turns and cannot go
   * stale in a save. Anything that arrived from outside the rescue is an adult — the market does
   * not sell hatchlings, and a rescue does not receive one without its mother.
   */
  stageOf(record: SnakeRecord): LifeStage {
    if (record.source !== 'bred') return 'adult'
    const age = this.ageOf(record)
    return age < 0.25 ? 'hatchling' : age < 1 ? 'juvenile' : 'adult'
  }

  /** One animal, as placement sees it. Stage, species and sex; nothing else is any of its business. */
  factsOf(record: SnakeRecord): AnimalFacts {
    return {
      id: record.individual.id,
      name: record.name,
      species: record.individual.species,
      speciesLabel: this.speciesOf(record).authored.label.toLowerCase(),
      sex: this.sexOf(record),
      stage: this.stageOf(record),
    }
  }

  /**
   * The roster, as `placement.ts` reads it.
   *
   * Rebuilt on each call rather than cached: a stale housing decision is worse than a lookup, and
   * this is a map over a roster measured in dozens.
   */
  placementWorld(): PlacementWorld {
    return {
      animal: (id) => {
        const record = this.state.roster.get(id)
        return record ? this.factsOf(record) : undefined
      },
    }
  }

  /** Where an animal lives, if anywhere. Unhoused is a normal state, not an error. */
  habitatOf(id: IndividualId): HabitatState | undefined {
    return habitatOf(this.store, id)
  }

  /** Would this placement be allowed? `null` for yes; otherwise a refusal to show the player. */
  checkPlacement(id: IndividualId, habitatId: string, options: PlacementOptions = {}): PlacementRefusal | null {
    return canPlace(this.store, habitatId, id, this.placementWorld(), options)
  }

  /**
   * Move an animal into a habitat.
   *
   * Returns the refusal instead of throwing, because the caller here is a UI and a refusal is a
   * thing to *show*, not an exception to handle. `null` means it went in.
   */
  placeSnake(id: IndividualId, habitatId: string, options: PlacementOptions = {}): PlacementRefusal | null {
    const refusal = this.checkPlacement(id, habitatId, options)
    if (refusal) return refusal
    this.store = place(this.store, habitatId, id, this.placementWorld(), options)
    this.changed()
    return null
  }

  /** Take an animal off the floor — back to the binder, holding no slot. */
  unhouse(id: IndividualId): void {
    const next = withdraw(this.store, id)
    if (next === this.store) return
    this.store = next
    this.changed()
  }

  /** The couple currently sharing a habitat, if there is one. What the store screen offers to breed. */
  pairingIn(habitatId: string): { readonly motherId: IndividualId; readonly fatherId: IndividualId } | undefined {
    return pairingIn(this.store, habitatId, this.placementWorld())
  }

  /**
   * Breed the pair living in a habitat.
   *
   * **Deliberately a two-line method.** It finds the couple and calls {@link breed} — the existing
   * path, with its existing checks, its existing gates and its existing `F` bookkeeping. Housing
   * two compatible animals together is a *way to reach* breeding, not a second breeding mechanism,
   * and the moment this file grew its own clutch logic the two would start to disagree.
   */
  breedInHabitat(habitatId: string): readonly SnakeRecord[] {
    const pair = this.pairingIn(habitatId)
    if (!pair) throw new Error(`breedInHabitat: no pairing in '${habitatId}'`)
    return this.breed(pair.motherId, pair.fatherId)
  }

  // -- time ------------------------------------------------------------------

  advance(turns = 1): number {
    let turn = this.turn
    for (let i = 0; i < turns; i++) turn = advanceTurn(this.state.flags, this.state.bus)
    this.gates = this.gates.filter((gate) => !isResolved(gate, turn))
    this.changed()
    return turn
  }

  /**
   * One control that advances to the next turn that asks a question, not merely the next turn.
   *
   * This is the resolution of the time-versus-feedback tension, and it is checkable rather than
   * a claim: `MAX_DECISIONS_PER_GENERATION` decisions and `MIN_TURNS_PER_DECISION` turns each,
   * both asserted in `tuning.test.ts`. A "next decision" button that advanced one week would be
   * an End Turn button with a longer label, and forty-five clicks of nothing is the same slow
   * loop as a real-time timer, paid in a different currency.
   */
  advanceToNextDecision(): number {
    return this.advance(turnsToNextDecision(this.gates, this.turn))
  }

  /** A season, for when you are waiting on nothing in particular and want the animals to grow. */
  advanceSeason(): number {
    return this.advance(Math.round(WEEKS_PER_YEAR / 4))
  }

  /** Cheat mode's "mature everything, now". Every pending gate resolves where it stands. */
  resolveAllGates(): void {
    this.gates = []
    this.changed()
  }

  /**
   * Jump a whole generation: enough turns that every animal on the roster is grown.
   *
   * The slowest gate in the game is a female reaching breeding age, so that is the one this
   * measures against — anything shorter would leave the lineage half-jumped.
   */
  advanceGeneration(): number {
    return this.advance(WEEKS_TO_MATURITY_FEMALE[1])
  }

  /** Swap one animal's genetics in place, keeping its name and history. Cheat mode only. */
  replaceIndividual(id: IndividualId, individual: Individual): void {
    const record = this.state.roster.get(id)
    if (!record) return
    this.state.roster.remove(id)
    this.state.roster.add({ ...record, individual })
    this.changed()
  }

  pendingGates(): readonly Gate[] {
    return this.gates.filter((gate) => !isResolved(gate, this.turn))
  }

  // -- internals -------------------------------------------------------------

  noteEvidence(id: IndividualId, item: Evidence): void {
    const list = this.evidence[id] ?? []
    list.push(item)
    this.evidence[id] = list
  }

  /** Used by cheat mode, which is allowed to write straight into the live game. */
  addRecord(record: SnakeRecord): void {
    this.state.roster.add(record)
    this.changed()
  }

  notifyChanged(): void {
    this.changed()
  }
}

/** A typical clutch, for the screens that want to talk about one. */
export const TYPICAL_CLUTCH = CLUTCH_SIZE_TYPICAL

// ---------------------------------------------------------------------------
// Small formatting helpers, shared by the screens
// ---------------------------------------------------------------------------

export function describePair(pair: readonly (string | null)[]): string {
  return describeCopies(pair.filter((a): a is string => a !== null))
}

/**
 * A genotype key, spelled out.
 *
 * The empty-string case is real and worth naming rather than rendering as a blank cell: it is a
 * sex-linked locus on a chromosome this animal does not have. "Not carried" is a fact about the
 * animal, and a fact is better than an empty box.
 */
export function describePairKey(key: string): string {
  return describeCopies(key.split('/').filter((part) => part !== '' && part !== 'null'))
}

function describeCopies(copies: readonly string[]): string {
  if (copies.length === 0) return 'not carried on this animal\u2019s chromosomes'
  if (copies.length === 1) return `${copies[0]} (one copy)`
  return `${copies[0]} / ${copies[1]}`
}

export function percent(p: number, digits = 0): string {
  return `${(p * 100).toFixed(digits)}%`
}
