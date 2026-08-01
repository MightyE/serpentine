/**
 * Life stages — egg, hatchling, juvenile, adult — start here.
 *
 * ## What this adds to the renderer
 *
 * `src/render/` on its own draws one animal at one age. This directory adds the age axis:
 *
 * | file | what lives there |
 * |---|---|
 * | `stage.ts` | the age parameter, and every proportion that depends on it. **Read first.** |
 * | `face.ts` | eyes and tongue, placed relative to a skull that changes size with age |
 * | `view.ts` | an animated snake whose age you can change while it is on screen |
 * | `egg.ts` | the egg — its own object, not a small snake |
 * | `hatch.ts` | the hatching sequence, replayable |
 * | `paint.ts` | the shared body-painting pass |
 *
 * ## The two things worth knowing before you change anything
 *
 * **Age is continuous.** `age ∈ [0, 1]`; the four stage names are points on it. Growth is
 * `age += dt * rate`, and it animates smoothly because it was never discrete.
 *
 * **Age changes proportions, not scale.** A scaled-down adult reads as a small adult. What reads
 * as a baby is a set of ratios: more of the body is head, the head is wider than the belly, the
 * body is short for its girth, the snout is blunt, the eyes are huge. See `LifeShape` in
 * `../bodyShape.ts`.
 *
 * ## Markings survive growth
 *
 * A snake keeps its own pattern at every age, and this needs no code: the pattern texture is
 * cached on the phenotype's *colours and stages*, and age touches neither. The same baked
 * texture is stretched over a differently-proportioned body. `lifeStages.test.ts` pins this
 * down, because it is exactly the kind of property that a well-meaning refactor breaks silently.
 *
 * ```ts
 * import { LifeSnakeView, HatchAnimation } from '@/render/life'
 *
 * const view = new LifeSnakeView(phenotype, { bounds, age: 0, pose: 'showcase' })
 * view.setAge(0.4) // grows smoothly, keeps its curve and its markings
 * ```
 */

export {
  LIFE_STAGES,
  STAGE_AGE,
  HATCHLING_SHAPE,
  ageOfStage,
  stageAtAge,
  lifeShapeAtAge,
  lifeShapeOfStage,
  ratioMaturity,
  sizeMaturity,
  eyeScaleAtAge,
  eyePlacementAtAge,
  eyeAtAge,
  motionAtAge,
  type LifeStage,
  type LifeMotion,
} from './stage'

export { drawLifeFace, type LifeFaceState } from './face'
export { paintBody, drawRoundness } from './paint'
export {
  LifeSnakeView,
  sCurvePose,
  resamplePath,
  type LifePose,
  type LifeSnakeOptions,
  type Rect,
} from './view'
export {
  eggShellFor,
  drawEgg,
  drawNest,
  traceEgg,
  type EggShell,
  type EggGeometry,
} from './egg'
export {
  HatchAnimation,
  HATCH_DURATION,
  phaseAt,
  staircase,
  emergePath,
  ribbonWithUs,
  drawTear,
  type HatchPhase,
} from './hatch'
