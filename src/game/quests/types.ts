/**
 * Serpentine — quests: the contract.
 *
 * This file is the interface between the two things a quest system is made of, and they are built
 * by different people at the same time. **Quest content** is object literals in `content/`, written
 * against the types here and importing nothing else. **The quest runtime** — the journal, the
 * evaluator, persistence and the UI — is built against the same types and never mentions a quest.
 * Neither blocks the other, which is the whole reason this file exists before either of them.
 *
 * The design and the reasoning are in `docs/quest-design.md`. The three things worth knowing before
 * reading any further:
 *
 * ## 1. A quest is guidance and never a gate
 *
 * Nothing in the game is behind a quest. That is not a convention, it is enforced: a quest does not
 * compile to an `Unlock`, has no `grants`, and no `UnlockCondition` anywhere in the game is allowed
 * to read a flag under `quest.`. A player who turns the system off on turn one can still do
 * everything. Every other decision in this file is affordable because of that one.
 *
 * ## 2. A predicate is data, exactly as an achievement's requirement is
 *
 * Same three reasons `achievements/types.ts` gives: the inputs are derivable, so evaluation can be
 * indexed ({@link actsIn}); the strength of a predicate can be *computed* rather than claimed
 * ({@link strengthOf}); and a predicate cannot quietly reach into the roster. What differs is what
 * they read. An achievement reads counters and answers *what have you accomplished*. A quest reads
 * **acts** — a recorded history of what the player did, in order, about which animal — and answers
 * *what should you try next*. Quests read the `ach.*` tallies for state checks rather than keeping
 * counters of their own; a second counter for the same fact is a counter that will disagree.
 *
 * ## 3. Strength is the anti-accident mechanism
 *
 * A step that gates understanding must complete only on an act sequence that demonstrates it — not
 * on a proxy state a player could satisfy blindly. {@link PredicateStrength} names the three tiers,
 * {@link strengthOf} computes which one a signal is, and {@link stepObeysAntiAccidentRule} is the
 * assertion a test makes over the shipped catalogue. The rule is mechanical because a rule that
 * depends on an author's judgement is a rule that erodes.
 */
import type { FlagId } from '../seams'

export type QuestId = string
export type StepId = string
export type ChapterId = string

/**
 * Mirrors `genetics/types.ts`'s `Sex` and `tuning.ts`'s `LifeStage` rather than importing them.
 *
 * Same reasoning as `seams.ts`: a contract file that names no gene, no species and no engine type
 * can be referenced from anywhere — including from content files that are forbidden to import
 * anything else — without dragging a dependency along.
 */
export type SexName = 'male' | 'female'
export type StageName = 'hatchling' | 'juvenile' | 'adult'

/** Matches `ui/cardModel.ts`'s `Mechanism`. How a locus expresses. */
export type MechanismName = 'recessive' | 'dominant' | 'incomplete' | 'multi'

/** What the player currently believes about one locus on one animal. */
export type BeliefState = 'unknown' | 'possibleHet' | 'provenHet' | 'homozygous' | 'visible'

// ---------------------------------------------------------------------------
// Acts — the catalogue
// ---------------------------------------------------------------------------

/**
 * Every act a quest predicate may refer to, with its filterable fields.
 *
 * **This map is the interface between the content agent and the implementation agent.** Content
 * chooses from it; the runtime is responsible for producing exactly these observations and no
 * others. An act that is missing is a message to the implementation agent, never a local fix.
 *
 * Three families, and the split matters for {@link strengthOf}:
 *
 * - **Consequences** — things the game did (`egg.hatched`, `money.changed`). Incidental: they say
 *   nothing about what the player was thinking.
 * - **Deliberate acts** — things the player did that only exist because they chose them
 *   (`pairing.committed`, `snake.placed`).
 * - **`ui.*` intents** — deliberate acts on the surfaces that *carry the concepts*: the notebook at
 *   a locus, one row of a Punnett preview, the explanation behind a non-viable egg. These are new
 *   events, declared by the runtime through the declaration-merging seam `seams.ts` documents, and
 *   they are what makes the demonstrative tier reachable at all.
 *
 * A note on why `ui.pairingPreviewed` is an event rather than a state read: `Session.previewPairing`
 * is a pure function called on every render, so its having been called is worth nothing as evidence
 * of intent. The player *opening* the preview is worth everything.
 */
