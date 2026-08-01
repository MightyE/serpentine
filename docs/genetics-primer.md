# The genetics primer

What this game's engine actually models, the real biology behind it, and — named explicitly,
every time — where the model simplifies. Written at "bright 11th-grader who already knows what a
Punnett square is" level, not "intro biology."

Two species ship right now: **ball python** (`src/species/ballPython/`) and **corn snake**
(`src/species/cornSnake/`). Every claim below about a specific locus is checked against the code
that implements it — the file path is next to each one so you can go verify it yourself.

## Alleles, loci, and how a genotype becomes a snake

A **locus** is a location on a chromosome. An **allele** is one version of what's at that
location. Every snake in this game carries two alleles at each locus — one from its mother, one
from its father — and that pair is its **genotype** at that locus. What you actually *see* is the
**phenotype**, and going from genotype to phenotype is most of what `src/genetics/` does.

The engine (`src/genetics/expression.ts`) turns a genotype into a phenotype in ordered stages —
base color, then trait projections, then modifier rules. Nothing about a snake is hard-coded into
that pipeline. `src/species/` is data: a list of loci, and a function per locus saying what each
genotype at it does to the phenotype. That's the whole reason adding a trait is a data change, not
an engine change — see [`add-a-trait.md`](add-a-trait.md).

## Inheritance patterns, with real examples

### Simple recessive

One "off" allele does nothing when paired with a normal one; two copies produce the visible trait.
**Albino** in ball pythons (`ballPython/loci/albinoComplex.ts`) and **amelanistic** in corn snakes
(`cornSnake/loci/amelanistic.ts`) both work this way. An animal with one copy is a **het** —
phenotypically normal, genetically carrying it.

### Incomplete dominance (not "co-dominant")

