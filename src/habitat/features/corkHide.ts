/**
 * Cork bark hide — the template feature file, and the one every enclosure should have.
 *
 * ## How to read a feature file
 *
 * A feature is a {@link Provision} with two extra fields, and they are both about *where it goes*:
 *
 * - `site` — the kind of place it wants. `layout.ts` turns that into an actual {@link Placement}
 *   from the enclosure's seed, which is why a hide, a branch and a dish do not end up in a row.
 * - `thermal` — which end of the gradient it belongs at. Layout reads it against
 *   `HabitatScene.warmSide`.
 *
 * Everything else is identical to a biome, on purpose: `resolveBenefits` reads one list and never
 * asks which kind of thing it is holding. See `contract.ts`'s header for why that was the decision.
 */

import type { FeatureProvision } from '../contract'
import { FEATURE_COST, FEATURE_UPKEEP } from '../tuningPlaceholders'

export const corkHide: FeatureProvision = {
  role: 'feature',
  id: 'cork-hide',
  label: 'Cork bark hide',
  describe: 'A curved slab of cork bark to disappear under. Snug is the point; roomy is not.',
  site: 'back',
  thermal: 'either',

  supplies: { cover: 'strong' },
  cost: FEATURE_COST,
  upkeepPerWeek: FEATURE_UPKEEP,
  featureSlotCost: 1,
  unlock: 'starting',

  layers: [{ kind: 'furniture', name: 'hideBox', params: { size: 0.33, bark: 0.85 } }],
}
