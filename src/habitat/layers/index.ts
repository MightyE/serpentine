/**
 * Every habitat layer the game knows about.
 *
 * ## Adding a decorative element
 *
 * Write a file next to these that exports a `LayerDefinition`, import it here, and add it to the
 * list below. **That is the whole change** — one new file, one line here. Nothing else in the
 * codebase needs to know your layer exists: the composer finds it by name through the registry,
 * and any biome or feature can start referencing it immediately.
 *
 * This is the same procedure as `src/render/stages/index.ts`, deliberately. Learn it once and it
 * is the procedure for snakes *and* for the places you keep them.
 *
 * The kind you pick decides when it draws, and it is worth picking honestly. In the top-down store
 * view the seven kinds read as:
 *
 * | kind | top-down, it is… | example |
 * |---|---|---|
 * | `backdrop` | the box: rim, walls, wall shadow | `enclosureFloor` |
 * | `substrate` | the floor covering | `substrateWash` |
 * | `scatter` | flat things lying on the floor | `pebbleScatter`, `leafLitter`, `sandRipples`, `barkChips` |
 * | `planting` | things that grow | `grassTufts`, `shrubClumps`, `mossPatch` |
 * | `furniture` | installed objects, placed by `layout.ts` | `rockOutcrop`, `driftwood`, `waterDish`, `hideBox` |
 * | `foreground` | what is between you and the animal — the lid | `glassGlare` |
 * | `light` | the lamp pool and the vignette; tints everything under it | `warmPool` |
 *
 * A rule of thumb for the middle three: if `layout.ts` should choose where your thing sits, it is
 * `furniture`. If it should appear all over the floor, it is `scatter` or `planting`.
 */

import { layerRegistry } from '../registry'

import { enclosureFloorLayer } from './enclosureFloor'
import { substrateWashLayer } from './substrateWash'
import { pebbleScatterLayer } from './pebbleScatter'
import { leafLitterLayer } from './leafLitter'
import { sandRipplesLayer } from './sandRipples'
import { barkChipsLayer } from './barkChips'
import { grassTuftsLayer } from './grassTufts'
import { shrubClumpsLayer } from './shrubClumps'
import { mossPatchLayer } from './mossPatch'
import { rockOutcropLayer } from './rockOutcrop'
import { driftwoodLayer } from './driftwood'
import { waterDishLayer } from './waterDish'
import { hideBoxLayer } from './hideBox'
import { glassGlareLayer } from './glassGlare'
import { warmPoolLayer } from './warmPool'

let registered = false

/**
 * Put every built-in layer into the shared registry.
 *
 * Idempotent rather than throwing, for the same reason as `registerBuiltInStages`: a module
 * imported twice (bundlers and hot reload both do it) is not a programming error, whereas two
 * different layers claiming one name is — and that still throws, inside the registry.
 */
export function registerBuiltInLayers(): void {
  if (registered) return
  registered = true

  // ---- the list. Add your line here. -------------------------------------------------------
  layerRegistry.register(enclosureFloorLayer)
  layerRegistry.register(substrateWashLayer)
  layerRegistry.register(pebbleScatterLayer)
  layerRegistry.register(leafLitterLayer)
  layerRegistry.register(sandRipplesLayer)
  layerRegistry.register(barkChipsLayer)
  layerRegistry.register(grassTuftsLayer)
  layerRegistry.register(shrubClumpsLayer)
  layerRegistry.register(mossPatchLayer)
  layerRegistry.register(rockOutcropLayer)
  layerRegistry.register(driftwoodLayer)
  layerRegistry.register(waterDishLayer)
  layerRegistry.register(hideBoxLayer)
  layerRegistry.register(glassGlareLayer)
  layerRegistry.register(warmPoolLayer)
}
