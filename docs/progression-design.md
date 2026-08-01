# Progression design — the talent tree

## The one thing to know before reading further

**The framework is built. The tree is not, and it is not supposed to be.**

`src/game/progression/` contains a complete talent-tree system: a node/edge model, prerequisites,
costs, three kinds of effect, a validator, a points economy, and a layout function that hands a
screen everything it needs. It contains **four nodes**, which exist to prove the machinery works
and to be a worked example of each effect kind.

Filling the tree in is the most enjoyable and most visible design work in this repo, and it is the
work that most says what you think the game is *about*. It has been left undone on purpose. If you
replace all four starter nodes with something better, nothing breaks — the tests assert properties
of any well-formed tree, never the presence of particular nodes.

Everything below is either how to use the machinery, or the reasoning behind the few structural
opinions it does hold.

---

## Why it is built on `seams.ts` rather than beside it

`src/game/seams.ts` already had the right shape: `Unlock` records whose `requires` reference each
other's ids, evaluated as a pure function of a `FlagSet`, with nothing storing an "unlocked" bit.
Its own doc comment calls itself the talent-tree seam and says a tree is "an arrangement of
`Unlock` records plus a screen to draw them on". That was correct, so the framework takes it
literally: **a `TalentNode` compiles down to an `Unlock`.**

```
player spends a point ──▶ one flag is set ──▶ UnlockRegistry recomputes ──▶ effects apply
```

The alternative — a second system that tracks its own notion of what is available — would have
produced two answers to the same question, and they would have drifted. There is one answer.

### What this buys, concretely

**Nothing stores "unlocked".** The only durable record is *"the player chose to spend on this
node"*. Whether that choice is currently **active** is recomputed from the rules as they exist
today. So:

- Rebalance a node next month and a save file from this month evaluates correctly against the new
  rules, with no migration.
- If a node's prerequisites stop being met — because you changed them — the node goes inactive,
  its effects stop, and **its points come back**. Respec is `clear some flags`. There is a test
  named after this property.
- The whole thing is testable with a hand-written fake: no game, no save file, no snakes.

---

## The model

### A node

```ts
{
  id: 'quarantine-room',
  label: 'Quarantine Room',
  description: 'A separate space for new arrivals. Intake stops competing with the breeding racks.',
  branch: 'facility',
  cost: 2,
  requires: ['second-pairing-tub'],          // edges in the graph
  alsoRequires: [                            // conditions on the world, not on the tree
    { describe: 'Take in five rescues', isMet: (v) => v.count('rescuesTaken') >= 5 },
  ],
  effects: [{ kind: 'capability', capability: 'intake.quarantine' }],
}
```

Adding a node to the game is adding one of these to the array in `starterTree.ts`. That is the
entire procedure. Rows are derived from the prerequisite graph, the `Unlock` is compiled for you,
the UI picks it up on the next render. Nothing else changes — not the registry, not the layout, not
the save format.

### The three effect kinds

A node can do exactly three things, because these three cover what a progression system is for.

| Kind | What it does | Authoring |
|---|---|---|
| `capability` | Switches a mechanic on — "run two pairings at once" | Free-form id. Invent one, then have some part of the game ask `effects.has('pairing.concurrent')`. |
| `content` | Reveals something that exists but is gated — a biome, a species, a screen | Free-form id, same deal. |
| `tuning` | Moves a number that shapes difficulty | **Not** free-form. See below. |

If you want a fourth kind, the honest question is whether it is one of these three wearing a
costume. Usually it is.

### Why `tuning` is the one that is fenced in

`tuning.ts` is where the difficulty of the game is written down, and `tuning.test.ts` asserts
*derived properties* of those numbers — how many clutches to a rare morph, whether the economy has
a ceiling. A talent that could move any constant by any amount would be a hole straight through
that arrangement: the invariants would keep passing (they test the constants as authored) while the
game actually being played had drifted somewhere else. Silent, and very hard to notice.

So a talent may only move a value listed in `progression/tunables.ts`, and only inside the band
declared there. The band is checked against the **whole tree at maximum investment**, not against
any one node — which means the guard keeps working as the tree grows, which is the point of having
it.

