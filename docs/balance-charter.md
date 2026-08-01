# The Serpentine balance charter

Every solo developer who is also their own only playtester drifts the same direction: toward the
version of the game that is most satisfying to *test*. That's not a character flaw, it's what
happens when the person tuning the numbers is the person who wants to see the cool snake. Every
studio solves it with a second person. We don't have a second person, so we wrote it down once
instead of re-arguing it every afternoon.

This is a position, not a rulebook. It is meant to be argued with. Eight principles, each with the
reasoning attached, so that when one of them blocks something good you can tell whether the *idea*
is wrong or the *principle* is. Sometimes it'll be the principle. There's a decision log at the
bottom for exactly that.

Three things make it stick in practice:

- **Cheat mode.** Everything you want instantly — an exact genotype, a forced mutation, eggs matured
  on the spot, a lineage jumped five generations, unlimited money — is one unlock away, and it works
  on your *real* save, because a sandbox that can't touch the real game can't test the real game.
  Any wish for instant gratification is a cheat-mode feature request, not a tuning change. The save
  quietly records that cheats were used, so a clean run stays distinguishable from a developed one.
  That's bookkeeping, not a restriction.
- **`src/game/tuning.ts`.** Every number that shapes difficulty lives in one file, each with a
  comment saying which principle it serves. Nothing is buried.
- **`src/game/tuning.test.ts`.** Tests that assert *derived properties* — "how many clutches to a
  rare morph" — not the constants themselves. When one fails it tells you what design property just
  moved and what it was protecting. If you still want the change, change the invariant too. That
  deliberate second step is the whole difference between designing and drifting.

---

## 1. Decisions are the scarce resource — never your time

**The principle.** What a breeding costs you is the breeding you *didn't* do this season. It never
costs you waiting.

**Why.** "Time is scarce" is the obvious way to make choices feel weighty, and it's a trap: a game
whose core resource is patience is a game you stop opening. The thing that actually makes a
decision matter is that you can't take it back — that female was paired with *this* male this
season. Opportunity cost, not latency. Once you locate the cost correctly, waiting turns out to be
doing no work at all, and you can delete it for free.

The short form: **time is scarce in the fiction and cheap in the wrist.** Turns are the currency.
Minutes never are.

**Forbids.** Real-time timers, anywhere, for anything — no "come back in four hours," not once.
Progress bars for outcomes the RNG has already decided; if the clutch exists, show it. Any mechanic
whose cost to the player is measured in seconds rather than in foregone alternatives.

**And clicks aren't a currency either.** This is the part that's easy to get wrong. Turn-based
doesn't automatically mean cheap — a turn-based game where advancing a week takes three clicks and
incubation runs eight weeks has charged you twenty-four clicks of nothing, which is the same slow
feedback loop, just paid in wrist instead of wall clock. So: **one control that advances to the
next thing that actually needs a decision.** Not "next week" twenty times. The wrist cost scales
with decisions; the fiction's clock can be as long as the biology says.

**Requires.** A full generation — pair, hatch, look at what you got — fits comfortably in one
sitting. A *project* (fixing a polygenic line, proving out a het, chasing a double recessive)
deliberately does not. Cheap generations, long projects. That combination is what lets you sink a
month into one line without the game punishing you for coming back after two weeks away.

**Change it when.** You find a mechanic where a genuine pause is the interesting part — the player
is *doing something* during it, not watching. Then the principle is about idle waiting
specifically, and should say so.

See **Time gates**, below, for what this means concretely for incubation, receptivity, and growth.

## 2. Information is the reward

**The principle.** The payoff of a breeding is finding out what your animals carry. Money is how
you afford to keep asking.

**Why.** This is the whole reason the genetics is load-bearing instead of decorative. If you can
look up the truth, the Punnett squares become a screensaver. The 66%-het mechanic isn't a
difficulty knob — it's the game.

**Forbids.** A UI that shows true genotypes for unproven animals in canonical mode. Free gene
tests. Anything that hands you a fact you could have earned by breeding for it.

**Note the line.** Facts can be bought — a gene test tells you about one locus on one animal, and
that's fine, it's a real thing breeders pay for. What can never be bought is *which pairing to
make*. That judgment is the thing the game is actually about, and there's no shop for it.

**Change it when.** Uncertainty starts feeling like obstruction rather than a question — when you
can't find out something you have a legitimate plan to find out. That's a missing evidence
mechanic, not a reason to lift the veil.

## 3. Genetic progress always pushes against something

**The principle.** Moving a line toward a genetic goal always gives up something else. Fixation
costs vigor; that's the archetype, and the rest should rhyme with it.

**Why.** Line-breeding fixes a trait and quietly accumulates inbreeding. Outcrossing restores vigor
and gives back some of the fixation. *When do you outcross?* is the best decision in this game, and
it exists because the mechanism is honest rather than because we bolted a penalty on.

**Forbids.** A genetic upgrade that is strictly good with no opposing pressure.

