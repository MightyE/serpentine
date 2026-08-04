/**
 * One enclosure, drawn.
 *
 * A thin wrapper over `habitat/compose.ts`: measure the box, set up the device pixel ratio, draw.
 * The picture is a pure function of the habitat's id, so there is nothing to cache and nothing to
 * animate — it repaints on resize and on a change of biome or features, and otherwise sits there.
 */
import { useEffect, useRef } from 'react'
// Importing the habitat barrel is what registers every layer, biome and feature. Without it every
// layer name looks unregistered — see `habitat/index.ts`.
import '../habitat'
import { drawEnclosure } from '../habitat/compose'
import { biomeRegistry, featureRegistry } from '../habitat/registry'
import type { FeatureProvision } from '../habitat/contract'

export interface HabitatCanvasProps {
  /** The habitat's id. Seeds the artwork, so the same enclosure looks identical every time. */
  readonly id: string
  readonly biomeId: string
  readonly featureIds: readonly string[]
  readonly className?: string
}

export function HabitatCanvas({ id, biomeId, featureIds, className }: HabitatCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const key = featureIds.join(',')

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return

    const paint = (): void => {
      const rect = canvas.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const biome = biomeRegistry.get(biomeId)
      if (!biome) return

      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, rect.width, rect.height)

      drawEnclosure(ctx, {
        id,
        rect: { x: 0, y: 0, width: rect.width, height: rect.height },
        biome,
        features: featureIds
          .map((featureId) => featureRegistry.get(featureId))
          .filter((f): f is FeatureProvision => f !== undefined),
      })
    }

    paint()
    const observer = new ResizeObserver(paint)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [id, biomeId, key, featureIds])

  return <canvas ref={ref} className={className} aria-hidden="true" />
}
