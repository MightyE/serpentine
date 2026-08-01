# Project ladder

Things you could hand to Claude Code next, roughly graded by size. Nothing here is an obligation —
pick whatever's interesting today. A rung can be a deep dive into one narrow thing; you don't have
to work your way up in order, and you don't have to touch every rung on a tier before moving to the
next one.

For "what's the one thing to do right this second," see
[`state-of-play.md`](state-of-play.md) instead — this file is the whole menu, that one's today's
pick.

## ~30 minutes

- **Add a new real trait to an existing species.** The `add-a-trait` skill
  (`.claude/skills/add-a-trait/SKILL.md`) has the exact steps and a worked example. Pastel-style
  incomplete dominance, a simple recessive, a sex-linked trait — any of the mechanisms already
  covered in [`docs/genetics-primer.md`](genetics-primer.md) is a good next one to try by hand.
- **Add a fictional trait just because it'd be delightful.** Same steps, `invented: true` on the
  alleles. Doesn't have to be biologically real — some of the existing ones (Prism Belly, Party
  Confetti) exist purely because they're fun to look at.
- **Tune a balance number and update its invariant.** Pick a constant in `src/game/tuning.ts`,
  change it, watch `tuning.test.ts` tell you which design property moved, and decide whether you
  agree with the new number. If you do, update the invariant and log two sentences in
  `docs/balance-charter.md`'s decision log.

## Half a day

- **A new species.** Copy `src/species/ballPython/index.ts` as your template. Pick a real snake
  with genuinely different genetics from the two already here — a species that's XY vs. ZW like
  the current pair already contrasts, or one with a real trait mechanism (say, true co-dominance,
  or a documented masking-epistasis case, if you can corroborate one from two independent sources)
  that isn't demonstrated yet.
- **Write the pairing-compatibility UI edge cases** — what the game actually shows when a pairing
  is refused (wrong species, same sex), and make the reason as legible as the genetics primer's
  writing style.

## Multi-day

- **Linkage between loci.** The seam is real and already declared —
  `src/genetics/genotype.ts`'s `assertNoLinkage` throws on purpose if a locus declares a `linkage`
  group, specifically so nothing ships half-working. Implementing it means teaching
  `makeGamete()` about crossover: two loci on the same chromosome should usually travel together
  into a gamete, with some probability of recombining apart. This is the honest mechanism behind
  "rare traits carry problems" that isn't founder effect or pleiotropy (see the primer's section
  on that) — a genuinely meaty thing to build and to write about, and a real building block for
  anyone doing quantitative genetics later.
- **Fix the renderer's ribbon-shear on hard curves.** `paintRibbon` maps texture strips affinely
  per spine segment, so a tight enough curve shears the markings slightly — invisible at default
  settings, visible if `turnRate` or `pointCount` get pushed. A good project for actually
  understanding how the ribbon renderer works end to end before changing it.
- **Tamper-evident share codes.** You wanted every snake to get a shareable code — the design
  reasoning (what's honestly achievable, what a "friction not security" client-side scheme looks
  like, base62 vs. base32/64 and why the difference matters for opacity) is written up in the
  cycle notes; ask Claude Code to find and summarize
  `future-share-codes.md` from this project's design history if you want the full writeup before
  starting. Touches byte packing, base conversion, and the honest limits of client-side security —
  the goal is deterring casual poking by friends who know some JavaScript, not real security, and
  the docs for this feature should say that plainly rather than overclaim.

## Multi-week

- **Pedigree tracking, inbreeding coefficient, and genetic load.** Designed but not built — see
  the primer's section on it and `docs/balance-charter.md` principle 3. The `Individual` type
  already carries `parents`, so the pedigree spine exists; this is about walking it to compute
  Wright's `F` to a bounded depth, seeding founders with a pool of hidden deleterious alleles
  (reusing the existing het/carrier machinery), and surfacing a friendly "vigor" readout that's
  purely derived, never simulated. This is the biggest, most interesting single piece of
  unbuilt biology in the project, and it's the thing that makes line-breeding a real tradeoff
  instead of a one-way ratchet.
- **The progression / talent-tree system.** `src/game/seams.ts` deliberately builds only the
  plumbing — a flag set, an unlock registry, an event bus — and nothing on top. This is
  intentionally left as your design, not something built for you: what unlocks what, what a
  "talent" even is in a genetics-lab game, what the arc of a whole playthrough feels like. Start
  by reading `seams.ts`'s own doc comment for how the three pieces are meant to compose.
- **Full playability** — economy tuning beyond the current invented curve, market UI polish,
  a care/husbandry system with real depth, actual rehab mission content. Any one of these could be
  its own multi-week arc; pick the one that's calling to you rather than trying to do all four.
