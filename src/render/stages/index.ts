/**
 * Every render stage the game knows about.
 *
 * ## Adding one
 *
 * Write a file next to these that exports a `StageDefinition`, import it here, and add it to
 * the list below. **That is the whole change** — one new file, one line here. Nothing else in
 * the codebase needs to know your stage exists: the pipeline finds it by name through the
 * registry, and a phenotype can start using it immediately.
 *
 * The kind you pick decides when it runs, and it is worth picking honestly:
 *
 * | kind | it… | example |
 * |---|---|---|
 * | `base` | starts the picture and ignores what came in | `solid` |
 * | `pattern` | draws markings using `u`/`v` | `bands`, `stripes`, `blotches`, `speckle` |
 * | `mask` | replaces a region outright, whatever was there | `piebald`, `belly` |
 * | `modifier` | transforms whatever colour it is handed | `albino`, `ghost`, `patternReduction` |
 *
 * A rule of thumb for the last two: if your effect would have to be written once per existing
 * pattern, it is a `modifier`, not a `pattern`.
 */

import { stageRegistry } from '../registry'

import { solidStage } from './solid'
import { bandsStage } from './bands'
import { stripesStage } from './stripes'
import { blotchesStage } from './blotches'
import { speckleStage } from './speckle'
import { piebaldStage } from './piebald'
import { bellyStage } from './belly'
import { albinoStage } from './albino'
import { ghostStage } from './ghost'
import { patternReductionStage } from './patternReduction'

let registered = false

/**
 * Put every built-in stage into the shared registry.
 *
 * Safe to call more than once — importing `src/render/` already does it, so you rarely need to.
 * It is idempotent rather than throwing because a module that gets imported twice (which
 * bundlers and hot reload both do) is not a programming error, whereas two *different* stages
 * claiming one name is, and that still throws.
 */
export function registerBuiltInStages(): void {
  if (registered) return
  registered = true

  // ---- the list. Add your line here. -------------------------------------------------------
  stageRegistry.register(solidStage)
  stageRegistry.register(bandsStage)
  stageRegistry.register(stripesStage)
  stageRegistry.register(blotchesStage)
  stageRegistry.register(speckleStage)
  stageRegistry.register(piebaldStage)
  stageRegistry.register(bellyStage)
  stageRegistry.register(albinoStage)
  stageRegistry.register(ghostStage)
  stageRegistry.register(patternReductionStage)
  // ------------------------------------------------------------------------------------------
}

export {
  solidStage,
  bandsStage,
  stripesStage,
  blotchesStage,
  speckleStage,
  piebaldStage,
  bellyStage,
  albinoStage,
  ghostStage,
  patternReductionStage,
}
