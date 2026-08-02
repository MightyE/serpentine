/**
 * The genome card: one animal, printed.
 *
 * Everything on it is earned — see `cardModel.ts` for the derivations and for why none of it is
 * allowed to leak what the player has not proved. This file is the markup, the lifecycle and the
 * handoff to `reveal.ts`; it decides nothing about the animal itself.
 *
 * Three sizes off one set of styles: `hero` in the detail view, the default in a hatch, `mini` in
 * the binder. Every inner size is an `em` against a font-size derived from the card's own width, so
 * there is exactly one card design rather than three.
 */
import { useEffect, useRef, type ReactNode } from 'react'
import type { Session } from '../game/session'
import type { SnakeRecord } from '../game/roster'
import { MECHANISM_LABEL, cardModelFor, type EscapeLevel, type Mechanism } from './cardModel'
import { drawSettled, faceDown, hasSeen, reveal, wirePointer } from './reveal'

const MECHANISM_ICON: Record<Mechanism, ReactNode> = {
  recessive: <circle cx="10" cy="10" r="6.5" fill="none" strokeWidth="2" />,
  dominant: <circle cx="10" cy="10" r="6.5" stroke="none" />,
  incomplete: (
    <>
      <circle cx="10" cy="10" r="6.5" fill="none" strokeWidth="2" />
      <path d="M10 3.5a6.5 6.5 0 0 1 0 13z" stroke="none" />
    </>
  ),
  multi: (
    <>
      <circle cx="6" cy="7" r="3.1" stroke="none" />
      <circle cx="14" cy="7" r="3.1" stroke="none" />
      <circle cx="10" cy="14" r="3.1" stroke="none" />
    </>
  ),
  sexlinked: (
    <>
      <circle cx="7.5" cy="10" r="5" fill="none" strokeWidth="2" />
      <circle cx="13.5" cy="10" r="5" stroke="none" opacity=".85" />
    </>
  ),
  polygenic: (
    <>
      <rect x="3" y="3" width="6" height="6" stroke="none" />
      <rect x="11" y="3" width="6" height="6" stroke="none" opacity=".55" />
      <rect x="3" y="11" width="6" height="6" stroke="none" opacity=".55" />
      <rect x="11" y="11" width="6" height="6" stroke="none" />
    </>
  ),
}

function Segments({ score, max = 10 }: { score: number; max?: number }) {
  return (
    <span className="bar">
      {Array.from({ length: max }, (_, i) => (
        <i key={i} className={i < score ? 'seg on' : 'seg'} />
      ))}
    </span>
  )
}

export interface GenomeCardProps {
  readonly session: Session
  readonly record: SnakeRecord
  readonly size?: 'hero' | 'default' | 'mini'
  /** Overrides the model's own (deliberately rare) escape rule. */
  readonly escape?: EscapeLevel
  /** Run the reveal on mount. The detail view does; the binder does not. */
  readonly autoReveal?: boolean
  /**
   * Show the printed face immediately, with no theatre and without spending the animal's
   * first-view reveal. Choosing a mate is not a reveal moment, and a face-down card in a pairing
   * picker is unhelpful rather than mysterious.
   */
  readonly faceUp?: boolean
  /** When given, a click calls this instead of revealing the card in place. */
  readonly onActivate?: () => void
}

