/**
 * Running a phenotype's stage list.
 *
 * Given a phenotype, this works out which stage functions it means, in what order, with what
 * settings — once — and hands back something you can ask "what colour is the snake at this
 * point?". See {@link compilePipeline}.
 */

import type {
  Phenotype,
  PatternSampler,
  RenderPipeline,
  Rgba,
  StageDefinition,
  StageParams,
  StageParamValue,
  StageRegistry,
} from './contract'
import { STAGE_KIND_ORDER } from './contract'
import { hashSeed, makeRng, type Rng } from '../lib/rng'
import { stageRegistry } from './registry'

/**
 * Parameter values that start with `@` are looked up on the phenotype instead of used
 * literally. So a stage can say "reduce the pattern back toward `@baseColour`" without the
 * phenotype having to repeat its own colour in two places — change the base colour and every
 * stage that referred to it follows.
 *
 * Add a row here to expose another phenotype field to stages.
 */
const COLOUR_REFS: Record<string, (p: Phenotype) => Rgba> = {
  '@baseColour': (p) => p.baseColour,
  '@patternColour': (p) => p.patternColour,
  '@bellyColour': (p) => p.bellyColour,
}

function resolveParams(raw: StageParams, phenotype: Phenotype): StageParams {
  let changed = false
  const out: Record<string, StageParamValue> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string' && value in COLOUR_REFS) {
      out[key] = COLOUR_REFS[value](phenotype)
      changed = true
    } else {
      out[key] = value
    }
  }
  return changed ? out : raw
}

interface CompiledStage {
  readonly definition: StageDefinition
  readonly params: StageParams
  readonly seed: number
}

/**
 * Resolve a phenotype's stages against a registry and return a sampler.
 *
 * Two things happen here that are worth understanding:
 *
 * **Ordering.** Stages are sorted by kind first (`base` → `pattern` → `mask` → `modifier`),
 * then by the order they appear in the phenotype. That means whoever assembles a phenotype —
 * a genetics rule, a species file, you typing one by hand — can push stages on in any order
 * and still get a sensible picture. A modifier can never accidentally run before the pattern
 * it is supposed to modify.
 *
 * **Randomness.** Each stage gets its own generator, seeded from the phenotype's seed plus the
 * stage's name and position, and *a fresh one for every point sampled*. That last part is the
 * subtle bit: it means a stage cannot accidentally depend on how many points were sampled
 * before it, so the markings are identical whether you bake a 64-pixel texture or a 512-pixel
 * one. The price is that `rng.next()` gives a stage the same number at every point on the body
 * — which is intended. **Variation across the body comes from the noise functions in
 * `noise.ts`, which are functions of position; the rng is for choosing per-snake constants.**
 *
 * Throws if a stage names something that is not registered. A missing stage would draw a
 * quietly wrong snake, and quietly wrong is much worse than a stack trace with the name in it.
 */
export function compilePipeline(phenotype: Phenotype, registry: StageRegistry = stageRegistry): PatternSampler {
  const ordered = [...phenotype.stages].sort((a, b) => {
    const rank = STAGE_KIND_ORDER.indexOf(a.kind) - STAGE_KIND_ORDER.indexOf(b.kind)
    return rank !== 0 ? rank : 0
  })

  const compiled: CompiledStage[] = ordered.map((stage, index) => {
    const definition = registry.get(stage.kind, stage.name)
    if (!definition) {
      const known = registry
        .list(stage.kind)
        .map((d) => d.name)
        .join(', ')
      throw new Error(
        `No ${stage.kind} stage registered as "${stage.name}". Registered ${stage.kind} stages: ${known || '(none)'}.`,
      )
    }
    return {
      definition,
      params: { ...definition.defaults, ...resolveParams(stage.params, phenotype) },
      seed: hashSeed(`${phenotype.seed}::${index}::${stage.kind}::${stage.name}`),
    }
  })

  const base = phenotype.baseColour

  return {
    sample(u: number, v: number): Rgba {
      let colour = base
      for (const stage of compiled) {
        const rng: Rng = makeRng(stage.seed)
        colour = stage.definition.render(u, v, colour, stage.params, rng)
      }
      return colour
    },
  }
}

/** The contract's interface form, for anywhere that wants to be handed a pipeline. */
export const renderPipeline: RenderPipeline = {
  compile: (phenotype, registry) => compilePipeline(phenotype, registry),
}
