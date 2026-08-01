/**
 * Serpentine — the rendering contract.
 *
 * ## What this file is
 *
 * The complete description of what a snake *looks like*, and the complete description of how
 * a look gets turned into colour. `src/render/` implements this. `src/species/` produces it.
 *
 * ## The rule that keeps this half honest
 *
 * **This file does not import anything from `src/genetics/`, and it never will.** The renderer
 * has no idea what a gene is. It is handed a {@link Phenotype} — a plain description of an
 * appearance — and it draws it.
 *
 * That boundary is worth more than it looks. It means:
 *
 *   - you can invent a completely fictional trait by adding one field to a phenotype and one
 *     render stage, without touching a single line of inheritance maths;
 *   - you can test the renderer with a hand-written phenotype literal, no breeding required;
 *   - a bug is always in one half or the other, never smeared across both.
 *
 * ## Rendering is a pipeline, not a function
 *
 * The tempting design is one function per look: `stripes(u, v, params)`, `blotches(...)`,
 * `albinoStripes(...)`. It falls over immediately, because several of the most interesting
 * real morphs are not patterns at all — they are *operations on whatever pattern is already
 * there*. Piebald erases regions of it. Albino strips the dark pigment out of it. Ghost lowers
 * its contrast. Clown reduces and reshapes it.
 *
 * Written as flat functions, every combination has to be hand-written: albino-stripes,
 * albino-blotches, ghost-albino-stripes, and so on forever. And that combinatorial space is
 * precisely the thing the game exists to explore, so the abstraction would fail exactly where
 * the game gets good.
 *
 * So a look is an **ordered list of stages**:
 *
 *     base colour  →  pattern  →  mask(s)  →  modifier(s)  →  final colour
 *
 * Each stage is a small registered function of `(u, v, incomingColour, params, rng)` that
 * returns a colour. A phenotype names the stages it wants; the renderer looks them up and runs
 * them in order. Adding a new visual effect is one function plus one registration line, and it
 * composes with everything that already exists for free.
 *
 * It is also the more honest model. Albino really *is* pigment removal, not a pattern.
 * Representing it as a modifier stage teaches something true about what the mutation does.
 *
 * ## Deliberate symmetry with the genetics side
 *
 * `src/genetics/types.ts` builds a phenotype in exactly the same shape: base values, then an
 * ordered list of modifier rules that rewrite them. Same idea, both halves of the codebase:
 * *start simple, then let named rules in a list rewrite it, in order.* Learn it once.
 *
 * @see ../genetics/types.ts
 * @see ../lib/rng.ts
 */

import type { Rng } from '../lib/rng'

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

/**
 * A colour, in the units the Canvas API already speaks.
 *
 * `r`, `g`, `b` are 0–255. `a` is 0–1. Yes, that is inconsistent — it is inconsistent in CSS
 * and in `rgba()` too, and matching the thing you will actually be typing into the debugger
 * beats internal tidiness.
 */
export interface Rgba {
  readonly r: number
  readonly g: number
  readonly b: number
  readonly a: number
}

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

/**
 * What sort of job a stage does. This is not decoration — it decides run order (see
 * {@link STAGE_KIND_ORDER}) and it tells a reader what a stage is allowed to assume.
 *
 * - `base` — paint the whole animal a colour. Ignores whatever came in. Every phenotype
 *   should have exactly one, and it should be first.
 * - `pattern` — draw markings: stripes, bands, blotches, speckles. Reads `u`/`v`, mixes with
 *   the incoming colour.
 * - `mask` — erase or reveal regions, usually leaving the rest untouched. Piebald's white
 *   patches are a mask: they do not care what pattern is underneath, they replace it.
 * - `modifier` — transform whatever is there. Remove a pigment, lower contrast, brighten,
 *   shift hue. These are the ones that make combinations interesting, because a modifier
 *   works on *any* pattern, including ones written after it.
 */
export type StageKind = 'base' | 'pattern' | 'mask' | 'modifier'

