import type { SexSystem } from '../../genetics/types'

/**
 * Corn snakes are colubrids, and colubrids really are **ZW**, females heterogametic — the part
 * of the old "all snakes are ZW" consensus that still holds. Pair this file with
 * `ballPython/sexSystem.ts` (XY) deliberately: two real species in this game, two different
 * sex-determination systems, neither hard-coded by the engine.
 */
export const cornSnakeSexSystem: SexSystem = {
  id: 'ZW',
  homogameticChromosome: 'Z',
  heterogameticChromosome: 'W',
  heterogameticSex: 'female',
}