export interface ActPayloadMap {
  // -- consequences ---------------------------------------------------------
  'turn.advanced': { turn: number }
  'money.changed': { balance: number; delta: number; reason: string }
  'snake.matured': { individualId: string; speciesId: string; sex: SexName }
  'clutch.laid': { pairingId: string; clutchSeed: string; eggCount: number }
  'clutch.hatched': {
    pairingId: string
    clutchSeed: string
    hatchedCount: number
    unhatchedCount: number
  }
  'egg.hatched': { individualId: string; clutchSeed: string; pairingId: string; speciesId: string }
  'egg.notViable': { clutchSeed: string; ruleId: string; locusId: string }
  'pairing.lapsed': { pairingId: string; reason: string }
  'trait.discovered': { speciesId: string; locusId: string; value: string }
  'allele.discovered': { speciesId: string; locusId: string; alleleId: string }

  // -- deliberate acts ------------------------------------------------------
  'species.chosen': { speciesId: string }
  'snake.acquired': { individualId: string; speciesId: string; source: string }
  'snake.bought': { individualId: string; speciesId: string; price: number }
  'snake.sold': { individualId: string; speciesId: string; price: number }
  'snake.named': { individualId: string; name: string }
  'snake.comforted': { individualId: string }
  'snake.placed': {
    individualId: string
    speciesId: string
    sex: SexName
    habitatId: string
    stage: StageName
  }
  'snake.unhoused': { individualId: string; habitatId: string }
  'placement.refused': { individualId: string; habitatId: string; reasonId: string }
  'pairing.introduced': {
    pairingId: string
    motherId: string
    fatherId: string
    speciesId: string
    relatedness: number
  }
  'pairing.committed': {
    pairingId: string
    motherId: string
    fatherId: string
    speciesId: string
    relatedness: number
    nonViableProbability: number
  }
  'geneTest.run': { individualId: string; locusId: string; speciesId: string; cost: number }
  /**
   * A locus was established by test breeding. Straight from the existing bus event, and the single
   * best piece of evidence in the game: a locus cannot be proven by accident, because proving it
   * meant designing and running a cross. Demonstrative on its own — see {@link DEMONSTRATIVE_ACTS}.
   */
  'genetics.proven': { individualId: string; locusId: string; speciesId: string }

  // -- ui intents -----------------------------------------------------------
  /** Weak by design. Incidental tier only; never the evidence for a teaching step. */
  'ui.screenOpened': { screen: string }
  'ui.cardOpened': {
    individualId: string
    speciesId: string
    pairingId: string
    /**
     * What this animal *looks like*, in the same key space as
     * {@link ActPayloadMap['ui.punnettOutcomeInspected'].phenotypeKey} — both are
     * `SpeciesDefinition.phenotypeKey(phenotype)`.
     *
     * Here so that "the outcome you predicted is the animal you came back for" is expressible.
     * Without it a P1 through-line can only say the player read *an* outcome and later opened *an*
     * animal of that pairing, which is what a blind run produces on its own.
     */
    phenotypeKey: string
  }
  'ui.cardRevealed': { individualId: string }
  'ui.notebookOpened': { individualId: string; speciesId: string }
  'ui.notebookLocusOpened': {
    individualId: string
    speciesId: string
    locusId: string
    mechanism: MechanismName
    belief: BeliefState
  }
  'ui.pairingPreviewed': {
    motherId: string
    fatherId: string
    speciesId: string
    relatedness: number
    nonViableProbability: number
    /**
     * The locus the two booleans below are about — the one the breeding screen has in view.
     *
     * Its absence was a bug rather than a simplification. `motherShows` / `fatherShows` were
     * documented as "whether each parent visibly shows the trait at the locus in view" and the act
     * then never said which locus that was, so P4 could require *neither parent showed a trait* and
     * *the baby shows a trait* but not that they be the **same** trait — which is the whole concept.
     * The emit site has always known the value.
     */
    locusId: string
    /** Whether each parent visibly shows the trait at {@link locusId}. Drives pattern P4. */
    motherShows: boolean
    fatherShows: boolean
  }
  'ui.punnettOutcomeInspected': {
    motherId: string
    fatherId: string
    phenotypeKey: string
    probability: number
  }
  'ui.viabilityExplanationRead': { clutchSeed: string; ruleId: string }
  'ui.habitatOpened': { habitatId: string }
  'ui.glossaryTermOpened': { termId: string }
  'ui.pedigreeOpened': { individualId: string; generations: number }
}

