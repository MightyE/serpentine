# Serpentine

A snake rehabilitation and genetics lab. You run a small sanctuary: breed snakes, study what
their offspring turn out to be, care for the ones that need extra attention, and sell or place
animals to keep the place funded. The genetics underneath it are real — not a flavor text layer
on top of random numbers, but an actual inheritance engine that computes exact offspring
probabilities the way a breeder works them out on paper, for two real species (ball python and
corn snake) plus a handful of clearly-labeled invented traits.

## Why this exists

I'm building this because I want to work with reptiles professionally, and genetics — what a
morph actually is, why "co-dominant" is the wrong word for what breeders mean by it, why a
fifty-year scientific consensus about snake sex chromosomes got overturned in 2017 — is the part
of herpetoculture I find most interesting. A game is a way to make that concrete: instead of
reading that pastel is "incomplete dominant," you breed two pastels, get a Punnett square
prediction, and watch a super pastel actually hatch out at the predicted rate.

The full biology this game models — and every place it deliberately simplifies, named
explicitly — is in [`docs/genetics-primer.md`](docs/genetics-primer.md).

## What's actually in the game

- **A collection of snakes you own**, each one drawn by a procedural renderer (not sprites — the
  visuals are generated from the animal's actual genotype) and lightly animated.
- **Spawn** a random snake, or **breed** any two compatible animals (opposite sexes, same
  species) to produce one offspring whose looks and genetics are derived from both parents.
- **A Punnett-square prediction** for any pairing you're considering — the "simulate the genetic
  outcome before you commit to it" half of the point of this project.
- **A rehab**, for animals whose real documented traits come with a real welfare consideration —
  they're residents to look after, not problems to solve.
- **A market**, for buying and selling — economy, not biology; entirely invented and documented
  as such.

Current build status — what actually works right now versus what's still being wired up — lives
in [`docs/state-of-play.md`](docs/state-of-play.md), which I keep short and current on purpose.
What's planned next, at every scale from a 30-minute change to a multi-week feature, is in
[`docs/project-ladder.md`](docs/project-ladder.md).

## Running it

```
npm install
npm run dev
```

Then open the URL Vite prints. `npm test` runs the test suite; `npm run build` typechecks and
produces a production build.

## Stack

React + TypeScript + Vite, tested with Vitest. No backend, no server — everything runs and saves
in the browser.

## License

Source-available, all rights reserved — see [`LICENSE`](LICENSE). You can read this code. You
can't use, copy, or build on it without asking me first. That's a deliberate, restrictive choice
for an early-stage personal project, not an oversight — I might loosen it later.

## About the tools I used to build this

I designed the genetics model, the trait mechanics, and the game's direction myself. I used
Claude Code as a coding assistant to implement and debug them — the way I'd use any framework or
library, except this one writes code with me instead of just being a dependency I import. Where
that mattered, I directed specific decisions (which biology to model, which simplifications were
honest to make and which weren't, what the rehab framing should and shouldn't do); where it
didn't, I let the tool move fast on plumbing so I could spend my own attention on the parts that
are actually mine. The commit history is real and reflects how this project actually got built.
