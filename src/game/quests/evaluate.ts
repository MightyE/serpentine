/**
 * Serpentine — quests: the predicate catalogue as running code.
 *
 * `types.ts` is this catalogue as data; this file is the interpreter. Between them they are the whole
 * contract with the content agent, who writes object literals and never a predicate.
 *
 * ## Pure function of a recorded history
 *
 * The only inputs are the journal and, for the three `state` signals, a flag read and a roster
 * summary. No session, no genetics engine, no renderer, no clock. That is what makes `blind.test.ts`
 * possible — a long uncomprehending playthrough is just a list of observations, and asking whether a
 * step would have completed is asking a pure function.
 *
 * ## Binding, and the two mechanisms that express it
 *
 * A group of acts becomes evidence when the acts concern *the same thing* (§B1). Two mechanisms,
 * because the patterns in §B3 need both:
 *
 * - **`bind: BindKey[]`** — a whole-group agreement. Every chosen act that *has* a value for the key
 *   must agree on it. An act with no value for that key is unconstrained by it, which is not a
 *   loophole but a requirement: pattern P2's middle element is a `pairing.committed`, which has no
 *   locus, and the pattern is about following one locus across it. Strength is unaffected — a bound
 *   group of two or more acts is demonstrative by {@link strengthOf} — and the through-line in P2 is
 *   carried by the second mechanism.
 * - **`op: 'bound'` filters** — a per-field cross-reference. The first element to mention a key
 *   captures its value; every later mention must match. That is how "`motherId` must be the animal
 *   whose notebook you opened" is said without the content agent writing code.
 *
 * ## Partial progress is a first-class output, not a debug aid
 *
 * §B4 counts opacity, not strictness, as most of the pain of a demanding predicate: a player who did
 * it out of order needs to see *which piece* is missing. So evaluation always returns how many
 * elements are satisfied and which, even when the answer is "not yet" — and the search below is a
 * maximiser rather than a boolean for exactly that reason.
 */
import { pairingIdOf } from '../pairingId'
import type { FlagId, FlagValue } from '../seams'
import type {
  ActFilter,
  ActKind,
  ActSignal,
  BindKey,
  FilterOp,
  FilterValue,
  Observation,
  QuestSignal,
  SexName,
} from './types'

// ---------------------------------------------------------------------------
// What evaluation may see
// ---------------------------------------------------------------------------

/** One roster entry, flattened to the four things `rosterHas` can ask about. */
export interface RosterFacts {
  readonly individualId: string
  readonly speciesId: string
  readonly sex: SexName
  readonly mature: boolean
}

/**
 * The state half of the input, for the incidental tier only.
 *
 * `roster()` is the one thing here that walks the collection. It is called only when a quest is
 * offered or when an indexed act fires, and at most a handful of steps are ever active — a different
 * budget from the achievement system's, which is why §E2 allows it here and forbids it there.
 */
export interface StateView {
  flag(id: FlagId): FlagValue | undefined
  roster(): readonly RosterFacts[]
}

export interface EvalContext {
  readonly journal: readonly Observation[]
  readonly state: StateView
}

/** One element of a group, for the "2 of 3" display. */
export interface PartProgress {
  readonly label: string
  readonly done: boolean
}

export interface SignalProgress {
  readonly done: boolean
  /** How many elements are satisfied, and out of how many. `1 of 1` for a plain act. */
  readonly satisfied: number
  readonly total: number
  /** Empty for a signal with no parts worth showing. */
  readonly parts: readonly PartProgress[]
}

const YES: SignalProgress = { done: true, satisfied: 1, total: 1, parts: [] }
const NO: SignalProgress = { done: false, satisfied: 0, total: 1, parts: [] }

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