export type ActKind = keyof ActPayloadMap

/** One recorded act. Flat, plain data, and everything a predicate is ever allowed to see. */
export interface Observation<K extends ActKind = ActKind> {
  readonly act: K
  /** The in-game turn it happened on. Never a wall clock — see the balance charter, principle 1. */
  readonly at: number
  /** Monotonic across the whole save. Never resets; how `sequence` knows what came first. */
  readonly seq: number
  readonly fields: ActPayloadMap[K]
}

// ---------------------------------------------------------------------------
// Signals — a predicate, as data
// ---------------------------------------------------------------------------

/**
 * What two acts must agree about for a group of them to count as one story.
 *
 * This is the anti-accident workhorse. Three clicks on three animals is browsing; the same three
 * clicks all concerning *the same animal at the same locus* is a player following a gene. Binding
 * is what turns a pile of acts into evidence, and coincidence does not produce through-lines.
 */
export type BindKey =
  | 'individual'
  | 'pairing'
  | 'clutch'
  | 'locus'
  | 'species'
  | 'habitat'
  | 'offspring'
  | 'phenotype'

/**
 * Keys that may only ever appear in a `bound` filter, never in a group's `bind` array.
 *
 * `offspring` reads the same field as `individual` — `individualId` — so in a `bind` array the two
 * are indistinguishable and putting both there is a contradiction the evaluator would resolve by
 * making the group unsatisfiable. As a cross-reference it is exactly what P2 needed: `bind` holds
 * one value per key, so following a gene from a parent into its baby means naming *two* animals in
 * one group, and there was no second name for one. {@link stepUsesCrossRefKeysCorrectly} is the
 * assertion; `witness.test.ts` runs it over the catalogue.
 */
export const CROSS_REFERENCE_ONLY_KEYS: ReadonlySet<BindKey> = new Set<BindKey>(['offspring'])

export type FilterOp = 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'in' | 'bound'
export type FilterValue = string | number | boolean

export type ActField<K extends ActKind> = Extract<keyof ActPayloadMap[K], string>

/**
 * One condition on one field of one act.
 *
 * `op: 'bound'` is the cross-reference: the field must equal whatever a sibling element of the same
 * bundle or sequence captured under `key`. That is how "the same locus, on the hatchling this time"
 * is expressed without the content agent writing code.
 */
export interface ActFilter<K extends ActKind> {
  readonly field: ActField<K>
  readonly op: FilterOp
  readonly value?: FilterValue | readonly FilterValue[]
  /** Required when `op` is `'bound'`, ignored otherwise. */
  readonly key?: BindKey
}

/** One act happened, optionally matching filters. The distributive form keeps `where` typed per act. */
export type ActSignal<K extends ActKind = ActKind> = K extends ActKind
  ? {
      readonly kind: 'act'
      readonly act: K
      readonly where?: readonly ActFilter<K>[]
      /** ≤6 words. Shown as one line of a "2 of 3" breakdown. */
      readonly label?: string
    }
  : never

/** The same act, n times. */
export type CountSignal<K extends ActKind = ActKind> = K extends ActKind
  ? {
      readonly kind: 'count'
      readonly act: K
      readonly where?: readonly ActFilter<K>[]
      readonly atLeast: number
      readonly label?: string
    }
  : never

/** The same act over n *different* animals, species or loci. "Keep two species." */
export type DistinctSignal<K extends ActKind = ActKind> = K extends ActKind
  ? {
      readonly kind: 'distinct'
      readonly act: K
      readonly where?: readonly ActFilter<K>[]
      readonly by: BindKey
      readonly atLeast: number
      readonly label?: string
    }
  : never

