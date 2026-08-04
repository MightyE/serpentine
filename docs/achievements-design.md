# Achievements design

## The one thing to know before reading further

**An achievement is a data literal, and its reward is computed, not chosen.**

You declare *the work* — in clutch-equivalents, assembled from steps whose conversions already exist
in `tuning.ts` — and `reward.ts` decides what that work pays. Nobody in this repo has ever typed a
money value into an achievement, and nobody should. That is the whole design: the numbers you would
otherwise be tempted to tune by feel are derived from numbers the balance charter already defends,
so an achievement cannot drift away from the economy it is supposed to be a bonus on top of.

The consequence is that adding an achievement is a one-file, one-object edit, and that arguing with
an achievement's reward means arguing with its declared *effort* or with the curve — never with the
entry.

---

## The taxonomy

Nine categories (`CATEGORIES` in `src/game/achievements/types.ts`). The question a new achievement
has to answer is **what kind of claim does earning this make about the player** — not what trait it
happens to mention. A piebald achievement can belong in five different categories depending on what
it is really saying.

| If it says… | it belongs in | category label |
|---|---|---|
| "you did this for the first time" | `firsts` | First Light |
| "you made this specific animal" | `traits` | The Morph Book |
| "you stacked genes" | `combinations` | Compound Interest |
| "you have seen a fraction of what exists" | `breadth` | The Catalogue |
| "your lab has been running a while" | `volume` | A Working Collection |
| "you understood something" | `mastery` | — |
| "you managed a line over time" | `lineage` | — |
| "you looked after animals who needed it" | `sanctuary` | — |
| "you found out the genetics is weirder than it looks" | `curiosities` | — |

The four axes underneath those nine are *novelty* (firsts, traits, curiosities), *breadth*
(combinations, breadth), *duration* (volume, lineage, sanctuary) and *understanding* (mastery). If a
proposed achievement does not sit on one of those axes, the honest answer is usually that it is a
quest, not an achievement — see `docs/quest-design.md`.

`curiosities` is the one that earns its place by tone rather than structure: those are the entries
whose reward is finding out they existed at all (a champagne clutch's normal sibling, a compound
heterozygote that is not a super). Several are `hidden`. Nothing mechanical depends on them.

---

## The effort model

The unit is one **clutch-equivalent** (CE): one pairing carried through to a hatch. It is the
charter's own unit — principle 1 says what a breeding costs you is the breeding you did not do, so
the honest denominator for "how much work was that" is pairings foregone, never minutes and never
clicks.

Every kind of work converts into it, and **not one conversion is a free parameter**:

| Step | Converts by | Source of the constant |
|---|---|---|
| `breed` | negative-binomial mean over the odds | `expectedClutchesToCopies`, `tuning.ts` |
| `evidence` | `1 − (1 − p)^n ≥ confidence`, solved for n | `clutchesForConfidence`, over `CANONICAL_ODDS` |
| `stock` | price / one entry clutch's gross | `BASE_PRICE_BY_TIER`, `ENTRY_CLUTCH_GROSS` |
| `capacity` | one slot-season = one pairing not made | 1:1, by definition |
| `generations` | one generation ≥ one pairing | 1:1, by definition |
| `action` | one animal's share of a clutch | `1 / EXPECTED_HATCHLINGS_PER_CLUTCH` |

Two structural rules carry more weight than they look like they do.

**`odds` is a key, never a number.** A `breed` or `evidence` step names an entry in
`CANONICAL_ODDS`, and every entry there is checked against `punnett()` with the real species files in
`canonicalOdds.test.ts`. A probability no test has verified is therefore a *type error* in an
achievement, not a plausible-looking number nobody rechecks. This is why the catalogue can quote
champagne het × het at 2/3 (the non-viable super makes the trait commoner once you condition on
hatching) without anyone having to trust it.

**Effort is marginal, never cumulative.** A ladder rung declares the work *from the rung below* via
`supersedes`. Double-counting would pay for the same clutch five times, and cumulative effort makes
the last rung of a long ladder so large that no reward can honestly cover it. Bounded marginal steps
are what make a ladder payable at all — and `validateReward` refusing an unpayable achievement is
the forcing function that turns a too-big achievement into a ladder, which is nearly always the
better design anyway.

