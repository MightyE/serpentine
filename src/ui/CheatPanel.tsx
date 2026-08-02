/**
 * The cheat panel. Appears only once the easter egg is unlocked — see `game/cheats.ts` for how,
 * and for why it acts on the live game rather than on a sandbox.
 *
 * Every cheat is an entry in `CHEATS`, so this component is a list and a text box. Adding a cheat
 * means adding an object there, not editing this file.
 */
import { useState } from 'react'
import { CHEATS, cheatUseCount, runCheat, type Cheat } from '../game/cheats'
import type { Session } from '../game/session'
import type { SnakeRecord } from '../game/roster'

export function CheatPanel({ session, selected }: { session: Session; selected?: SnakeRecord }) {
  const [args, setArgs] = useState<Record<string, string>>({})
  const [log, setLog] = useState<string[]>([])

  const run = (cheat: Cheat) => {
    // `runCheat` is called here and *not* inside the `setLog` updater. A state updater must be
    // pure: StrictMode deliberately invokes it twice to catch exactly this, and an earlier version
    // of this function ran every cheat twice — two snakes per click, two entries on the used-cheats
    // counter. Anything with an effect belongs outside the updater.
    let message: string
    try {
      message = runCheat(session, cheat, selected, args[cheat.id] ?? '')
    } catch (error) {
      message = String(error instanceof Error ? error.message : error)
    }
    setLog((prev) => [message, ...prev].slice(0, 6))
  }

  return (
    <div className="cheats panel">
      <h3>The lab notebook</h3>
      <p className="muted small">
        Cheats act on this game, not a copy — a sandbox that cannot touch the real game cannot be
        used to test it. The save records that you used them ({cheatUseCount(session)} so far) and
        nothing else changes. Nothing is blocked, now or later.
      </p>
      {selected && <p className="small">Selected: <strong>{selected.name}</strong></p>}

      <ul className="cheat-list">
        {CHEATS.map((cheat) => (
          <li key={cheat.id}>
            <div className="cheat-head">
              <button
                className="primary"
                disabled={cheat.needsSelection && !selected}
                onClick={() => run(cheat)}
              >
                {cheat.label}
              </button>
              {cheat.argument && (
                <input
                  placeholder={cheat.argument}
                  value={args[cheat.id] ?? ''}
                  onChange={(e) => setArgs({ ...args, [cheat.id]: e.target.value })}
                />
              )}
            </div>
            <p className="muted small">{cheat.describe}</p>
          </li>
        ))}
      </ul>

      {log.length > 0 && (
        <ul className="cheat-log">
          {log.map((line, i) => (
            <li key={`${i}-${line}`}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
