/**
 * Every biome the game knows about.
 *
 * ## Adding one
 *
 * Copy the file here closest to what you want, change the palette, the layer list and the supply
 * bands, then add one line to the list below. **That is the whole change.** `westAfricanScrub.ts`
 * is written as the template — read its header first.
 *
 * The four shipped biomes are deliberately spread across the *axes*, not just across the
 * scenery: scrub is cover, prairie is substrate depth, woodland is climbing and enrichment, and
 * cypress is humidity. If a fifth biome duplicates an existing one's supply profile it will look
 * different and play identically, which is the failure mode worth watching for here.
 */

import { biomeRegistry } from '../registry'

import { westAfricanScrub } from './westAfricanScrub'
import { woodlandEdge } from './woodlandEdge'
import { sandyPrairie } from './sandyPrairie'
import { cypressMargin } from './cypressMargin'

export { westAfricanScrub, woodlandEdge, sandyPrairie, cypressMargin }

let registered = false

/** Put every built-in biome into the shared registry. Idempotent; see `layers/index.ts`. */
export function registerBuiltInBiomes(): void {
  if (registered) return
  registered = true

  // ---- the list. Add your line here. -------------------------------------------------------
  biomeRegistry.register(westAfricanScrub)
  biomeRegistry.register(woodlandEdge)
  biomeRegistry.register(sandyPrairie)
  biomeRegistry.register(cypressMargin)
}