Rungs 1–5 come off `RUNG_THRESHOLDS` `[2, 6, 25, 60]`, every one of which is a number `RARITY_TIERS`
already publishes. A single-locus dominant project lands in rung 1, a simple recessive in rung 2, a
double recessive in rung 3, a triple in rung 4 — because those are literally the tiers' own
expected-clutch bands. The rungs cannot drift away from what the game calls common, uncommon, rare
and exceptional, because they are not separate numbers.

---

## The reward curve

The requirement it answers, in Eric's words:

> All scaled to how much work it is to achieve them. Completing achievements can be a major source
> of early funding for your rehab. This is not meant to be a continuous stream — just as achievement
> frequency should go down over time, so do the aggregate rewards. However the achievements should
> continue to feel rewarding.

The last two sentences are in tension and **money cannot resolve it**, because a fixed sum matters
less the richer you get: pay a late achievement fewer dollars and it feels like nothing; pay it more
and the aggregate goes the wrong way. So the resolution is not in the amount. It is in the **type**.

```
effortValue = VALUE_PER_CLUTCH_EQUIVALENT × marginal CE      (150 × CE)
money       = effortValue × MONEY_SHARE_BY_RUNG[rung]        ([1.0, 0.45, 0.22, 0.1, 0.04])
residual    = effortValue − money  (+ a capstone premium)
```

The residual is paid in things money is forbidden to buy: reputation (which already gates better
stock), a talent point, an introduction to breeding stock, a title. **Effort is paid at a constant
rate; only the currency changes.** Early on the whole of it arrives as cash, and it is meant to — a
rehab that cannot yet support itself is exactly what the money is for.

Every exchange rate is anchored to a number the game already publishes, so if one of the systems
behind a currency turns out to be thin, the anchor is wrong in a visible place rather than the
reward being wrong in an invisible one: `VALUE_PER_REPUTATION` against
`REPUTATION_AWARDS.novelPhenotypeProduced`, `VALUE_PER_STOCK_OFFER` as literally the tier-3 price,
`MAX_REPUTATION_PER_ACHIEVEMENT` as `REPUTATION_AWARDS.alleleDiscovered` — the largest single
reputation event in the game, which nothing an achievement hands you should outweigh.

### The argument against this, which is real

Non-monetary rewards are worth something only if the systems behind them are. A talent point is
worth `VALUE_PER_TALENT_POINT` only if the tree has nodes she wants, and
[the tree is deliberately four nodes](progression-design.md). If those systems stay thin, this design
has quietly replaced real rewards with a scoreboard and the late game will feel like it stopped
paying. That risk is accepted knowingly, not overlooked.

### The corrected claim: what declines is the rate, not the sum

**An earlier draft of `reward.ts` claimed "the monetary curve declines exactly as asked". That was
false, and it was false in a way the tests could not see.** It cost two agents a re-derivation, so it
is written down here in full.

Aggregate money is checked *by rung* — and a rung measures the size of one achievement, not when it
arrives. Order the catalogue by the effort needed to reach each entry (following the `supersedes`
chain: the honest proxy for "when"), and money per quartile of the completion order comes out:

| Quartile of the completion order | entries | money | reputation |
|---|---|---|---|
| Q1 | 30 | 1930 | 0 |
| Q2 | 29 | 3770 | 12 |
| Q3 | 30 | 6020 | 103 |
| Q4 | 29 | 8280 | 188 |

Money **rises**, monotonically, 4.3× from the first quarter of the game to the last. Aggregate money
per rung falls only because the catalogue holds dozens of tiny rung-1 entries against a handful of
large ones; a player does not meet the catalogue rung by rung.

`REWARD_INVARIANTS.aggregateMoneyMustDecline` is still worth keeping — it is a real joint constraint
on `MONEY_SHARE_BY_RUNG`'s steepness and the catalogue's composition, and adding thirty rung-2
entries *should* break it. It is simply not a statement about time. Do not cite it for that.

**The invariant that actually holds:**

> Money per unit of work declines monotonically — **150/CE at rung 1 down to 6/CE at rung 5** — so
> achievement money collapses as a *share of what the player is earning by then*, even as the
> absolute sum grows. Early achievements are worth two-thirds of the opening balance; late ones are
> a rounding error against a running breeding programme. And no achievement is ever more than **25%**
> of the money available for the work it names, so none of them is ever a reason to do anything.

