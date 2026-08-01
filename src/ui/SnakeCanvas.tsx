/**
 * One animated snake, in a box.
 *
 * ## One loop for the whole page
 *
 * `render/loop.ts` is explicit that there should be exactly one `requestAnimationFrame` loop in
 * the app, and a grid of thirty cards each starting its own would be thirty callbacks a frame
 * drifting out of step. So this component registers with the shared loop below and unregisters
 * on unmount; the loop itself starts on the first canvas and stops on the last.
 *
 * ## It is handed a phenotype, never a snake
 *
 * The renderer has no idea what a gene is — see `render/contract.ts`. This component keeps that
 * boundary: it takes a `Phenotype` and an age, and could draw an animal that was never bred.
 */
import { useEffect, useRef } from 'react'
// Importing the renderer's barrel is what registers every built-in stage and effect. Without it
// a phenotype cannot compile and every snake throws "no stage registered as…" — see
// `render/index.ts`'s closing paragraph, which says exactly this.
import '../render'
import { fitCanvasToDisplay, startRenderLoop } from '../render/loop'
import { LifeSnakeView, type LifePose } from '../render/life'
import type { Phenotype } from '../render/contract'

interface Entry {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  view: LifeSnakeView
  zoom: number
}

const entries = new Set<Entry>()
let stop: (() => void) | null = null

function ensureLoop(): void {
  if (stop) return
  stop = startRenderLoop((dt) => {
    for (const entry of entries) {
      const { canvas, ctx, view, zoom } = entry
      if (!canvas.isConnected) continue
      fitCanvasToDisplay(canvas, ctx)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      view.update(dt)
      // The view works in the renderer's own units — an adult is 300 logical pixels long — and
      // the card it has to fit in is smaller than that. Scaling the context rather than shrinking
      // the animal keeps every proportion honest, which matters because proportion is the whole
      // of how a hatchling reads as a hatchling.
      ctx.save()
      ctx.scale(zoom, zoom)
      view.draw(ctx)
      ctx.restore()
    }
  })
}

function maybeStopLoop(): void {
  if (entries.size > 0 || !stop) return
  stop()
  stop = null
}

export interface SnakeCanvasProps {
  readonly phenotype: Phenotype
  /** 0 = newly hatched, 1 = fully grown. Proportions change, not just scale. */
  readonly age?: number
  readonly pose?: LifePose
  readonly width?: number
  readonly height?: number
  /**
   * Logical pixels per CSS pixel. Below 1 the whole animal fits in a small card; the default is
   * chosen so a full-grown adult (300 logical pixels nose to tail) has room to curve.
   */
  readonly zoom?: number
  readonly className?: string
}

export function SnakeCanvas({
  phenotype,
  age = 1,
  pose = 'showcase',
  width = 220,
  height = 140,
  zoom = width / 300,
  className,
}: SnakeCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const view = new LifeSnakeView(phenotype, {
      bounds: { x: 0, y: 0, width: width / zoom, height: height / zoom },
      age,
      pose,
    })
    const entry: Entry = { canvas, ctx, view, zoom }
    entries.add(entry)
    ensureLoop()

    return () => {
      entries.delete(entry)
      maybeStopLoop()
    }
    // A new phenotype is a new animal — rebuilding the view is correct, not wasteful.
  }, [phenotype, age, pose, width, height, zoom])

  return (
    <canvas
      ref={ref}
      className={className ? `snake-canvas ${className}` : 'snake-canvas'}
      style={{ width, height }}
      aria-label={phenotype.label}
      role="img"
    />
  )
}
