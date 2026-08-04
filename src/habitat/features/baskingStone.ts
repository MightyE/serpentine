/**
 * Basking stone — a flat slab at the warm end that holds heat after the lamp goes off.
 *
 * See `corkHide.ts` for how to read (and copy) one of these files.
 */

import type { FeatureProvision } from '../contract'
import { FEATURE_COST } from '../tuningPlaceholders'

export const baskingStone: FeatureProvision = {
  role: 'feature',
  id: 'basking-stone',
  label: 'Basking stone',
  describe: 'A flat slab under the warm end. Holds its heat for hours after the lamp goes off.',
  site: 'floor',
  thermal: 'warm',

  supplies: { thermalGradient: 'strong' },
  cost: Math.round(FEATURE_COST * 0.8),
  upkeepPerWeek: 0,
  featureSlotCost: 1,
  unlock: 'starting',

  layers: [{ kind: 'furniture', name: 'rockOutcrop', params: { size: 0.21, satellites: 2, cracks: 3 } }],
}
