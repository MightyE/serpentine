/**
 * Where render stages live.
 *
 * ## Adding a new look to the game
 *
 * 1. Copy the file in `stages/` that is closest to what you want.
 * 2. Change the maths.
 * 3. Add one line to `stages/index.ts` registering it.
 *
 * That is the whole procedure. There is no switch statement to update, no type to widen, no
 * list of valid names anywhere else in the codebase. The registry exists specifically so that
 * step 3 is one line and step 4 does not exist.
 *
 * The reason phenotypes refer to stages **by name** instead of holding the function itself is
 * that a phenotype is plain data — it gets hashed to key a cache, and it may end up in a save
 * file. A function survives neither. A string does.
 */

import type { StageDefinition, StageKind, StageParams, StageRegistry } from './contract'

function keyOf(kind: StageKind, name: string): string {
  return `${kind}:${name}`
}

/** Make an empty registry. Tests use this to register a fake stage in isolation. */
export function createStageRegistry(): StageRegistry {
  const entries = new Map<string, StageDefinition>()

  return {
    register<Params extends StageParams>(definition: StageDefinition<Params>): void {
      const key = keyOf(definition.kind, definition.name)
      if (entries.has(key)) {
        // Loudly, on purpose. A silent overwrite means two files fight over one name and the
        // winner depends on import order, which is the worst class of bug to track down.
        throw new Error(`Render stage "${key}" is already registered. Pick a different name.`)
      }
      entries.set(key, definition as unknown as StageDefinition)
    },

    get(kind: StageKind, name: string): StageDefinition | undefined {
      return entries.get(keyOf(kind, name))
    },

    list(kind?: StageKind): readonly StageDefinition[] {
      const all = [...entries.values()]
      return kind === undefined ? all : all.filter((d) => d.kind === kind)
    },
  }
}

/**
 * The one the game uses. `stages/index.ts` fills it; import that module (or `src/render/`)
 * before compiling a phenotype, or every name will look unregistered.
 */
export const stageRegistry: StageRegistry = createStageRegistry()
