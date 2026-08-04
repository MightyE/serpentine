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

## The UI layer, and the session

`src/ui/` is React and nothing else — no game state lives in a component. Everything runs through
`src/game/session.ts`, a plain class with a coarse `subscribe()` callback, which means the whole
loop (spawn, pair, predict, breed, sell, advance) is drivable from a test with no renderer at all.
`src/game/session.test.ts` is exactly that, and it is the first place to look when something in the
app misbehaves — if it passes there, the bug is in a component.

Two things the session owns that nothing else does:

- **Genetic load is bolted on at the game layer**, not authored into species files. `loadPool.ts`'s
  `playableSpecies()` returns the authored species plus sixty hidden recessive loci and their
  viability rules. `src/species/` stays about *morphs*, which is what a person wants to edit.
- **Belief is inferred one locus at a time.** `inferKnowledge` enumerates the joint candidate space
  across every locus, which for a whole species is six figures of genotypes and refuses (correctly)
  rather than hanging the browser. `Session.beliefAt` narrows the species to a single locus first.
  That is also the only form of the question a player ever asks.

## Time gates

Pairing (1–6 weeks), incubation (8–9) and growth to maturity (34–78 male, 104–156 female) are
**live**, and they are **turn-based only**. One turn is one in-game week; nothing in `src/game/`
may read `Date.now()`, and `session.ts` advances gates only when the player advances the clock.
The model is `src/game/gates.ts` (the clock) and `session.ts`'s `settleGates` (the consequence) —
keep that split, it is why a gate can carry a mechanic that did not exist when it was written.

Three things to know before you touch this:

- **`Session`'s default `gateMode` is `'timed'`.** A test that wants a hatchling without clicking
  through fifteen weeks passes `{ gateMode: 'instant' }`, which sets every gate's duration to zero
  and leaves everything else identical. `session.test.ts`'s `instantSession()` is the convention.
  Do not add a second breeding path for tests.
- **Every duration is shown as a bounded range before you commit, and never as `???`.** That is
  principle 6 of the balance charter and it is not negotiable. `describeBand` and
  `describeRemaining` exist so no screen has to format a wait by hand.
- **`gates` and the clutches they carry are saved.** `Session.toSaveFile()` / `new Session({
  restore })`, round-tripped in `save.test.ts`. A save that loses a pending clutch loses a
  decision the player made fifteen weeks ago; treat that test as load-bearing.

## Cheat mode

Name any snake **`Gregor Mendel`** and a "Lab notebook" tab appears. It acts on the live game, and
the save records that cheats were used and how often — record, don't restrict. It rides the
ordinary `FlagSet` / `UnlockRegistry` seams; there is no dev build. See `src/game/cheats.ts` and
`docs/state-of-play.md`.

## Known limitations (don't "fix" these without reading why first)

- **Linkage between loci is a declared, throwing seam, not an implemented mechanic.**
  `genetics/genotype.ts`'s `assertNoLinkage` throws on purpose if a locus declares a `linkage`
  group — implementing crossover in `makeGamete()` is real work, not a quick patch. See the primer
  and the project ladder.
- **Masking epistasis** is demonstrated only in a fictional trait (`cornSnake/fictional/umbra.ts`),
  never claimed for a real one — the research behind this project couldn't corroborate a real
  single-locus case from two independent sources.
- **Renderer ribbon shear on hard curves**: `paintRibbon` maps each texture strip affinely — one
  rotate-and-scale per spine segment — so a constant-`u` line in the texture stays square to its
  own segment instead of following the shared edge at the joint. A tight curve therefore still
  shears the markings slightly, and the fix for *that* (splitting each segment in two and shearing
  each half to its own joint) is still a future project. See the project ladder.

  What is fixed, and must not be re-broken: the strips used to be **rectangles**, which cannot tile
  a curve — they left a wedge `(w/2)·tan(Δθ/2)` deep uncovered on the outside of every bend. Each
  strip is now clipped to the **rhomboid** `left[i] → left[i+1] → right[i+1] → right[i]`, which
  works because `buildRibbon` keeps one edge point per spine point, so consecutive segments already
  share the two points at their joint and the rhomboids tile the body exactly. Measured on a
  resting coil (`/miter-probe.html`), uncovered interior area went from 1.5–2.4% to 0.15%, and at
  9x magnification 96–99% of what remains is the rounded snout bulge at spine point 0 rather than
  any joint. Worst-case texture misregistration against a ground-truth `(u, v)` ramp went from 1.7
  body-widths — a lengthwise stripe landing on the wrong side of the animal, which is what got
  reported as "is he see-through?" — to under 0.6, and it no longer grows with curvature.

  Do **not** "improve" this by mitring the edge points themselves to `width/(2·cos(θ/2))` along the
  angle bisector. That is the textbook stroke join and it was tried and reverted: it derives each
  edge point from the two raw segment directions instead of `tangentAt`'s smoothed tangent, so it
  faithfully reproduces every segment-scale kink of the slither wave as a spike. The fat hognose
  fixtures (body width 3.8× the segment length) rendered as sawblades. The gap was never caused by
  the offset distance; it was caused by `paintRibbon` ignoring the shared points it already had.
- **Genetic load is real, and `vigor` must stay a readout.** `genetics/pedigree.ts` and
  `genetics/load.ts` implement Wright's `F`, kinship and the deleterious-recessive pool; the game
  layer stores `F` and expressed load on a `SnakeRecord` at hatch. `load.ts`'s `vigor()` is display
  only, and `load.test.ts` asserts that **no file under `src/genetics/`, `src/species/` or
  `src/render/` so much as names it** — including the `genetics/index.ts` barrel. The moment
  something simulates a summary number, the summary *is* the model. Import it from
  `@/genetics/load` in the UI, never re-export it.

## Repo etiquette

- License is source-available / all-rights-reserved (`LICENSE`) — this is a public repo people can
  read, not one they can use or fork for their own project.
- No `Math.random()` in anything genetics-related — see Determinism above.
- If you land in `src/species/testSupport/referenceEngine.ts`, know that it's a self-contained test
  double built before the real `GeneticsEngine` (`src/genetics/index.ts`) was assembled, kept
  around deliberately documented as such. Don't assume it's the real engine's behavior — go check
  `genetics/index.ts` directly for that.
