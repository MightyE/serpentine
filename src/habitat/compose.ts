/**
 * Draw one enclosure: look the layers up, sort them, hand each a forked RNG, draw.
 *
 * ## The top-down reading of the contract
 *
 * `contract.ts` describes the seven layer kinds in side-on words, because that is the view it was
 * written for. The store is top-down. **Nothing in the contract changed** — the kinds, the order
 * and every signature are as written; only what the words point at is rotated:
 *
 * | field | side-on | top-down (here) |
 * |---|---|---|
 * | `backdrop` | back wall, distant scenery | the box: rim, walls, wall shadow |
 * | `foreground` | blades nearer than the animal | the lid, over everything |
 * | `horizon` | where wall meets substrate | the inside face of the back wall |
 * | `Placement.y` | the ground line an item stands on | the item's centre |
 * | `Placement.depth` | 0 at the wall, 1 at the glass | 0 at the top edge, 1 at the bottom |
 * | `Placement.facing` | which way it faces | which way it lies |
 *
 * That mapping is why a *side-on* enclosure view can be added later without touching a single
 * biome or feature file: it would be a second composer over the same registry.
 *
 * ## Known limitation: object scale follows the canvas, not the enclosure
 *
 * Every layer sizes itself against `min(rect.width, rect.height)`, so a pebble is a fixed fraction
 * of the enclosure's *short* side. That is right for the two shipped shapes — an alcove and a
 * vivarium are the same depth, so both get the same absolute pebble — and **wrong for a habitat
 * that is larger in both axes**: a 2 × 2 atrium has twice the short side, so its planting and
 * furniture come out twice life size.
 *
 * No atrium is built on the starting floor, so nothing shipped shows it. The fix is a `unit` field
 * on {@link HabitatScene} carrying "pixels per nominal cell", set here from the habitat's cell
 * span, with every layer sizing against that instead — a one-line change per layer file and a
 * one-field change to the contract. It is written down here rather than done because it touches
 * every layer, and the biomes were the thing that needed to be right first.
 *
 * ## Determinism
 *
 * Every layer gets `baseRng.fork(kind:name:index)`, so a layer always sees the same numbers no
 * matter what drew before it or how many layers the biome has. Add a shrub to a biome and the
 * pebbles do not move. That is the property that lets an enclosure's whole arrangement be
 * regenerated from its id instead of stored, and it is worth protecting — a layer that reads
 * `scene.rng` a variable number of times is fine, one that reaches for a shared stream is not.
 */

import { makeRng, hashSeed } from '../lib/rng'
import type {
  BiomeProvision,
  FeatureProvision,
  HabitatLayer,
  HabitatRect,
  HabitatScene,
  LayerParams,
  Placement,
} from './contract'
import { LAYER_KIND_ORDER } from './contract'
import { layoutFeatures } from './layout'
import { layerRegistry } from './registry'

/** Everything the composer needs to draw one enclosure. */
export interface EnclosureView {
  /** Stable and unique. Hashed into the seed, so this *is* the enclosure's identity. */
  readonly id: string
  readonly rect: HabitatRect
  readonly biome: BiomeProvision
  readonly features: readonly FeatureProvision[]
  /** Seconds since first draw. Only for gentle motion; nothing shipped uses it yet. */
  readonly time?: number
}

/** The whole enclosure, as a placement — what a biome layer is handed. */
function wholeOf(rect: HabitatRect): Placement {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
    scale: 1,
    facing: 1,
    depth: 0.5,
  }
}

/**
 * Build the scene an enclosure's layers share.
 *
 * `warmSide` comes off the id's hash rather than being a constant, so the rescue's enclosures do
 * not all bask in the same direction. Exported because the habitat lab wants to inspect a scene
 * without drawing one.
 */
export function sceneFor(view: EnclosureView): HabitatScene {
  const seed = hashSeed(view.id)
  return {
    rect: view.rect,
    seed,
    rng: makeRng(view.id),
    palette: view.biome.palette,
    warmSide: (seed & 1) === 0 ? 1 : -1,
    horizon: view.rect.y + view.rect.height * 0.16,
    time: view.time ?? 0,
  }
}

interface Entry {
  readonly layer: HabitatLayer
  readonly placement: Placement
  readonly rank: number
  readonly order: number
}

/**
 * Every layer to draw, in draw order.
 *
 * Sorted by kind first (`LAYER_KIND_ORDER`), then — within `furniture` only — by depth, then by
 * the order the layers were declared. So a biome file can list its layers in whatever order reads
 * best in the source and still get a sensible picture, which is the promise `contract.ts` makes.
 *
 * Exported so a test can assert the order without a canvas.
 */
export function drawOrder(view: EnclosureView, scene: HabitatScene): readonly Entry[] {
  const whole = wholeOf(view.rect)
  const entries: Entry[] = []
  let order = 0

  for (const layer of view.biome.layers) {
    entries.push({ layer, placement: whole, rank: LAYER_KIND_ORDER.indexOf(layer.kind), order: order++ })
  }

  for (const { feature, placement } of layoutFeatures(view.features, scene)) {
    for (const layer of feature.layers) {
      entries.push({
        layer,
        // A `ground` feature is not an object: its layers fill the enclosure like a biome's do.
        placement: feature.site === 'ground' ? whole : placement,
        rank: LAYER_KIND_ORDER.indexOf(layer.kind),
        order: order++,
      })
    }
  }

  return entries.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank
    if (a.layer.kind === 'furniture' && a.placement.depth !== b.placement.depth) {
      return a.placement.depth - b.placement.depth
    }
    return a.order - b.order
  })
}

/**
 * Draw the enclosure into `ctx`.
 *
 * An unregistered layer name throws rather than being skipped. A silently missing hide would be
 * read as a rendering glitch and chased for an hour; a thrown name is read in one second. See
 * `contract.ts`'s note on {@link HabitatLayer.name}.
 */
export function drawEnclosure(ctx: CanvasRenderingContext2D, view: EnclosureView): void {
  const scene = sceneFor(view)

  drawOrder(view, scene).forEach((entry, index) => {
    const definition = layerRegistry.get(entry.layer.kind, entry.layer.name)
    if (!definition) {
      throw new Error(
        `Habitat layer "${entry.layer.kind}:${entry.layer.name}" is not registered. ` +
          `Import 'src/habitat' before drawing, or add it to layers/index.ts.`,
      )
    }

    const params: LayerParams = { ...definition.defaults, ...entry.layer.params }
    // Forked per layer *and per position*, so two `mossPatch` entries in one biome are two
    // different patches rather than the same one drawn twice.
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
}