export function GenomeCard({
  session,
  record,
  size = 'default',
  escape,
  autoReveal,
  faceUp,
  onActivate,
}: GenomeCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const model = cardModelFor(session, record, escape ? { escape } : {})
  const phenotype = session.phenotype(record)
  const age = session.ageOf(record)
  const id = record.individual.id

  useEffect(() => {
    const card = ref.current
    if (!card) return
    const unwire = wirePointer(card)

    let cancelled = false
    // A card that has been seen shows its printed face straight away; one that has not stays
    // face-down, which is the game telling you there is something here you have not looked at.
    if (autoReveal) {
      void reveal(card, phenotype, age)
    } else if (faceUp || hasSeen(id)) {
      card.classList.add('is-revealed')
      card.dataset.state = 'settled'
      requestAnimationFrame(() => {
        if (!cancelled) drawSettled(card, phenotype, age)
      })
    } else {
      faceDown(card)
    }

    // Another card for the same animal has just been revealed somewhere — turn this one over too,
    // quietly, so closing the detail view does not leave a face-down card for an animal you met.
    const onSeen = (event: Event): void => {
      const detail = (event as CustomEvent<{ id: string }>).detail
      if (detail?.id !== id || card.dataset.state !== 'facedown') return
      card.classList.add('is-revealed')
      card.dataset.state = 'settled'
      drawSettled(card, phenotype, age)
    }
    window.addEventListener('serpentine:seen', onSeen)

    // The art canvas is sized from its layout box, so a resize means a repaint — but only when the
    // card is settled. Mid-reveal the animation owns the canvas.
    const observer = new ResizeObserver(() => {
      if (card.dataset.state === 'settled') drawSettled(card, phenotype, age)
    })
    observer.observe(card)

    return () => {
      cancelled = true
      observer.disconnect()
      window.removeEventListener('serpentine:seen', onSeen)
      unwire()
    }
  }, [id, phenotype, age, autoReveal, faceUp])

  const activate = (): void => {
    const card = ref.current
    if (!card) return
    if (onActivate) onActivate()
    else void reveal(card, phenotype, age)
  }

  return (
    <div
      ref={ref}
      className={`card ${size === 'default' ? '' : size}`}
      data-id={id}
      data-tier={model.tier}
      data-foil={model.foils.join(' ')}
      data-escape={model.escape}
      data-state="facedown"
      role="button"
      tabIndex={0}
      aria-label={`${model.name}, ${model.tier}`}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          activate()
        }
      }}
    >
      <div className="card__tilt">
        <div className="card__flipper">
          <div className="face face--front">
            <div className="legend-halo" />
            <div className="frame" />
            <i className="corner corner--tl" />
            <i className="corner corner--tr" />
            <i className="corner corner--bl" />
            <i className="corner corner--br" />

            <div className="content">
              <div className="hdr">
                <span className="tier-chip">{model.tier}</span>
                <span className="pips">
                  {Array.from({ length: 5 }, (_, i) => (
                    <i key={i} className={i <= ['common', 'uncommon', 'rare', 'epic', 'legendary'].indexOf(model.tier) ? 'pip on' : 'pip'} />
                  ))}
                </span>
              </div>

              <div className="badges">
                {model.mechanisms.map((m) => (
                  <span key={m} className="badge" title={MECHANISM_LABEL[m]} aria-label={MECHANISM_LABEL[m]}>
                    <svg viewBox="0 0 20 20">{MECHANISM_ICON[m]}</svg>
                  </span>
                ))}
              </div>

              <div className="art-window">
                <canvas className="snake-canvas" aria-label={`${model.name} artwork`} />
                <div className="foil foil--art foil--glow" />
                <div className="foil foil--art foil--irid" />
                <div className="foil foil--art foil--glit" />
              </div>

              <div className="nameplate">
                <h3 className="cname">{model.name}</h3>
                <span className="species">{model.speciesLine}</span>
                <span className="pedigree">{model.pedigreeLine}</span>
              </div>

              <div className="stats">
                {model.stats.map((stat) => (
                  <div className="stat" key={stat.key}>
                    <span className="k">{stat.label}</span>
                    <Segments score={stat.score} />
                    <span className="v">{stat.display}</span>
                  </div>
                ))}
                <div className="hidden-stat">
                  <div>
                    <span className="k">Hidden</span>
                    <div className="sub">{model.hiddenSub}</div>
                  </div>
                  <div className="hidden-val">{model.hidden}</div>
                  <div className="hidden-meter">
                    {Array.from({ length: model.hiddenTotal }, (_, i) => (
                      <i key={i} className={i < model.hidden ? 'on' : ''} />
                    ))}
                  </div>
                </div>
              </div>

              <p className="flavour">{model.flavour}</p>
            </div>

            {model.needsCare && <span className="care-flag">extra care</span>}

            <div className="foil foil--glow" />
            <div className="foil foil--irid" />
            <div className="foil foil--glit" />
            <div className="foil foil--gloss" />
          </div>

          <div className="face face--back">
            <div className="back-pattern" />
            <div className="back-vignette" />
            <div className="back-frame" />
            <div className="back-emblem">
              <div className="d">
                <i />
              </div>
            </div>
            <div className="back-wordmark">Serpentine</div>
          </div>
        </div>
      </div>

      <div className="wrapper">
        <div className="wrap-half wrap-half--l" />
        <div className="wrap-half wrap-half--r" />
        <div className="wrap-sheen" />
        <div className="wrap-seal">S</div>
      </div>
      <div className="fx-ring" />
      <canvas className="fx-canvas" />
      <canvas className="escape-canvas" aria-hidden="true" />
    </div>
  )
}