/**
 * A read of state rather than of history. Always incidental (see {@link strengthOf}), so never the
 * evidence for a step that gates understanding.
 *
 * `flagAtLeast` and `flagIsTrue` read any flag, and in practice that means the `ach.*` tallies —
 * which is the deliberate compose point with the achievement system. `rosterHas` is the one thing
 * here that walks the collection; it is evaluated only when a quest is offered or when an indexed
 * act fires, and at most a handful of steps are ever active. That is a different budget from the
 * achievement system's, which is why it is allowed here and forbidden there.
 */
export type StateSignal =
  | { readonly kind: 'flagAtLeast'; readonly flag: FlagId; readonly value: number; readonly label?: string }
  | { readonly kind: 'flagIsTrue'; readonly flag: FlagId; readonly label?: string }
  | {
      readonly kind: 'rosterHas'
      readonly speciesId?: string
      readonly sex?: SexName
      readonly mature?: boolean
      readonly atLeast: number
      readonly label?: string
    }

/**
 * Several acts, all about the same thing, **in any order**. The default group and the one to reach
 * for first.
 *
 * Unordered on purpose: requiring an order the game does not require is how a step ends up never
 * firing because the player did the right thing backwards, and a step that never fires is the one
 * failure mode this design treats as worse than the rest (`docs/quest-design.md` §B4).
 */
export interface BundleSignal {
  readonly kind: 'bundle'
  readonly bind: readonly BindKey[]
  readonly of: readonly ActSignal[]
  readonly label?: string
}

/**
 * Several acts, all about the same thing, **in this order**.
 *
 * Only legitimate where the acts are *physically* ordered — you cannot open a hatchling's card
 * before the clutch hatched. If two acts are causally independent, use a {@link BundleSignal}; a
 * required order that the world does not require is a guess by the author and a trap for the player.
 */
export interface SequenceSignal {
  readonly kind: 'sequence'
  readonly bind: readonly BindKey[]
  readonly of: readonly ActSignal[]
  /**
   * All elements within this many turns. **The tutorial arc must not use this** — a window is the
   * classic cause of a predicate that never fires. It exists for a future mechanic that genuinely
   * needs adjacency, and a use needs a written reason.
   */
  readonly within?: { readonly turns: number }
  readonly label?: string
}

export interface AllSignal {
  readonly kind: 'all'
  readonly of: readonly QuestSignal[]
}

export interface AnySignal {
  readonly kind: 'any'
  readonly of: readonly QuestSignal[]
  /** Required: "any of" cannot describe itself the way "all of" can. */
  readonly label: string
}

export type QuestSignal =
  | ActSignal
  | CountSignal
  | DistinctSignal
  | StateSignal
  | BundleSignal
  | SequenceSignal
  | AllSignal
  | AnySignal

// ---------------------------------------------------------------------------
// Predicate strength
// ---------------------------------------------------------------------------

/**
 * How hard this predicate is to satisfy without understanding what it is about.
 *
 * - `incidental` — game state happened to hold. Proves nothing about the player.
 * - `deliberate` — the player performed an act. Proves attention; not comprehension.
 * - `demonstrative` — the player performed a bound group of acts, or aimed a single act using a
 *   judgement, in a way that has no innocent explanation.
 */
export type PredicateStrength = 'incidental' | 'deliberate' | 'demonstrative'

const STRENGTH_RANK: Record<PredicateStrength, number> = {
  incidental: 0,
  deliberate: 1,
  demonstrative: 2,
}

/** Acts that are consequences of the world rather than choices by the player. */
export const INCIDENTAL_ACTS: ReadonlySet<string> = new Set<ActKind>([
  'turn.advanced',
  'money.changed',
  'snake.matured',
  'clutch.laid',
  'clutch.hatched',
  'egg.hatched',
  'egg.notViable',
  'pairing.lapsed',
  'trait.discovered',
  'allele.discovered',
  'ui.screenOpened',
])

/**
 * Acts that demonstrate understanding on their own, because there is no way to perform them
 * without having designed something. Currently one, and it is the best evidence in the game.
 */
export const DEMONSTRATIVE_ACTS: ReadonlySet<string> = new Set<ActKind>(['genetics.proven'])

/**
 * Fields whose value encodes a *call the player made* rather than a fact about the world.
 *
 * Filtering an act on one of these promotes it to demonstrative: committing a pairing is a click,
 * but committing one whose `relatedness` is under 0.0625 right after the step asked for an outcross
 * is a click that had to be aimed.
 */
