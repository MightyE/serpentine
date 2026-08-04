/**
 * The animal that is currently in your hands.
 *
 * A live canvas rather than the cached portrait, because the *pose* is the message here — head
 * level, tail dangling — and because being picked up is a reaction: the eyes go wide and settle
 * over about two seconds. See `render/pose/heldView.ts`.
 *
 * `aria-hidden`, deliberately. The carry banner already says "<name> is in your hands" through a
 * live region, and the picked-up button reports its own state; a third announcement of the same
 * fact is noise on a screen reader, not access.
 */
import { useEffect, useRef } from 'react'
// The renderer's barrel is what registers every pattern stage — see `SnakePortrait` for the same
// import and the same reason.
import '../render'
import type { Phenotype } from '../render/contract'
import { HeldSnakeView } from '../render/pose'
import { prefersReducedMotion } from '../habitat/occupants'

export interface HeldSnakeProps {
  readonly phenotype: Phenotype
  /** 0 newly hatched, 1 full grown. */
  readonly age: number
  readonly className?: string
}

export function HeldSnake({ phenotype, age, className }: HeldSnakeProps) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const view = new HeldSnakeView(canvas, { phenotype, age, still: prefersReducedMotion() })
    return () => view.destroy()
  }, [phenotype, age])

  return <canvas ref={ref} className={className} aria-hidden="true" />
}
