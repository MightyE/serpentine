/**
 * The rescue, from above: a floor of habitats and a bench of animals waiting for one.
 *
 * ## What this screen is for
 *
 * Assignment. An animal in a habitat is an animal that can be *paired*, so this is the screen
 * where breeding stops being a form with two dropdowns and becomes a thing you arrange. Two
 * compatible adults sharing an enclosure is how a clutch happens; the Breeding screen still owns
 * the prediction and the arithmetic.
 *
 * ## The grid is a parameter
 *
 * `store.columns` and `store.rows` drive the CSS grid through two custom properties. Nothing here
 * knows the number nine. The store is going to become upgradable, so three-by-three is today's
 * value, and buying floor space will be a change to `placement.ts` and a button — not a relayout.
 *
 * ## Interaction
 *
 * All of it goes through {@link useCarry}, which holds the single "what is in your hand" state
 * that clicking, dragging and the keyboard all drive. This file supplies one thing that hook does
 * not have: what happens on a drop. That is `session.placeSnake`, and a refusal comes back as a
 * value to *show* rather than as a failure to swallow.
 *
 * The one place a refusal is more than a message is `wouldPair`: dropping a snake in with a
 * compatible partner is refused once, with the partner named, and goes through on the second drop.
 * Pairing is the feature, but a clutch you got by fumbling a drag is a clutch you did not choose.
 */
import { useState } from 'react'
import { describeRefusal } from '../habitat/provisions'
import type { SnakeRecord } from '../game/roster'
import type { Session } from '../game/session'
import { cellsOf, freeCells, habitatOf, sizeOf, type HabitatState } from '../game/placement'
import { featureRegistry } from '../habitat/registry'
import { biomeRegistry } from '../habitat/registry'
import { HabitatCanvas } from './HabitatCanvas'
import { SnakePortrait } from './SnakePortrait'
import { HABITAT_TARGET_ATTR, useCarry, type CarryHandle } from './useCarry'
import './store.css'

export interface StoreProps {
  readonly session: Session
  readonly onOpen: (record: SnakeRecord) => void
  readonly onHatched: (babies: readonly SnakeRecord[]) => void
  readonly say: (message: string) => void
}

/** How a habitat reads while you are carrying an animal. Drives the tile's outline. */
type TargetState = 'ok' | 'confirm' | 'no' | 'idle'