export const JUDGEMENT_FIELDS: Readonly<Partial<Record<ActKind, readonly string[]>>> = {
  'pairing.committed': ['relatedness', 'nonViableProbability'],
  'ui.pairingPreviewed': ['relatedness', 'nonViableProbability', 'motherShows', 'fatherShows'],
  'ui.punnettOutcomeInspected': ['probability', 'phenotypeKey'],
  'ui.notebookLocusOpened': ['belief', 'mechanism'],
}

function actStrength(act: string, where: readonly { field: string; op: FilterOp }[]): PredicateStrength {
  if (DEMONSTRATIVE_ACTS.has(act)) return 'demonstrative'
  const judgement = JUDGEMENT_FIELDS[act as ActKind] ?? []
  // `bound` is a cross-reference, not a call — it is the binding that earns strength, not the op.
  if (where.some((f) => f.op !== 'bound' && judgement.includes(f.field))) return 'demonstrative'
  if (INCIDENTAL_ACTS.has(act)) return 'incidental'
  return 'deliberate'
}

function filtersOf(signal: QuestSignal): readonly { field: string; op: FilterOp }[] {
  const where = (signal as { where?: readonly { field: string; op: FilterOp }[] }).where
  return where ?? []
}

/**
 * Compute a signal's strength. Pure, total, and the reason the anti-accident rule is checkable
 * rather than aspirational.
 *
 * Two cases are worth reading twice. A **bundle or sequence of two or more bound acts is
 * demonstrative**, whatever its parts are — the binding is the evidence. And **`any` takes the
 * weakest of its branches**, because a player will satisfy it by whichever branch is easiest, so
 * one weak alternative makes the whole thing weak.
 */
export function strengthOf(signal: QuestSignal): PredicateStrength {
  switch (signal.kind) {
    case 'act':
    case 'count':
    case 'distinct':
      return actStrength(signal.act, filtersOf(signal))
    case 'flagAtLeast':
    case 'flagIsTrue':
    case 'rosterHas':
      return 'incidental'
    case 'bundle':
    case 'sequence': {
      if (signal.of.length >= 2 && signal.bind.length >= 1) return 'demonstrative'
      return strongest(signal.of)
    }
    case 'all':
      return strongest(signal.of)
    case 'any':
      return weakest(signal.of)
  }
}

function strongest(of: readonly QuestSignal[]): PredicateStrength {
  let best: PredicateStrength = 'incidental'
  for (const child of of) {
    const s = strengthOf(child)
    if (STRENGTH_RANK[s] > STRENGTH_RANK[best]) best = s
  }
  return best
}

function weakest(of: readonly QuestSignal[]): PredicateStrength {
  if (of.length === 0) return 'incidental'
  let worst: PredicateStrength = 'demonstrative'
  for (const child of of) {
    const s = strengthOf(child)
    if (STRENGTH_RANK[s] < STRENGTH_RANK[worst]) worst = s
  }
  return worst
}

/** Every act kind a signal could care about. The index that keeps evaluation off the hot path. */
export function actsIn(signal: QuestSignal): readonly ActKind[] {
  const out = new Set<ActKind>()
  const walk = (node: QuestSignal): void => {
    switch (node.kind) {
      case 'act':
      case 'count':
      case 'distinct':
        out.add(node.act)
        return
      case 'flagAtLeast':
      case 'flagIsTrue':
      case 'rosterHas':
        return
      case 'bundle':
      case 'sequence':
        for (const child of node.of) walk(child)
        return
      case 'all':
      case 'any':
        for (const child of node.of) walk(child)
    }
  }
  walk(signal)
  return [...out]
}

// ---------------------------------------------------------------------------
// The quest
// ---------------------------------------------------------------------------

/** The six things the tutorial exists to teach. See `docs/quest-design.md` §B2. */
export type ConceptId =
  | 'expression'
  | 'carriers'
  | 'odds'
  | 'provingOut'
  | 'relatedness'
  | 'viability'

/** The named demonstrative shapes. `docs/quest-design.md` §B3. */
export type PatternId = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6'

