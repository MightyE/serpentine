/**
 * Animals living inside enclosures.
 *
 * `occupant.ts` is one snake; `floor.ts` is one enclosure plus the single shared animation loop
 * for the whole screen; `enclosure.ts` caches the artwork the animals are drawn between.
 *
 * The movement itself is not here — it is `src/render/locomotion/`, and that is the file to read
 * if you want to know why these snakes do not wiggle on the spot.
 */

export { HabitatOccupant, occupantScale, type OccupantSpec, type OccupantOptions } from './occupant'
export { buildEnclosureArt, obstaclesOf, type EnclosureArt } from './enclosure'
export {
  LivingHabitat,
  FloorAnimator,
  floorAnimator,
  prefersReducedMotion,
  type LivingHabitatOptions,
} from './floor'
