/**
 * Water bowl — heavy ceramic, at the cool end, big enough to soak in.
 *
 * See `corkHide.ts` for how to read (and copy) one of these files.
 */

import type { FeatureProvision } from '../contract'
import { FEATURE_COST, FEATURE_UPKEEP } from '../tuningPlaceholders'

export const waterBowl: FeatureProvision = {
  role: 'feature',
  id: 'water-bowl',
  label: 'Ceramic water bowl',
  describe: 'Heavy enough not to be pushed over, wide enough to soak in. At the cool end, always.',
  site: 'floor',
  thermal: 'cool',

  supplies: { humidity: 'moderate' },
  cost: Math.round(FEATURE_COST * 0.6),
  upkeepPerWeek: FEATURE_UPKEEP * 0.5,
  featureSlotCost: 1,
  unlock: 'starting',

  layers: [{ kind: 'furniture', name: 'waterDish', params: { size: 0.15, fill: 0.85 } }],
}
