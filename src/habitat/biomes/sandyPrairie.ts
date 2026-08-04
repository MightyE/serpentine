/**
 * Sandy prairie — the western hognose's country: loose sand deep enough to disappear into.
 *
 * The substrate axis is the whole point of this one. A hognose is a digging animal with a rostral
 * scale shaped like a spade, and an enclosure that does not let it dig is the one arrangement that
 * actually leaves something on the table. `substrateDepth: 'strong'` is that fact, in the model.
 *
 * See `westAfricanScrub.ts` for how to read (and copy) one of these files.
 */

import type { BiomeProvision } from '../contract'
import { rgba } from '../../render/colour'
import { BIOME_COST } from '../tuningPlaceholders'

export const sandyPrairie: BiomeProvision = {
  role: 'biome',
  id: 'sandy-prairie',
  label: 'Sandy prairie',
  describe: 'Deep loose sand under sparse bunch grass, wind-rippled, with sun-warmed flat stones.',
  nativeTo: ['hognose'],
  rangeNote:
    'Western hognose snakes live on the sandy short-grass prairie of the Great Plains, from ' +
    'southern Canada down into northern Mexico, digging for toads and burrowing to escape heat.',

  supplies: { substrateDepth: 'strong', thermalGradient: 'moderate', enrichment: 'slight' },
  cost: BIOME_COST,
  upkeepPerWeek: 0,
  featureSlotCost: 0,
  unlock: 'starting',

  palette: {
    skyTop: rgba(128, 148, 164),
    skyBottom: rgba(78, 110, 128),
    distant: rgba(168, 150, 112),
    substrate: rgba(216, 186, 132),
    substrateDark: rgba(154, 124, 82),
    foliage: rgba(174, 168, 104),
    foliageDeep: rgba(104, 100, 58),
    wood: rgba(158, 128, 88),
    stone: rgba(186, 176, 158),
    light: rgba(255, 214, 130),
  },

  layers: [
    { kind: 'backdrop', name: 'enclosureFloor', params: {} },
    { kind: 'substrate', name: 'substrateWash', params: { grain: 4, contrast: 0.5, octaves: 2 } },
    { kind: 'scatter', name: 'sandRipples', params: { frequency: 10, angle: 18, opacity: 0.34 } },
    { kind: 'scatter', name: 'pebbleScatter', params: { density: 20, size: 0.017, blend: 0.3 } },
    { kind: 'planting', name: 'grassTufts', params: { density: 20, size: 0.055, dryness: 0.7, bend: 0.6, blades: 12 } },
    { kind: 'foreground', name: 'glassGlare', params: {} },
    { kind: 'light', name: 'warmPool', params: { intensity: 0.4, vignette: 0.22 } },
  ],
}