What is on the list is scheduling, upkeep, comfort, and variance in something you are planning
around. What is deliberately not: hatch rate, clutch size, mutation rate, rarity-tier
probabilities, inbreeding load. Every one of those is load-bearing for a teaching claim. A talent
that raises hatch rate makes inbreeding depression invisible; a talent that raises mutation rate
turns "find something new" into a farm. The genetics is the game, not a difficulty setting on it.

This follows the charter's principle 3 exactly, including the part people forget: convenience
that is strictly good is *explicitly permitted*. A better incubator does not need a fake downside.

### Tuning modifiers combine order-independently

Only `add` and `mul`, resolved as `(base + Σ adds) × Π muls`. There is no `set`.

That restriction is not fussiness. If the effect of your tree depended on which node you took
first, two players with identical trees would have different games and no test could pin it down.
`set` is worse still — it makes the last writer win, and "last" is not a thing a *set* of unlocks
has.

---

## Points

**Points come from milestones of understanding. Never from money, never from repetition.**

This is the one structural opinion the framework holds, and it comes straight from charter
principle 2: information is the reward. What advances you should be *finding something out* —
proving a het, hatching a first clutch, caring for an animal that needed it — rather than doing
anything a hundred times.

Two consequences fall out:

- **Points cannot be bought.** If money bought talent points, the tree would be a second shop and
  the economy would be the only axis in the game.
- **Points are derived, not stored.** Earned = sum of milestones currently met. Spent = sum of the
  costs of nodes currently active. A save file cannot lose your points and cannot lie about them.

The starter set awards three points against five points of nodes. Keep that shape as you grow it:
**total cost should always outrun total points**, by enough that two players end up with different
trees. A tree you can fully clear is a checklist, not a choice. There is a test for this.

---

## Rendering

`tree.layout(view)` returns everything a screen needs and nothing it should have to compute:

- Each node with a derived `row` (longest path from a root), a `column`, and a `state` —
  `active` / `affordable` / `available` / `locked` / `hidden`.
- `unmet`: the human-readable reasons, so a locked node can always say what to go and do. That is
  why `describe` is mandatory on an `UnlockCondition`; a locked thing with no legible reason is the
  most annoying thing a progression system can do.
- Edges, each flagged `satisfied` so the parent-lit ones can be drawn differently.
- The points purse and the milestones still to reach.

The UI holds no game logic. That is the boundary: this module decides what is true, the screen
decides what it looks like.

---

## Wiring it up

```ts
const tree = createTalentTree(STARTER_TREE)
tree.registerInto(game.unlocks)

const view = createProgressView(game.flags, game.unlocks)
const layout = tree.layout(view)                       // hand straight to a screen
if (tree.effects(view).has('pairing.concurrent')) { ... }

tree.take('steady-incubation', game.flags, game.unlocks, game.bus)
```

Make a **fresh `ProgressView` whenever flags may have changed.** It is cheap and disposable, and a
stale one is the single way to get a wrong answer out of this module.

### Flags the starter tree reads

`clutchesHatched` (bumped by `game/breeding.ts`) and `totalCareGiven` (by `game/rehab.ts`) are
live. `genotypesProven` and `snakesPlaced` are **not yet emitted by anything** — they are named in
`starterTree.ts` so the wiring has a list rather than a guess. Until they exist, the milestones
that depend on them simply never fire, which is a safe way for this to be incomplete.

---

## A note on what a talent tree is for

The tempting default is a tree of small percentages: +5% this, −3% that. It is easy to write and it
is nearly always boring, because a number moving by 5% is not something a player can feel or plan
around.

The nodes worth writing are the ones that change **what you can attempt**. A second pairing tub
does not make you 10% better at breeding; it means you no longer have to choose between two
projects this season, and that changes the shape of every plan you make. Reach for capabilities
first, content second, and tuning only when the number is one the player is genuinely scheduling
around.

The related question — how progression stays *engaging* without tipping into the exploitative
patterns most games in this genre use — is worked out in
[`economy-design.md`](economy-design.md#engaging-not-addictive), and it applies to the tree as much
as to the shop.
