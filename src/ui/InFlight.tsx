/**
 * What you are waiting for, always on screen.
 *
 * The strip exists because of a specific failure mode. Turn the time gates on and the game gains
 * eight weeks of incubation and two years of growing up; without somewhere to look, all the player
 * knows is that pressing a button does nothing for a while. Waiting is only tolerable when you can
 * see what you are waiting for, and *scheduling* — the thing the gates exist to create — is
 * impossible without it.
 *
 * Two rules it follows, both from the balance charter:
 *
 *   - **Every row shows the declared band as well as the countdown.** "8–9 weeks · 3 weeks left".
 *     The band is what you plan against and the countdown is what you are living through; showing
 *     only the second turns a schedule back into a surprise, and `???` is not a value that appears
 *     anywhere in this game.
 *   - **Nothing here reads a clock.** These numbers move when the player moves the turn.
 *
 * It renders even when empty, on purpose: a panel that disappears when idle is one the player has
 * to rediscover, and the empty state is where they learn what the panel is for.
 */
import type { InFlightItem, Session } from '../game/session'

export interface InFlightProps {
  readonly session: Session
}

export function InFlight({ session }: InFlightProps) {
  const rows = session.inFlight()

  if (rows.length === 0) {
    return (
      <div className="in-flight empty">
        <span className="in-flight-title">Nothing in flight</span>
        <span className="muted small">
          Pair two snakes and this is where the clutch, and everything after it, will count itself
          down.
        </span>
      </div>
    )
  }

  return (
    <div className="in-flight">
      <span className="in-flight-title">
        In flight <span className="muted">({rows.length})</span>
      </span>
      <ul>
        {rows.map((row) => (
          <Row key={row.id} row={row} />
        ))}
      </ul>
    </div>
  )
}

function Row({ row }: { row: InFlightItem }) {
  return (
    <li className={`in-flight-row ${row.kind}`}>
      <span className="in-flight-label">{row.label}</span>
      <span className="in-flight-subject">{row.subject}</span>
      <span className="in-flight-bar" aria-hidden="true">
        <span style={{ width: `${Math.round(row.progress * 100)}%` }} />
      </span>
      <span className="in-flight-when">
        <strong>{row.remaining}</strong>
        {/* The band, never dropped once the countdown starts — it is what the wait was quoted at. */}
        <span className="muted small"> of {row.band}</span>
      </span>
    </li>
  )
}
