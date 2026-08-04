/**
 * Cypress margin — dark peat, sphagnum, and waterlogged bark at the edge of a southern swamp.
 *
 * The fourth biome, and the one that is not a species' default. It exists to be the *humid* end of
 * the range: nothing else shipped supplies humidity strongly, so without it the humidity axis is
 * decorative and the choice of enclosure has one fewer real answer in it. It suits a corn snake
 * from the Florida end of the range, and it is the obvious setup for anything tropical added later.
 *
 * See `westAfricanScrub.ts` for how to read (and copy) one of these files.
 */

import type { BiomeProvision } from '../contract'
import { rgba } from '../../render/colour'
import { BIOME_COST } from '../tuningPlaceholders'

export const cypressMargin: BiomeProvision = {
  role: 'biome',
  id: 'cypress-margin',
  label: 'Cypress margin',
  describe: 'Damp peat and cypress mulch under heavy sphagnum, with waterlogged wood to shelter in.',
  nativeTo: ['corn-snake'],
  rangeNote:
    'The wet end of the corn snake’s range: cypress and hardwood swamp margins across Florida and ' +
    'the Gulf coast, where the ground holds water and the litter never quite dries out.',

  supplies: { humidity: 'strong', cover: 'moderate', substrateDepth: 'slight' },
  cost: BIOME_COST,
  upkeepPerWeek: 0,
  featureSlotCost: 0,
  unlock: 'early',

  palette: {
    skyTop: rgba(92, 122, 122),
    skyBottom: rgba(44, 78, 80),
    distant: rgba(58, 74, 66),
    substrate: rgba(84, 70, 52),
    substrateDark: rgba(38, 34, 28),
    foliage: rgba(96, 150, 104),
    foliageDeep: rgba(34, 66, 52),
    wood: rgba(104, 84, 64),
    stone: rgba(98, 104, 100),
    light: rgba(255, 196, 118),
  },

  layers: [
    { kind: 'backdrop', name: 'enclosureFloor', params: {} },
    { kind: 'substrate', name: 'substrateWash', params: { grain: 9, contrast: 0.7, octaves: 4 } },
    { kind: 'scatter', name: 'barkChips', params: { density: 95, size: 0.036, damp: 0.55 } },
    { kind: 'planting', name: 'mossPatch', params: { coverage: 0.36, side: -1, grain: 13 } },
    { kind: 'planting', name: 'mossPatch', params: { coverage: 0.14, side: 0.8, grain: 18 } },
    { kind: 'planting', name: 'shrubClumps', params: { density: 7, size: 0.075, lobes: 8, relief: 0.6 } },
    { kind: 'foreground', name: 'glassGlare', params: {} },
    { kind: 'light', name: 'warmPool', params: { intensity: 0.26, vignette: 0.34 } },
  ],
}
