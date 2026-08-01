# Economy and storefront design

The loop is **buy → breed → sell → upgrade**, and the reason it holds together is that every arrow
points back at the genetics. This document says how.

It is written against [`balance-charter.md`](balance-charter.md) and does not diverge from it
anywhere. Where it disagrees with a *number* in `tuning.ts` rather than a principle, it says so out
loud — see [Where this design pushes back](#where-this-design-pushes-back). Proposed constants live
in `src/game/progression/tuningProposals.ts`, staged for a merge into `tuning.ts`.

---

## 1. The rescue storefront

### The facility comes in rooms, not slots

You do not buy a seventh rack. You rent a bigger room.

Each facility tier is a step change in space with a step change in cost — a spare bedroom, a
garage, a converted unit, a small commercial space — and the steps get about 2.5× steeper each
time. That shape is doing a specific job, explained in
[Where this design pushes back](#where-this-design-pushes-back): it keeps space genuinely scarce at
year twenty, not just in week one, which is what charter principle 7 needs in order to keep
working.

### Enclosures: four types, and deliberately not a ladder

| Type | Footprint | Holds | Feature slots | Rendered |
|---|---|---|---|---|
| Rack slot | 1 | 4 hatchlings/juveniles | 0 | no |
| Tub | 1 | 1 | 1 | yes |
| Vivarium | 2 | 1 | 3 | yes |
| Display habitat | 4 | 1 adult | 6 | yes |

A rack is the best capacity per pound in the game and always will be. A display habitat is where
the renderer actually shows you an animal in a place, and the only kind of enclosure where
provisions do much. **Throughput versus the thing you built the game to look at** is the
storefront's core tension, and neither answer is wrong — which is exactly what charter principle 4
asks for. A pure-rack operation out-earns a pretty one; a pure-display operation is nicer to spend
time in and gets better sponsorship. Most players will run both and move animals between them,
which is also what real breeders do.

This is the same tension the rehab creates, in a different currency. That rhyme is intentional.

### Enclosure size, type, and features are one axis, not three

Eric named four upgrade axes — number, size, type, features. In the model they collapse to two:

- **Footprint and capacity** are what "size" and "number" mean once space is the scarce thing. A
  vivarium is a tub that costs two slots. That is the entire difference, mechanically.
- **Type is a feature-slot count plus a life-stage restriction.** A rack takes no features; a
  display takes six.

Collapsing them is what keeps the storefront legible. Three separate ladders would need three
separate explanations and would give the player three shallow decisions instead of one real one.

### Provisions: features and biomes share one model

This is the part that matters most for the habitat work, which has not been built yet.

**A biome is a bundle of provisions. A feature is a single provision.** Same type, same axes, same
effects channel, same render hook. Two systems here would have been the obvious mistake — the
habitat renderer would have had two lists to read and the game two numbers to compute, and they
would have disagreed within a month.

A provision declares what it supplies across six axes — `humidity`, `thermalGradient`, `cover`,
`climbing`, `substrateDepth`, `enrichment` — plus a cost, an upkeep, a feature-slot cost, and the
render layers it contributes. A species (and an individual needing extra care) declares a
requirement profile over the *same* six axes. Match quality is the comparison. One number, computed
from published components, each shown broken out — charter principle 6 satisfied, because it is
arithmetic you could reproduce on paper.

**Baseline is fully adequate.** A plain tub with a hide and correct temperatures meets every
requirement. Provisions above baseline earn you something; the game simply **refuses** a placement
that would fall below baseline rather than accepting it and quietly harming an animal.

That is a tone decision with teeth, and husbandry is exactly where it would be easiest to break by
accident. Nothing in this repo models an animal suffering. Husbandry here is a bonus system, never
a penalty system: *the game never lets you house an animal badly. It lets you house it plainly.*

What a good match actually does, all bounded and all published:

- Shortens the receptivity window within its already-published range — a **scheduling** benefit, the
  only kind of time benefit charter principle 1 permits anyone to sell.
- Raises resident support (a visibly well-run sanctuary attracts sponsors — this is how real
  sanctuaries work), capped so a resident stays net-negative.
- Offsets part of the extra-care multiplier for a resident who needs it.

It does **not** touch hatch rate, clutch size, or anything genetic. Hatch rate has exactly one job
in this game and that job is genetic load; the moment husbandry can move it, inbreeding depression
becomes invisible and the best mechanic in the design stops teaching anything.

---

## 2. The economy

### What sets a snake's price

Four terms, all of them real, all of them visible:

```
price = base(rarity tier) × saturation(phenotype) × vigor × proof
```

- **Rarity tier** is Mendelian arithmetic, not a label someone assigned. A tier is *the pairing you
  would actually make* and the probability it gives you the animal you want (`RARITY_TIERS` in
  `tuning.ts`). Making something rarer means moving it to a different tier, not editing a number.
- **Saturation** is the sink. A morph's price halves for every `SATURATION_HALFLIFE_SALES` of it
  that reach the market, recovering `SATURATION_RECOVERY_PER_YEAR` annually as animals get sold on
  and keepers come and go. This is the charter's chosen bound on compounding and it is not up for
  renegotiation here — it is *true* (it is what happened to ball python morph prices), it bounds the
  loop as hard as a care tax would, and its answer to "how do I earn more" is **"find something
  new"**, which points straight back at the genetics.
- **Vigor** — the friendly readout over `F` and expressed genetic load. A rare animal out of a
  narrow line is genuinely worth less than the same morph out of a diverse one, because a buyer of
  breeding stock cares. This is what gives fixation-versus-vigor an economic edge instead of leaving
  it as flavour.
- **Proof** is the term worth dwelling on. A 66% possible het sells for about 66% of a proven het,
  with a small extra haircut for the uncertainty itself. That is honest — it is what the buyer is
  actually getting — and it makes the game's central reward *also* the thing that pays. Information
  is the reward (principle 2), and information is what you sell.

### Where money comes from, and where it goes

**In:** animal sales (saturating), rehab support per resident (bounded by capacity, and
deliberately less than what a resident costs), placement fees.

Every income source has a saturation or capacity term. That is principle 5 stated as a rule rather
than a hope: an income line with no such term is a runaway loop waiting to be found.

**Out:** facility tier upgrades, enclosures, per-slot upkeep, resident care, and purchasables.

**The rehab is a mission, not a tax, and the mechanism is arithmetic.** Support very nearly covers
care, so what a resident actually costs you is *the slot* — the enclosure, and the breeding female
you did not put in it. Capacity, never conscience. The margin is small and deliberate, and both the
talent tree's tuning bands and the husbandry bonus are carved out of it, with a test asserting a
resident stays net-negative at every reachable combination. That test exists because the first
draft of the talent bands broke it: a support ceiling and an upkeep floor, each safe alone, together
made rescuing animals profitable.

### Progressive difficulty, gating increasingly valuable rewards

The gate is **genetic and reputational, never money and never time.**

Better stock appears in the shop as reputation rises, and reputation comes from what you have
*produced, proven, and placed* — a novel phenotype (first time only; repeats award nothing), a locus
proven by test breeding, a resident rehomed, an allele discovered. You cannot buy your way to better
stock. This is what stops money from being the only axis in the game.

Each tier of stock is a step change in what you can attempt, and the step is paid for with a
**project** rather than with repetitions. That is the ladder:

| Stage | What you can attempt | What gates the next step |
|---|---|---|
| Early | Tier 1–2 morphs from shop stock | Producing something, at all |
| Mid | Double recessives; a line of your own | Proving hets; placing residents; space |
| Late | Tier 4 combinations; fixing a polygenic line | Reputation, and the vigor cost of fixation |

**Why this is not a grind.** Saturation caps what any one morph can earn, so the route to more money
is a *new* morph; a new morph requires a project; a project is bounded by breeding seasons and
pairing slots, not by repetitions. Doing the same profitable thing again earns strictly less each
time. That is charter principle 8 expressed in the economy rather than enforced against it.

---

## 3. Purchasables

The design rule: **every purchasable is a conversion between the game's real currencies**, and they
all compete for the same money. There is no aisle of strict upgrades.

| You spend | To get | Purchasable |
|---|---|---|
| money | information | gene test (one locus, one animal); full panel; pedigree audit |
| money | capacity | facility tier; enclosures |
| money | genetic diversity | unrelated outcross stock |
| money | schedule | incubator (narrows variance); second pairing tub |
| money | experience | display habitat; biomes; features |
| **information** | **money** | selling a *proven* animal at the proof premium |

That last row is the loop closing on itself, and it is why the design coheres rather than being a
shop bolted to a genetics engine.

**The best purchasable in the game is the gene test**, because its real competitor is not another
item — it is a test breeding, which costs no money and instead costs a pairing slot and a season.
Money or a season, and which of those is scarcer changes as you play. Priced at about two-thirds of
the tier-2 animal it typically informs, so it hurts.

A **full panel** is deliberately *worse per fact* than a targeted test. Bulk discounts on
information would let money replace the judgment about which question to ask — and choosing what to
test is the same skill as choosing which pairing to make, which the charter says can never be
bought.

The **incubator** narrows incubation variance. It does not touch the mean and it does not touch
hatch rate. A better incubator in reality buys you a more predictable hatch date, not more
hatchlings, and modelling it that way keeps hatch rate free to mean exactly one thing.

**Consumables** are few and none of them is a re-roll: gene test, outcross stock, and a vet consult
that distinguishes whether an animal's condition is genetic or environmental. (That last one is
honest — per the D3 reasoning, kinking and similar outcomes are genuinely not purely genetic, and
incubation conditions matter. It is also a real diagnostic decision with a real cost.)

**Forbidden, permanently:** any consumable that re-rolls an outcome. A clutch's seed is derived from
the world seed, the parents, and the clutch index, so re-rolling is structurally impossible today.
Nothing in the shop may reintroduce it through the back door.

---

## 4. Engaging, not addictive

This is an explicit constraint, and it is the most interesting design problem in the project. The
distinction is not a matter of degree, and it is not about how much fun something is.

> **Engaging: the game rewards a model you built in your head.**
> **Addictive: the game rewards the act of checking.**

A design has tipped over when the optimal action is to interact *more often* rather than *better*.

There is a one-sentence test for any mechanic:

> **The closed-laptop test.** If you can think about the game while it is closed and come back with
> a better plan, it is engaging. If thinking about it while closed gains you nothing, but *opening*
> it does, it is addictive.

Every mechanic in this game passes that test, and it is worth noticing that the genetics is why:
you can work out a Punnett square on a bus.

### Forbidden mechanisms

Named individually, because "don't be exploitative" is not a specification and because each of these
has a specific, well-documented reason for existing in other games:

1. **Variable-ratio reinforcement** — random rewards on an unpublished schedule. The slot-machine
   mechanism. Already forbidden by charter principle 6: every roll's odds are printed.
2. **Loot boxes, mystery eggs, gacha pulls.** The same thing in a snake costume.
3. **Daily login rewards and streaks.** Pressure to open the game on the game's schedule rather than
   your own. A streak is a punishment for having a life, disguised as a gift.
4. **Energy or stamina meters** that refill in real time.
5. **Real-time timers, anywhere, for anything.** Already principle 1.
6. **Push notifications, and any "your snake misses you" framing.** Especially this: the game must
   never use an animal's welfare as a retention hook. Nothing decays, sickens, or is unhappy because
   you were away. This is where a cute animal game most easily becomes coercive, and it is the line
   that would be most shameful to cross.
7. **Limited-time offers, seasonal exclusives, anything that expires.** Manufactured urgency.
8. **Artificial scarcity** — rarity that comes from a supply cap rather than from Mendelian
   probability. Ours comes from arithmetic you can check.
9. **Re-rolling and save-scumming.** Structurally impossible; keep it that way.
10. **Any repeatable action with an unbounded expected payoff.** Principle 8.
11. **Real-money purchases of any kind.** No IAP, no currency packs, no cosmetics store, ever.
12. **Near-miss framing** — "so close!" on a failed outcome. A non-viable egg is reported as a
    genetics fact with an explanation, never as a tease.
13. **Autoplay and infinite scroll of reveals.** A reveal is per-animal and it ends.
14. **Progress that happens while you are not playing.** There is nothing to come back and collect.

### What we use instead

The list above is the easy half. This is the part that has to actually work:

- **A prediction resolving.** The dopamine comes from having been *right* — or interestingly wrong.
  The Punnett square is shown *before* you commit, so anticipation is built out of knowledge rather
  than out of a spinner. This is the whole reason the genetics is load-bearing.
- **Ceremony attached to novelty, not to repetition.** The first-ever view of a card is wrapped,
  built, flipped, celebrated; every later view is a plain flip. This is quietly the single best
  anti-addiction mechanic in the project, because the celebration is attached to something *bounded*
  — there are only so many first times — instead of to something infinite.
- **Session-shaped, not tick-shaped.** A full generation fits in one sitting. A project spans
  months. You come back because you have a next move, not because a meter refilled.
- **A visible ceiling.** Saturation means "do more of what worked" stops paying, and the game tells
  you so with a number. Very few games in this genre will ever tell you to stop. This one does.
- **Nothing is lost by being away.** Come back after two weeks and your line is exactly as you left
  it. The cost of a decision is the decision you did not make, never the time you did not spend.

### Why this is worth writing down

A reader who knows this genre will assume, reasonably, that a breeding game with a shop and a talent
tree is built on the standard retention playbook. This section is the evidence that the playbook was
read, understood, and refused on purpose — and that what replaced it is a real design rather than an
absence.

---

## 5. Where this design pushes back

Two places where the charter's *principles* are right but its current *numbers* do not deliver them.
Recorded here rather than quietly worked around, per the charter's own instruction.

**Capacity pressure expires by mid-game.** Principle 7 relies entirely on capacity being scarce —
that is what makes taking an animal in a real decision rather than a decoration. But at a flat
`SLOT_PURCHASE_COST` of 350, one tier-3 sale buys four enclosures. Pressure is real for the first
hour and gone thereafter, and a principle whose mechanism expires is a principle that expires. The
proposal is facility *tiers* with superlinear costs (`tuningProposals.ts`), which is also how space
really works: you rent a bigger room, you do not buy a seventh rack. Raising `SLOT_PURCHASE_COST`
instead would hurt most where the pressure already works.

**Saturation may be dodgeable by portfolio rotation.** Saturation is keyed to a phenotype and
recovers at 40% a year, so a player cycling five morphs never saturates any of them. Income then
scales with morph count, morph count scales with capacity, capacity scales with money — and the
runaway loop principle 5 forbids has reappeared one level up. `ECONOMY_LATE_ACCELERATION_MAX` will
not catch it if the strategy model only simulates a single-morph strategy.

This is the strongest objection to the economy as designed, and the right response is the charter's
own standing obligation under principle 4: **add portfolio rotation to the strategy model in
`tuning.test.ts` and find out.** The fix, if one is needed, is probably a shared saturation term
across closely related phenotypes — a market for "pastel-something" saturating as a family, which is
also what really happens. But that should be a response to a failing test, not a guess.