That is the true form of the requirement: **declining relevance, not a declining sum.** A declining
sum was never achievable without breaking the felt-reward half. The rate is what the design
controls; the sum is an outcome of how many achievements the catalogue happens to hold.
`catalogue.test.ts`'s `rises in absolute money over the completion order, and that is the design`
asserts the rise on purpose, so the next person cannot mistake it for a bug and "fix" it.

### The granularity lever — a known, bounded defect

Because the money share is a **step** function of rung rather than continuous in effort, **how finely
a ladder is cut changes what it pays for identical work.** Five 5-CE rungs pay 1687; one 25-CE step
pays 375 — 4.5×, same work. Measured across the catalogue's ladders the spread is 5.5×:

```
curiosities.no-daughters   2 rungs   1.5 CE    230 money   155 /CE
volume.ball.100            4 rungs  18.5 CE   1090 money    59 /CE
sanctuary.residents.40     4 rungs  40.0 CE   1130 money    28 /CE
```

This quietly rewards a catalogue author for splitting ladders, and nothing checked it. The honest fix
is to make the money share continuous in effort, which would move every reward in the game and
belongs in its own change. Until then `REWARD_INVARIANTS.ladderRateSpreadMax` pins the spread at 6.0
so it cannot widen unnoticed. **If you are adding a ladder, cut it at the size the design wants, not
at the size that pays best.**

---

## How to add an achievement

**One object, appended to `ACHIEVEMENTS` in `src/game/achievements/catalogue.ts`.** There is no
registry to update, no reward to pick, and no other file to touch. The requirement compiles, the
reward computes itself from the declared effort, the progress bar draws, and `catalogue.test.ts`
starts holding the new entry to the same standards as everything else.

```ts
{
  id: 'volume.piebald.10',
  category: 'volume',
  label: 'A Piebald Line',
  description: 'Produce ten piebald ball pythons.',
  requires: showed(BALL, 'piebald', 'piebald', 'piebald ball python', 10),
  effort: [breed(RECESSIVE, 'five more, once the line is established', 5)],
  supersedes: 'volume.piebald.5',
}
```

Five things to get right, in the order they will bite you:

1. **`category`** — ask what claim it makes about the player, from the table above.
2. **`requires`** — one of the shorthands (`showed`, `paired`, `stacked`, `counter`, `cover`, `all`).
   Each is a `Requirement` literal spelled once; they add no meaning. Requirements are **data**, not
   closures, which is what makes `watches` derivable by walking the tree and evaluation O(1) per
   event against a tally of flag counters. An achievement never reads the roster.
3. **`effort`** — marginal from `supersedes`, in `EffortStep`s. Every step carries a `note`, because
   the design doc, the planning UI and the next person to argue with the reward all read the same
   sentence. `odds` must be a `CANONICAL_ODDS` key; if the pairing you want is not in there, add it
   *and* its `punnett()` check first.
4. **`supersedes`** — set it whenever this is a rung above something. It is what makes `effort`
   legible as a marginal quantity, and without it the effort model will read your rung as work from
   zero and overpay it.
5. **`grants`** — only if the validator asks. Run the tests; `validateReward` will tell you in plain
   language whether the residual is unpaid (add a grant, or split into a ladder) or overpaid (drop
   one, or use a title). Do not pre-emptively add grants.

Every species, locus and allele id you mention is checked against `src/species/`, so a renamed allele
fails a test rather than producing an achievement nobody can ever earn. Do not add an entry naming a
trait you are planning to write.

**Retroactivity, and its honest caveat.** A tally predates the achievement that reads it, so a new
achievement fires on the next sweep for a player who already did the thing. That only reaches facts
an existing tally recorded — add an achievement that needs a counter nobody was keeping, and
existing saves start it at zero.

---

## Charter findings

Every number below was computed against the catalogue and `tuning.ts`, not asserted. Where a check
produced a change, the change is named.

### Principle 8 — repetition may never improve your expected result: **PASS**

Three independent guards, and the important discovery is that **market saturation is not one of
them.**

`SATURATION_HALFLIFE_SALES` is 120. Ten of one morph — the most any entry asks for, and the cap is
deliberate — costs **2.8%** of price averaged over the run. Fifty costs 13%, a hundred 24%. Under
40%/yr recovery a morph sold at 10/yr settles at 0.87× base. At 5.4 hatchlings per clutch and one
clutch per female per year, it takes **ten breeding females all committed to one morph** before the
price halves. Saturation is real, correctly built, and engages an order of magnitude above anything
the achievements ask for. It was never what protected the catalogue.

