/**
 * Serpentine — the habitat contract.
 *
 * ## What this file is
 *
 * The complete description of what an *enclosure* is: the biome it is set up as, the features
 * installed in it, what those supply to the animal living there, and how all of it gets drawn.
 *
 * ## The rule that keeps this half honest
 *
 * **A biome is a bundle of provisions. A feature is a single provision. They are the same type.**
 *
 * That is not a tidiness preference — it is `docs/economy-design.md`'s decision, and the reason
 * is spelled out there: two systems would have given the habitat renderer two lists to read and
 * the game two numbers to compute, and they would have disagreed within a month. So
 * {@link BiomeProvision} and {@link FeatureProvision} are both {@link Provision}. One `role`
 * field tells them apart, and nothing downstream of `resolveBenefits` looks at it.
 *
 * The six axes a provision supplies (`humidity`, `thermalGradient`, `cover`, `climbing`,
 * `substrateDepth`, `enrichment`) are **not redeclared here**. They are imported from the game's
 * own constants, because a second copy of that list is exactly the disagreement the single model
 * was chosen to prevent.
 *
 * ## Drawing is a layer pipeline, not a function
 *
 * Same shape as `src/render/contract.ts`, deliberately. A snake's look is an ordered list of
 * named stages; an enclosure's look is an ordered list of named *layers*:
 *
 *     backdrop  →  substrate  →  scatter  →  planting  →  furniture  →  foreground  →  light
 *
 * Each layer is a small registered function of `(ctx, scene, params, placement)`. A biome names
 * the layers it wants; so does a feature. The composer looks them up, sorts them by kind, and
 * draws. Adding a new decorative element is one function plus one registration line, and it
 * composes with everything that already exists for free.
 *
 * If you already know `src/render/stages/`, you already know this. That was the point.
 *
 * @see ../render/contract.ts
 * @see ../game/progression/tuningProposals.ts
 * @see ../../docs/economy-design.md
 */

import type { Rgba } from '../render/contract'
import type { Rng } from '../lib/rng'
import type { ProvisionAxis } from '../game/progression/tuningProposals'

export type { ProvisionAxis }

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** A rectangle in logical pixels. Same shape as the renderer's `Rect`; kept local so the two can diverge. */
export interface HabitatRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/**
 * Where one drawn thing sits.
 *
 * Computed by `layout.ts` from the enclosure's seed, then handed to a layer at draw time — which
 * is why placement is a separate argument rather than a parameter. Parameters describe *what a
 * thing is* and get written into a save file; placement describes *where this instance landed*
 * and is derived, every time, from the seed.
 */
