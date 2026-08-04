/**
 * Deep leaf bedding — a top-up of litter over whatever substrate is already down.
 *
 * The demonstration that `site: 'ground'` works: it is not an object, so layout hands it the whole
 * enclosure rather than a site, and it reuses the biome's own `leafLitter` layer with a heavier
 * density. A feature does not need its own drawing code — most of the interesting ones will not
 * have any.
 *
 * See `corkHide.ts` for how to read (and copy) one of these files.
 */

import type { FeatureProvision } from '../contract'
import { FEATURE_COST, FEATURE_UPKEEP } from '../tuningPlaceholders'

export const leafBedding: FeatureProvision = {
  role: 'feature',
  id: 'leaf-bedding',
  label: 'Deep leaf bedding',
  describe: 'Litter piled deep enough to vanish into. Cover and digging in the same handful.',
  site: 'ground',
  thermal: 'either',

  supplies: { substrateDepth: 'strong', cover: 'slight' },
  cost: Math.round(FEATURE_COST * 0.5),
  upkeepPerWeek: FEATURE_UPKEEP,
  featureSlotCost: 1,
  unlock: 'early',

  layers: [
    { kind: 'scatter', name: 'leafLitter', params: { density: 44, size: 0.1, dryness: 0.7, hueSpread: 34 } },
  ],
}
