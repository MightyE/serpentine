/**
 * Serpentine — quests: the content boundary, mechanically enforced.
 *
 * `docs/quest-design.md` §E3: **no file under `src/game/quests/content/` may import anything except
 * `../types` and `./glossary`.**
 *
 * That single rule is what makes the two-agent split real rather than a convention. The content agent
 * can write and typecheck every quest before the runtime exists; the implementation agent can build
 * the runtime before a single quest is written. The moment a quest file reaches for `session.ts` or
 * the genetics engine, the boundary has moved and a predicate has become code — which is the failure
 * this design spends most of its effort avoiding, since a predicate that can call into the game is a
 * predicate whose strength cannot be computed.
 *
 * ## Why the rule is checked by resolution rather than by a list of strings
 *
 * The literal reading of §E3 rejects two things it did not mean to. `content/index.ts` cannot be a
 * barrel without importing its own chapters, and `content/catalogue.test.ts` exists precisely to run
 * the readability checker against them. Both were flagged by the first version of this test, and
 * both are inside the boundary rather than across it.
 *
 * So the check resolves each specifier and asks where it *lands*:
 *
 * - **Anything inside `content/` is allowed**, and that is not a loosening. Every file in `content/`
 *   is itself subject to this same test, so the transitive closure of what `content/` may import is
 *   still `content/` plus `../types`. The guarantee is by induction rather than by enumeration, and
 *   induction is the stronger of the two — it cannot be defeated by a file added tomorrow.
 * - **Anything outside it must be on an explicit list**, and the list is different for a quest file
 *   than for a test. A quest file gets `../types` and nothing else, which is the rule as written. A
 *   test file additionally gets `vitest` and the quest module's own instruments, because a test that
 *   cannot import the checker it is running is not a test — but it still may not reach `session.ts`,
 *   the genetics engine, or anything outside `src/game/quests/`, which is the part that matters.
 *
 * The failure message names which of the two lists the file was judged against, because "this import
 * is fine in a test and not in a quest" is the one thing about this rule that is easy to get wrong.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const contentDir = fileURLToPath(new URL('./content', import.meta.url))

/** What a quest data file may reach for. The rule from §E3, unchanged. */
const QUEST_FILE_ALLOWED = new Set(['../types'])

/**
 * What a test living under `content/` may additionally reach for.
 *
 * The instruments only — never the runtime, and never the game. `../readability` is the checker the
 * content agent runs; `../shipped` is how a test gets the arc. Nothing here can evaluate a predicate
 * or touch a `Session`, so a quest smuggled into a `.test.ts` still cannot call into the game.
 */
const TEST_FILE_ALLOWED = new Set([
  ...QUEST_FILE_ALLOWED,
  'vitest',
  '../readability',
  '../shipped',
])

function filesUnder(dir: string): readonly string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return filesUnder(path)
    return entry.name.endsWith('.ts') ? [path] : []
  })
}

function isInside(dir: string, path: string): boolean {
  const rel = relative(dir, path)
  return rel !== '' && !rel.startsWith('..')
}

describe('content boundary', () => {
  if (!existsSync(contentDir)) {
    it.skip('content/ does not exist yet — nothing to check', () => {})
    return
  }

  const files = filesUnder(contentDir)

  it('has content to check', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const file of files) {
    const name = file.slice(contentDir.length + 1)
    const isTest = name.endsWith('.test.ts')
    const allowed = isTest ? TEST_FILE_ALLOWED : QUEST_FILE_ALLOWED

    it(`${name} imports only the contract`, () => {
      const source = readFileSync(file, 'utf8')
      const specifiers = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1] as string)

      const forbidden = specifiers.filter((specifier) => {
        if (allowed.has(specifier)) return false
        // A relative specifier that lands inside content/ is inside the boundary, and every file it
        // lands on is checked by this same test. Anything else — bare package, or a relative path
        // that escapes — has to be on the list above.
        if (!specifier.startsWith('.')) return true
        return !isInside(contentDir, resolve(dirname(file), specifier))
      })

      expect(
        forbidden,
        `${name} is judged as ${isTest ? 'a test' : 'a quest file'}. A quest file may import only ` +
          '../types and its siblings under content/; a test may additionally import vitest and the ' +
          'quest instruments. Anything else has moved the boundary between content and runtime',
      ).toEqual([])
    })
  }

  /**
   * The induction step, stated as its own assertion.
   *
   * The rule above leans on "every file under content/ is checked by this test". If that ever stops
   * being true — a `.js` file, a subdirectory the walker misses — the sibling allowance becomes a
   * hole rather than a closure. Cheap to assert, and it is the load-bearing half of the argument.
   */
  it('checks every module a content file could import from inside content/', () => {
    const unchecked = readdirSync(contentDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && !entry.name.endsWith('.ts'))
      .map((entry) => entry.name)
    expect(
      unchecked,
      'a non-TypeScript module under content/ is importable by a quest file but not checked by ' +
        'this test, which breaks the closure argument the sibling allowance rests on',
    ).toEqual([])
  })
})
