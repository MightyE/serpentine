/**
 * Serpentine — quests: the witness synthesiser.
 *
 * Given any signal, build the shortest history that satisfies it. `witness.test.ts` then asserts
 * that the evaluator agrees, for every step in the shipped catalogue.
 *
 * ## Why this is generated rather than hand-written
 *
 * §B4 asks for a scripted run per demonstrative predicate, and says why: *a predicate with no
 * witness does not ship — unfalsifiability is not a risk you reason about, it is a test you run.*
 * A hand-written script per step would satisfy that for the steps that exist on the day it is
 * written, and quietly not for anything the content agent adds afterwards. A synthesiser satisfies
 * it for every step that will ever be written, including ones added long after this file.
 *
 * What it cannot do alone is prove the acts it invents are ones the *game* can produce — a synthetic
 * `genetics.proven` proves nothing about whether anything emits `genetics.proven`. So the witness is
 * one of a pair, and `witness.test.ts` runs both halves:
 *
 * 1. **Satisfiability** (here) — every step's signal has a history that completes it, so no shipped
 *    predicate is unfalsifiable.
 * 2. **Emission** (a scripted `Session` run in the test) — every act kind either arrives in a real
 *    journal from real gameplay, or is on the `PENDING_UI_EMITS` list with the call site it needs.
 *
 * Together those are "every step is proven capable of firing". Either alone is a comfortable lie.
 *
 * ## The synthesiser is deliberately naive
 *
 * It applies defaults, then the bind keys, then the literal filters, then the cross-references, and
 * it does not backtrack. If a signal is written so that two constraints fight — an `eq` on the same
 * field the group binds — the witness comes out unsatisfying and the test fails loudly. That is the
 * right failure: a predicate whose constraints contradict each other is a step that can never fire,
 * which is the one outcome §B4 treats as worse than a step that fires too easily.
 */
import { pairingIdOf } from '../pairingId'
import type { FlagId, FlagValue } from '../seams'
import { ACT_DEFAULTS, BIND_FIELD } from './acts'
import type { EvalContext, RosterFacts, StateView } from './evaluate'
import type {
  ActFilter,
  ActKind,
  BindKey,
  FilterValue,
  Observation,
  QuestSignal,
  SexName,
} from './types'

const WITNESS_MOTHER = 'w-mother'
const WITNESS_FATHER = 'w-father'

const DEFAULT_BINDING: Record<BindKey, string> = {
  individual: 'w-animal',
  pairing: pairingIdOf(WITNESS_MOTHER, WITNESS_FATHER),
  clutch: 'w-clutch',
  locus: 'w-locus',
  species: 'w-species',
  habitat: 'w-habitat',
  // Deliberately a different id from `individual`: the whole point of the key is to name a second
  // animal, so a witness in which the two collide would satisfy a P2 group that a real parent and
  // baby could not.
  offspring: 'w-offspring',
  phenotype: 'w-phenotype',
}

type Fields = Record<string, unknown>

/** A history that should satisfy the signal it was built from, plus the state a `state` signal reads. */
export interface Witness extends EvalContext {
  readonly journal: readonly Observation[]
  readonly state: StateView
}

class Builder {
  readonly journal: Observation[] = []
  readonly flags = new Map<FlagId, FlagValue>()
  readonly roster: RosterFacts[] = []
  readonly binding = new Map<BindKey, string>()
  private seq = 0
  private turn = 1

  bind(key: BindKey): string {
    const existing = this.binding.get(key)
    if (existing !== undefined) return existing
    this.binding.set(key, DEFAULT_BINDING[key])
    return DEFAULT_BINDING[key]
  }

  /** One act, satisfying `where` and agreeing with the group on every key in `bind`. */
  emit(act: ActKind, where: readonly ActFilter<ActKind>[] = [], bind: readonly BindKey[] = []): Observation {
    const fields: Fields = { ...(ACT_DEFAULTS[act] as object) } as Fields

    for (const key of bind) this.applyBind(fields, key)
    for (const filter of where) {
      if (filter.op === 'bound') continue
      this.applyLiteral(fields, filter, bind)
    }
    for (const filter of where) {
      if (filter.op !== 'bound' || !filter.key) continue
      const known = this.binding.get(filter.key)
      if (known !== undefined) fields[filter.field] = known
      else this.binding.set(filter.key, String(fields[filter.field]))
    }

    const observation = { act, at: this.turn, seq: this.seq++, fields } as Observation
    this.journal.push(observation)
    return observation
  }