export interface QuestStep {
  readonly id: StepId
  /** One short imperative line. "Put a male corn snake in a habitat." Limits in {@link LIMITS}. */
  readonly text: string
  readonly when: QuestSignal
  /**
   * Steps this one physically requires. **Empty is the default and the norm.**
   *
   * For causality only — you cannot open a hatchling's card before the clutch hatched. Never for
   * reading order: the array order already is the reading order, and a step blocked for pedagogy
   * is invisible progress. If a teaching order matters, it belongs inside one step's signal as a
   * {@link SequenceSignal}, where the player can see the parts they have already done.
   */
  readonly after?: readonly StepId[]
  /** Shown after a few turns of no progress. Names the screen. Never widens the predicate. */
  readonly hint?: string
  /**
   * Marks this step as the game's evidence that a concept landed.
   *
   * Carries an obligation: {@link stepObeysAntiAccidentRule} must hold, a witness test must prove
   * the predicate can fire, and the blind-playthrough test must prove it does not fire by accident.
   */
  readonly gates?: 'understanding'
  /** Which named pattern this uses. Required whenever `gates` is set. */
  readonly pattern?: PatternId
}

export interface QuestOffer {
  /** Display order within the arc. */
  readonly order: number
  /** Offered once this holds. Absent means "from the first turn". */
  readonly when?: QuestSignal
  /**
   * Offered only once these quests are done.
   *
   * This orders the *arc*, not the game: a quest not yet offered still leaves every mechanic it
   * would have covered fully available. A player who never sees quest 14 can still prove a het.
   */
  readonly after?: readonly QuestId[]
}

export interface Quest {
  readonly id: QuestId
  readonly chapter: ChapterId
  /** ≤5 words. */
  readonly title: string
  /** One line: what you will learn. ≤14 words. */
  readonly intent: string
  readonly offer: QuestOffer
  /** Three to five. See {@link LIMITS.stepsPerQuest}. */
  readonly steps: readonly QuestStep[]
  /** Which of the six concepts this quest is responsible for, if any. */
  readonly teaches?: readonly ConceptId[]
}

/**
 * There is deliberately no `grants` field.
 *
 * A quest pays nothing. Rewards would put ignoring the tutorial on the losing line of the economy,
 * which brushes balance-charter principles 4 and 5 for no gain. The sanctioned path to a badge is an
 * achievement that reads `quest.completed` — permitted precisely because an achievement whose own
 * `grants` is empty is a record rather than a capability, and so is not a gate.
 */
export type QuestStatus = 'offered' | 'active' | 'done' | 'dismissed'

/** The chapter a quest belongs to. Titles and intents live with the content. */
export interface Chapter {
  readonly id: ChapterId
  readonly label: string
  readonly order: number
}

// ---------------------------------------------------------------------------
// The anti-accident rule, as an assertion
// ---------------------------------------------------------------------------

/**
 * The rule from `docs/quest-design.md` §B2, in one function.
 *
 * A step marked as gating understanding must use a demonstrative signal. Asserted over the whole
 * shipped catalogue in a test, so the rule holds by construction rather than by review.
 */
export function stepObeysAntiAccidentRule(step: QuestStep): boolean {
  if (step.gates !== 'understanding') return true
  return strengthOf(step.when) === 'demonstrative' && step.pattern !== undefined
}

/**
 * Every misuse of a {@link CROSS_REFERENCE_ONLY_KEYS} key in one signal, as a list of complaints.
 *
 * A group `bind` and a `distinct` `by` both resolve a key through `bindValueOf`, where `offspring`
 * is `individualId` — the same field `individual` reads. Used there it is a silent synonym at best
 * and an unsatisfiable contradiction at worst, and either way it is not what the key is for.
 */
export function crossReferenceKeyMisuses(signal: QuestSignal): readonly string[] {
  const out: string[] = []
  const walk = (node: QuestSignal): void => {
    switch (node.kind) {
      case 'distinct':
        if (CROSS_REFERENCE_ONLY_KEYS.has(node.by)) {
          out.push(`distinct by '${node.by}', which is a cross-reference key`)
        }
        return
      case 'bundle':
      case 'sequence':
        for (const key of node.bind) {
          if (CROSS_REFERENCE_ONLY_KEYS.has(key)) {
            out.push(`'${key}' in a group bind, where it is a synonym for 'individual'`)
          }
        }
        for (const child of node.of) walk(child)
        return
      case 'all':
      case 'any':
        for (const child of node.of) walk(child)
    }
  }
  walk(signal)
  return out
}

