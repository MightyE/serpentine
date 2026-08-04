/**
 * The enclosure around a living animal: cached artwork, and the furniture it has to walk around.
 *
 * ## Why the artwork is cached rather than redrawn
 *
 * `HabitatCanvas` draws an enclosure once and never again, because the picture is a pure function
 * of the habitat's id. The moment there is an animal in it, something has to be redrawn sixty
 * times a second — and redrawing a hundred-odd planting layers behind the snake each time would
 * cost more than everything else on this screen put together.
 *
 * So the enclosure is rendered twice into offscreen canvases at mount:
 *
 * - **backdrop** — `backdrop` through `furniture`. Everything the animal is *on*.
 * - **overlay** — `foreground` and `light`. The lid, the glare, the warm pool. Everything the
 *   animal is *under*.
 *
 * A frame is then two `drawImage` calls with the snakes between them, which is both fast and the
 * correct layering: an animal drawn over the glass glare looks like it is sitting on the outside
 * of the enclosure, and once you have seen it you cannot unsee it.
 *
 * Splitting the layer list this way needs the *same* per-layer RNG forks the one-shot composer
 * uses, or the two halves would be drawn from different arrangements of the same enclosure. That
 * is why this walks `drawOrder`'s full sorted list and skips entries rather than filtering first:
 * the fork label contains the entry's index.
 */

// Importing the habitat barrel is what registers every layer, biome and feature — the same reason
// `HabitatCanvas` does it. Anything that draws an enclosure has to, or every layer name looks
// unregistered and `biomeRegistry.get` quietly returns nothing.
import '../index'
import type { EnclosureView } from '../compose'
import { drawOrder, sceneFor } from '../compose'
import { layoutFeatures } from '../layout'
import { layerRegistry } from '../registry'
import type { HabitatScene, LayerKind, LayerParams } from '../contract'
import type { Obstacle } from '../../render/locomotion'

/** Drawn behind the animals. */
const BEHIND: readonly LayerKind[] = ['backdrop', 'substrate', 'scatter', 'planting', 'furniture']
/** Drawn over them. */
const IN_FRONT: readonly LayerKind[] = ['foreground', 'light']

/**
 * How big a circle each kind of feature takes up, as a fraction of the enclosure's short side.
 *
 * Deliberately generous: this is an *avoidance* radius, not a collision hull. The animal starts
 * bending away at the rim, so a radius that only just covers the object produces a snake that
 * grazes it. `overhead` and `ground` are absent because a lamp is above the animal and a change
 * of substrate is under it — neither is in the way.
 */
const AVOID_RADIUS: Partial<Readonly<Record<string, number>>> = {
  back: 0.17,
  floor: 0.14,
  span: 0.1,
}

export interface EnclosureArt {
  readonly behind: HTMLCanvasElement
  readonly inFront: HTMLCanvasElement
  readonly obstacles: readonly Obstacle[]
  readonly scene: HabitatScene
}

/**
 * Render one enclosure into the two cached layers, and work out where its furniture is.
 *
 * @param dpr device pixel ratio the caches are rendered at, so they composite 1:1 onto a canvas
 *   set up the same way.
 */
export function buildEnclosureArt(view: EnclosureView, dpr: number): EnclosureArt {
  const scene = sceneFor(view)
  const entries = drawOrder(view, scene)

  const paint = (kinds: readonly LayerKind[]): HTMLCanvasElement => {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(view.rect.width * dpr))
    canvas.height = Math.max(1, Math.round(view.rect.height * dpr))
    const ctx = canvas.getContext('2d')
    if (!ctx) return canvas
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    entries.forEach((entry, index) => {
      if (!kinds.includes(entry.layer.kind)) return
      const definition = layerRegistry.get(entry.layer.kind, entry.layer.name)
      if (!definition) {
        throw new Error(
          `Habitat layer "${entry.layer.kind}:${entry.layer.name}" is not registered. ` +
            `Import 'src/habitat' before drawing, or add it to layers/index.ts.`,
        )
      }
      const params: LayerParams = { ...definition.defaults, ...entry.layer.params }
      const layerScene: HabitatScene = {
        ...scene,
        rng: scene.rng.fork(`${entry.layer.kind}:${entry.layer.name}:${index}`),
      }
      ctx.save()
      try {
        definition.draw(ctx, layerScene, params, entry.placement)
      } finally {
        ctx.restore()
      }
    })
    return canvas
  }

  return {
    behind: paint(BEHIND),
    inFront: paint(IN_FRONT),
    obstacles: obstaclesOf(view, scene),
    scene,
  }
}

/** Where the furniture is, as circles the animals steer around. */
export function obstaclesOf(view: EnclosureView, scene: HabitatScene): readonly Obstacle[] {
  const short = Math.min(view.rect.width, view.rect.height)
  const out: Obstacle[] = []
  for (const { feature, placement } of layoutFeatures(view.features, scene)) {
    const fraction = AVOID_RADIUS[feature.site]
    if (fraction === undefined) continue
    out.push({ x: placement.x, y: placement.y, radius: short * fraction * placement.scale })
  }
  return out
}