function compare(actual: unknown, op: FilterOp, expected: FilterValue | readonly FilterValue[] | undefined): boolean {
  switch (op) {
    case 'eq':
      return actual === expected
    case 'neq':
      return actual !== expected
    case 'lt':
      return typeof actual === 'number' && typeof expected === 'number' && actual < expected
    case 'lte':
      return typeof actual === 'number' && typeof expected === 'number' && actual <= expected
    case 'gt':
      return typeof actual === 'number' && typeof expected === 'number' && actual > expected
    case 'gte':
      return typeof actual === 'number' && typeof expected === 'number' && actual >= expected
    case 'in':
      return Array.isArray(expected) && (expected as readonly FilterValue[]).includes(actual as FilterValue)
    case 'bound':
      // Resolved against the group's captured bindings, never here. Outside a group there is no
      // sibling to bind to, so the filter constrains nothing — see `literalFiltersHold`.
      return true
  }
}

function fieldOf(observation: Observation, field: string): unknown {
  return (observation.fields as Record<string, unknown>)[field]
}

/** Every filter except the cross-references. Enough to pre-filter candidates before any search. */
function literalFiltersHold(observation: Observation, where: readonly ActFilter<ActKind>[] = []): boolean {
  for (const filter of where) {
    if (filter.op === 'bound') continue
    if (!compare(fieldOf(observation, filter.field), filter.op, filter.value)) return false
  }
  return true
}

/**
 * The canonical value an observation contributes for one bind key.
 *
 * `pairing` is the interesting one: an act that carries a `pairingId` uses it, and an act that
 * carries only the two parents derives the same id with {@link pairingIdOf}. That is what lets
 * `ui.pairingPreviewed` (parents, no pairing) bind to `pairing.committed` and `clutch.hatched`
 * (pairing id) — patterns P1 and P4 in one line, and the reason `pairingId` had to exist at all.
 */
export function bindValueOf(observation: Observation, key: BindKey): string | undefined {
  const fields = observation.fields as Record<string, unknown>
  const str = (name: string): string | undefined => {
    const value = fields[name]
    return typeof value === 'string' && value.length > 0 ? value : undefined
  }
  switch (key) {
    case 'individual':
    // `offspring` is a cross-reference key (`CROSS_REFERENCE_ONLY_KEYS`) and so is never resolved
    // from a group `bind`. It reads the same field for the one path that can still reach it —
    // `distinct`, which the catalogue test forbids — so that this switch stays total rather than
    // returning `undefined` for a key the type says exists.
    case 'offspring':
      return str('individualId')
    case 'phenotype':
      return str('phenotypeKey')
    case 'pairing': {
      const explicit = str('pairingId')
      if (explicit) return explicit
      const mother = str('motherId')
      const father = str('fatherId')
      return mother && father ? pairingIdOf(mother, father) : undefined
    }
    case 'clutch':
      return str('clutchSeed')
    case 'locus':
      return str('locusId')
    case 'species':
      return str('speciesId')
    case 'habitat':
      return str('habitatId')
  }
}

/** The `act` + `where` shape shared by `act`, `count` and `distinct` signals. */
interface ActPattern {
  readonly act: ActKind
  readonly where?: readonly ActFilter<ActKind>[]
}

function matchesAct(observation: Observation, element: ActPattern): boolean {
  return observation.act === element.act && literalFiltersHold(observation, element.where)
}

function patternOf(signal: { act: ActKind; where?: unknown }): ActPattern {
  return { act: signal.act, where: signal.where as readonly ActFilter<ActKind>[] | undefined }
}

// ---------------------------------------------------------------------------
// Groups: bundle and sequence
// ---------------------------------------------------------------------------

type Bindings = ReadonlyMap<string, FilterValue>

/**
 * How many candidate placements the search will try before it settles for the best it has.
 *
 * There is a budget rather than an exhaustive search because the journal is 200 entries and a group
 * is up to five elements, so the unconstrained product is large enough to notice inside a click
 * handler. In practice it is never approached: binding prunes almost everything after the first
 * element is placed, which is the same property that makes a bound group good evidence.
 *
 * When the budget runs out the answer can only be *pessimistic* — a full solution already found is
 * returned as soon as it is found, so the failure mode is an under-reported partial count on a
 * pathological journal, never a step completing when it should not.
 */