export function Store({ session, onOpen, onHatched, say }: StoreProps) {
  const store = session.store
  const [refusal, setRefusal] = useState<{ readonly habitatId: string; readonly text: string } | null>(null)
  /** The one habitat a `wouldPair` refusal has been shown for. A second drop there confirms it. */
  const [pendingPair, setPendingPair] = useState<{ snakeId: string; habitatId: string } | null>(null)

  const carry = useCarry({
    onDrop: (snakeId, habitatId) => {
      const confirming = pendingPair?.snakeId === snakeId && pendingPair.habitatId === habitatId
      const result = session.placeSnake(snakeId, habitatId, { confirmPairing: confirming })
      if (!result) {
        setRefusal(null)
        setPendingPair(null)
        const record = session.record(snakeId)
        const habitat = store.habitats.find((h) => h.id === habitatId)
        if (record && habitat) say(`${record.name} moved into the ${sizeOf(habitat).label.toLowerCase()}.`)
        return true
      }
      setRefusal({ habitatId, text: describeRefusal(result) })
      setPendingPair(result.kind === 'wouldPair' ? { snakeId, habitatId } : null)
      return false
    },
    onCancel: () => {
      setRefusal(null)
      setPendingPair(null)
    },
  })

  /** How this habitat would receive whatever is in hand. `idle` when nothing is. */
  const targetState = (habitat: HabitatState): TargetState => {
    if (!carry.held) return 'idle'
    const check = session.checkPlacement(carry.held.snakeId, habitat.id)
    if (!check) return 'ok'
    if (check.kind === 'wouldPair') return 'confirm'
    return 'no'
  }

  const unhoused = session.residents().filter((record) => !habitatOf(store, record.individual.id))
  const held = carry.held ? session.record(carry.held.snakeId) : undefined

  return (
    <div className="store">
      <div className="panel store-panel">
        <div className="panel-head">
          <h3>
            The floor — {store.habitats.length} habitat{store.habitats.length === 1 ? '' : 's'} in{' '}
            {store.columns} × {store.rows}
          </h3>
          <span className="muted small mono">
            {carry.held
              ? 'click a habitat to put it down · esc to stop'
              : 'click a snake to pick it up, or drag it upward'}
          </span>
        </div>

        {held && (
          <p className="carry-banner" role="status">
            <strong>{held.name}</strong> is in your hands. Choose a habitat.
          </p>
        )}

        <div
          className="store-floor"
          style={
            {
              '--store-columns': store.columns,
              '--store-rows': store.rows,
            } as React.CSSProperties
          }
        >
          {freeCells(store).map((cell) => (
            <div
              key={`free-${cell.column}-${cell.row}`}
              className="floor-cell"
              style={{ gridColumn: cell.column + 1, gridRow: cell.row + 1 }}
              aria-hidden="true"
            >
              <span>buildable</span>
            </div>
          ))}

          {store.habitats.map((habitat) => (
            <HabitatTile
              key={habitat.id}
              session={session}
              habitat={habitat}
              carry={carry}
              state={targetState(habitat)}
              refusal={refusal?.habitatId === habitat.id ? refusal.text : null}
              onOpen={onOpen}
              onHatched={onHatched}
            />
          ))}
        </div>
      </div>

      <aside className="panel bench">
        <div className="panel-head">
          <h3>Waiting for a habitat</h3>
          <span className="muted small mono">{unhoused.length}</span>
        </div>

        {unhoused.length === 0 ? (
          <p className="empty">Everyone has somewhere to be.</p>
        ) : (
          <ul className="bench-list">
            {unhoused.map((record) => (
              <li key={record.individual.id}>
                <SnakeHandle session={session} record={record} carry={carry} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        )}
      </aside>

      {carry.held?.dragging && carry.held.at && held && (
        <div
          className="carry-ghost"
          style={{ left: carry.held.at.x, top: carry.held.at.y }}
          aria-hidden="true"
        >
          <SnakePortrait phenotype={session.phenotype(held)} className="carry-ghost-art" />
          <span>{held.name}</span>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

interface TileProps {
  readonly session: Session
  readonly habitat: HabitatState
  readonly carry: CarryHandle
  readonly state: TargetState
  readonly refusal: string | null
  readonly onOpen: (record: SnakeRecord) => void
  readonly onHatched: (babies: readonly SnakeRecord[]) => void
}

function HabitatTile({ session, habitat, carry, state, refusal, onOpen, onHatched }: TileProps) {
  const size = sizeOf(habitat)
  const biome = biomeRegistry.get(habitat.biomeId)
  const occupants = habitat.occupants
    .map((id) => session.record(id))
    .filter((r): r is SnakeRecord => r !== undefined)
  const pairing = session.pairingIn(habitat.id)
  const cells = cellsOf(habitat)
  const carrying = carry.held !== null

  return (
    <section
      className="habitat"
      {...{ [HABITAT_TARGET_ATTR]: habitat.id }}
      data-target={state}
      style={{
        gridColumn: `${habitat.column + 1} / span ${size.columns}`,
        gridRow: `${habitat.row + 1} / span ${size.rows}`,
      }}
    >
      <HabitatCanvas
        id={habitat.id}
        biomeId={habitat.biomeId}
        featureIds={habitat.featureIds}
        className="habitat-art"
      />

      {/*
        The drop target is a real `<button>` covering the art, not a `role="button"` on the tile
        itself. The tile contains the occupants' own pick-up buttons, and a button inside a button
        is invalid and unusable with a screen reader. It also only exists while something is in
        hand: nine permanent tab stops that do nothing is worse for a keyboard than none.
      */}
      {carrying && (
        <button
          type="button"
          className="habitat-drop"
          aria-label={`Put down in the ${size.label}, ${biome?.label ?? habitat.biomeId}. ${occupants.length} of ${size.capacity} occupied.`}
          onClick={() => carry.dropOn(habitat.id)}
        >
          <span>put down here</span>
        </button>
      )}

      <header className="habitat-head">
        <span className="habitat-name">{biome?.label ?? habitat.biomeId}</span>
        <span className="habitat-count mono" aria-label={`${occupants.length} of ${size.capacity} occupied`}>
          {occupants.length} / {size.capacity}
        </span>
      </header>

      <div className="habitat-foot">
        <ul className="habitat-occupants">
          {occupants.map((record) => (
            <li key={record.individual.id}>
              <SnakeHandle session={session} record={record} carry={carry} onOpen={onOpen} compact />
            </li>
          ))}
        </ul>

        <div className="habitat-meta">
          <span className="habitat-size mono">
            {size.label} · {cells.length} cell{cells.length === 1 ? '' : 's'}
          </span>
          <ul className="habitat-features">
            {habitat.featureIds.map((id) => (
              <li key={id} className="mono">
                {featureRegistry.get(id)?.label ?? id}
              </li>
            ))}
          </ul>
        </div>

        {pairing && (
          <div className="habitat-pairing">
            <span className="mono">these two will pair</span>
            <button
              className="primary"
              onClick={(e) => {
                e.stopPropagation()
                const babies = session.breedInHabitat(habitat.id)
                onHatched(babies)
              }}
            >
              Breed
            </button>
          </div>
        )}

        {refusal && (
          <p className="habitat-refusal" role="alert">
            {refusal}
          </p>
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------

interface HandleProps {
  readonly session: Session
  readonly record: SnakeRecord
  readonly carry: CarryHandle
  readonly onOpen: (record: SnakeRecord) => void
  readonly compact?: boolean
}

/**
 * One animal you can pick up.
 *
 * A real `<button>`, so Enter and Space pick it up for free and it is in the tab order without
 * anything being simulated. The pointer drag rides on top via `onPointerDown` — a press that never
 * moves falls through to the button's own click, which is why both gestures reach the same state.
 */
function SnakeHandle({ session, record, carry, onOpen, compact }: HandleProps) {
  const held = carry.isHeld(record.individual.id)
  const sex = session.sexOf(record)
  const stage = session.stageOf(record)

  return (
    <div className={compact ? 'handle compact' : 'handle'} data-held={held || undefined}>
      <button
        type="button"
        className="handle-grab"
        aria-pressed={held}
        aria-label={`${record.name}, ${sex} ${stage}. ${held ? 'In your hands.' : 'Pick up.'}`}
        onPointerDown={(e) => {
          e.stopPropagation()
          carry.beginDrag(record.individual.id, e)
        }}
        // Keyboard activation is handled here rather than in an `onClick` that tries to tell a
        // keyed click from a pointer one by its `detail`. That inference did not survive being
        // tested in the browser, and the explicit version is the one you can read anyway: the
        // pointer goes through `beginDrag`, the keyboard goes through here, and both end at the
        // same `toggle`.
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          e.stopPropagation()
          carry.toggle(record.individual.id)
        }}
      >
        <SnakePortrait phenotype={session.phenotype(record)} className="handle-art" />
        <span className="handle-name">{record.name}</span>
        <span className="handle-facts mono">
          {sex === 'female' ? '♀' : '♂'} {stage}
        </span>
      </button>

      <button
        type="button"
        className="ghost handle-open"
        aria-label={`Open ${record.name}’s file`}
        onClick={(e) => {
          e.stopPropagation()
          onOpen(record)
        }}
      >
        file
      </button>
    </div>
  )
}
