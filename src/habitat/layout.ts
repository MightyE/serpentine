/**
 * Where each installed feature ends up sitting.
 *
 * ## Why this is a file and not four lines in the composer
 *
 * Because "a hide, a branch and a dish" arranged by three independent random draws looks like
 * three sprites dropped on a floor, and arranged by this looks like somebody set an enclosure up.
 * The difference is entirely in the constraints:
 *
 * - **Sites do not overlap.** `back`, `floor`, `span` and `overhead` occupy different bands of the
 *   enclosure, and two features claiming the same band get pushed apart along it.
 * - **Thermal preference is honoured.** A basking stone goes under the lamp; a water dish and a
 *   humid hide go at the far end. That is correct husbandry *and* it is what spreads the objects
 *   out — the two constraints happen to agree, which is the nicest thing about this system.
 * - **It is a pure function of the enclosure's id.** Same enclosure, same arrangement, every
 *   frame and after every reload, so nothing about the layout is ever stored. See
 *   `HabitatScene.rng`.
 */

import type { FeatureProvision, FeatureSite, HabitatScene, Placement } from './contract'
import { makeRng } from '../lib/rng'

/**
 * The band of the enclosure each site lives in, as fractions of height from the back wall (`0`)
 * to the front glass (`1`).
 *
 * `ground` spans everything because it is not an object — it is a change to the floor, and its
 * layers are scatter layers that fill the whole rect.
 */
const SITE_BAND: Readonly<Record<FeatureSite, readonly [number, number]>> = {
  back: [0.12, 0.4],
  floor: [0.55, 0.86],
  span: [0.38, 0.62],
  overhead: [0.06, 0.22],
  ground: [0, 1],
}

/** Depth 0 is against the back wall, 1 against the front. Decides draw order within `furniture`. */
function depthOf(band: readonly [number, number], t: number): number {
  return band[0] + (band[1] - band[0]) * t
}

/**
 * The horizontal half a feature wants, as a fraction of width.
 *
 * `'warm'` and `'cool'` resolve against `scene.warmSide`; `'either'` gets whichever half is less
 * crowded, which is what stops three thermally-indifferent features from stacking up.
 */
function xFraction(feature: FeatureProvision, scene: HabitatScene, spread: number): number {
  const side =
    feature.thermal === 'warm'
      ? scene.warmSide
      : feature.thermal === 'cool'
        ? (-scene.warmSide as -1 | 1)
        : spread < 0.5
          ? (-scene.warmSide as -1 | 1)
          : scene.warmSide
  // 0.5 is the middle; ±0.26 puts the object solidly in one half without touching the wall.
  return 0.5 + side * (0.16 + spread * 0.2)
}

/**
 * Place one feature in one enclosure.
 *
 * `index` is the feature's position in the installed list and is only used to keep two features
 * with the same site and the same thermal preference from landing on top of each other — it walks
 * them along their band rather than re-rolling, so adding a third does not move the first two.
 */
export function placeFeature(
  feature: FeatureProvision,
  scene: HabitatScene,
  index: number,
  sameSiteCount: number,
): Placement {
  const { rect } = scene
  const band = SITE_BAND[feature.site]

  if (feature.site === 'ground') {
    return {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
      scale: 1,
      facing: 1,
      depth: 0.5,
    }
  }

  const rng = makeRng(`${scene.seed}:${feature.id}:${index}`)
  // Evenly spaced along the band when several share it, jittered so it is not a grid.
  const slot = sameSiteCount <= 1 ? 0.5 : (index + 0.5) / sameSiteCount
  const spread = Math.min(1, Math.max(0, slot + rng.range(-0.12, 0.12)))
  const t = sameSiteCount <= 1 ? rng.range(0.3, 0.7) : (index + 0.5) / sameSiteCount

  return {
    x: rect.x + rect.width * xFraction(feature, scene, spread),
    y: rect.y + rect.height * depthOf(band, t),
    scale: rng.range(0.9, 1.1),
    facing: rng.chance(0.5) ? -1 : 1,
    depth: depthOf(band, t),
  }
}

/**
 * Place every installed feature, in the order the composer should draw them.
 *
 * Sorted by depth so a hide at the back never draws over a dish at the front — the one ordering
 * rule `contract.ts` states for the `furniture` kind.
 */
export function layoutFeatures(
  features: readonly FeatureProvision[],
  scene: HabitatScene,
): readonly { readonly feature: FeatureProvision; readonly placement: Placement }[] {
  const bySite = new Map<FeatureSite, FeatureProvision[]>()
  for (const feature of features) {
    const list = bySite.get(feature.site) ?? []
    list.push(feature)
    bySite.set(feature.site, list)
  }

  const placed = features.map((feature) => {
    const siblings = bySite.get(feature.site) ?? [feature]
    return {
      feature,
      placement: placeFeature(feature, scene, siblings.indexOf(feature), siblings.length),
    }
  })

  return [...placed].sort((a, b) => a.placement.depth - b.placement.depth)
}
