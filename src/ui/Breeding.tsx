/**
 * Breeding — the screen the whole game is arranged around.
 *
 * The rule this screen exists to obey: **the prediction is shown before anything is committed.**
 * A breeding screen that reveals the outcome and nothing else is a slot machine with snakes on
 * it. The same screen with `punnett()`'s exact probabilities on it beforehand is genetics, and
 * the difference is entirely in the ordering.
 *
 * Three things are on screen before the button is pressed:
 *
 *   - what could hatch, and how likely each is — computed, never sampled;
 *   - how closely these two are related, which is exactly the `F` the hatchling will carry;
 *   - how many eggs are expected not to hatch, and why, in the population's own words.
 *
 * The third one is where inbreeding stops being flavour: pair two siblings and that number moves,
 * because they are drawing hidden recessives from the same small set. Nothing announces it. It is
 * just visibly worse, before you commit, which is the only form of a lesson a game can teach.
 */
import { useState } from 'react'
import { describeRemaining } from '../game/gates'
import { percent, type Session } from '../game/session'
import type { SnakeRecord } from '../game/roster'
import { GenomeCard } from './GenomeCard'

function relatednessNote(f: number): { tone: string; text: string } {
  if (f === 0) return { tone: 'good', text: 'Unrelated, as far as your records go — a clean outcross.' }
  if (f < 0.0625) return { tone: 'good', text: 'Distantly related. Barely moves the odds.' }
  if (f < 0.125) return { tone: 'warn', text: 'Related — think cousins. The hidden recessives start to line up.' }
  if (f < 0.25) return { tone: 'warn', text: 'Half sibs, or thereabouts. Noticeably fewer eggs will hatch.' }
  return { tone: 'bad', text: 'Full sibs, or a parent bred back to its own offspring. This is how a line narrows.' }
}

/** The suffix on a picker option for an animal that cannot be paired right now, or nothing. */
function availability(session: Session, record: SnakeRecord): string {
  const growing = session.maturityGateOf(record.individual.id)
  if (growing) return ` — growing, ${describeRemaining(growing, session.turn)}`
  return session.unavailableReason(record) ? ' — already paired' : ''
}

export interface BreedingProps {
  readonly session: Session
  readonly onHatched: (babies: readonly SnakeRecord[]) => void
}

export function Breeding({ session, onHatched }: BreedingProps) {
  const [aId, setA] = useState<string | null>(null)
  const [bId, setB] = useState<string | null>(null)
  const residents = session.residents()

  const preview = session.previewPairing(aId, bId)
  const note = relatednessNote(preview.relatedness)

  return (
    <div className="breeding">
      <div className="panel pair-pickers">
        <Picker session={session} label="First snake" value={aId} onChange={setA} residents={residents} />
        {/* A cross, in the genetics sense — the same symbol a punnett square is written with. */}
        <div className="plus">×</div>
        <Picker session={session} label="Second snake" value={bId} onChange={setB} residents={residents} />
      </div>

      {!preview.check.ok && <p className="refusal">{preview.check.reason}</p>}

      {preview.check.ok && preview.mother && preview.father && (
        <>
          <div className="prediction">
            <h3>What could hatch</h3>
            <p className="muted small">
              These are exact probabilities, worked out from the two genotypes — not a simulation. A
              single clutch will not match them, and that is worth watching for its own sake.
            </p>
            <table className="outcomes">
              <tbody>
                {preview.outcomes ? (
                  preview.outcomes.map((o) => (
                    <tr key={o.key}>
                      <td>{o.label}</td>
                      <td>
                        <div className="bar">
                          <span style={{ width: `${Math.round(o.probability * 100)}%` }} />
                        </div>
                      </td>
                      <td className="num">{percent(o.probability, 1)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="muted small">
                      This pairing varies at too many loci to list every visible outcome at once. Pin a
                      locus down with a gene test and it will fit again.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className={`relatedness ${note.tone}`}>
            <h3>Relatedness — F {preview.relatedness.toFixed(3)}</h3>
            <p>{note.text}</p>
            <p className="small">
              This is the inbreeding coefficient any hatchling from this pairing will carry. It is the
              same number that will be on its card.
            </p>
          </div>

          {preview.nonViableProbability > 0 && (
            <div className="nonviable">
              <h3>{percent(preview.nonViableProbability, 1)} of eggs are not expected to hatch</h3>
              <ul>
                {preview.nonViableReasons.slice(0, 3).map((r) => (
                  <li key={r.value}>
                    <span className="num">{percent(r.probability, 1)}</span> {r.value}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* The gates, before you commit. These are the weeks this decision costs, and they are
              the reason it is a decision: the female is committed for the whole of it. */}
          <div className="gates">
            <span>Pairing: {preview.receptivity}</span>
            <span>Incubation: {preview.incubation}</span>
            <span>Hatchlings in: {preview.totalWait}</span>
            <span className="muted small">
              Ranges, always — you can plan against a range. Time moves when you move it; nothing
              here runs while you are away.
            </span>
          </div>

          <button
            className="primary big"
            onClick={() => onHatched(session.breed(preview.mother!.individual.id, preview.father!.individual.id))}
          >
            Introduce {preview.mother.name} to {preview.father.name}
          </button>
        </>
      )}
    </div>
  )
}

function Picker({
  session,
  label,
  value,
  onChange,
  residents,
}: {
  session: Session
  label: string
  value: string | null
  onChange: (id: string | null) => void
  residents: readonly SnakeRecord[]
}) {
  const selected = value ? session.record(value) : undefined
  return (
    <div className="picker">
      <label>
        {label}
        <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">— choose —</option>
          {/* Unavailable animals stay in the list, marked. Removing them would hide the two most
              interesting facts on this screen — who is growing, and who is already committed. */}
          {residents.map((r) => (
            <option key={r.individual.id} value={r.individual.id}>
              {r.name} ({session.sexOf(r) === 'female' ? '♀' : '♂'})
              {availability(session, r)}
            </option>
          ))}
        </select>
      </label>
      <div className="picker-art">
        {selected ? (
          <GenomeCard session={session} record={selected} size="mini" faceUp />
        ) : (
          <div className="empty-art">nobody yet</div>
        )}
      </div>
    </div>
  )
}
