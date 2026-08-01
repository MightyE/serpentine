/**
 * The real-vs-modelled note every real trait must carry.
 *
 * This is the intellectual backbone of the content in this directory: a short, specific,
 * honest statement of what the real biology does and what shortcut the game takes. It is not
 * decoration — `realTraitNotes.test.ts` asserts every real trait has one, and a docs agent
 * downstream surfaces these to the player.
 *
 * Keyed by `LocusId` (or, for the polygenic white-percentage trait, by its `TraitKey`) so a
 * species' `index.ts` can assemble one map per species without repeating the note next to the
 * locus itself.
 */
export interface RealVsModeledNote {
  /** What the real animal's biology actually does. Cite the mechanism where known. */
  readonly real: string
  /** What this game's model does instead, and why the difference is safe to teach with. */
  readonly modeled: string
}

/** A note keyed by locus (or polygenic trait) id, ready to merge into a species' content map. */
export type RealTraitNotes = Readonly<Record<string, RealVsModeledNote>>