The hobby calls traits like **pastel** and **champagne** "co-dominant." That's the wrong term, and
this project uses the correct one throughout: **incomplete dominance**. True co-dominance means
both alleles are visible *separately and simultaneously* — human AB blood type is the textbook
case, where a person genuinely has both A and B antigens, not a blend. What pastel actually does is
different: one copy gives a distinct look, two copies give a *further*, distinct look ("super
pastel"). That's a blended/graded response to dose, which is incomplete dominance, not
co-dominance. You'll hear "co-dominant" from every breeder you talk to — it's not worth arguing
with them about it, but know which word is which. `pastel.ts` and `champagne.ts` both document
this explicitly in code.

### Dominant, no super form

**Pinstripe** (`ballPython/loci/pinstripe.ts`) shows fully with one copy, and a second copy adds
nothing visibly different. Not every dominant trait has a "super" version — that only happens when
the gene product does something dose-dependent.

### Multi-allele series

The blue-eyed-leucistic complex — **lesser, mojave, butter, russo, phantom**, and others — isn't a
set of independent on/off switches. It's *one locus* with several possible alleles, capped at two
per animal (`ballPython/loci/belComplex.ts`, `BEL` = "blue-eyed leucistic"). Modeling these as
independent booleans would let the engine generate genetically impossible offspring, so it's
built as a real multi-allele pair instead. This is a harder data structure than a simple
recessive, and it's the right one.

### Polygenic (line-bred) traits

**Piebald white percentage** (`ballPython/loci/piebald.ts`) isn't one gene with two states — it's
a continuous value that real breeders push up over generations by selecting for more white each
clutch. The engine models this as a numeric trait that drifts toward the average of the parents'
values (with some spread), which is the actual mechanism of line-breeding: not a single locus
flipping, but a population's average shifting.

### Sex-linked

**Coral Glow** (and its allelic partner Banana) is a real, named ball python color trait carried
on the **Y chromosome** (`ballPython/loci/coralGlow.ts`). Because it's Y-linked, it can only ever
pass from father to son — a female ball python cannot carry it. That's not a game rule; it's where
the gene physically sits.

## Sex determination: this is where a fifty-year consensus got overturned

For roughly fifty years, herpetology's working assumption was that **all snakes are ZW**, meaning
females carry two different sex chromosomes (Z and W) and are the heterogametic sex, while males
are ZZ. That held for corn snakes and every other colubrid tested.

**In 2017, Gamble et al., published in the peer-reviewed journal *Current Biology*, showed that
pythons and boas are XY** — the opposite system, with males heterogametic (XY) and females XX —
and that this XY system evolved *independently* in pythons/boas rather than being inherited from a
shared snake ancestor. That means two lineages of snake, both very much "snakes" to a casual
observer, run on genuinely different sex-determination machinery, and the textbook answer was
wrong for over half the family tree until relatively recently.

**Ball python: XY, males heterogametic.** `src/species/ballPython/sexSystem.ts`.
**Corn snake: ZW, females heterogametic.** `src/species/cornSnake/sexSystem.ts`.

Do not merge these. "Snakes are ZW, so the ball python's Y-linked Coral Glow trait is really
Z-linked" is a sentence that manages to be wrong about both species at once. The engine takes sex
determination as **declared per species** — `src/genetics/genotype.ts` implements XY and ZW as the
same mechanism (a locus lives on a chromosome; whichever chromosome copy a gamete carries, that
locus rides along with it) with no `if (isPython)` anywhere. Neither system is privileged, which is
the only way to be honest about the fact that both are real.

## "66% possible het" — the probability lesson wearing breeder clothes

Breed two animals that are each **het** for the same recessive trait. Ordinary Mendelian ratios
say the offspring split **25% visual : 50% het : 25% normal**. If the trait isn't visible in
"normal"-looking offspring, here's the catch: you can *see* the 25% that are visual, but the other
75% all look identical to you. Among that invisible 75%, two-thirds are secretly het and one-third
is genuinely clear. That's where "66% possible het" comes from — it's the standard breeder phrase
for **P(het | doesn't look visual)**, and it's genuine conditional probability, not marketing.

This is exactly why a gene test (or a "prove it out" breeding — see below) is worth money: it
collapses that 66%-vs-34% uncertainty into a certainty.

`src/genetics/knowledge.ts` computes this rigorously and generally, for any locus, any pairing, any
amount of evidence — not just the classic 66% case. It runs exact Bayesian inference by
enumerating every genotype an animal could have, weighting each by its prior probability and by
how well it explains everything you've observed (its own appearance, its parents, and what its
offspring looked like), then renormalizing. The save file only ever stores *evidence* ("these were
its parents," "it produced this offspring") — never a stored probability — so a bug fix to the
inference logic corrects every existing save automatically, and a belief can never drift out of
sync with the facts underneath it.

## How a new morph actually gets proven out

A named morph almost always starts the same way in real herpetoculture: one animal hatches looking
different, somebody notices and keeps it, and the ratios from subsequent breedings reveal what
they've got.

- **Dominant** trait: breed the oddball to a normal. If roughly half the offspring show it
  immediately, it's dominant — one copy is enough.
- **Recessive** trait: breed the oddball to normals first. Nothing shows in that first generation
  (F1) — every offspring is a het, invisibly. Pair two F1 offspring together, and roughly 25% of
  *that* generation shows the trait. That two-generation wait, and the ratio when it finally
  appears, is the tell.

Real case: the piebald trait in ball pythons was proven recessive this way, formally documented by
1998. `src/genetics/mutation.ts` models the *first* half of this loop — the moment a novel allele
appears — and `knowledge.ts` models the second half, a player accumulating evidence until they know
what they're holding. One honest simplification, stated in `mutation.ts`'s own doc comment: real
per-locus mutation rates are around 10⁻⁸ per generation. At that rate nobody playing a game would
ever see one happen. The mutation rate here is a *game* number, deliberately millions of times too
high, so that discovering a new morph is a thing that can plausibly happen to you.

## Lethal genotypes: an egg that doesn't hatch, never an animal that dies

Some real homozygous forms don't survive to hatch. **Super champagne** — two copies of the
champagne allele — is the flagged example here, and it's real: breeders are told never to pair
champagne to champagne, because the egg won't make it. This game models that exactly, and only
that: `champagneLethalRule` in `ballPython/loci/champagne.ts` marks the two-copy genotype as
non-viable. When it comes up, the game reports **an egg that did not hatch, with the actual
genetic reason stated as a fact** — never an animal being harmed, dying, or culled. No code path
in this repository kills, harms, or disposes of a living snake. This isn't a euphemism layered
over a harsher simulation underneath; there's no "death" mechanic to euphemize. The rule *is* "this
egg does not develop," full stop, because that's what the biology actually is.

## Welfare, honestly, in both directions

Some real ball python morphs carry documented health effects in *living* animals, and this is a
different category from a lethal genotype — the animal exists and needs consideration, it isn't
absent. The clearest documented case is the **spider** morph's "wobble": a real, peer-reviewed
central-nervous-system/vestibular effect, ranging from barely noticeable to significant, that
appears to be caused by the spider allele itself rather than by inbreeding or incidental factors.
It's genuinely controversial — the International Herpetological Society banned the sale of spider
morphs in 2018 over it, while plenty of experienced keepers argue mild cases don't meaningfully
affect quality of life and that morphs with similar signs (woma, champagne, hidden-gene woma,
super sable, powerball) shouldn't all be treated identically. Both positions are represented in
current breeder and welfare discussion; this game doesn't take a side on which morphs should exist
— it takes the side that if an effect is real, an honest model says so.

This project doesn't ship a spider locus specifically, but it applies the same idea to
**champagne**: heterozygous champagne is documented with wobble-like neurological signs in some
individuals (see the note in `champagne.ts`), so a champagne het in this game is flagged
`needsExtraCare` (`src/game/rehab.ts`) — it becomes a resident the rehab looks after, not a problem
to be gotten rid of. That's the entire welfare mechanic: `rehab.ts` never asks *why* an animal
needs care, it just reads a tag that content sets, which keeps the judgment call about which real
traits carry which real effects in the data (checkable, arguable, correctable) rather than buried
in game logic.

## Inbreeding, genetic load, and vigor — the real biology, and current build status

**This is the one section of the primer describing biology the engine does not yet implement.**
The design is decided (`docs/balance-charter.md`, principle 3) and it's a strong project-ladder
candidate — see [`project-ladder.md`](project-ladder.md) — but as of this writing there is no
pedigree, inbreeding-coefficient, or genetic-load code in `src/`. The biology is real regardless of
build status, and it's worth understanding now so the eventual build makes sense.

Every population carries **deleterious recessive alleles** — genes that do nothing when masked by
a normal copy, and cause a real problem only when an individual inherits two copies. On their own
these are invisible; they're mechanically the same kind of thing as a het (see the 66%-het section
above), just for a trait nobody wants.

Relatives are likely to carry the *same* deleterious alleles, because they share ancestors. Breed
two relatives, and you raise the odds their offspring inherits two copies of the same one. This is
**inbreeding depression**, and the standard way to measure exposure to it is **Wright's inbreeding
coefficient, F** — the probability that an individual's two alleles at a locus are identical by
descent (literally, the same physical copy of DNA, inherited twice through two different paths
back to a shared ancestor), computed from the pedigree.

The fix — and this is the part that makes it a good game mechanic, not just a good biology
lesson — is **outcrossing**: pair into an unrelated line, and the different deleterious alleles
each parent carries essentially never match up. `F` collapses in a single generation, and the
recovery is real, not a gradual grind. That creates the actual dilemma working breeders live with:
line-breeding is how you *fix* a desirable trait, and it's also how you accumulate `F`. Push a line
hard enough toward a look, and you eventually have to decide when to spend a generation outcrossing
to buy vigor back.

One vocabulary note that matters if this is ever shown to a working breeder or a biologist: the
right words are **genetic diversity**, **heterozygosity**, and **inbreeding coefficient**. Avoid
"strong genes" / "weak genes" — that framing describes homozygosity at specific harmful loci, not
some general quality of an animal's genes, and it sits uncomfortably close to language that has a
real, ugly history when applied to living things. "Vigor" is fine as a friendly, *displayed* number
once this is built — the engine's job is to track `F` and load honestly; vigor is just how it gets
shown to a player.

### Three reasons rare morphs are associated with problems — and they are not the same mechanism

It's a real, common observation that rare/valuable morphs seem to run into more health problems.
That's true, but it's three distinct mechanisms, and conflating them is the single most common
error in casual discussion of morph welfare:

1. **Founder effect.** A new morph starts from *one* animal. Making more of them necessarily means
   breeding its descendants to each other for a while, which concentrates `F` around that whole
   sub-population — not because the trait is bad, but because rarity itself forces inbreeding. This
   falls straight out of the pedigree math once it's built; no special rule needed.
2. **Pleiotropy.** Sometimes the trait-causing allele *itself* directly causes the problem — spider's
   wobble is the standard real example. The trait and the health effect are the same gene, not two
   separate things that happen to travel together.
3. **Linkage.** A harmful allele can sit physically close to a desirable one on the same
   chromosome and get dragged along whenever you select hard for the desirable one. This is real,
   well documented in domesticated species generally, and it's the one of the three this engine
   deliberately left a seam for but does not implement — see the next section.

What's explicitly **not** true, and not modeled: an allele degrading or "wearing out" from being
bred a lot. Alleles don't change from use — a pedigree narrows around them, which is mechanism 1,
not the allele itself getting worse. That would be simple to write and would teach something false.

## The linkage seam: real, declared, and deliberately not implemented

Two loci on the *same* chromosome, physically close together, don't assort independently — they
tend to travel together into a gamete unless a crossover happens between them ("recombination").
Right now, every locus in this engine that isn't sex-linked is treated as independent
(`src/genetics/genotype.ts`'s `assertNoLinkage` actively **throws** if a locus declares a
`linkage` group, specifically so nobody ships something that silently doesn't do what its data
claims). The type for declaring a linkage group already exists in `genetics/types.ts` — the seam is
real, not hypothetical — but the actual crossover mechanics inside gamete formation aren't built.
This is the honest mechanism behind "rare traits carry problems" (mechanism 3, above), and it's on
the project ladder.

## Masking epistasis: demonstrated, not claimed as real

One allele's effect can hide (mask) another's — real and well documented in general genetics.
This project's research could **not** independently corroborate a true single-locus masking
epistasis case in ball pythons or corn snakes specifically from two independent sources, so no
*real* trait here is labeled as masking epistasis. The engine supports the mechanism (it's needed
for the render pipeline regardless, and albino-strips-melanin-style interactions are real), and
it's demonstrated with a clearly-labeled **fictional** corn snake trait, `umbra`
(`cornSnake/fictional/umbra.ts`), rather than asserted about a real gene on the strength of one
source.

## What's fictional in this game, and why that's fine

Every species ships a handful of invented traits (`ballPython/fictional/`,
`cornSnake/fictional/`) — Glimmer, Empath, Prism Belly, Sparkle Eyes, Pulse-Glow, Umbra, Party
Confetti. Every allele in these files is flagged `invented: true` in code, and every real trait
carries a `RealVsModeledNote` (`src/species/support/traitNotes.ts`) stating explicitly what's real
about it and what's simplified — checked by `realTraitNotes.test.ts` so a note can't quietly go
missing. Nothing fictional is presented as a real morph anywhere in the UI or the data; that
boundary is load-bearing for this whole project's credibility, and it's tested, not just intended.

## Every simplification named, in one place

- **Mutation rate** is millions of times higher than real per-locus rates (`mutation.ts`) — a game
  number, stated as such.
- **Piebald white percentage** models line-breeding as drift-toward-parents'-average, a real
  mechanism but a simplified one — it doesn't model the actual number or interaction of underlying
  polygenes, because nobody knows what those are yet in reality either.
- **The BEL complex** is capped at two alleles per animal (correct — it's one locus) but the
  specific claim that lesser and butter are *genetically distinct* alleles rests on a single
  source and is flagged as a caveat in code (`belNote`), not asserted as settled.
- **Masking epistasis** is demonstrated only fictionally, not attributed to any real trait (above).
- **Inbreeding, genetic load, and vigor** are designed but not yet built (above) — described here
  as real biology, not as a shipped feature.
- **Linkage** is a declared, throwing seam, not an implemented mechanic (above).
- **The economy** (prices, market) is entirely invented and documented as such in `economy.ts` and
  `market.ts` — it makes running a facility feel real; it is not a claim about what any actual
  snake costs.
- **Kinking and similar developmental outcomes** are not purely genetic in reality — incubation
  conditions matter too. Any future model of these should include an environmental contribution,
  not attribute them to genotype alone.
