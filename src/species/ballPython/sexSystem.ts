import type { SexSystem } from '../../genetics/types'

/**
 * Ball pythons are **XY**, males heterogametic — Gamble et al. 2017 (*Current Biology*)
 * overturned roughly fifty years of "all snakes are ZW" consensus by showing pythons and boas
 * evolved their own, independent XY system. Do not attach ZW to this species; see
 * `cornSnake/sexSystem.ts` for the species that really is ZW.
 */
export const ballPythonSexSystem: SexSystem = {
  id: 'XY',
  homogameticChromosome: 'X',
  heterogameticChromosome: 'Y',
  heterogameticSex: 'male',
}
