# State of play

**Right now:** the genetics engine, both species (ball python, corn snake), and the renderer are
built and tested (`npm test` — 218 passing). `src/ui/` — the actual screen you'd play the game on —
isn't wired up yet, so `npm run dev` / `npm run build` won't work until that lands.

**Do next:** once `src/ui/` exists, run `npm run dev`, spawn a snake, breed a pair, and check that
a Punnett-square prediction shows up before you commit to the pairing. If all three work, pick
anything off [`project-ladder.md`](project-ladder.md).

Full menu of what to do next: [`project-ladder.md`](project-ladder.md). The biology being modeled:
[`genetics-primer.md`](genetics-primer.md).

*Update this file at the end of every session — one current pointer, nothing else.*
