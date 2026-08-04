/**
 * Snake locomotion: the head decides, the body follows the path the head actually took.
 *
 * Read `headPath.ts` first — it explains why this directory exists and why the obvious
 * sine-wave-across-the-body approach (`spine.ts`'s `visualSpine`) is kept for still poses and
 * portraits but is not what a living animal in an enclosure uses.
 */

export { HeadPath, type PathSample } from './headPath'
export { HeadDriver, type Bounds, type Obstacle, type SteerCommand, type HeadDriverOptions } from './driver'
export { Behaviour, type BehaviourName, type BehaviourWorld, type HeadReading } from './behaviour'
export { Locomotor, applyHeadLook, coilPath, type LocomotorOptions } from './locomotor'
