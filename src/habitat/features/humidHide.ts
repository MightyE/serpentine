/**
 * Humid hide — a sealed box packed with damp sphagnum, at the cool end.
 *
 * `thermal: 'cool'` is husbandry rather than layout preference: a humid box under the basking lamp
 * grows mould and cooks the animal in it. Layout honours the field, so the correct arrangement is
 * the one the game draws.
 *
 * See `corkHide.ts` for how to read (and copy) one of these files.
 */

import type { FeatureProvision } from '../contract'
import { FEATURE_COST, FEATURE_UPKEEP } from '../tuningPlaceholders'

export const humidHide: FeatureProvision = {
  role: 'feature',
  id: 'humid-hide',
  label: 'Humid hide',
  describe: 'A closed box of damp sphagnum at the cool end. Where a shed goes right instead of wrong.',
  site: 'back',
  thermal: 'cool',

  supplies: { humidity: 'strong', cover: 'moderate' },
  cost: FEATURE_COST,
  upkeepPerWeek: FEATURE_UPKEEP * 1.5,
  featureSlotCost: 1,
  unlock: 'early',

  layers: [
    { kind: 'furniture', name: 'hideBox', params: { size: 0.28, aspect: 0.86, bark: 0.15, radius: 0.14 } },
  ],
}
