/**
 * A still portrait, in a box.
 *
 * Static on purpose, and cached: `render/portrait.ts` memoises per phenotype and size, so a list of
 * thirty animals costs thirty `drawImage` calls rather than thirty render pipelines and thirty
 * animation loops. The live renderer earns its keep during a reveal, where one card at a time has
 * the whole frame budget — see `reveal.ts` for why that split is the point rather than a saving.
 */
import { useEffect, useRef } from 'react'
// Importing the renderer's barrel is what registers every built-in stage and effect. Without it a
// phenotype cannot compile — see `render/index.ts`'s closing paragraph.
import '../render'
import { renderPortrait } from '../render/portrait'
import type { Phenotype } from '../render/contract'

export interface SnakePortraitProps {
  readonly phenotype: Phenotype
  readonly className?: string
}

export function SnakePortrait({ phenotype, className }: SnakePortraitProps) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return

    const paint = (): void => {
      const rect = canvas.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, rect.width, rect.height)
      ctx.drawImage(renderPortrait(phenotype, { width: rect.width, height: rect.height, pixelRatio: dpr }), 0, 0, rect.width, rect.height)
    }

    paint()
    const observer = new ResizeObserver(paint)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [phenotype])

  return <canvas ref={ref} className={className} aria-label={phenotype.label} role="img" />
}
