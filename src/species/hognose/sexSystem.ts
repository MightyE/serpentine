import type { SexSystem } from '../../genetics/types'

/**
 * Western hognose (*Heterodon nasicus*) is a colubrid — same family as the corn snake, and
 * genuinely **ZW**, females heterogametic. See `cornSnake/sexSystem.ts` for the fuller argument
 * (Gamble et al. 2017 overturned "all snakes are ZW" for pythons and boas specifically; it never
 * touched colubrids, which is why this file and the corn snake's are identical in shape and the
 * ball python's is not).
 */
export const hognoseSexSystem: SexSystem = {
  id: 'ZW',
  homogameticChromosome: 'Z',
  heterogameticChromosome: 'W',
  heterogameticSex: 'female',
}
