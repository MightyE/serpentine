/**
 * The habitat system's barrel.
 *
 * **Importing this file is what registers every built-in layer, biome and feature.** Import it
 * before drawing anything or every name will look unregistered — exactly the same contract as
 * `src/render/index.ts`, and for the same reason: registration is a side effect of the module
 * graph, so something has to pull the graph in.
 *
 * The two halves of the system:
 *
 * - **The model** — `contract.ts`, `provisions.ts`, `tuningPlaceholders.ts`. What an enclosure
 *   supplies, how well it matches an animal, and what that is worth. No canvas anywhere in it.
 * - **The drawing** — `layers/`, `biomes/`, `features/`, `layout.ts`, `compose.ts`. Reads the
 *   model; nothing in the model reads it back.
 */

import { registerBuiltInLayers } from './layers'
import { registerBuiltInBiomes } from './biomes'
import { registerBuiltInFeatures } from './features'

registerBuiltInLayers()
registerBuiltInBiomes()
registerBuiltInFeatures()

export * from './contract'
export * from './provisions'
export { biomeRegistry, featureRegistry, layerRegistry } from './registry'
export { drawEnclosure, drawOrder, sceneFor, type EnclosureView } from './compose'
export { layoutFeatures, placeFeature } from './layout'
export { registerBuiltInLayers, registerBuiltInBiomes, registerBuiltInFeatures }
export {
  BIOME_COST,
  FEATURE_COST,
  FEATURE_UPKEEP,
  SPECIES_REQUIREMENT_PLACEHOLDER,
  SUPPLY_LEVEL_VALUE,
  UNLOCK_BAND_REPUTATION,
} from './tuningPlaceholders'
