# CLAUDE.md

Working notes for Claude Code in this repo. This file is about *how to work here* — architecture,
commands, conventions, gotchas. For the biology, read
[`docs/genetics-primer.md`](docs/genetics-primer.md). For adding a new trait specifically, use the
`add-a-trait` skill (`.claude/skills/add-a-trait/SKILL.md`) or read
[`docs/add-a-trait.md`](docs/add-a-trait.md) directly — don't re-derive that procedure from
scratch, it's already worked out.

## What this is

Serpentine: a snake-rehab / genetics-lab game. React + TypeScript + Vite, tested with Vitest, no
backend. `package.json`'s own description: "A snake rehabilitation & genetics lab. Breed, study,
and care for snakes to fund the sanctuary."

## Commands

```
npm run dev         # vite dev server
npm run build        # tsc --noEmit, then vite build
npm run preview      # preview a production build
npm test              # vitest run — the whole suite, once
npm run test:watch   # vitest, watch mode
npm run typecheck    # tsc --noEmit only
```

Always run `npm test` (not a partial `vitest run <path>`) before considering a change done unless
you have a specific reason to scope it — the suite is fast (well under a second of actual test
time).

## Architecture, top to bottom

```
src/genetics/   the engine — loci, alleles, inheritance, probability. Knows no snake, no trait.
src/species/    data — which loci a species has, and what each one does to the phenotype.
                This is the ONLY place genetics and rendering meet.
src/render/     procedural snake renderer — phenotype → pixels, in ordered stages.
src/game/       the game shell — roster, economy, market, rehab, save/load, progression seams.
src/ui/         React components.
src/lib/        small shared utilities (deterministic RNG, etc).
```

**The one rule that keeps the engine general**, stated in `src/genetics/types.ts`'s own doc
comment: no snake, no trait, no species name appears anywhere in `src/genetics/`. If you're
editing something in there and reach for a specific trait name, the thing you actually want is a
new data file in `src/species/`, not an engine change. This is why adding a trait never touches
the engine — see the add-a-trait skill.

Genetics and rendering are two parallel pipelines with the same shape (`genetics/types.ts` spells
this out): `locus values → base phenotype → trait projections → modifier rules → final`
mirrors `base colour → pattern → mask(s) → modifier stage(s) → final` on the render side. Learn one,
you know both.

`src/species/ballPython/index.ts` (or `cornSnake/index.ts`) is the single file where a species'
loci, its render hookup, and its sex system all come together. Copy that file as the starting
point for a whole new species; for a single new trait on an existing species, see the skill.

## Sex determination

Declared per species, not hard-coded — `SexSystem` in `genetics/types.ts`. Ball python is XY
(`species/ballPython/sexSystem.ts`), corn snake is ZW (`species/cornSnake/sexSystem.ts`). Full
reasoning and the science behind why these differ: `docs/genetics-primer.md`. If you ever see code
that treats "snake" as implying one sex-determination system, that's a bug.

## Conventions

- **Genetics terms**: incomplete dominance (never "co-dominant") for traits like pastel/champagne;
  "possible het" / carrier probability for unproven recessive carriers; "genotype" vs. "phenotype"
  used precisely. See the primer for why.
- **Lethal genotypes**: an egg that does not hatch, reported as a genetics fact with an
  explanation — never framed as death, harm, or culling, anywhere. No code path in this repo kills
  or disposes of a living animal. See `champagneLethalRule` in
  `species/ballPython/loci/champagne.ts` for the pattern to copy if you add another one.
  `needsExtraCare` (`game/rehab.ts`) is the separate mechanic for a *living* animal with a real
  documented health effect — it becomes a rehab resident, not a problem.
- **Fictional vs. real traits**: every allele on an invented trait is flagged `invented: true` and
  lives in a `fictional/` subdirectory. Every real trait carries a `RealVsModeledNote`
  (`species/support/traitNotes.ts`) stating what's real and what's simplified, enforced by
  `realTraitNotes.test.ts`. Don't add a real-sounding trait without one, and don't blur a fictional
  trait into looking real.
- **Determinism**: mutation and any other randomness goes through `src/lib/rng.ts`'s seeded RNG.
  Never `Math.random()` or `Date.now()` inside anything that affects a save file — it breaks
  save-file reproducibility in a way that's hard to notice and hard to undo. `mutation.ts`'s own
  doc comment explains why this matters for `NovelAlleleGenerator`s specifically.
- **Tuning numbers**: every constant that shapes game difficulty lives in `src/game/tuning.ts`,
  each with a comment naming which balance principle (`docs/balance-charter.md`) it serves.
  `tuning.test.ts` asserts *derived properties* ("clutches to a rare morph"), never the raw
  constants — if you change a constant and a test breaks, that's the point: read what design
  property moved, and if you still want the change, update the invariant too and log two sentences
  in the balance charter's decision log.
- **Progression seams** (`src/game/seams.ts`): a flag set, an unlock registry, an event bus — the
  plumbing for a future talent tree, deliberately with no talent tree built on top. Don't build
  progression content into `unlockRegistry.ts`; that's a deliberately reserved seam (see
  `docs/project-ladder.md`).

## Known limitations (don't "fix" these without reading why first)

- **Linkage between loci is a declared, throwing seam, not an implemented mechanic.**
  `genetics/genotype.ts`'s `assertNoLinkage` throws on purpose if a locus declares a `linkage`
  group — implementing crossover in `makeGamete()` is real work, not a quick patch. See the primer
  and the project ladder.
- **Masking epistasis** is demonstrated only in a fictional trait (`cornSnake/fictional/umbra.ts`),
  never claimed for a real one — the research behind this project couldn't corroborate a real
  single-locus case from two independent sources.
- **Renderer ribbon shear on hard curves**: `paintRibbon` maps texture strips affinely per spine
  segment, so a sufficiently tight curve shears the markings slightly. Invisible at default
  `turnRate`/`pointCount`; visible if either is pushed hard. Documented as a future project, not
  fixed — see the project ladder.
- **Inbreeding coefficient, genetic load, and pedigree tracking are designed, not built.** The
  design is in `docs/balance-charter.md` (principle 3); there is no pedigree/`F`/genetic-load code
  in `src/` as of this writing. Don't assume it exists because the design docs discuss it.

## Repo etiquette

- License is source-available / all-rights-reserved (`LICENSE`) — this is a public repo people can
  read, not one they can use or fork for their own project.
- No `Math.random()` in anything genetics-related — see Determinism above.
- If you land in `src/species/testSupport/referenceEngine.ts`, know that it's a self-contained test
  double built before the real `GeneticsEngine` (`src/genetics/index.ts`) was assembled, kept
  around deliberately documented as such. Don't assume it's the real engine's behavior — go check
  `genetics/index.ts` directly for that.
