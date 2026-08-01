/**
 * Serpentine's renderer — start here.
 *
 * ## What it does
 *
 * Takes a {@link Phenotype} (a plain description of what an animal looks like) and draws an
 * animated snake. It has no idea what a gene is; see `contract.ts` for why that boundary is
 * worth keeping.
 *
 * ## The whole thing in one screen
 *
 * ```ts
 * import { SnakeView, startRenderLoop, fitCanvasToDisplay } from '@/render'
 *
 * const ctx = canvas.getContext('2d')!
 * const snake = new SnakeView(myPhenotype, { bounds: { x: 0, y: 0, width: 400, height: 300 } })
 *
 * startRenderLoop((dt) => {
 *   fitCanvasToDisplay(canvas, ctx)
 *   ctx.clearRect(0, 0, canvas.width, canvas.height)
 *   snake.update(dt)
 *   snake.draw(ctx)
 * })
 * ```
 *
 * ## The map
 *
 * | file | what lives there |
 * |---|---|
 * | `contract.ts` | the types. Written by the architect; read it first. |
 * | `stages/` | every pattern, mask and modifier. **Add new looks here.** |
 * | `effects.ts` | animated extras — glow, sparkle, sheen. **Add new magic here.** |
 * | `pipeline.ts` | runs a phenotype's stages in order |
 * | `texture.ts` | bakes the result into a picture, once |
 * | `spine.ts` | the follow-the-leader chain and the slither wave |
 * | `ribbon.ts` | turns the spine into a body outline and paints it |
 * | `bodyShape.ts` | how thick the snake is along its length |
 * | `head.ts` | eyes, blinking, tongue — the cuteness |
 * | `snake.ts` | one animated snake, tying all of the above together |
 * | `portrait.ts` | still thumbnails, cached |
 * | `loop.ts` | the frame loop and screen-density handling |
 * | `lab/` | a standalone page for looking at your work: `/render-lab.html` |
 *
 * Importing this module registers every built-in stage and effect, which is what makes stage
 * names resolvable. If you import a submodule directly and get "no stage registered as…",
 * this is the import you are missing.
 */

import { registerBuiltInStages } from './stages'
import { registerBuiltInEffects } from './effects'

registerBuiltInStages()
registerBuiltInEffects()

export * from './contract'
export { createStageRegistry, stageRegistry } from './registry'
export { compilePipeline, renderPipeline } from './pipeline'
export {
  bakePatternTexture,
  patternTextureFor,
  clearTextureCache,
  phenotypeKey,
  TEXTURE_WIDTH,
  TEXTURE_HEIGHT,
  type PatternTexture,
} from './texture'
export { SnakeView, type SnakeMode, type SnakeViewOptions, type Rect } from './snake'
export { renderPortrait, clearPortraitCache, type PortraitOptions } from './portrait'
export { startRenderLoop, fitCanvasToDisplay, type FrameCallback } from './loop'
export {
  effectRegistry,
  createEffectRegistry,
  effectsFor,
  describeEffects,
  registerBuiltInEffects,
  type EffectDefinition,
  type EffectDrawContext,
  type EffectRegistry,
} from './effects'
export { registerBuiltInStages } from './stages'
export { bodyLength, widthProfile, widthAt } from './bodyShape'
export { Spine, visualSpine, coilPose, arcLengths, DEFAULT_WAVE, type WaveParams } from './spine'
export { buildRibbon, traceRibbon, paintRibbon, pointOnBody, type Ribbon } from './ribbon'
export * from './colour'
export * from './noise'
export * from './geometry'