**Explicitly permits.** Convenience that is strictly good — a bigger rack, a better incubator
screen, a faster way to compare two animals. Inventing a fake downside for a quality-of-life
feature ("+2 slots, −5% hatch rate") is designer noise, and it cheapens the one tradeoff that's
real.

**Change it when.** You catch yourself attaching a token cost to something just to satisfy this
principle. That's the principle being applied too broadly, not the feature being wrong.

## 4. No strategy should be the best one at every stage

**The principle.** A strategy may be the right call for a while. None should be the right call
forever.

**Why.** If one approach always wins there's no decision, and without a decision there's no game.
But a beginner strategy that's clearly best for the first few seasons is *good* — that's
onboarding, not imbalance. The failure is a strategy that never stops being correct.

**Forbids.** An approach that leads at every measured horizon. A gap so wide between best and
second-best that the others are jokes.

**Requires an ongoing obligation.** When you add a mechanic, add it to the strategy model in
`tuning.test.ts`. An invariant that only knows about the mechanics from July can't protect the ones
you add in October.

**Change it when.** Never, probably. But the *model* should change constantly.

## 5. Compounding is bounded by the market, not by taxing the rehab

**The principle.** Money → better animals → more money is a runaway loop, and the thing that stops
it is that morph prices fall as morphs become common.

**Why.** The obvious sink is "care costs scale with residents." That works, and it quietly makes
the mission the thing that's punishing you — which drags optimal play toward a small, cold
operation. Market saturation is the better sink because it's *true* (this is exactly what happened
to ball python morph prices), it bounds the loop just as hard, and its answer to "how do I earn
more" is "find something new" — which points straight back at the genetics.

**Forbids.** Any income source with no saturation term. Per-resident costs steep enough that taking
in an animal is primarily an economic decision.

**Change it when.** The ceiling starts biting before you've had a chance to build anything. That's
the ceiling being too low, not the mechanism being wrong.

## 6. You may be uncertain about facts. You are never uncertain about odds

**The principle.** The player can always compute the probability. They're surprised only by the
draw.

**Why.** Hidden distributions are the one form of randomness this game should never use, because
the entire teaching claim rests on "you could have worked this out." A mutation is a fair surprise
— the *rate* is published, you just can't know which egg. An animal's genotype is fair too: the
roll already happened and you can find it out by breeding or testing. Hidden information is not the
same thing as unfair randomness, and the difference is whether the player has any route to knowing.

**Forbids.** A roll the player can't look up the odds of. Secret modifiers on displayed
probabilities. Any number in the UI that isn't computed from something you could reproduce on
paper.

**This applies to time too.** "Incubation: 55–60 days" is a scheduling decision — pair now, or wait
for next season and risk the window? "Incubation: ???" is a slot machine on wait time, and variance
you can't plan against is variance that only produces frustration. Show the range; roll inside it.

**Change it when.** It doesn't. This one is the honesty claim of the whole project — it's what makes
"I built a genetics teaching tool" a true sentence.

## 7. The rehab competes for capacity, never for your conscience

**The principle.** Caring for an animal costs you slots, money, and attention you wanted for your
breeding project. It never costs you points for being kind.

**Why.** A rehab that's free is decorative. But a rehab that makes compassion the losing play puts
callousness on the optimal line, and that is not a game we want to have built. The real tension a
sanctuary faces isn't ethical, it's capacity: how much of what you have goes to the animals who
need it versus the project you're excited about. That's a genuine, recurring, honest decision, and
it never asks you to be cold.

**Forbids.** Any mechanic where declining to help an animal scores better than helping. Anything
that reads as a penalty for the mission.

**Requires.** Residents consume real resources. If taking one in costs nothing, you haven't made a
decision, you've made a decoration.

**Change it when.** Capacity pressure stops being felt at all — if you never once hesitate before
taking in another animal, the cost is too small to be a choice.

## 8. Repetition may be a ritual. It may never improve your expected result

**The principle.** Watching six eggs hatch is a ritual. Re-rolling until you like the clutch is a
grind. The line between them is whether doing it again changes what you can expect to get.

**Why.** "No grinding" as usually stated would ban the most joyful thing in the game. The precise
version bans only the thing that's actually corrosive: an action worth repeating a hundred times
for a better outcome is a slot machine, and it replaces judgment with endurance.

**Forbids.** Re-rolling a clutch. Reloading for a different result. Any repeatable action with an
unbounded expected payoff.

