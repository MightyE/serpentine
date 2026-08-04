/**
 * West African scrub — the ball python's own country, and the template biome file.
 *
 * ## How to read a biome file
 *
 * Three things and nothing else:
 *
 * 1. A {@link BiomePalette}. **Every colour in the drawing comes from here.** No layer file names
 *    a colour, which is why the grass tuft written for the prairie looks right in this scrub.
 *    Retinting a biome is editing this object, and only this object.
 * 2. A list of layers, each naming something registered in `layers/index.ts` plus the parameters
 *    to draw it with. Order inside a kind is draw order; kinds sort themselves (`LAYER_KIND_ORDER`).
 * 3. Ordinal supply bands. `strong`, not `0.6` — the number that band is worth lives in
 *    `tuningPlaceholders.ts` and nowhere else, so retuning husbandry never means editing a biome.
 *
 * ## In the top-down view, two palette entries change job
 *
 * `skyTop` and `skyBottom` have no sky to be. `enclosureFloor` uses `skyTop` for the rim's tint
 * and `waterDish` uses `skyBottom` for the water, so read them as "the cool, non-earth colours of
 * this place". They are still the right two colours for the job in every biome, which is why the
 * fields were left alone rather than renamed.
 */

import type { BiomeProvision } from '../contract'
import { rgba } from '../../render/colour'
import { BIOME_COST } from '../tuningPlaceholders'

export const westAfricanScrub: BiomeProvision = {
  role: 'biome',
  id: 'west-african-scrub',
  label: 'West African scrub',
  describe: 'Red laterite soil, dry grass and low thorny cover, with a deep hide out of the sun.',
  nativeTo: ['ball-python'],
  rangeNote:
    'Ball pythons live across the savanna and farm-edge scrub of West and Central Africa, sheltering ' +
    'by day in termite mounds and rodent burrows.',

  supplies: { cover: 'strong', thermalGradient: 'moderate', enrichment: 'slight' },
  cost: BIOME_COST,
  upkeepPerWeek: 0,
  featureSlotCost: 0,
  unlock: 'starting',

  palette: {
    skyTop: rgba(94, 116, 132),
    skyBottom: rgba(60, 88, 104),
    distant: rgba(120, 96, 70),
    substrate: rgba(168, 106, 62),
    substrateDark: rgba(94, 55, 33),
    foliage: rgba(150, 154, 82),
    foliageDeep: rgba(72, 82, 46),
    wood: rgba(122, 88, 58),
    stone: rgba(158, 140, 118),
    light: rgba(255, 186, 92),
  },

  layers: [
    { kind: 'backdrop', name: 'enclosureFloor', params: {} },
    { kind: 'substrate', name: 'substrateWash', params: { grain: 6, contrast: 0.72, octaves: 3 } },
    { kind: 'scatter', name: 'pebbleScatter', params: { density: 26, size: 0.016, blend: 0.45 } },
    { kind: 'scatter', name: 'leafLitter', params: { density: 26, size: 0.04, dryness: 0.85, hueSpread: 18 } },
    { kind: 'planting', name: 'grassTufts', params: { density: 30, size: 0.05, dryness: 0.55, bend: 0.55 } },
    { kind: 'planting', name: 'shrubClumps', params: { density: 9, size: 0.075, lobes: 5 } },
    { kind: 'foreground', name: 'glassGlare', params: {} },
    { kind: 'light', name: 'warmPool', params: { intensity: 0.36, vignette: 0.26 } },
  ],
}
