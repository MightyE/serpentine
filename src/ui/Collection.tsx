/**
 * The rehab: every animal you are looking after, drawn live.
 *
 * Portraits would be cheaper and would be wrong. A still picture of a snake is a specimen; a
 * snake that moves is an animal you are looking after, and the difference is most of why anyone
 * opens this screen twice. `SnakeCanvas` puts them all on one shared frame loop so the cost of
 * being right here is one `requestAnimationFrame`, not thirty.
 */
import { percent, type Session } from '../game/session'
import type { SnakeRecord } from '../game/roster'
import { SnakeCanvas } from './SnakeCanvas'

export interface CollectionProps {
  readonly session: Session
  readonly onOpen: (record: SnakeRecord) => void
}

export function Collection({ session, onOpen }: CollectionProps) {
  const residents = session.residents()

  if (residents.length === 0) {
    return (
      <p className="empty">
        Nobody here yet. Spawn a snake and the rehab has its first resident.
      </p>
    )
  }

  const needingCare = residents.filter((r) => session.expressedLoadOf(r).length > 0)

  return (
    <>
      {needingCare.length > 0 && (
        <p className="care-banner">
          {needingCare.length} resident{needingCare.length === 1 ? '' : 's'} need extra care. They are
          fine — they just need more from you than the others do.
        </p>
      )}
      <div className="grid">
        {residents.map((record) => {
          const phenotype = session.phenotype(record)
          const age = session.ageOf(record)
          const care = session.expressedLoadOf(record).length > 0
          return (
            <button
              key={record.individual.id}
              className={`resident ${care ? 'needs-care-tile' : ''}`}
              onClick={() => onOpen(record)}
            >
              <SnakeCanvas phenotype={phenotype} age={age} width={220} height={140} />
              <span className="resident-name">{record.name}</span>
              <span className="resident-sub">
                {session.sexOf(record) === 'female' ? '♀' : '♂'} · {phenotype.label} ·{' '}
                {age >= 1 ? 'grown' : age > 0.55 ? 'juvenile' : 'hatchling'}
              </span>
              <span className="resident-sub muted">
                vigor {percent(session.vigorOf(record))} · ${session.valueOf(record)}
              </span>
              {care && <span className="care-tag">needs extra care</span>}
            </button>
          )
        })}
      </div>
    </>
  )
}
