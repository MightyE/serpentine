/**
 * Climbing branch — a forked length of wood spanning the enclosure.
 *
 * `site: 'span'` is the only site that crosses the whole floor, which is what makes a branch read
 * as furniture the animal moves *along* rather than an object it moves *around*.
 *
 * See `corkHide.ts` for how to read (and copy) one of these files.
 */

import type { FeatureProvision } from '../contract'
import { FEATURE_COST, FEATURE_UPKEEP } from '../tuningPlaceholders'

export const climbingBranch: FeatureProvision = {
  role: 'feature',
  id: 'climbing-branch',
  label: 'Climbing branch',
  describe: 'A forked length of hardwood across the enclosure. Even a heavy-bodied snake will use it.',
  site: 'span',
  thermal: 'either',

  supplies: { climbing: 'strong', enrichment: 'moderate' },
  cost: FEATURE_COST,
  upkeepPerWeek: FEATURE_UPKEEP * 0.5,
  featureSlotCost: 1,
  unlock: 'starting',

  layers: [{ kind: 'furniture', name: 'driftwood', params: { length: 0.66, thickness: 0.11, forks: 2 } }],
}
