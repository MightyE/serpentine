/**
 * The rehab: every animal you are looking after, as a binder of cards.
 *
 * ## Why a binder, and why the cards are still
 *
 * An earlier version drew every resident live, on the argument that a moving snake is an animal
 * and a still one is a specimen. That is true of a *photograph*; it is not true of a card. A card
 * that animates forever reads as a video player in a frame, and a card that is static at rest
 * reads as a printed object you own — which is the whole collectible feeling this screen is
 * chasing. The animals come alive during a reveal, one at a time, and then freeze into print.
 *
 * It is also the cheap path: thirty cached portraits instead of thirty render pipelines. The
 * prettiest option and the fastest option rarely coincide, and when they do you take it.
 *
 * ## Face-down means "you have not looked at this one yet"
 *
 * A card you have never opened stays face-down in the binder. That is not decoration — it is the
 * screen telling you there is something here you have not seen, and it is what makes a new hatch
 * worth walking over to.
 */
import type { Session } from '../game/session'
import type { SnakeRecord } from '../game/roster'
import { GenomeCard } from './GenomeCard'

export interface CollectionProps {
  readonly session: Session
  readonly onOpen: (record: SnakeRecord) => void
}

export function Collection({ session, onOpen }: CollectionProps) {
  const residents = session.residents()

  if (residents.length === 0) {
    return <p className="empty">Nobody here yet — spawn a snake and the rehab has its first resident.</p>
  }

  const needingCare = residents.filter((r) => session.expressedLoadOf(r).length > 0)

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>The binder — {residents.length} residents</h3>
        <span className="muted small mono">tap a card to open its file</span>
      </div>

      {needingCare.length > 0 && (
        <p className="care-banner">
          {needingCare.length} resident{needingCare.length === 1 ? '' : 's'} need extra care. They are fine — they
          just need more from you than the others do.
        </p>
      )}

      <div className="binder">
        {residents.map((record) => (
          <GenomeCard
            key={record.individual.id}
            session={session}
            record={record}
            size="mini"
            onActivate={() => onOpen(record)}
          />
        ))}
      </div>
    </div>
  )
}
