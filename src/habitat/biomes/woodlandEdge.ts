/**
 * North American woodland edge — the corn snake's country: leaf litter, fallen wood, and the
 * broken shade where field meets trees.
 *
 * See `westAfricanScrub.ts` for how to read (and copy) one of these files.
 */

import type { BiomeProvision } from '../contract'
import { rgba } from '../../render/colour'
import { BIOME_COST } from '../tuningPlaceholders'

export const woodlandEdge: BiomeProvision = {
  role: 'biome',
  id: 'woodland-edge',
  label: 'Woodland edge',
  describe: 'Deep leaf litter over dark loam, fallen wood to climb, and moss at the cool end.',
  nativeTo: ['corn-snake'],
  rangeNote:
    'Corn snakes range across the southeastern United States, favouring field margins, pine ' +
    'woodland and the edges of farm buildings rather than deep forest.',

  supplies: { cover: 'moderate', climbing: 'moderate', substrateDepth: 'moderate', enrichment: 'moderate' },
  cost: BIOME_COST,
  upkeepPerWeek: 0,
  featureSlotCost: 0,
  unlock: 'starting',

  palette: {
    skyTop: rgba(122, 136, 140),
    skyBottom: rgba(66, 92, 92),
    distant: rgba(84, 92, 74),
    // Cooler and browner than the scrub's laterite on purpose. The two biomes were nearly the
    // same orange under the lamp's warm pool, and two enclosures that read alike at thumbnail
    // size is the failure mode this whole system exists to avoid.
    substrate: rgba(108, 86, 60),
    substrateDark: rgba(46, 38, 30),
    foliage: rgba(118, 164, 76),
    foliageDeep: rgba(40, 70, 42),
    wood: rgba(136, 104, 72),
    stone: rgba(126, 124, 116),
    light: rgba(255, 206, 128),
  },

  layers: [
    { kind: 'backdrop', name: 'enclosureFloor', params: {} },
    { kind: 'substrate', name: 'substrateWash', params: { grain: 8, contrast: 0.85, octaves: 4 } },
    { kind: 'scatter', name: 'leafLitter', params: { density: 90, size: 0.052, dryness: 0.62, hueSpread: 30 } },
    { kind: 'scatter', name: 'pebbleScatter', params: { density: 14, size: 0.016, blend: 0.5 } },
    { kind: 'planting', name: 'mossPatch', params: { coverage: 0.26, side: -1, grain: 14 } },
    { kind: 'planting', name: 'shrubClumps', params: { density: 11, size: 0.08, lobes: 7, relief: 0.85 } },
    { kind: 'planting', name: 'grassTufts', params: { density: 16, size: 0.045, dryness: 0.1 } },
    { kind: 'foreground', name: 'glassGlare', params: {} },
    { kind: 'light', name: 'warmPool', params: { intensity: 0.3, vignette: 0.3 } },
  ],
}