**Already enforced by the architecture, not by willpower.** A clutch's seed is derived from the
world seed, the two parents, and the clutch index — so the eggs are decided the moment the pairing
is, and reloading gives you the same eggs. Save-scumming isn't discouraged here; it's structurally
impossible. Keep it that way. (Cheat mode *can* re-roll a clutch with a seed you choose. That's the
point of a cheat: it's an explicit, recorded act, not a thing you drift into by pressing F9.)

**Change it when.** You add something genuinely worth doing repeatedly where the repetition *is*
the skill. Then say so specifically rather than loosening the rule.

---

## Time gates

Pairing receptivity, incubation, and growth to maturity are all real, all variable in reality, and
all worth having — without them a breeding decision costs nothing and the whole strategic layer
collapses. Two hard constraints, both of which fall out of the principles above rather than being
extra rules:

**Turn-based, never wall-clock** (principle 1). Time advances because you advanced it. There is no
clock running while the tab is closed, and there never will be.

**Bounded variance, and the bound is visible** (principle 6). Every gate publishes its range.
Incubation is 8–9 weeks, and you're told so before you pair.

One consequence worth knowing, because it decides whether the variance is worth having at all:
**variance only becomes a decision when there's a window to miss.** If nothing else is on a clock,
it makes no difference whether the eggs hatch in week 8 or week 9 — that's texture, which is fine
but free. The moment there's a breeding season, a late hatch can cost you a pairing slot for the
year, and now the range is something you plan around. So receptivity windows and incubation
variance are a matched pair; if you ever cut the window, the variance becomes decoration and you
may as well simplify it away.

Growth to maturity is the weakest case for variance — nothing schedules against a two-year wait.
Keep it if you like the texture; it isn't load-bearing.

---

## How to change any of this

The point of writing it down was never to make it permanent. It was to make disagreeing with it
cost one deliberate minute instead of nothing.

1. Change the number in `tuning.ts`.
2. A test fails and tells you which principle moved and what it was holding.
3. If you still want it: change the invariant band too, and add a line to the log below saying what
   you wanted and what you decided. Two sentences is plenty.

That's it. Step 3 is the entire mechanism. Nobody's checking; the log is for future you, who will
absolutely want to know why sixteen-year-old you widened tier 3.

---

## Decision log

**2026-07-31 — Principle 1 rewritten from "time is the scarce resource."** The original said the
scarce resource was time and that clutches come once a year. That's in direct conflict with how this
project actually gets built — slow feedback is what makes a project stop getting opened. Located the
cost in irreversibility instead of duration. Consequence: waiting became free to delete, and
"cheap generations, long projects" became the design target.

**2026-07-31 — Principle 3 narrowed to genetic gains.** The original ("no upgrade should be strictly
good") would have forced a fake downside onto every convenience feature. Scoped it to genetic
progress, where the tradeoff is real, and explicitly permitted strictly-good quality-of-life work.

**2026-07-31 — Principle 4 restated as "not best at every stage."** "No dominant strategy" is
unfalsifiable as an absolute and would have banned good onboarding. The new form is checkable: the
leader has to change at least once across the measured horizons.

**2026-07-31 — Principle 7 rewritten from "the mission must be able to lose to profit."** The
original invited a design where being callous is optimal play. Moved the tension from ethics to
capacity, which is both the real dynamic a sanctuary faces and the one that doesn't put cruelty on
the winning line.

**2026-07-31 — Contradiction found between principles 5 and 7; resolved by market saturation.** The
proposed economy sink was per-resident care cost. Leaning on it hard enough to bound compounding
would have made the rehab itself the tax, which is exactly what principle 7 forbids. Made
saturation the primary sink instead: prices decay as a morph becomes common. Bounds the loop, taxes
scale rather than compassion, and it's what really happened to morph prices.

**2026-07-31 — Killed the ninth principle, "rare things stay rare in canonical mode."** It had no
content the rarity-tier invariant didn't already carry, and it was the only entry that read as
"don't cheat" — the wrong register for a charter about design. Its useful half became a routing
rule in the Lab spec: every instant-gratification wish is a Lab feature request.

**2026-07-31 — The sandbox became cheat mode, and it acts on your real save.** The first version was
quarantined: it couldn't write a canonical save, and anything made there was marked forever. That
was wrong, and self-defeating. A sandbox that can't touch the real game can't be used to *test* the
real game — and the first time you want to check a five-generation line-breeding project in your
actual save and find the sandbox can't help, the only lever left is the constants, which is the one
thing this whole charter exists to protect. What actually degrades the game is editing constants,
not skipping one wait on one occasion. So: cheats operate live, the save records a flag and a count,
and the invariant tests do the defending.

**2026-07-31 — Time gates accepted, with the wrist-cost hole in the reasoning closed.** The proposed
resolution of the time-versus-feedback tension was "time is scarce in the fiction and cheap in the
wrist; turns are the currency, minutes never are." Pressure-tested: the wall-clock half holds
completely and should never be revisited. The "cheap in the wrist" half doesn't follow from being
turn-based — it's a claim about the UI, and turn-based games fail it constantly (turn 47 of 300,
press End Turn). Added the missing constraint: one control that advances to the next decision, so
input cost scales with decisions rather than with turns. With that, the answer holds.

**2026-07-31 — Also found: variance without a window is decoration.** Bounded incubation variance
only creates a scheduling decision if there's a breeding season it can push you past. Recorded so
that if the receptivity window ever gets cut, the variance gets simplified away with it rather than
quietly persisting as noise.