What actually does:

- **Rate.** Achievement money/CE by rung is 150 / 67.5 / 33 / 15 / 6. Breeding-and-selling pays
  486 / 796 / 996 / 1069 money/CE by target tier. The best achievement rate is **31% of the worst
  breeding rate and 14% of the best.**
- **Share.** Across all 118 entries, the maximum share of the money-for-that-work that the
  achievement itself represents is **25.0%** — and that values the work at the *bottom* market tier,
  the conservative direction. No achievement is ever more than a quarter of the money for the work it
  names. This is the bound worth defending, and it is now asserted.
- **Repeatability.** Every requirement is a threshold, never a rate; each entry pays once. Principle
  8 forbids repetition that *improves your expected result* — nothing here repeats at all.

The catalogue's one real cut stands and was re-verified: **single-morph counts stop at ten.** Fifty
or a hundred of one morph is reachable only by repeating one pairing, and it is also where saturation
finally starts arguing back — so the ladder ends before the treadmill starts, rather than relying on
the treadmill being unpleasant. The 50 and 100 rungs survive at the *per-species* level, where they
accrue from every project you run at once. `sanctuary.care.50` was likewise repriced off free clicks:
`giveCare` costs no money, no slot and no turn, so paying reputation for fifty button presses put the
cheapest reputation in the game behind something you could hold down. Principle 1 says clicks are not
a currency the player spends; the corollary is that they are not one the game pays in.

### Principle 4 — no strategy should be the best one at every stage: **PASS**

"Chase achievements" pays 150/CE at its absolute best (rung 1, early) and decays to 6/CE. It is
beaten 3.2× by the *cheapest* breeding even at its own peak, and it decays monotonically thereafter.
That is precisely principle 4's permitted shape: strong early, which is onboarding, and never correct
forever. Total catalogue reputation is also band-checked against the tier-4 stock gate, so
achievements are *a* route to the best stock and never a shortcut past playing.

### Principle 7 — the rehab competes for capacity, never for your conscience: **PASS**, with an
asymmetry that had never been written down

Nothing in the catalogue scores better for declining an animal, and `sanctuary.both` explicitly pays
for running the rehab and the breeding programme at once. But money per CE by category is:

```
sanctuary 35.4 | volume 61.4 | lineage 68.6 | breadth 71.6 | combinations 71.7
mastery 79.1   | curiosities 124.4 | traits 152.8 | firsts 153.3
```

Sanctuary is the **lowest of nine**, at 45% of the catalogue mean. The cause is arithmetic, not
authorial: a rehab commitment is denominated in slot-seasons, so its achievements carry large CE,
which lands them in rungs 3–4 where the money share collapses. Nobody decided this.

Why it is nonetheless correct — and the argument has to be made rather than assumed. On the breeding
path, achievement money is a tip on top of sale income. On the rehab path there is no sale income at
all (resident support very nearly covers resident care, which is deliberate: `RESIDENT_CARE_PER_WEEK`
taxes the mission and is explicitly *not* the mechanism that bounds the economy). So the achievement
curve **is** the rehab's whole income curve. Paying it more is the wrong fix, and `catalogue.test.ts`
correctly forbids it: a capacity achievement that out-pays the pairing whose slot it took turns
taking in animals into an income strategy. The right answer is that the rehab is paid in the currency
a rehab player is short of — **access**. Sanctuary carries **0.60 grants per achievement, the joint
highest of any category**: the vet room, the quarantine wing, a place in the regional rescue network,
three titles.

**Added:** `REWARD_INVARIANTS.sanctuaryRateFloorFraction`, a floor at 0.35 of the catalogue rate, plus
an assertion that the compensating grants actually exist. The old test bounded the rehab only from
above; nothing stopped a later edit quietly starving it while every other test still passed.

### Principle 5 — compounding is bounded by the market: **PASS**, trivially

Nothing here compounds because nothing here repeats. The catalogue is finite, ids are unique, and
every requirement is a threshold rather than a rate, so there is no achievement income that scales
with anything.

### Verdict

**No achievement was cut or reshaped, because nothing in the catalogue fails.** What failed was a
*claim* — the money curve — and a *gap*: the granularity lever and the rehab's missing floor, neither
of which any test could see. Guards were added rather than content changed, which is the outcome you
want from a numerical check that was run honestly.
