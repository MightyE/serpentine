/**
 * Picking a snake up and putting it down — **one state model, three ways to drive it.**
 *
 * ## Why this is a hook and not two event handlers
 *
 * The store supports clicking a snake to select it, dragging it upward off its shelf, and doing
 * the whole thing from the keyboard. The obvious implementation is three code paths, and the
 * obvious result is three subtly different behaviours: the drag remembers where the snake came
 * from and the click does not, Escape cancels one of them, a refusal shows for two.
 *
 * So there is exactly one piece of state — {@link Carry}, "which animal is in your hand" — and
 * every input is a way of setting or clearing it. `dragging` is *presentation*: it says the
 * pointer is currently holding the thing so it can be drawn following the cursor. Nothing about
 * whether a drop is legal, or what happens on one, consults it.
 *
 * ## The gestures, precisely
 *
 * - **Click a snake** → pick it up. Click it again → put it back down.
 * - **Press and drag** → the same pick-up, plus the snake follows the pointer. Lifting *upward*
 *   is the asked-for gesture, so a small upward movement arms it immediately; movement past a
 *   larger threshold in any direction arms it too, because a drag that only works in one
 *   direction feels broken.
 * - **Release over a habitat** → drop. Release anywhere else → the snake stays in hand, so a
 *   fumbled drag costs a second click rather than your selection.
 * - **A refused drop keeps the snake in hand**, which is what `onDrop`'s boolean is for. Being
 *   told why and then having to go and find the animal again is the version that would make the
 *   refusal message feel like a punishment.
 * - **Enter or Space on a focused snake** → pick up. On a focused habitat → drop.
 * - **Escape** → put it down, always, from any of the above.
 *
 * This hook never decides whether a placement is allowed. That is `game/placement.ts`'s job, and
 * keeping the decision out of here is what stops the UI growing a second, disagreeing copy of the
 * housing rules.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

/** How far up the pointer must move before a press becomes a lift. Small: this is the asked-for gesture. */
const LIFT_UP_PX = 5

/** How far in any direction before a press becomes a lift anyway. */
const LIFT_ANY_PX = 12

/** What is in your hand. `null` means nothing is. */
export interface Carry {
  readonly snakeId: string
  /** True while the pointer is holding it, so it can be drawn following the cursor. */
  readonly dragging: boolean
  /** Viewport coordinates of the pointer, for the drag ghost. `null` unless dragging. */
  readonly at: { readonly x: number; readonly y: number } | null
}

export interface UseCarryOptions {
  /**
   * Called when the player releases over, clicks, or keys onto a habitat.
   *
   * Return `true` if the animal went in — the hook then empties your hand. Return `false` for a
   * refusal, and it stays held so the next attempt does not start with hunting for it again.
   */
  readonly onDrop: (snakeId: string, habitatId: string) => boolean
  /** Called when a carry ends without a drop, so a stale refusal message can be cleared. */
  readonly onCancel?: () => void
}

export interface CarryHandle {
  readonly held: Carry | null
  readonly isHeld: (snakeId: string) => boolean
  /** Click or key: pick this one up, or put it back if it is already in hand. */
  readonly toggle: (snakeId: string) => void
  /** `onPointerDown` for a snake. Arms the drag; the lift happens once the pointer moves. */
  readonly beginDrag: (snakeId: string, event: React.PointerEvent) => void
  /** Drop on a habitat, from a click or a key. Does nothing when nothing is held. */
  readonly dropOn: (habitatId: string) => void
  readonly cancel: () => void
}

/**
 * The `data-habitat` attribute a drop target must carry.
 *
 * A pointer release is resolved by hit-testing the element under the cursor rather than by each
 * tile tracking its own enter/leave. Fewer moving parts, and it is the version that keeps working
 * when a tile re-renders mid-drag.
 */
export const HABITAT_TARGET_ATTR = 'data-habitat'

export function useCarry({ onDrop, onCancel }: UseCarryOptions): CarryHandle {
  const [held, setHeldState] = useState<Carry | null>(null)

  // A mirror of the state, because the pointer listeners live on `window` and outlive the render
  // that installed them. Reading state through a ref here — rather than doing the work inside a
  // `setState` updater — keeps every side effect outside React's render path, which is what makes
  // this behave under StrictMode's double invocation.
  const heldRef = useRef<Carry | null>(null)
  const setHeld = useCallback((next: Carry | null) => {
    heldRef.current = next
    setHeldState(next)
  }, [])

  const handlers = useRef({ onDrop, onCancel })
  handlers.current = { onDrop, onCancel }

  const cancel = useCallback(() => {
    if (!heldRef.current) return
    setHeld(null)
    handlers.current.onCancel?.()
  }, [setHeld])

  const toggle = useCallback(
    (snakeId: string) => {
      if (heldRef.current?.snakeId === snakeId) {
        cancel()
        return
      }
      setHeld({ snakeId, dragging: false, at: null })
    },
    [cancel, setHeld],
  )

  /** The one place a drop is resolved, whatever gesture produced it. */
  const resolveDrop = useCallback(
    (snakeId: string, habitatId: string) => {
      const placed = handlers.current.onDrop(snakeId, habitatId)
      setHeld(placed ? null : { snakeId, dragging: false, at: null })
    },
    [setHeld],
  )

  const dropOn = useCallback(
    (habitatId: string) => {
      const current = heldRef.current
      if (!current) return
      resolveDrop(current.snakeId, habitatId)
    },
    [resolveDrop],
  )

  const beginDrag = useCallback(
    (snakeId: string, event: React.PointerEvent) => {
      // Right-click and middle-click are not drags.
      if (event.button !== 0) return
      const startX = event.clientX
      const startY = event.clientY
      let lifted = false

      const move = (e: PointerEvent): void => {
        const dx = e.clientX - startX
        const dy = e.clientY - startY
        if (!lifted && !(dy <= -LIFT_UP_PX || Math.hypot(dx, dy) >= LIFT_ANY_PX)) return
        if (!lifted) {
          lifted = true
          // Selecting text while dragging a snake around is not a bug, but it reads as one.
          document.body.style.userSelect = 'none'
        }
        setHeld({ snakeId, dragging: true, at: { x: e.clientX, y: e.clientY } })
      }

      const up = (e: PointerEvent): void => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        document.body.style.userSelect = ''

        if (!lifted) {
          // A press that never moved is a click. Same path as clicking, deliberately.
          toggle(snakeId)
          return
        }

        const habitatId = document
          .elementFromPoint(e.clientX, e.clientY)
          ?.closest(`[${HABITAT_TARGET_ATTR}]`)
          ?.getAttribute(HABITAT_TARGET_ATTR)

        if (habitatId) resolveDrop(snakeId, habitatId)
        else setHeld({ snakeId, dragging: false, at: null })
      }

      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [resolveDrop, setHeld, toggle],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') cancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cancel])

  return {
    held,
    isHeld: (snakeId) => held?.snakeId === snakeId,
    toggle,
    beginDrag,
    dropOn,
    cancel,
  }
}
