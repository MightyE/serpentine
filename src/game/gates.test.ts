/**
 * The clock, on its own.
 *
 * `session.test.ts` checks that pairing, incubation and growth actually cost the player weeks.
 * This file checks the arithmetic underneath: that a duration lands inside its declared band and
 * reaches **both ends** of it, that the same gate always draws the same number, and that the
 * control the whole pacing rests on — "advance to the next decision" — never lands short.
 */
import { describe, expect, it } from 'vitest'
import {
  describeBand,
  describeRemaining,
  gateDuration,
  incubationBand,
  isResolved,
  maturityBand,
  openGate,
  receptivityBand,
  remainingTurns,
  soonestGate,
  turnsToNextDecision,
  type Gate,
} from './gates'
import { INCUBATION_WEEKS, MIN_TURNS_PER_DECISION, PAIRING_RECEPTIVITY_WEEKS } from './tuning'

describe('gate durations', () => {
  it('stays inside its declared band, and reaches both ends of it', () => {
    // A band the UI advertises as 1–6 weeks and which only ever draws 3 is a lie told in a
    // trustworthy format. Two hundred ids is far more than enough to see both ends of either band.
    for (const band of [receptivityBand(), incubationBand()]) {
      const seen = new Set<number>()
      for (let i = 0; i < 200; i++) seen.add(gateDuration(band, `gate:sample:${i}`, 'timed'))
      expect(Math.min(...seen)).toBe(band.min)
      expect(Math.max(...seen)).toBe(band.max)
      for (const drawn of seen) {
        expect(drawn).toBeGreaterThanOrEqual(band.min)
        expect(drawn).toBeLessThanOrEqual(band.max)
      }
    }
  })

  it('draws the same number for the same gate every time — a save never re-rolls a wait', () => {
    const band = incubationBand()
    const first = gateDuration(band, 'gate:incubation:noodle:12', 'timed')
    const second = gateDuration(band, 'gate:incubation:noodle:12', 'timed')
    expect(second).toBe(first)
  })

  it('costs nothing at all in instant mode, for every band', () => {
    for (const band of [receptivityBand(), incubationBand(), maturityBand('female')]) {
      expect(gateDuration(band, 'gate:whatever:1', 'instant')).toBe(0)
    }
    const gate = openGate('incubation', 'clutch-1', incubationBand(), 4, 'instant')
    expect(isResolved(gate, 4)).toBe(true)
  })

  it('never reads a clock — the same gate is unresolved and then resolved purely by turn', () => {
    const gate = openGate('incubation', 'clutch-2', incubationBand(), 0, 'timed')
    expect(isResolved(gate, INCUBATION_WEEKS[0] - 1)).toBe(false)
    expect(isResolved(gate, INCUBATION_WEEKS[1])).toBe(true)
    expect(remainingTurns(gate, INCUBATION_WEEKS[1])).toBe(0)
  })
})

describe('what the player is shown', () => {
  it('describes every band as a range of whole weeks, never as an unknown', () => {
    for (const band of [receptivityBand(), incubationBand(), maturityBand('female'), maturityBand('male')]) {
      expect(describeBand(band)).toMatch(/^\d+(–\d+)? weeks?$/)
    }
    expect(describeBand(receptivityBand())).toBe(
      `${PAIRING_RECEPTIVITY_WEEKS[0]}–${PAIRING_RECEPTIVITY_WEEKS[1]} weeks`,
    )
  })

  it('counts down in weeks, and says "this week" rather than "0 weeks"', () => {
    const gate = openGate('incubation', 'clutch-3', incubationBand(), 0, 'timed')
    expect(describeRemaining(gate, 0)).toMatch(/^\d+ weeks$/)
    expect(describeRemaining(gate, gate.resolvesTurn - 1)).toBe('1 week')
    expect(describeRemaining(gate, gate.resolvesTurn)).toBe('this week')
  })
})

describe('advance to the next decision', () => {
  const gate = (resolvesTurn: number): Gate => ({
    id: `g${resolvesTurn}`,
    kind: 'incubation',
    subject: 's',
    openedTurn: 0,
    resolvesTurn,
  })

  it('lands exactly on the soonest arrival, never a week short of it', () => {
    const gates = [gate(11), gate(4), gate(30)]
    expect(turnsToNextDecision(gates, 0)).toBe(4)
    expect(soonestGate(gates, 0)?.resolvesTurn).toBe(4)
    // Having landed on it, the next press goes to the one after.
    expect(turnsToNextDecision(gates.filter((g) => !isResolved(g, 4)), 4)).toBe(7)
  })

  it('skips a real stretch when nothing is pending, rather than being End Turn in disguise', () => {
    expect(turnsToNextDecision([], 0)).toBeGreaterThanOrEqual(MIN_TURNS_PER_DECISION)
    expect(soonestGate([], 0)).toBeUndefined()
  })

  it('never returns zero, so a press always moves the clock', () => {
    expect(turnsToNextDecision([gate(0)], 5)).toBeGreaterThanOrEqual(1)
  })
})