const SEARCH_BUDGET = 20_000

interface GroupSolution {
  /** Index into the group's `of`, in the order the elements were declared. */
  readonly placed: readonly boolean[]
  readonly count: number
  readonly turns: readonly number[]
}

function extend(
  bindings: Bindings,
  observation: Observation,
  element: ActSignal,
  bind: readonly BindKey[],
): Map<string, FilterValue> | null {
  const next = new Map(bindings)
  for (const key of bind) {
    const value = bindValueOf(observation, key)
    if (value === undefined) continue
    const already = next.get(key)
    if (already !== undefined && already !== value) return null
    next.set(key, value)
  }
  for (const filter of (element.where ?? []) as readonly ActFilter<ActKind>[]) {
    if (filter.op !== 'bound' || !filter.key) continue
    const value = fieldOf(observation, filter.field)
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return null
    const already = next.get(filter.key)
    if (already !== undefined && already !== value) return null
    next.set(filter.key, value as FilterValue)
  }
  return next
}

/**
 * The best assignment of observations to a group's elements.
 *
 * Depth-first over the elements in declaration order, maximising how many are placed. `ordered`
 * additionally requires each placement to come after the last one by `seq`, which is what separates
 * `sequence` from `bundle` — and `sequence` is legitimate only where the acts are *physically*
 * ordered, because a required order the world does not require is a trap for the player (§B4).
 *
 * The skip branch is what produces "2 of 3" rather than a bare false.
 */
function solveGroup(
  journal: readonly Observation[],
  of: readonly ActSignal[],
  bind: readonly BindKey[],
  ordered: boolean,
  withinTurns: number | undefined,
): GroupSolution {
  const candidates = of.map((element) => {
    const pattern = patternOf(element)
    return journal.filter((observation) => matchesAct(observation, pattern))
  })
  let best: GroupSolution = { placed: of.map(() => false), count: 0, turns: [] }
  let budget = SEARCH_BUDGET
  let finished = false

  const walk = (
    index: number,
    afterSeq: number,
    bindings: Bindings,
    placed: boolean[],
    turns: number[],
  ): void => {
    if (finished) return
    if (index === of.length) {
      const count = placed.filter(Boolean).length
      if (count > best.count) best = { placed: [...placed], count, turns: [...turns] }
      if (count === of.length) finished = true
      return
    }
    for (const observation of candidates[index] as readonly Observation[]) {
      if (budget-- <= 0) break
      if (ordered && observation.seq <= afterSeq) continue
      if (withinTurns !== undefined && turns.length > 0) {
        const lowest = Math.min(...turns, observation.at)
        const highest = Math.max(...turns, observation.at)
        if (highest - lowest > withinTurns) continue
      }
      const next = extend(bindings, observation, of[index] as ActSignal, bind)
      if (!next) continue
      placed[index] = true
      turns.push(observation.at)
      walk(index + 1, observation.seq, next, placed, turns)
      turns.pop()
      placed[index] = false
      if (finished) return
    }
    // Skip this element. Only worth exploring while a better answer is still reachable.
    if (budget > 0 && placed.filter(Boolean).length + (of.length - index - 1) > best.count) {
      walk(index + 1, afterSeq, bindings, placed, turns)
    }
  }

  walk(0, -1, new Map(), of.map(() => false), [])
  return best
}

// ---------------------------------------------------------------------------
// The evaluator
// ---------------------------------------------------------------------------