/**
 * The order stage kinds run in.
 *
 * The renderer sorts a phenotype's stages by this rank first, then by the order they appear in
 * the array. That means you can push stages onto `Phenotype.stages` in whatever order is
 * convenient while building a phenotype, and still get a sensible picture — a modifier added
 * by an early genetics rule will still run after a pattern added by a later one.
 *
 * Within a kind, array order decides. Two masks compose in the order you listed them.
 */
export const STAGE_KIND_ORDER: readonly StageKind[] = ['base', 'pattern', 'mask', 'modifier']

/**
 * Values a stage can be configured with.
 *
 * Restricted to plain JSON-able things on purpose: a phenotype gets cached, hashed to key that
 * cache, and may be written into a save file. A function in here could do none of those. This
 * is the one place where "name in a registry plus a bag of parameters" genuinely earns its
 * indirection — the parameters cross a serialisation boundary, so the code they belong to has
 * to be reachable by name.
 */
export type StageParamValue = number | string | boolean | Rgba | readonly number[] | readonly string[]

/** A stage's parameters. Keys are whatever that stage's `defaults` declares. */
export type StageParams = Readonly<Record<string, StageParamValue>>

/**
 * One entry in a phenotype's look: "run the stage called this, with these settings."
 *
 * Names, not function references, so a phenotype stays plain data.
 */
export interface RenderStage {
  readonly kind: StageKind
  /** Key into the {@link StageRegistry}. Unknown names must fail loudly, not be skipped. */
  readonly name: string
  /** Merged over the registered stage's `defaults`. */
  readonly params: StageParams
}

/**
 * The actual work: given a point on the snake and the colour that is there so far, return the
 * colour that should be there now.
 *
 * - `u` runs 0 → 1 from nose to tail tip.
 * - `v` runs −1 → 1 across the body, with 0 on the dorsal midline (the top of the spine).
 *   So `Math.abs(v)` is "how far down the side am I", and the belly is at `|v| = 1`.
 * - `incoming` is what the stages before this one produced. A `base` stage ignores it;
 *   everything else should use it.
 * - `rng` is seeded from `Phenotype.seed`, so noise and speckles look identical on every frame
 *   and after every reload. Never call `Math.random()` here; the snake would shimmer.
 *
 * Must be pure. Same inputs, same colour out, every time.
 */
export type StageFn<Params extends StageParams = StageParams> = (
  u: number,
  v: number,
  incoming: Rgba,
  params: Params,
  rng: Rng,
) => Rgba

/**
 * A stage, registered.
 *
 * Adding a visual effect to the game is: write one of these in a file under
 * `src/render/patterns/` or `src/render/effects/`, then register it. That is the whole
 * extension procedure, and it is deliberately the shortest one in the codebase — copy the
 * nearest existing stage file, change the maths, register it, reload.
 */
export interface StageDefinition<Params extends StageParams = StageParams> {
  readonly kind: StageKind
  /** Unique within its `kind`. Referenced by {@link RenderStage.name}. */
  readonly name: string
  /** One sentence, player-facing. The trait inspector shows this. */
  readonly describe: string
  /** Every parameter this stage understands, with a sensible value. Doubles as documentation. */
  readonly defaults: Params
  readonly render: StageFn<Params>
}

/**
 * Where stages live.
 *
 * A registry rather than a big `switch` because the point is that new stages can be added
 * without editing anything that already exists. `list()` is what a "here is every effect in
 * the game" screen — or a trait editor — is built on.
 */
export interface StageRegistry {
  /**
   * Throws on a duplicate `kind` + `name`. Silent overwrite would be a nightmare to debug.
   *
   * Generic so a stage can declare its own precise parameter type — `{ bandCount: number }`
   * rather than a vague bag — and still live in one shared registry.
   */
  register<Params extends StageParams>(definition: StageDefinition<Params>): void
  get(kind: StageKind, name: string): StageDefinition | undefined
  /** Everything, or everything of one kind. */
  list(kind?: StageKind): readonly StageDefinition[]
}

// ---------------------------------------------------------------------------
// Phenotype — the whole of what the renderer is told
// ---------------------------------------------------------------------------

