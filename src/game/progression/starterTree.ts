/**
 * # The starter tree — four nodes, and a note about why there are only four.
 *
 * ## This file is the creative surface. It is not ours.
 *
 * Everything else in `src/game/progression/` is machinery: it validates a graph, compiles nodes
 * into the existing unlock seam, derives points, folds effects, and hands a screen a grid to
 * draw. None of that is a design decision about *your* game. This file is where the design
 * decisions live — which branches exist, what they are called, what they give you, what the tree
 * is *about* — and it has been left almost empty on purpose.
 *
 * The four nodes below exist to prove the machinery works and to be a worked example of the
 * three effect kinds. They are not a design. If you replace all four with something better, you
 * have not broken anything and you have not lost anything: the tests in `starterTree.test.ts`
 * assert properties of *any* tree (it is acyclic, it stays inside the tuning bands, its roots are
 * reachable), not the presence of these particular nodes.
 *
 * Filling this file in is the most enjoyable work in the whole repo, and it is the work that most
 * shows what you think the game is for. Nobody else should do it.
 *
 * ## How to add one
 *
 * Add a `TalentNode` to `STARTER_TREE_NODES`. That is the whole procedure — rows are derived from
 * the prerequisite graph, the unlock is compiled for you, the UI picks it up on the next render.
 *
 * ```ts
 * {
 *   id: 'quarantine-room',
 *   label: 'Quarantine Room',
 *   description: 'A separate space for new arrivals. Intake stops competing with the breeding racks.',
 *   branch: 'facility',
 *   cost: 2,
 *   requires: ['second-pairing-tub'],
 *   effects: [{ kind: 'capability', capability: 'intake.quarantine' }],
 * }
 * ```
 *
 * Three things to know before you go far:
 *
 * - **A `capability` or `content` effect is free-form** — invent any id you like, then make some
 *   part of the game ask `effects.has('intake.quarantine')`. Nothing needs to be registered.
 * - **A `tuning` effect is not free-form.** It may only move a value listed in `tunables.ts`, and
 *   only inside the band declared there. That is not bureaucracy: the bands are what stop the
 *   tree from quietly moving the game out from under the balance invariants. If you want a node
 *   that moves something not on the list, read the "what belongs here" section of `tunables.ts`
 *   first — the answer is sometimes yes, and the reasoning for when is written down.
 * - **Points come from milestones, never from money and never from repetition.** See
 *   `STARTER_MILESTONES`. This is the one structural opinion the framework does hold, and it
 *   comes from the balance charter's principle 2: what advances you should be finding something
 *   out.
 *
 * ## A deliberate imbalance in the starter set
 *
 * Three milestones award three points; the four nodes cost five between them. You cannot take
 * everything, and that is the point — a tree you can fully clear is a checklist, not a choice.
 * Keep that property when you grow it: total cost should always outrun total points by enough
 * that two players end up with different trees.
 */
import type { TalentMilestone, TalentNode } from './types'

/**
 * Flags these nodes and milestones read.
 *
 * `clutchesHatched` is bumped by `game/breeding.ts` and `totalCareGiven` by `game/rehab.ts`
 * today. The other two are **not yet emitted by anything** — they are named here so the
 * integration has a concrete list rather than a guess, and until they are wired the milestones
 * that depend on them simply never fire, which is a safe way for this to be incomplete.
 */
export const FLAGS_READ_BY_STARTER_TREE = {
  /** Bumped in `game/breeding.ts`. Live. */
  clutchesHatched: 'clutchesHatched',
  /** Bumped in `game/rehab.ts`. Live. */
  totalCareGiven: 'totalCareGiven',
  /** NOT YET EMITTED — bump when `genetics.proven` fires. */
  genotypesProven: 'genotypesProven',
  /** NOT YET EMITTED — bump when a resident leaves for a permanent home. */
  snakesPlaced: 'snakesPlaced',
} as const

export const STARTER_TREE_NODES: readonly TalentNode[] = [
  // — Husbandry branch ————————————————————————————————————————————————
  {
    // Effect kind: TUNING. Narrows incubation spread; touches neither the mean nor the hatch
    // rate, because hatch rate has exactly one job in this game and that job is genetic load.
    id: 'steady-incubation',
    label: 'Steady Incubation',
    description:
      'A thermostat you trust. Eggs still take eight to nine weeks — but you can tell which, ' +
      'which means you can plan the rest of the season around it.',
    branch: 'husbandry',
    cost: 1,
    effects: [{ kind: 'tuning', key: 'incubationVarianceWeeks', op: 'add', value: -0.5 }],
  },
  {
    // Effect kind: CAPABILITY, gated behind a prerequisite node.
    id: 'second-pairing-tub',
    label: 'Second Pairing Tub',
    description: 'Run two pairings in the same season instead of choosing between them.',
    branch: 'husbandry',
    cost: 2,
    requires: ['steady-incubation'],
    effects: [{ kind: 'capability', capability: 'pairing.concurrent' }],
  },

  // — Lab branch ——————————————————————————————————————————————————————
  {
    // Effect kind: CAPABILITY, a root.
    id: 'field-notebook',
    label: 'Field Notebook',
    description:
      'Keep proper records. Shows each animal’s pedigree and inbreeding coefficient instead of ' +
      'leaving you to hold five generations in your head.',
    branch: 'lab',
    cost: 1,
    effects: [{ kind: 'capability', capability: 'ui.pedigreePanel' }],
  },
  {
    // Effect kind: CONTENT, with an extra non-node condition — the pattern for "do a thing in the
    // world, not just spend points". `habitat.arid` is a placeholder id; point it at whatever the
    // habitat work actually ships.
    id: 'open-day',
    label: 'Open Day',
    description:
      'Let people in to see the animals. Sponsors follow, and so does a proper desert setup for ' +
      'the display enclosure.',
    branch: 'lab',
    cost: 1,
    requires: ['field-notebook'],
    alsoRequires: [
      {
        describe: 'Place a rehab resident in a permanent home',
        isMet: (view) => view.count('snakesPlaced') >= 1,
      },
    ],
    effects: [{ kind: 'content', content: 'habitat.arid' }],
  },
]

/**
 * Three ways to earn a point. Also yours — and worth more thought than the nodes, because the
 * milestone list is a statement about what the game thinks is worth doing.
 */
export const STARTER_MILESTONES: readonly TalentMilestone[] = [
  {
    id: 'first-clutch',
    describe: 'Hatch your first clutch',
    points: 1,
    isMet: (view) => view.count('clutchesHatched') >= 1,
  },
  {
    id: 'first-proof',
    describe: 'Prove what an animal carries by test breeding',
    points: 1,
    isMet: (view) => view.count('genotypesProven') >= 1,
  },
  {
    id: 'first-care',
    describe: 'Care for a resident who needs extra help',
    points: 1,
    isMet: (view) => view.count('totalCareGiven') >= 1,
  },
]

export const STARTER_TREE = {
  nodes: STARTER_TREE_NODES,
  milestones: STARTER_MILESTONES,
} as const
