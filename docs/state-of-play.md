# State of play

**Right now:** the game runs, and it runs **on a clock made of turns**. `npm run dev` opens a rehab
with four founding animals in it; you can open any snake's card, pair two, read the Punnett
prediction *before* committing, wait out the pairing and the incubation, hatch a baby whose look
derives from its parents, watch it grow up, and sell it.

The three time gates are live: a pair takes 1–6 weeks to produce a clutch, a clutch takes 8–9 weeks
to hatch, and a hatchling takes 34–78 weeks (male) or 104–156 (female) to reach breeding age. Every
one of those ranges is on screen before you commit, the strip under the header counts down whatever
is in flight, and **nothing runs while the tab is closed** — time moves when you move it. "Next
decision" skips to the exact week the next thing arrives, so a fifteen-week generation costs four
clicks rather than fifteen. The genetics engine, three species (ball
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
a random or a designed animal, reveal every true genotype, force a mutation, re-roll a clutch under
a seed you choose, and jump a lineage forward a generation.

Three of the entries are there to get you past the time gates, which is the whole reason the door
exists — an outlet for impatience that never requires editing a constant:

- **Mature everything, now** resolves every pending gate *where it stands*. The gates happen; they
  are not thrown away, so a clutch mid-incubation hatches rather than vanishing.
- **Skip the next wait** resolves only the thing due soonest and leaves the rest ticking.
- **Turn the waiting off** flips the whole session to instant gates, and back. Every gate still
  exists and still publishes its range; it simply costs zero weeks.

Two things worth knowing about how it is built:

- It acts on **your live game**, not a copy. A sandbox that cannot touch the real game cannot be
  used to test the real game, and testing the real game is the only reason it exists.
- The save records **that** you used cheats and **how many times** — and nothing else changes.
  Nothing is blocked afterwards. Record, don't restrict.

The unlock rides the ordinary `FlagSet` and `UnlockRegistry` in `src/game/seams.ts`; there is no
dev build and no secret query string. See `src/game/cheats.ts`.

## Known gaps, written down so they don't get rediscovered

- **The breeding season is a constant nobody reads.** `BREEDING_SEASON_FIRST_WEEK` and
  `LAST_WEEK` exist in `tuning.ts` and no code consults them, which by the balance charter's own
  reasoning makes today's incubation *variance* decoration: with no window to miss, it makes no
  difference whether the eggs hatch in week 8 or week 9. The gates still earn their keep without it
  (a committed female is a real opportunity cost), but either implement the window or simplify
  `INCUBATION_WEEKS` to one number — don't leave it half-built.
- **A save does not carry the player's evidence.** `SaveFile` round-trips the roster, the flags,
  the store floor and every in-flight gate, but `Session.evidence` — the gene tests you paid for
  and the parentage you observed — is rebuilt from nothing on load, so belief resets to what can be
  inferred from appearance alone. Same shape of bug as a lost clutch, and not yet fixed.
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
