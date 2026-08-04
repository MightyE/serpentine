/**
 * Time gates: pairing receptivity, incubation, growth to maturity.
 *
 * ## Turn-based, never wall-clock
 *
 * Nothing in this file reads `Date.now()`, and nothing ever may. A gate is a number of **turns**
 * — one turn is one in-game week (`tuning.ts`'s `WEEKS_PER_YEAR`). Closing the tab and coming
 * back is not a mechanic here; the only thing that moves the clock is the player deciding to
 * move it. A game that charges you real hours is charging you for not playing it.
 *
 * ## Variance is bounded and shown
 *
 * Every gate resolves to a specific number of turns, drawn from a declared `[min, max]` band in
 * `tuning.ts`, seeded from the gate's own id so it is stable across a reload. The UI shows the
 * *band* before you commit — "Incubation: 8–9 weeks" — never `???`. Bounded visible variance is
 * something you can schedule against; hidden variance is a slot machine on wait time.
 *
 * ## The wrist half
 *
 * A fifteen-week generation clicked through one week at a time is forty-five clicks of nothing,
 * which is the same slow loop as a real-time timer paid in a different currency. So the control
 * the UI is built on is {@link turnsToNextDecision} — advance to the next turn on which
 * something actually asks you a question. `tuning.test.ts` holds the ratio: at most
 * `MAX_DECISIONS_PER_GENERATION` decisions per generation, at least `MIN_TURNS_PER_DECISION`
 * turns skipped per decision.
 *
 * ## This file is the clock, not the consequence
 *
 * A `Gate` knows when it resolves and nothing about what resolving *means*. Laying a clutch,
 * hatching one, and an animal finishing growing all live in `session.ts`, which holds the payload
 * each gate is carrying. Keeping the timing separable is what lets the same three lines of
 * arithmetic serve a mechanic that did not exist when they were written.
 *
 * ## Instant mode
 *
 * {@link GateMode} `'timed'` is the default: gates cost the weeks they say they cost. `'instant'`
 * makes every gate resolve on the turn it opens — still declared, still shown, still reporting
 * its band, just with a duration of zero. That is what cheat mode flips, and what a test that is
 * measuring genetics rather than pacing asks for, so it does not have to click through fifteen
 * weeks to reach a hatchling.
 */
import { makeRng } from '../lib/rng'
import type { Sex } from '../genetics/types'
import {
  INCUBATION_WEEKS,
  PAIRING_RECEPTIVITY_WEEKS,
  WEEKS_TO_MATURITY_FEMALE,
  WEEKS_TO_MATURITY_MALE,
  MIN_TURNS_PER_DECISION,
} from './tuning'

export type GateMode = 'instant' | 'timed'

export type GateKind = 'receptivity' | 'incubation' | 'maturity'

/** A declared `[min, max]` band, in turns. This is the thing the UI puts on screen. */
export interface GateBand {
  readonly kind: GateKind
  readonly label: string
  readonly min: number
  readonly max: number
}

/** One gate actually ticking: what it is, when it opened, and the turn it resolves on. */
export interface Gate {
  readonly id: string
  readonly kind: GateKind
  readonly subject: string
  readonly openedTurn: number
  readonly resolvesTurn: number
}

export function receptivityBand(): GateBand {
  return {
    kind: 'receptivity',
    label: 'Pairing',
    min: PAIRING_RECEPTIVITY_WEEKS[0],
    max: PAIRING_RECEPTIVITY_WEEKS[1],
  }
}

export function incubationBand(): GateBand {
  return { kind: 'incubation', label: 'Incubation', min: INCUBATION_WEEKS[0], max: INCUBATION_WEEKS[1] }
}

export function maturityBand(sex: Sex): GateBand {
  const band = sex === 'female' ? WEEKS_TO_MATURITY_FEMALE : WEEKS_TO_MATURITY_MALE
  return { kind: 'maturity', label: `Grown (${sex})`, min: band[0], max: band[1] }
}

/** "8–9 weeks", or "8 weeks" when the band has no width. Never `???`. */
export function describeBand(band: GateBand): string {
  const weeks = band.min === band.max ? `${band.min}` : `${band.min}–${band.max}`
  return `${weeks} ${band.max === 1 ? 'week' : 'weeks'}`
}

/** "3 weeks", "1 week", "this week". The countdown next to the band, never instead of it. */
export function describeRemaining(gate: Gate, turn: number): string {
  const left = remainingTurns(gate, turn)
  if (left <= 0) return 'this week'
  return `${left} ${left === 1 ? 'week' : 'weeks'}`
}

export function remainingTurns(gate: Gate, turn: number): number {
  return Math.max(0, gate.resolvesTurn - turn)
}

/**
 * Draw this gate's duration.
 *
 * Seeded from the gate's own id, per the engine's rule that anything about an event derives
 * from that event's seed — so the same clutch always incubates for the same number of weeks,
 * however many times the value is recomputed, and a save file never has to re-roll it.
 */
export function gateDuration(band: GateBand, gateId: string, mode: GateMode): number {
  if (mode === 'instant') return 0
  if (band.max <= band.min) return band.min
  return makeRng(gateId).fork('gate').int(band.min, band.max)
}

export function openGate(
  kind: GateKind,
  subject: string,
  band: GateBand,
  turn: number,
  mode: GateMode,
): Gate {
  const id = `gate:${kind}:${subject}:${turn}`
  return { id, kind, subject, openedTurn: turn, resolvesTurn: turn + gateDuration(band, id, mode) }
}

export function isResolved(gate: Gate, turn: number): boolean {
  return turn >= gate.resolvesTurn
}

/**
 * How many turns to skip to reach the next thing that asks the player a question.
 *
 * With gates pending, that is the soonest one resolving — **exactly** it, so the turn the button
 * lands on is a turn where something arrives rather than one somewhere near it. Landing near an
 * arrival is the failure this control exists to prevent: a "next decision" that puts you a week
 * short of the hatch has charged you a click for nothing and made you press it again.
 *
 * With nothing pending there is nothing to wait for, so every turn is equally a decision turn and
 * the answer is `MIN_TURNS_PER_DECISION` — the floor the balance charter holds this control to. A
 * "next decision" button that advanced one turn would be an "end turn" button with a longer label.
 */
export function turnsToNextDecision(gates: readonly Gate[], turn: number): number {
  const pending = gates.filter((g) => !isResolved(g, turn)).map((g) => g.resolvesTurn - turn)
  if (pending.length === 0) return MIN_TURNS_PER_DECISION
  return Math.max(1, Math.min(...pending))
}

/** The gate that will resolve first, for the label on the button. `undefined` when idle. */
export function soonestGate(gates: readonly Gate[], turn: number): Gate | undefined {
  let soonest: Gate | undefined
  for (const gate of gates) {
    if (isResolved(gate, turn)) continue
    if (!soonest || gate.resolvesTurn < soonest.resolvesTurn) soonest = gate
  }
  return soonest
}