/** Eyes get their own type because they are most of the cuteness budget. */
export interface EyeAppearance {
  readonly irisColour: Rgba
  readonly pupilColour: Rgba
  /** 1 is anatomically plausible. Higher is cuter. The default should not be 1. */
  readonly sizeScale: number
  /** The little white catchlight. Turning it off makes a snake look eerie; that is a tool. */
  readonly highlight: boolean
}

/** Shape, separated from colour so a size trait never has to know about pigment. */
export interface BodyProportions {
  /** Overall length, in whatever units the renderer picked. 1 is a typical adult. */
  readonly lengthScale: number
  /** Thickness at the thickest point, relative to length. */
  readonly girthScale: number
  /** Head size relative to body. Above 1 reads as juvenile, which reads as cute. */
  readonly headScale: number
  /** How sharply the body narrows toward the tail. Higher is a whippier tail. */
  readonly taperExponent: number
}

/**
 * A free-form label the game can hang behaviour off — `'glows'`, `'needsExtraCare'`,
 * `'blueEyed'`. Open on purpose: the renderer ignores tags it does not recognise, so adding
 * one can never break rendering.
 */
export type EffectTag = string

/**
 * Everything the renderer needs, and nothing it does not.
 *
 * This is the whole interface between "what this animal is" and "what it looks like". If you
 * want to invent a trait, the question to ask is: *what field here does it change?* If the
 * answer is "none of them", add one — either a named field if it is going to be common, or an
 * entry in {@link Phenotype.extra} if it is experimental.
 *
 * It is plain data. You can write one by hand in a test, log it, diff two of them, or cache it.
 */
export interface Phenotype {
  /**
   * Seeds every random number used while drawing this animal — noise fields, speckle
   * placement, idle-animation phase.
   *
   * Derived from the individual's id, never from a shared world RNG. That is what lets the
   * renderer throw the pattern away after every frame and regenerate an identical one next
   * frame, so nothing about a snake's markings ever has to be stored.
   */
  readonly seed: string
  /** Player-facing name for this look, e.g. what you would put on a listing. */
  readonly label: string

  /** Dominant colour of the animal. Usually what the `base` stage paints. */
  readonly baseColour: Rgba
  /** The markings colour — what patterns draw in. */
  readonly patternColour: Rgba
  /** Underside. Often near-white, and often the thing a pigment modifier forgets to change. */
  readonly bellyColour: Rgba

  readonly eye: EyeAppearance
  readonly body: BodyProportions

  /** Open set. The renderer may use these for extras (a glow, a shimmer); the game may too. */
  readonly effects: readonly EffectTag[]

  /**
   * The ordered pipeline. See {@link STAGE_KIND_ORDER} for how order is resolved.
   *
   * An empty list is legal and draws a plain snake in `baseColour` — a useful thing to be able
   * to fall back to when something is wrong.
   */
  readonly stages: readonly RenderStage[]

  /**
   * Anything nobody has invented yet.
   *
   * When you are trying out a new trait, put its value here first — nothing else in the
   * codebase has to change, and a custom render stage can read it through its `params`. If it
   * survives and turns out to be generally useful, promote it to a real field above.
   *
   * Keep the values plain: this gets hashed for caching and may end up in a save file.
   */
  readonly extra: Readonly<Record<string, number | string | boolean>>
}

// ---------------------------------------------------------------------------
// Running the pipeline
// ---------------------------------------------------------------------------

/**
 * A compiled look: ask it for the colour at any point on the body.
 *
 * The intended use is to evaluate this across an offscreen `(u, v)` texture once per phenotype
 * and cache it, then draw the animated body by sampling that texture — rather than re-running
 * every stage per pixel per frame. Snake shape moves; snake markings do not.
 */
export interface PatternSampler {
  /** `u` 0→1 nose to tail; `v` −1→1 across, 0 at the dorsal midline. */
  sample(u: number, v: number): Rgba
}

/** Resolves a phenotype's stage names against a registry and runs them in order. */
export interface RenderPipeline {
  /**
   * Throws if a stage name is not registered. A missing stage means the picture is wrong in a
   * way nobody will spot; better to stop and say which name was missing.
   */
  compile(phenotype: Phenotype, registry: StageRegistry): PatternSampler
}