/** A short line for one element of a group, or for a whole signal in a hint. */
export function labelOf(signal: QuestSignal): string {
  if ('label' in signal && signal.label) return signal.label
  switch (signal.kind) {
    case 'act':
    case 'count':
    case 'distinct':
      return signal.act
    case 'flagAtLeast':
    case 'flagIsTrue':
      return signal.flag
    case 'rosterHas':
      return 'keep an animal'
    case 'bundle':
    case 'sequence':
      return signal.of.map((child) => labelOf(child)).join(' then ')
    case 'all':
      return signal.of.map((child) => labelOf(child)).join(' and ')
    case 'any':
      return signal.label
  }
}

export function evaluateSignal(signal: QuestSignal, ctx: EvalContext): SignalProgress {
  switch (signal.kind) {
    case 'act': {
      const pattern = patternOf(signal)
      const hit = ctx.journal.some((observation) => matchesAct(observation, pattern))
      return hit ? YES : NO
    }

    case 'count': {
      const pattern = patternOf(signal)
      let hits = 0
      for (const observation of ctx.journal) if (matchesAct(observation, pattern)) hits += 1
      return {
        done: hits >= signal.atLeast,
        satisfied: Math.min(hits, signal.atLeast),
        total: signal.atLeast,
        parts: [],
      }
    }

    case 'distinct': {
      const pattern = patternOf(signal)
      const seen = new Set<string>()
      for (const observation of ctx.journal) {
        if (!matchesAct(observation, pattern)) continue
        const value = bindValueOf(observation, signal.by)
        if (value !== undefined) seen.add(value)
      }
      return {
        done: seen.size >= signal.atLeast,
        satisfied: Math.min(seen.size, signal.atLeast),
        total: signal.atLeast,
        parts: [],
      }
    }

    case 'flagAtLeast': {
      const value = ctx.state.flag(signal.flag)
      return typeof value === 'number' && value >= signal.value ? YES : NO
    }

    case 'flagIsTrue': {
      const value = ctx.state.flag(signal.flag)
      return value === true ? YES : NO
    }

    case 'rosterHas': {
      let matches = 0
      for (const animal of ctx.state.roster()) {
        if (signal.speciesId !== undefined && animal.speciesId !== signal.speciesId) continue
        if (signal.sex !== undefined && animal.sex !== signal.sex) continue
        if (signal.mature !== undefined && animal.mature !== signal.mature) continue
        matches += 1
      }
      return {
        done: matches >= signal.atLeast,
        satisfied: Math.min(matches, signal.atLeast),
        total: signal.atLeast,
        parts: [],
      }
    }

    case 'bundle':
    case 'sequence': {
      const ordered = signal.kind === 'sequence'
      const within = signal.kind === 'sequence' ? signal.within?.turns : undefined
      const solution = solveGroup(ctx.journal, signal.of, signal.bind, ordered, within)
      return {
        done: solution.count === signal.of.length,
        satisfied: solution.count,
        total: signal.of.length,
        parts: signal.of.map((child, index) => ({
          label: labelOf(child),
          done: solution.placed[index] === true,
        })),
      }
    }

    case 'all': {
      const parts = signal.of.map((child) => {
        const progress = evaluateSignal(child, ctx)
        return { label: labelOf(child), done: progress.done }
      })
      const satisfied = parts.filter((part) => part.done).length
      return { done: satisfied === parts.length, satisfied, total: parts.length, parts }
    }

    case 'any': {
      const parts = signal.of.map((child) => {
        const progress = evaluateSignal(child, ctx)
        return { label: labelOf(child), done: progress.done }
      })
      const satisfied = parts.filter((part) => part.done).length
      // `total: 1` on purpose — one branch is the whole requirement, so "1 of 3" would be a lie
      // about how much is left. The parts still show which branch is already satisfied.
      return { done: satisfied > 0, satisfied: satisfied > 0 ? 1 : 0, total: 1, parts }
    }
  }
}

/** Convenience: just the boolean. */
export function isSatisfied(signal: QuestSignal, ctx: EvalContext): boolean {
  return evaluateSignal(signal, ctx).done
}
