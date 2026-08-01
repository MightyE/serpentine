# State of play

**Right now:** the game runs. `npm run dev` opens a rehab with four founding animals in it; you
can open any snake's card, pair two, read the Punnett prediction *before* committing, hatch a
baby whose look derives from its parents, and sell it. The genetics engine, three species (ball
python, corn snake, hognose), the renderer with life stages, and the balance invariants are all
built and tested (`npm test`).

**Do next:** pick anything off [`project-ladder.md`](project-ladder.md). The two things a fresh
pair of eyes will notice first are that a hatchling has to be looked up on its card to find out
anything about it (there's no reveal moment yet), and that the market is a list rather than a
place.

## The cheat mode

There is one, it is an easter egg, and since you are the person building this game you should know
where the door is.

**Name any snake `Gregor Mendel`.** A "Lab notebook" tab appears in the nav. From it you can spawn
a random or a designed animal, reveal every true genotype, mature everything instantly, force a
mutation, re-roll a clutch under a seed you choose, and jump a lineage forward a generation.

Two things worth knowing about how it is built:

- It acts on **your live game**, not a copy. A sandbox that cannot touch the real game cannot be
  used to test the real game, and testing the real game is the only reason it exists.
- The save records **that** you used cheats and **how many times** — and nothing else changes.
  Nothing is blocked afterwards. Record, don't restrict.

The unlock rides the ordinary `FlagSet` and `UnlockRegistry` in `src/game/seams.ts`; there is no
dev build and no secret query string. See `src/game/cheats.ts`.

## Known gaps, written down so they don't get rediscovered

- **Tier 4 of the rarity table is arithmetic, not content.** It assumes three independent simple
  recessives in one species; ball python ships two and corn snake ships two. Adding one more
  recessive anywhere makes tier 4 reachable, and `tuning.test.ts` already measures this.
- **Market saturation is per phenotype and recovers 40%/year**, so rotating five or so morphs
  never saturates any of them — the runaway loop the charter's principle 5 guards against
  reappears one level up. The right fix is to model a multi-morph rotation before patching
  anything; patching an unmodelled runaway is how you get a second one.
- **`src/game/progression/tuningProposals.ts` is a re-export shim.** Its constants now live in
  `tuning.ts`. Repoint `src/habitat/`'s two imports and delete the shim.

Full menu of what to do next: [`project-ladder.md`](project-ladder.md). The biology being modeled:
[`genetics-primer.md`](genetics-primer.md).

*Update this file at the end of every session — one current pointer, nothing else.*
