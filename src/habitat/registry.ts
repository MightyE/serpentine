/**
 * Where habitat layers, biomes and features live.
 *
 * ## Adding something to a habitat
 *
 * A **decorative element** (a new kind of shrub, a different rock formation):
 *   1. Copy the file in `layers/` closest to what you want.
 *   2. Change the maths.
 *   3. Add one line to `layers/index.ts`.
 *
 * A **biome**:
 *   1. Copy the file in `biomes/` closest to what you want.
 *   2. Change the palette, the layer list and the supply bands.
 *   3. Add one line to `biomes/index.ts`.
 *
 * A **feature**:
 *   1. Copy the file in `features/` closest to what you want.
 *   2. Change the drawing, the site and the supply bands.
 *   3. Add one line to `features/index.ts`.
 *
 * That is the whole procedure in all three cases. There is no switch statement to update, no
 * type to widen, and no list of valid names anywhere else in the codebase. The registries exist
 * specifically so that the last step is one line and there is no step after it.
 *
 * This is the same shape as `src/render/registry.ts`, deliberately — learn the pattern once and
 * it is the pattern for snakes *and* for the places you keep them.
 */

import type {
  BiomeProvision,
  BiomeRegistry,
  FeatureProvision,
  FeatureRegistry,
  LayerDefinition,
  LayerKind,
  LayerParams,
  LayerRegistry,
} from './contract'

function keyOf(kind: LayerKind, name: string): string {
  return `${kind}:${name}`
}

/** Make an empty layer registry. Tests use this to register a fake layer in isolation. */
export function createLayerRegistry(): LayerRegistry {
  const entries = new Map<string, LayerDefinition>()

  return {
    register<Params extends LayerParams>(definition: LayerDefinition<Params>): void {
      const key = keyOf(definition.kind, definition.name)
      if (entries.has(key)) {
        // Loudly, on purpose. A silent overwrite means two files fight over one name and the
        // winner depends on import order — the worst class of bug to track down.
        throw new Error(`Habitat layer "${key}" is already registered. Pick a different name.`)
      }
      entries.set(key, definition as unknown as LayerDefinition)
    },

    get(kind: LayerKind, name: string): LayerDefinition | undefined {
      return entries.get(keyOf(kind, name))
    },

    list(kind?: LayerKind): readonly LayerDefinition[] {
      const all = [...entries.values()]
      return kind === undefined ? all : all.filter((d) => d.kind === kind)
    },
  }
}

/** Make an empty biome registry. */
export function createBiomeRegistry(): BiomeRegistry {
  const entries = new Map<string, BiomeProvision>()
  return {
    register(biome: BiomeProvision): void {
      if (entries.has(biome.id)) {
        throw new Error(`Biome "${biome.id}" is already registered. Pick a different id.`)
      }
      entries.set(biome.id, biome)
    },
    get: (id) => entries.get(id),
    list: () => [...entries.values()],
  }
}

/** Make an empty feature registry. */
export function createFeatureRegistry(): FeatureRegistry {
  const entries = new Map<string, FeatureProvision>()
  return {
    register(feature: FeatureProvision): void {
      if (entries.has(feature.id)) {
        throw new Error(`Feature "${feature.id}" is already registered. Pick a different id.`)
      }
      entries.set(feature.id, feature)
    },
    get: (id) => entries.get(id),
    list: () => [...entries.values()],
  }
}

/**
 * The ones the game uses. `layers/index.ts`, `biomes/index.ts` and `features/index.ts` fill
 * them; import `src/habitat/` before drawing anything, or every name will look unregistered.
 */
export const layerRegistry: LayerRegistry = createLayerRegistry()
export const biomeRegistry: BiomeRegistry = createBiomeRegistry()
export const featureRegistry: FeatureRegistry = createFeatureRegistry()
