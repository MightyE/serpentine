/**
 * Serpentine — quests: what is actually in the game right now.
 *
 * `content/` is the content agent's, and on the day this landed it did not exist yet. Rather than
 * block on it — the whole point of `types.ts` being written first is that neither agent blocks the
 * other — the catalogue is loaded through a dynamic import that tolerates its absence, and the
 * instruments run over whatever is there plus the reference patterns.
 *
 * ## The failure this file is now built to prevent
 *
 * The first version of this loader had one `catch` around everything and returned an empty
 * catalogue from it. That is a reasonable answer to *"content/ has not been written yet"* and a
 * catastrophic answer to everything else, and it duly produced the worst outcome this module can
 * have: `content/index.ts` exported `ALL_QUESTS`, the loader looked for `QUESTS`, and the whole
 * twenty-quest arc resolved to `[]`. Every instrument went on passing — the blind playthrough, the
 * witness, the anti-accident rule — over six reference fixtures, while reporting nothing wrong.
 *
 * **A test corpus that is silently empty is worse than one that fails**, because a failure gets
 * fixed and a silence gets trusted. So the three ways this can go wrong are now three distinct
 * outcomes rather than one, and {@link ShippedCatalogue.problem} names which:
 *
 * - the module is **absent** — legitimate while `content/` is being written, and the only case the
 *   instruments are allowed to skip past;
 * - the module **threw** on import — a syntax or reference error in someone's half-saved file, and
 *   the error text is carried out rather than swallowed;
 * - the module **loaded and exported no quests** — the export-name mismatch above, which is the
 *   quiet one and therefore the one worth being loudest about.
 *
 * The instruments assert on `problem` directly, so none of them can go blind again without a test
 * saying so by name.
 */
import { REFERENCE_GLOSSARY, REFERENCE_PATTERNS } from './reference'
import type { GlossaryEntry, Quest } from './types'

/** Why the shipped arc is not here. `undefined` means it is. */
export type CatalogueProblem =
  | { readonly kind: 'absent'; readonly detail: string }
  | { readonly kind: 'threw'; readonly detail: string }
  | { readonly kind: 'empty'; readonly detail: string }

export interface ShippedCatalogue {
  /** The tutorial arc, or an empty array if `content/` is not written yet. */
  readonly quests: readonly Quest[]
  readonly glossary: readonly GlossaryEntry[]
  /** False when `content/` is still missing. Tests report this rather than passing quietly. */
  readonly present: boolean
  /** Set whenever `quests` is not the real arc. Asserted on by the instruments. */
  readonly problem?: CatalogueProblem
}

/** Node and Vite both report a missing module this way; a thrown quest file does not. */
function isMissingModule(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') return true
  return /cannot find module|failed to load url|failed to resolve import/i.test(String(error))
}

export async function loadShipped(): Promise<ShippedCatalogue> {
  // Assembled rather than literal, so the type checker does not resolve it and a missing module is
  // a runtime `catch` instead of a build failure in someone else's half-written directory.
  const contentPath = './content' + '/index'
  const glossaryPath = './content' + '/glossary'

  let loaded: { QUESTS?: readonly Quest[]; ALL_QUESTS?: readonly Quest[]; default?: readonly Quest[] }
  try {
    loaded = (await import(/* @vite-ignore */ contentPath)) as typeof loaded
  } catch (error) {
    const problem: CatalogueProblem = isMissingModule(error)
      ? { kind: 'absent', detail: 'content/index.ts does not exist yet' }
      : { kind: 'threw', detail: String(error) }
    return { quests: [], glossary: [], present: false, problem }
  }

  // `ALL_QUESTS` is accepted alongside `QUESTS` because the arc was written under that name and
  // both are exported today. Reading only one of two live export names is what caused the silence
  // this file's header describes, and an alias is a cheaper guarantee than a convention.
  const quests = loaded.QUESTS ?? loaded.ALL_QUESTS ?? loaded.default ?? []

  let glossary: readonly GlossaryEntry[] = []
  try {
    const terms = (await import(/* @vite-ignore */ glossaryPath)) as {
      TEACHABLE_TERMS?: readonly GlossaryEntry[]
      GLOSSARY?: readonly GlossaryEntry[]
      default?: readonly GlossaryEntry[]
    }
    // `GLOSSARY` is a Map in `content/glossary.ts`; only take it if it is really a list.
    glossary = terms.TEACHABLE_TERMS ?? (Array.isArray(terms.GLOSSARY) ? terms.GLOSSARY : undefined) ?? terms.default ?? []
  } catch {
    glossary = []
  }

  if (quests.length === 0) {
    return {
      quests,
      glossary,
      present: false,
      problem: {
        kind: 'empty',
        detail:
          'content/index.ts imported cleanly but exported no quests under QUESTS, ALL_QUESTS or ' +
          'default. Every instrument would run over the reference fixtures alone and pass.',
      },
    }
  }

  return { quests, glossary, present: true }
}

/** Everything the instruments check: the shipped arc plus the six worked examples. */
export async function loadForInstruments(): Promise<ShippedCatalogue> {
  const shipped = await loadShipped()
  return {
    quests: [...REFERENCE_PATTERNS, ...shipped.quests],
    glossary: [...REFERENCE_GLOSSARY, ...shipped.glossary],
    present: shipped.present,
    problem: shipped.problem,
  }
}

/**
 * The assertion every instrument makes before it trusts its own result.
 *
 * Returns a failure message, or `null` when the arc is really loaded. `absent` is tolerated because
 * a runtime built before any content exists is the working arrangement this module was written for;
 * `threw` and `empty` are not, because in both of those the arc exists and the instrument is simply
 * not looking at it.
 */
export function catalogueComplaint(catalogue: ShippedCatalogue): string | null {
  const problem = catalogue.problem
  if (!problem || problem.kind === 'absent') return null
  return (
    `the shipped quest catalogue did not load (${problem.kind}), so this instrument is running ` +
    `over the reference fixtures alone and proves nothing about the arc: ${problem.detail}`
  )
}
