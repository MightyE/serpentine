/**
 * Every feature the game knows about.
 *
 * ## Adding one
 *
 * Copy the file here closest to what you want, change the drawing, the site and the supply bands,
 * then add one line to the list below. **That is the whole change.** `corkHide.ts` is written as
 * the template — read its header first.
 *
 * Between them the six shipped features cover all six provision axes at least once. That is worth
 * keeping true: an axis no feature supplies is an axis a player cannot act on, which makes it a
 * number on a readout rather than a decision.
 */

import { featureRegistry } from '../registry'

import { corkHide } from './corkHide'
import { humidHide } from './humidHide'
import { waterBowl } from './waterBowl'
import { climbingBranch } from './climbingBranch'
import { baskingStone } from './baskingStone'
import { leafBedding } from './leafBedding'

export { corkHide, humidHide, waterBowl, climbingBranch, baskingStone, leafBedding }

let registered = false

/** Put every built-in feature into the shared registry. Idempotent; see `layers/index.ts`. */
export function registerBuiltInFeatures(): void {
  if (registered) return
  registered = true

  // ---- the list. Add your line here. -------------------------------------------------------
  featureRegistry.register(corkHide)
  featureRegistry.register(humidHide)
  featureRegistry.register(waterBowl)
  featureRegistry.register(climbingBranch)
  featureRegistry.register(baskingStone)
  featureRegistry.register(leafBedding)
}
