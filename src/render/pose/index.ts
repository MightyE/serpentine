/**
 * Poses: bodies arranged by something other than their own locomotion.
 *
 * A pose is a pure function from a few parameters to spine points. It does no drawing and knows no
 * phenotype, which is what lets the same held snake be unit-tested, screenshotted and animated.
 */

export { heldPose, pickupDilation, HELD_EXTENT, type HeldPoseOptions } from './held'
export { HeldSnakeView, type HeldSnakeOptions } from './heldView'