// ---------------------------------------------------------------------------
// Reading level
// ---------------------------------------------------------------------------

/**
 * The reading budget, as numbers a test can check.
 *
 * Where they come from: silent reading at 7th grade runs about 150 words a minute, so thirty
 * seconds is seventy-five words and that is the budget for a whole quest. A nine-word step is under
 * four seconds, which is what glancing at the header strip has to cost.
 */
export const LIMITS = {
  titleWords: 5,
  titleChars: 34,
  intentWords: 14,
  intentChars: 90,
  stepWords: 9,
  stepChars: 60,
  hintWords: 14,
  hintChars: 90,
  labelWords: 6,
  labelChars: 40,
  glossWords: 12,
  stepsPerQuest: 5,
  /** Title + intent + every step and hint, together. The thirty-second budget. */
  questWords: 75,
  /** Flesch–Kincaid grade level, per quest. A coarse backstop; the word-length rule does the work. */
  fkGrade: 7,
  /** Any word longer than this many syllables must be a {@link GlossaryEntry}. */
  maxSyllables: 3,
  /** Observations kept for retroactive replay. See `docs/quest-design.md` §A4. */
  journalSize: 200,
  /** Turns a step may sit with no progress before its hint appears. */
  hintAfterTurns: 3,
} as const

/** A step's text must not contain any of these. A clause is two steps, or a hint. */
export const FORBIDDEN_STEP_CHARS: readonly string[] = [',', ';', ':', '(', ')', '—']

/**
 * A step's first word must be one of these.
 *
 * Extending the set is a one-line edit and a deliberate speed bump — it is what stops "The corn
 * snake needs a habitat" from becoming a step. Keep the register imperative and the verbs plain.
 */
export const IMPERATIVE_VERBS: ReadonlySet<string> = new Set([
  'add',
  'advance',
  'aim',
  'breed',
  'bring',
  'buy',
  'check',
  'choose',
  'compare',
  'find',
  'give',
  'hatch',
  'keep',
  'look',
  'make',
  'move',
  'name',
  'open',
  'pair',
  'pick',
  'place',
  'plan',
  'predict',
  'prove',
  'put',
  'read',
  'run',
  'sell',
  'set',
  'show',
  'take',
  'test',
  'wait',
  'watch',
])

/**
 * A hard word the game is allowed to use, because the game teaches it.
 *
 * This is the real reading-level control: any word over {@link LIMITS.maxSyllables} syllables must
 * appear here with a gloss, which converts "keep it simple" into "you may only use a hard word the
 * game explicitly explains". `recessive` qualifies because it is the curriculum. `subsequently`
 * does not, and never will.
 */