  /**
   * Make an act carry the group's value for one bind key.
   *
   * The parents case is the interesting one: `ui.pairingPreviewed` has no `pairingId`, so agreeing
   * about a pairing means carrying the two parent ids the id was derived from. That asymmetry is
   * exactly what `bindValueOf` resolves at evaluation time, and it is why P1 and P4 work at all.
   */
  private applyBind(fields: Fields, key: BindKey): void {
    const value = this.bind(key)
    const field = BIND_FIELD[key]
    if (field in fields) {
      fields[field] = value
      return
    }
    if (key === 'pairing' && 'motherId' in fields && 'fatherId' in fields) {
      const [mother, father] = value.split('|')
      fields.motherId = mother ?? WITNESS_MOTHER
      fields.fatherId = father ?? WITNESS_FATHER
    }
  }

  private applyLiteral(fields: Fields, filter: ActFilter<ActKind>, bind: readonly BindKey[]): void {
    const current = fields[filter.field]
    const wanted = filter.value
    switch (filter.op) {
      case 'eq':
        fields[filter.field] = wanted
        break
      case 'neq':
        fields[filter.field] =
          typeof wanted === 'number' ? wanted + 1 : typeof wanted === 'boolean' ? !wanted : `${String(wanted)}-other`
        break
      case 'lt':
        fields[filter.field] = typeof wanted === 'number' ? (wanted > 0 ? wanted / 2 : wanted - 1) : current
        break
      case 'lte':
        fields[filter.field] = typeof wanted === 'number' ? wanted : current
        break
      case 'gt':
        fields[filter.field] = typeof wanted === 'number' ? (wanted > 0 ? wanted * 2 : wanted + 1) : current
        break
      case 'gte':
        fields[filter.field] = typeof wanted === 'number' ? wanted : current
        break
      case 'in':
        fields[filter.field] = Array.isArray(wanted) ? (wanted as readonly FilterValue[])[0] : current
        break
      case 'bound':
        return
    }
    // A literal that overwrites the field the group binds on has to move the binding with it, or
    // every later element would agree with a value this one no longer carries.
    for (const key of bind) {
      if (BIND_FIELD[key] === filter.field) this.binding.set(key, String(fields[filter.field]))
    }
  }

  nextTurn(): void {
    this.turn += 1
  }

  finish(): Witness {
    const flags = this.flags
    const roster = this.roster
    return {
      journal: this.journal,
      state: {
        flag: (id) => flags.get(id),
        roster: () => roster,
      },
    }
  }
}

function build(signal: QuestSignal, builder: Builder): void {
  switch (signal.kind) {
    case 'act':
      builder.emit(signal.act, signal.where as readonly ActFilter<ActKind>[] | undefined)
      return

    case 'count':
      for (let i = 0; i < signal.atLeast; i++) {
        builder.emit(signal.act, signal.where as readonly ActFilter<ActKind>[] | undefined)
      }
      return

    case 'distinct': {
      for (let i = 0; i < signal.atLeast; i++) {
        const observation = builder.emit(signal.act, signal.where as readonly ActFilter<ActKind>[] | undefined)
        const fields = observation.fields as Fields
        const field = BIND_FIELD[signal.by]
        if (field in fields) fields[field] = `${String(fields[field])}-${i}`
        else if (signal.by === 'pairing' && 'motherId' in fields) fields.motherId = `${WITNESS_MOTHER}-${i}`
      }
      return
    }

    case 'flagAtLeast':
      builder.flags.set(signal.flag, signal.value)
      return

    case 'flagIsTrue':
      builder.flags.set(signal.flag, true)
      return

    case 'rosterHas':
      for (let i = 0; i < signal.atLeast; i++) {
        builder.roster.push({
          individualId: `w-animal-${i}`,
          speciesId: signal.speciesId ?? 'w-species',
          sex: (signal.sex ?? 'female') as SexName,
          mature: signal.mature ?? true,
        })
      }
      return

    case 'bundle':
    case 'sequence':
      // One act per turn, so a witness reads like play rather than like one instant — except under a
      // `within` window, where spreading the elements out would be the synthesiser inventing the
      // very failure the window causes. Order comes from `seq`, which the builder always increments.
      for (const element of signal.of) {
        builder.emit(element.act, element.where as readonly ActFilter<ActKind>[] | undefined, signal.bind)
        if (signal.kind === 'bundle' || !signal.within) builder.nextTurn()
      }
      return

    case 'all':
      for (const child of signal.of) build(child, builder)
      return

    case 'any':
      // A player satisfies whichever branch is easiest; the witness takes the first, which is the
      // one the author wrote as the main road.
      if (signal.of[0]) build(signal.of[0], builder)
  }
}

/** The shortest history that should satisfy this signal. */
export function witnessFor(signal: QuestSignal): Witness {
  const builder = new Builder()
  build(signal, builder)
  return builder.finish()
}
