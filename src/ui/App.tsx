/**
 * Serpentine's shell: a header that always says where you are in time and money, four screens,
 * and a card that opens over the top of whichever one you are on.
 *
 * ## What the header owes you
 *
 * Two time controls, not one. **Next decision** is the load-bearing one: a fifteen-week generation
 * clicked through a week at a time is forty-five clicks of nothing, which is the same slow loop as
 * a real-time timer paid in a different currency. So one button skips to the next turn that
 * actually asks a question. See `game/gates.ts`.
 *
 * Nothing here reads a clock. Time moves when you move it.
 */
import { useEffect, useState } from 'react'
import { cheatsUnlocked } from '../game/cheats'
import type { SnakeRecord } from '../game/roster'
import { Breeding } from './Breeding'
import { CheatPanel } from './CheatPanel'
import { Collection } from './Collection'
import { Market } from './Market'
import { SnakeCard } from './SnakeCard'
import { Store } from './Store'
import { useSession } from './useSession'

type Screen = 'rehab' | 'store' | 'breeding' | 'market' | 'cheats'

export function App() {
  const session = useSession()
  const [screen, setScreen] = useState<Screen>('rehab')
  const [openId, setOpenId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const open = openId ? session.record(openId) : undefined

  // The card is a full-screen overlay; letting the page behind it keep scrolling is the classic
  // way for a modal to feel broken.
  useEffect(() => {
    document.body.style.overflow = openId ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [openId])
  const cheats = cheatsUnlocked(session)
  const year = 1 + Math.floor(session.turn / 52)
  const week = 1 + (session.turn % 52)

  const say = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), 4000)
  }

  const hatched = (babies: readonly SnakeRecord[]) => {
    if (babies.length === 0) {
      say('No hatchlings from that clutch — the pairing screen said which combinations do not develop.')
      return
    }
    setOpenId(babies[0]!.individual.id)
    say(`${babies[0]!.name} hatched.`)
  }

  return (
    <div className="app">
      <header>
        <div className="brand">
          <h1>Serpentine</h1>
          <span className="muted small">snake rehab &amp; genetics lab</span>
        </div>

        <div className="readouts">
          <span className="readout">
            <span className="readout-label">week</span>
            <span className="readout-value">
              {week} <span className="muted">of year {year}</span>
            </span>
          </span>
          <span className="readout">
            <span className="readout-label">balance</span>
            <span className="readout-value">${session.money}</span>
          </span>
          <span className="readout">
            <span className="readout-label">residents</span>
            <span className="readout-value">{session.residents().length}</span>
          </span>
        </div>

        <div className="time-controls">
          <button onClick={() => session.advance(1)}>+1 week</button>
          <button className="primary" onClick={() => session.advanceToNextDecision()}>
            Next decision
          </button>
          <button onClick={() => session.advanceSeason()}>+ a season</button>
        </div>
      </header>

      <nav>
        <button className={screen === 'rehab' ? 'on' : ''} onClick={() => setScreen('rehab')}>
          The rehab
        </button>
        <button className={screen === 'store' ? 'on' : ''} onClick={() => setScreen('store')}>
          The floor
        </button>
        <button className={screen === 'breeding' ? 'on' : ''} onClick={() => setScreen('breeding')}>
          Breeding
        </button>
        <button className={screen === 'market' ? 'on' : ''} onClick={() => setScreen('market')}>
          Market
        </button>
        {cheats && (
          <button className={screen === 'cheats' ? 'on' : ''} onClick={() => setScreen('cheats')}>
            Lab notebook
          </button>
        )}
        <span className="spacer" />
        <button
          className="primary"
          onClick={() => {
            const spawned = session.spawnRandom()
            say(`${spawned.name} arrived at the rehab.`)
          }}
        >
          Spawn a random snake
        </button>
      </nav>

      <main>
        {screen === 'rehab' && (
          <Collection session={session} onOpen={(record) => setOpenId(record.individual.id)} />
        )}
        {screen === 'store' && (
          <Store
            session={session}
            onOpen={(record) => setOpenId(record.individual.id)}
            onHatched={hatched}
            say={say}
          />
        )}
        {screen === 'breeding' && <Breeding session={session} onHatched={hatched} />}
        {screen === 'market' && (
          <Market
            session={session}
            onSold={(record, price) => {
              if (openId === record.individual.id) setOpenId(null)
              say(`${record.name} went to a new keeper for $${price}.`)
            }}
          />
        )}
        {screen === 'cheats' && cheats && <CheatPanel session={session} selected={open} />}
      </main>

      {open && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setOpenId(null)}>
          <SnakeCard
            session={session}
            record={open}
            onClose={() => setOpenId(null)}
            onSell={() => {
              const price = session.sell(open.individual.id)
              setOpenId(null)
              say(`${open.name} went to a new keeper for $${price}.`)
            }}
          />
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