export interface Placement {
  /** Centre of the item's footprint, in canvas coordinates. */
  readonly x: number
  /** The ground line the item stands on. */
  readonly y: number
  /** 1 is the size the layer was drawn at. Depth scaling has already been applied. */
  readonly scale: number
  /** Which way it faces. Mirrors the drawing. */
  readonly facing: -1 | 1
  /** 0 at the back wall, 1 pressed against the glass. Decides draw order and haze. */
  readonly depth: number
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

/**
 * A biome's colours, in one place.
 *
 * Every layer takes its colours from here rather than declaring its own, which is what makes a
 * grass tuft written for the woodland look right when a savanna reuses it. Retinting a biome is
 * editing this object; it is not editing any layer.
 */
export interface BiomePalette {
  /** Back wall, top and bottom. Everything behind the animal is these two mixed. */
  readonly skyTop: Rgba
  readonly skyBottom: Rgba
  /** Distant silhouettes — a tree line, a rock face, dunes. Low contrast on purpose. */
  readonly distant: Rgba
  /** The ground, lit and shaded. */
  readonly substrate: Rgba
  readonly substrateDark: Rgba
  /** Living green, near and deep. */
  readonly foliage: Rgba
  readonly foliageDeep: Rgba
  /** Branches, cork bark, driftwood. */
  readonly wood: Rgba
  /** Rock, and anything mineral. */
  readonly stone: Rgba
  /** The tint of the warm end's light pool. Warm, always — this is most of the cosiness budget. */
  readonly light: Rgba
}

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

/**
 * What sort of job a layer does. Decides draw order (see {@link LAYER_KIND_ORDER}) and tells a
 * reader what a layer may assume is already on the canvas.
 *
 * - `backdrop` — the back wall and anything distant. Ignores what came before; draws first.
 * - `substrate` — the ground the animal is on, and the horizon where it meets the wall.
 * - `scatter` — small things lying *on* the substrate: leaf litter, pebbles, sand ripples.
 * - `planting` — things that grow: grass, ferns, shrubs. Drawn back to front by `depth`.
 * - `furniture` — installed items: hides, branches, dishes, lamps. This is where features live.
 * - `foreground` — the few blades and leaves nearer than the animal. Sells the depth cheaply.
 * - `light` — the warm pool, the shadow pass, the vignette. Tints everything under it.
 */
export type LayerKind =
  | 'backdrop'
  | 'substrate'
  | 'scatter'
  | 'planting'
  | 'furniture'
  | 'foreground'
  | 'light'

/**
 * The order layer kinds draw in.
 *
 * The composer sorts a provision's layers by this rank first, then by the order they appear in
 * the array — so you can push layers onto a biome in whatever order reads best in the source and
 * still get a sensible picture. Within a kind, array order decides, and `furniture` additionally
 * sorts by `Placement.depth` so a hide at the back never draws over a dish at the front.
 */
export const LAYER_KIND_ORDER: readonly LayerKind[] = [
  'backdrop',
  'substrate',
  'scatter',
  'planting',
  'furniture',
  'foreground',
  'light',
]

/**
 * Values a layer can be configured with.
 *
 * Plain JSON-able things only, and for the same reason as `StageParamValue` in the render
 * contract: an enclosure is saved. A function in here could not be.
 */
export type LayerParamValue = number | string | boolean | readonly number[] | readonly string[]

/** A layer's parameters. Keys are whatever that layer's `defaults` declares. */
export type LayerParams = Readonly<Record<string, LayerParamValue>>

/** One entry in a provision's look: "draw the layer called this, with these settings." */
export interface HabitatLayer {
  readonly kind: LayerKind
  /** Key into the {@link LayerRegistry}. Unknown names must fail loudly, not be skipped. */
  readonly name: string
  /** Merged over the registered layer's `defaults`. */
  readonly params: LayerParams
}

/**
 * Everything a layer is told about the enclosure it is drawing into.
 *
 * `rng` is the important field. It is forked per layer from the enclosure's id, so every layer
 * gets an independent stream that is *identical on every frame and after every reload*. That is
 * the whole reason an enclosure's planting never has to be stored: it is regenerated, the same
 * way, every time. Never `Math.random()` in here — the shrubbery would crawl.
 */
export interface HabitatScene {
  /** The interior of the enclosure — inside the glass, where things may be drawn. */
  readonly rect: HabitatRect
  /** `hashSeed(enclosure.id)`. The one input that makes this enclosure this enclosure. */
  readonly seed: number
  /** Forked from the enclosure seed and the layer's own name. Deterministic. */
  readonly rng: Rng
  readonly palette: BiomePalette
  /**
   * Which end of the enclosure the heat is at: `-1` left, `+1` right.
   *
   * Layout keeps the water dish at the opposite end, because that is where it belongs — a water
   * dish under the basking lamp is how you get a humid enclosure and a cool animal. Correct
   * husbandry and good composition turn out to be the same constraint here, which is a nice
   * thing to have found and worth keeping.
   */
  readonly warmSide: -1 | 1
  /** The y where the back wall meets the substrate. Above it is wall; below it is ground. */
  readonly horizon: number
  /** Seconds since the enclosure was first drawn. For gentle motion only — heat shimmer, dust. */
  readonly time: number
}

/**
 * The actual work: draw one layer.
 *
 * `placement` is the whole enclosure for a biome layer and the item's own site for a feature
 * layer, so the same function signature covers both. Must be pure with respect to the scene: the
 * same scene and placement must draw the same picture every time.
 */
export type LayerFn<Params extends LayerParams = LayerParams> = (
  ctx: CanvasRenderingContext2D,
  scene: HabitatScene,
  params: Params,
  placement: Placement,
) => void

/**
 * A layer, registered.
 *
 * **Adding a decorative element to the game is: write one of these in a file under
 * `src/habitat/layers/`, then add one line to `layers/index.ts`.** That is the whole procedure.
 * There is no switch statement to update, no type to widen, and no list of valid names anywhere
 * else — exactly as in `src/render/registry.ts`, on purpose.
 */
export interface LayerDefinition<Params extends LayerParams = LayerParams> {
  readonly kind: LayerKind
  /** Unique within its `kind`. Referenced by {@link HabitatLayer.name}. */
  readonly name: string
  /** One sentence. Shows up in the habitat lab's layer list. */
  readonly describe: string
  /** Every parameter this layer understands, with a sensible value. Doubles as documentation. */
  readonly defaults: Params
  readonly draw: LayerFn<Params>
}

/** Where layers live. Mirrors {@link import('../render/contract').StageRegistry}. */
export interface LayerRegistry {
  /** Throws on a duplicate `kind` + `name`. Silent overwrite would be a nightmare to debug. */
  register<Params extends LayerParams>(definition: LayerDefinition<Params>): void
  get(kind: LayerKind, name: string): LayerDefinition | undefined
  /** Everything, or everything of one kind. */
  list(kind?: LayerKind): readonly LayerDefinition[]
}

// ---------------------------------------------------------------------------
// Provisions — the one model, per docs/economy-design.md
// ---------------------------------------------------------------------------

/**
 * How much of an axis a provision supplies, as an ordinal band rather than a number.
 *
 * **This is the fence between structure and balance.** If every feature wrote its own numbers,
 * there would be forty magic constants scattered across forty files, none of them in
 * `tuning.ts`, and the balance charter's "difficulty is readable top to bottom in one file" would
 * be quietly dead. Bands instead: a file says a water dish supplies *moderate* humidity — a
 * design fact — and one table in `tuning.ts` says what "moderate" is worth. Four numbers to tune,
 * not forty, and retuning them moves the whole habitat system coherently.
 */
export type SupplyLevel = 'none' | 'slight' | 'moderate' | 'strong'

/** What a provision supplies. Axes it does not mention supply `'none'`. */
export type ProvisionSupply = Partial<Readonly<Record<ProvisionAxis, SupplyLevel>>>

/**
 * When a provision becomes buyable, as an ordinal band.
 *
 * Same fence as {@link SupplyLevel}, and the same reason. `docs/economy-design.md` is explicit
 * that the gate is reputation — what you have produced, proven and placed — never money and
 * never elapsed time, so this is a reputation band and nothing else.
 */
export type UnlockBand = 'starting' | 'early' | 'mid' | 'late'

/**
 * The shared model. A biome is one of these; so is a feature.
 *
 * `cost`, `upkeepPerWeek` and `featureSlotCost` are the three prices in the economy design, and
 * every one of them is a real number rather than a band — they are already denominated in
 * existing `tuning.ts` currencies (`SLOT_PURCHASE_COST`, `SLOT_UPKEEP_PER_WEEK`), so they are
 * written as expressions over those and move when those move.
 */
export interface Provision {
  readonly id: string
  /** Player-facing name. "Cork bark hide", "West African scrub". */
  readonly label: string
  /** One sentence, player-facing, factual. The shop and the inspector both show this. */
  readonly describe: string
  readonly supplies: ProvisionSupply
  readonly cost: number
  readonly upkeepPerWeek: number
  /** Slots consumed out of the enclosure type's `featureSlots`. A biome costs none. */
  readonly featureSlotCost: number
  readonly unlock: UnlockBand
  /** What this contributes to the picture. May be empty — a provision need not be visible. */
  readonly layers: readonly HabitatLayer[]
}

/**
 * A biome: a bundle of provisions, expressed as one provision with a palette.
 *
 * The bundle is not modelled as a list of child provisions, because nothing would ever ask for
 * the children individually — you cannot buy half a savanna. It is modelled as the summed supply
 * that a bundle would have, which is the only thing anyone reads.
 */
export interface BiomeProvision extends Provision {
  readonly role: 'biome'
  readonly palette: BiomePalette
  /**
   * Species this setup is drawn from, by `src/species/` id. Advisory: it drives the shop's "suits
   * your ball python" hint, never a restriction. Nothing in this game refuses a pairing of animal
   * and enclosure that meets baseline.
   */
  readonly nativeTo: readonly string[]
  /** Where the animal is in the world, in one line. This is the herpetology, so it should be right. */
  readonly rangeNote: string
}

/**
 * Where in the enclosure a feature wants to sit. Layout honours this; see `layout.ts`.
 *
 * This is what stops a hide, a branch and a dish from looking like three sprites in a row.
 */
export type FeatureSite =
  /** Against the back wall, sunk into the planting. Hides, humidity boxes. */
  | 'back'
  /** Out on the open floor, front half. Water dishes. */
  | 'floor'
  /** Spanning the enclosure, resting on whatever is under it. Branches. */
  | 'span'
  /** Fixed to the ceiling. Lamps. */
  | 'overhead'
  /** Not an object at all — changes the substrate itself. Depth, moss layers. */
  | 'ground'

/** A feature: a single provision, with a site and a thermal preference. */
export interface FeatureProvision extends Provision {
  readonly role: 'feature'
  readonly site: FeatureSite
  /**
   * Which end of the thermal gradient this belongs at, if it cares.
   *
   * `'warm'` for the lamp and the basking rock, `'cool'` for the water dish and the humid hide.
   * Layout reads it against {@link HabitatScene.warmSide}. Real husbandry; also the thing that
   * makes an arrangement look considered rather than scattered.
   */
  readonly thermal: 'warm' | 'cool' | 'either'
}

/** Either kind, when you do not care which — which is most of the time, and the point. */
export type AnyProvision = BiomeProvision | FeatureProvision

// ---------------------------------------------------------------------------
// Registries for the two provision kinds
// ---------------------------------------------------------------------------

/**
 * Where biomes live.
 *
 * **Adding a biome is one file in `src/habitat/biomes/` plus one line in `biomes/index.ts`.**
 */
export interface BiomeRegistry {
  register(biome: BiomeProvision): void
  get(id: string): BiomeProvision | undefined
  list(): readonly BiomeProvision[]
}

/**
 * Where features live.
 *
 * **Adding a feature is one file in `src/habitat/features/` plus one line in
 * `features/index.ts`.**
 */
export interface FeatureRegistry {
  register(feature: FeatureProvision): void
  get(id: string): FeatureProvision | undefined
  list(): readonly FeatureProvision[]
}

// ---------------------------------------------------------------------------
// Benefits — the shape only. Numbers live in tuning.ts.
// ---------------------------------------------------------------------------

/**
 * The three things good husbandry may do, and there are exactly three on purpose.
 *
 * `docs/economy-design.md` lists them and then lists what husbandry may **never** touch: hatch
 * rate, clutch size, or anything genetic. Hatch rate has one job in this game and that job is
 * genetic load; the moment husbandry can move it, inbreeding depression becomes invisible and the
 * best mechanic in the design stops teaching anything.
 *
 * If you are about to add a fourth channel, that paragraph is the one to argue with first.
 */
export type BenefitChannel =
  /** Shortens the receptivity window *within its already-published range*. A scheduling benefit. */
  | 'receptivityWindow'
  /** Raises rehab resident support. Capped so a resident stays net-negative. */
  | 'residentSupport'
  /** Offsets part of the extra-care multiplier for a resident who needs it. */
  | 'extraCareOffset'

/**
 * One provision's contribution to one channel, kept separate rather than summed.
 *
 * Charter principle 6: the player sees the total *and* every component. A number you could
 * reproduce on paper, from a list the game showed you.
 */
export interface BenefitContribution {
  readonly channel: BenefitChannel
  /** The provision id it came from. */
  readonly source: string
  /** That provision's player-facing label, so a readout needs no second lookup. */
  readonly sourceLabel: string
  /** Share of the channel's published cap, 0..1. Never the raw game number — that is tuning's. */
  readonly share: number
}

/** How well an enclosure matches what an animal needs, axis by axis. */
export interface MatchReport {
  /** Supplied level per axis, 0..1, summed across every installed provision and clamped. */
  readonly supplied: Readonly<Record<ProvisionAxis, number>>
  /** What the animal asked for, per axis. */
  readonly required: Readonly<Record<ProvisionAxis, number>>
  /** Axes below `PROVISION_BASELINE`. Non-empty means the game refuses the placement. */
  readonly shortfalls: readonly ProvisionAxis[]
  /** 0..1. Zero is "exactly baseline"; one is "everything this animal could want". */
  readonly quality: number
}

/**
 * Everything husbandry does to one animal in one enclosure, computed and itemised.
 *
 * This is the whole of "how a benefit reaches a snake": the game calls `resolveBenefits`, gets
 * one of these, and multiplies the published cap for a channel by `totals[channel]`. No system
 * downstream needs to know what a biome is.
 */
export interface BenefitLedger {
  readonly match: MatchReport
  readonly contributions: readonly BenefitContribution[]
  /** Per channel, 0..1: the share of that channel's published cap this enclosure earns. */
  readonly totals: Readonly<Record<BenefitChannel, number>>
  /**
   * False when an axis is below baseline. The caller must **refuse the placement**, not apply a
   * penalty. Nothing in this repo models an animal being housed badly.
   */
  readonly placementAllowed: boolean
}