export interface GlossaryEntry {
  readonly term: string
  /** ≤12 words. Shown on first use and in the quest list. */
  readonly gloss: string
  readonly concept?: ConceptId
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/** Everything a quest writes to the save lives under here. `ach.` is the neighbouring precedent. */
export const QUEST_PREFIX = 'quest.'

export const QUEST_FLAGS = {
  /** How many quests finished. What an achievement reads, so it needs no quest id. */
  completed: 'quest.completed' as FlagId,
  dismissed: 'quest.dismissed' as FlagId,
  /** The player turned the whole system off. Two clicks, reversible, nothing is lost. */
  off: 'quest.off' as FlagId,
} as const

export function questStatusFlag(id: QuestId): FlagId {
  return `${QUEST_PREFIX}status.${id}`
}

export function questStepFlag(questId: QuestId, stepId: StepId): FlagId {
  return `${QUEST_PREFIX}step.${questId}.${stepId}`
}

export function questCompletedTurnFlag(id: QuestId): FlagId {
  return `${QUEST_PREFIX}completedTurn.${id}`
}

/**
 * This quest was done before it was ever shown, so the list collapses it (§A4).
 *
 * A flag rather than a field on the runtime because it has to survive a reload. Held in memory it was
 * true for the session that retired the quest and false for every session after, which turns "never
 * shown" into "shown from the second launch onwards" — the congratulation-for-the-past rule losing to
 * a save round trip rather than to a decision.
 */
export function questRetiredFlag(id: QuestId): FlagId {
  return `${QUEST_PREFIX}retired.${id}`
}

/** True for any flag no `UnlockCondition` is allowed to read. Asserted in `notAGate.test.ts`. */
export function isQuestFlag(flag: FlagId): boolean {
  return flag.startsWith(QUEST_PREFIX)
}

/**
 * The quest slice of the save file, alongside the existing `inFlight` slice.
 *
 * The journal is structured and so cannot be a `FlagValue`; everything else a quest remembers is a
 * flag, which is why there is nothing else in here. Bounded at {@link LIMITS.journalSize}, newest
 * last. A save without this slice starts empty — there are no real saves to migrate.
 */
export interface QuestSave {
  readonly journal: readonly Observation[]
  /** Monotonic observation counter. Never resets, so `sequence` orderings survive a reload. */
  readonly seq: number
}

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

/**
 * Sugar over the data above, so a quest file reads as prose instead of as JSON.
 *
 * They construct values and evaluate nothing — the runtime's `evaluate.ts` is what interprets them.
 * The internal casts are because the signal types distribute over `ActKind` to keep `where` typed
 * per act at the *call site*, which is where the checking is worth having; inside a generic
 * function the parameter is unresolved and TypeScript cannot see through it.
 */
export function act<K extends ActKind>(
  kind: K,
  where?: readonly ActFilter<K>[],
  label?: string,
): ActSignal {
  return { kind: 'act', act: kind, where, label } as ActSignal
}

export function count<K extends ActKind>(
  kind: K,
  atLeast: number,
  where?: readonly ActFilter<K>[],
  label?: string,
): CountSignal {
  return { kind: 'count', act: kind, atLeast, where, label } as CountSignal
}

export function distinct<K extends ActKind>(
  kind: K,
  by: BindKey,
  atLeast: number,
  where?: readonly ActFilter<K>[],
  label?: string,
): DistinctSignal {
  return { kind: 'distinct', act: kind, by, atLeast, where, label } as DistinctSignal
}

/** Bound, unordered. The default group — reach for this before {@link sequence}. */
export function bundle(
  bind: readonly BindKey[],
  of: readonly ActSignal[],
  label?: string,
): BundleSignal {
  return { kind: 'bundle', bind, of, label }
}

/** Bound and ordered. Only where the acts are physically ordered. */
export function sequence(
  bind: readonly BindKey[],
  of: readonly ActSignal[],
  label?: string,
): SequenceSignal {
  return { kind: 'sequence', bind, of, label }
}

export function allOf(...of: readonly QuestSignal[]): AllSignal {
  return { kind: 'all', of }
}

export function anyOf(label: string, ...of: readonly QuestSignal[]): AnySignal {
  return { kind: 'any', of, label }
}

export function flagAtLeast(flag: FlagId, value: number, label?: string): StateSignal {
  return { kind: 'flagAtLeast', flag, value, label }
}

export function flagIsTrue(flag: FlagId, label?: string): StateSignal {
  return { kind: 'flagIsTrue', flag, label }
}

export function rosterHas(
  options: {
    readonly speciesId?: string
    readonly sex?: SexName
    readonly mature?: boolean
    readonly atLeast?: number
    readonly label?: string
  } = {},
): StateSignal {
  return { kind: 'rosterHas', atLeast: options.atLeast ?? 1, ...options }
}

/** `field` must equal what a sibling element captured under `key`. The cross-reference. */
export function bound<K extends ActKind>(field: ActField<K>, key: BindKey): ActFilter<K> {
  return { field, op: 'bound', key }
}

export function eq<K extends ActKind>(field: ActField<K>, value: FilterValue): ActFilter<K> {
  return { field, op: 'eq', value }
}

export function lt<K extends ActKind>(field: ActField<K>, value: number): ActFilter<K> {
  return { field, op: 'lt', value }
}

export function gte<K extends ActKind>(field: ActField<K>, value: number): ActFilter<K> {
  return { field, op: 'gte', value }
}
