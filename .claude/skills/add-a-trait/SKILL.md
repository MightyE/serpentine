---
name: add-a-trait
description: Use when adding a new genetic trait (real or fictional) to an existing species in Serpentine — a new color morph, pattern, or invented visual trait driven by one locus. Not for adding a whole new species, and not for a trait that needs a render stage that doesn't exist yet.
---

# Add a trait

Adding a trait to an existing species (`src/species/ballPython/` or `src/species/cornSnake/`) is a
data-only change: one new file, plus two one-line edits to that species' `index.ts`. The genetics
engine (`src/genetics/`) and the renderer (`src/render/`) never mention any specific trait by
name — they only speak the generic shapes in `src/genetics/types.ts` and `src/render/contract.ts`.
Do not edit anything under `src/genetics/`, `src/render/`, or `src/game/` for an ordinary new
trait; if it seems like you need to, stop and check `src/render/registry.ts` for an existing
stage/effect first, or read `docs/add-a-trait.md` for the "if the trait needs a new render effect"
case.

## Steps

1. Create one new file under the target species' `loci/` (real trait) or `fictional/` (invented
   trait) directory. It exports:
   - A `Locus`: id, label, `placement` (`{ kind: 'autosomal' }` unless it's sex-linked), `wildType`,
     the allele(s), and an `expression` table mapping genotype → expressed value.
   - A `TraitProjection<Phenotype>`: mutates a phenotype draft based on the expressed value. Look
     at a sibling file in the same species directory for the exact `draft` shape in use there.
2. In the species' `index.ts`: add one import line for the new locus + projection.
3. In the same file: add the locus to the `loci` array, the projection to the `projections` array.
4. Run `npm run typecheck` — must be clean.
5. Add one test to the species' test file (`fictional.test.ts` for invented traits, or the
   relevant real-trait test file) asserting what the trait actually does. Run
   `npx vitest run src/species` (or `npm test` for the whole suite).

## Real vs. fictional

- **Real trait**: also add a `RealVsModeledNote` (shape in `src/species/support/traitNotes.ts`) and
  register it in that species' `xRealTraitNotes` map in `index.ts`. `realTraitNotes.test.ts`
  enforces every real trait has one.
- **Fictional trait**: mark every allele `invented: true`. Never mix a fictional allele into a
  `loci/` file or a real one into `fictional/`.

## Reference

Full walkthrough with a real worked example (Sparkle Eyes, ball python) at
`docs/add-a-trait.md` in the repo root — read that if this summary isn't enough.
