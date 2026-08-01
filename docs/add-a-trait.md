# Add a trait

End-to-end steps for adding a new genetic trait to an existing species. This is the whole
recipe — no engine changes, no render changes, one new file plus two one-line edits to a species'
`index.ts`. It's been done for real once already (Sparkle Eyes, ball python) to make sure these
steps are actually correct and not aspirational; see the worked example at the bottom.

If you want a **new species** instead of a new trait on an existing one, that's a bigger job —
copy `src/species/ballPython/index.ts` as your starting point and read its file comment first.

## The mental model

A species (`src/species/ballPython/index.ts`, `src/species/cornSnake/index.ts`) is a plain data
object: a list of loci, and a list of functions ("projections") that each say what one locus's
genotype does to the phenotype. The genetics engine (`src/genetics/`) and the renderer
(`src/render/`) never mention any specific trait by name — they only know about the generic shapes
in `src/genetics/types.ts` and `src/render/contract.ts`. Adding a trait means writing one new file
that speaks those generic shapes; you never touch the engine or the renderer to do it.

## Steps

1. **Create one new file** under the species' `fictional/` or `loci/` subdirectory — e.g.
   `src/species/ballPython/loci/yourTrait.ts` for a real trait, or
   `src/species/ballPython/fictional/yourTrait.ts` for an invented one. It exports two things:
   - A `Locus` — id, label, `placement` (`{ kind: 'autosomal' }` for an ordinary trait, or the
     sex-linked form if you're modeling something like Coral Glow), `wildType`, the allele(s), and
     an `expression` table saying what each genotype produces.
   - A `TraitProjection<Phenotype>` — a function that takes a phenotype-in-progress (`draft`) and
     the locus's expressed value, and mutates the draft. Look at an existing file in the same
     species for the shape of `draft` (e.g. `draft.eye.sizeScale`, `draft.effects.push(...)`) —
     it's whatever the renderer's `Phenotype` type in `src/render/contract.ts` exposes.
2. **Import it in the species' `index.ts`** — one import line for the locus and its projection
   (and its note, if it's a real trait — see the callout below).
3. **Register it** in the same file — add the locus to the `loci` array and the projection to the
   `projections` array. One line each.
4. **Typecheck.** `npm run typecheck` (or `npx tsc --noEmit`). Should be clean.
5. **Test it.** Add one test to the species' `fictional.test.ts` or a real-trait test file
   asserting what the trait actually does (e.g. "one copy of the allele scales the eye up"), then
   `npx vitest run src/species` (or just `npm test` for everything).

That's it. Every file touched is under `src/species/`. Nothing in `src/genetics/`, `src/render/`,
or `src/game/` should need to change for an ordinary new trait.

## If the trait is real, not invented

Add a `RealVsModeledNote` alongside it (see `src/species/support/traitNotes.ts` for the shape —
two strings: what's real about the trait, and what this game simplifies or gets exactly right
about it), and register it in the species' `xRealTraitNotes` map in `index.ts`. `realTraitNotes.test.ts`
checks that every entry is non-empty and points at a real locus — it will fail loudly if you forget
this, which is the point. If the trait is invented, mark every one of its alleles `invented: true`
instead, and it goes in `fictional/`, not `loci/`.

## If the trait needs a new render effect

Most traits reuse an existing render stage or effect (`solid`, `blotches`, `bands`, `belly`,
`piebald`, `albino`, `patternReduction`, or the effects registry — `iridescent`, `glow`,
`glitter`). If you genuinely need a new visual stage that doesn't exist yet, that's a `src/render/`
change and is out of scope for this cookbook — check `src/render/registry.ts` for what's already
registered before assuming you need something new.

## Worked example: Sparkle Eyes (ball python, fictional, dominant)

Performed for real, not hypothetical:

1. One new file, `src/species/ballPython/fictional/sparkleEyes.ts`, exporting a `Locus` (id,
   label, `placement: { kind: 'autosomal' }`, `wildType`, two alleles, a `table` `ExpressionRule`)
   and a `TraitProjection<Phenotype>` that mutates `draft.eye.sizeScale` when the trait value is
   `true`.
2. In `src/species/ballPython/index.ts`, one import line for the new locus + projection.
3. In the same file, the locus added to `loci`, the projection added to `projections` — one line
   each.
4. `npx tsc --noEmit` — clean.
5. One test added to `src/species/fictional.test.ts` asserting the eye scales up with one copy;
   `npx vitest run src/species` — passes.

One new file, two one-line edits. Everything else was verification.
