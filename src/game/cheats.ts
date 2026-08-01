/**
 * Cheat mode — the developer's door, dressed as an easter egg.
 *
 * ## The unlock
 *
 * **Name any snake `Gregor Mendel`.** That is the whole thing. It sets the flag below through
 * the ordinary `FlagSet`, and an `Unlock` in the ordinary `UnlockRegistry` reads it — no side
 * channel, no dev build, no query string. The seams in `seams.ts` already did this job; adding a
 * second mechanism for cheats would have meant two ways for the game to be in a state, which is
 * how a save file starts disagreeing with itself.
 *
 * It stays documented in `CLAUDE.md` and `docs/state-of-play.md`. It is an easter egg for a
 * player and a labelled door for the person developing the game, and the person developing this
 * game needs the door on her own map.
 *
 * ## Record, do not restrict
 *
 * Cheats act on the **live game**, not on a quarantined sandbox — a sandbox that cannot touch the
 * real game cannot be used to test the real game, which is the only reason this exists. Nothing
 * is blocked afterwards. The save records that cheats were used and how many times, so a clean
 * run stays distinguishable from a developed one, and that is the entire consequence.
 *
 * Nothing about balance depends on this file. The invariants over `tuning.ts` are what hold that
 * line, and they are computed from constants, not from play.
 */
import { geneticsEngine } from '../genetics'
import { expressedLoad, seedFounderLoad } from '../genetics/load'
import { makeGenotype, possiblePairs } from '../genetics/genotype'
import { applyMutation } from '../genetics/mutation'
import { inbreedingCoefficient } from '../genetics/pedigree'
import type { AllelePair, Individual, IndividualId, Sex } from '../genetics/types'
import { makeRng, type Rng } from '../lib/rng'
import type { SnakeRecord } from './roster'
import type { Session } from './session'
import type { Unlock } from './seams'

/** The name that opens the door. Case- and whitespace-insensitive; nothing else matters. */
export const CHEAT_UNLOCK_NAME = 'gregor mendel'

/** Set the moment a snake is named `Gregor Mendel`. Lives in the save like any other flag. */
export const CHEAT_UNLOCKED_FLAG = 'cheatModeUnlocked'

/** Set the first time a cheat is *used*. This is the honest one — unlocking is not using. */
export const CHEATS_USED_FLAG = 'cheatsUsed'

/** How many cheats have been used. Bookkeeping, never a limit. */
export const CHEAT_USE_COUNT_FLAG = 'cheatUseCount'

export const cheatModeUnlock: Unlock = {
  id: 'cheat-mode',
  label: 'The Abbot’s Garden',
  description:
    'Someone in this collection is named after the monk who counted pea plants for eight years. ' +
    'The lab notebook opens.',
  requires: [
    {
      describe: 'name a snake “Gregor Mendel”',
      isMet: (view) => view.flag(CHEAT_UNLOCKED_FLAG) === true,
    },
  ],
  grants: ['cheat-panel'],
  hidden: true,
}

export function registerCheatUnlock(session: Session): void {
  if (!session.state.unlocks.get(cheatModeUnlock.id)) {
    session.state.unlocks.register(cheatModeUnlock)
  }
}

export function isCheatNameSpelling(name: string): boolean {
  return name.trim().toLowerCase().replace(/\s+/g, ' ') === CHEAT_UNLOCK_NAME
}

export function cheatsUnlocked(session: Session): boolean {
  return session.state.flags.get(CHEAT_UNLOCKED_FLAG) === true
}

export function cheatUseCount(session: Session): number {
  const value = session.state.flags.get(CHEAT_USE_COUNT_FLAG)
  return typeof value === 'number' ? value : 0
}

/** Called on every rename. A no-op unless the name is the one. */
export function noticeName(session: Session, name: string): void {
  if (!isCheatNameSpelling(name)) return
  session.state.flags.set(CHEAT_UNLOCKED_FLAG, true)
}

function record(session: Session): void {
  session.state.flags.set(CHEATS_USED_FLAG, true)
  session.state.flags.bump(CHEAT_USE_COUNT_FLAG)
}

// ---------------------------------------------------------------------------
// The cheats themselves
// ---------------------------------------------------------------------------

/**
 * Every cheat, as data.
 *
 * A list rather than a panel full of hand-wired buttons, because the useful thing to be able to
 * do with a cheat menu is add one — and adding one here is a single object.
 */
export interface Cheat {
  readonly id: string
  readonly label: string
  readonly describe: string
  /** Some cheats want a selected snake; the panel disables those when nothing is selected. */
  readonly needsSelection?: boolean
  /** A free-text argument — a seed, an allele id, a species id. */
  readonly argument?: string
  readonly run: (session: Session, selected: SnakeRecord | undefined, argument: string) => string
}

export const CHEATS: readonly Cheat[] = [
  {
    id: 'spawn-random',
    label: 'Spawn a random snake',
    describe: 'A whole new animal, drawn from the wild population, exactly as a rescue would be.',
    argument: 'species id (blank for any)',
    run: (session, _selected, argument) => {
      const speciesId = argument.trim() || undefined
      const spawned = session.spawnRandom(speciesId)
      return `Spawned ${spawned.name}.`
    },
  },
  {
    id: 'spawn-designed',
    label: 'Spawn a snake with chosen traits',
    describe:
      'Write the traits you want as `locus=allele/allele`, separated by commas — ' +
      'for example `albino=albino/albino, pastel=pastel/wild-type`. Prefix with `male:` or ' +
      '`female:` to choose a sex.',
    argument: 'female: albino=albino/albino',
    run: (session, _selected, argument) => spawnDesigned(session, argument),
  },
  {
    id: 'reveal',
    label: 'Reveal true genotypes',
    describe:
      'Turns off the known-versus-actual split for the whole collection. Every card then shows ' +
      'what an animal really is rather than what you have proved. It can be turned back off.',
    run: (session) => {
      const next = session.state.flags.get('revealGenotypes') !== true
      session.state.flags.set('revealGenotypes', next)
      return next ? 'True genotypes revealed.' : 'Back to what you have actually proved.'
    },
  },
  {
    id: 'mature',
    label: 'Mature everything, now',
    describe: 'Resolves every pending gate: eggs hatch, hatchlings finish growing.',
    run: (session) => {
      const pending = session.pendingGates().length
      session.resolveAllGates()
      return pending === 0 ? 'Nothing was waiting.' : `Resolved ${pending} pending gate(s).`
    },
  },
  {
    id: 'jump-lineage',
    label: 'Jump the lineage forward',
    describe: 'Advances a full generation of turns, so every animal on the roster grows up.',
    run: (session) => {
      const before = session.turn
      session.advanceGeneration()
      return `Jumped from week ${before} to week ${session.turn}.`
    },
  },
  {
    id: 'force-mutation',
    label: 'Force a mutation',
    describe:
      'Runs `applyMutation` on the selected animal at the locus you name, so a novel allele ' +
      'appears without waiting several thousand eggs for one.',
    needsSelection: true,
    argument: 'locus id',
    run: (session, selected, argument) => forceMutation(session, selected, argument),
  },
  {
    id: 'reroll-clutch',
    label: 'Re-roll the last clutch with a seed',
    describe:
      'Breeds the selected animal to its most recent mate again under a seed you choose. Same ' +
      'seed, same clutch — which is what makes a bug in breeding reproducible.',
    needsSelection: true,
    argument: 'seed',
    run: (session, selected, argument) => rerollClutch(session, selected, argument),
  },
]

/** Runs a cheat and records it. Everything a cheat panel needs is this one function. */
export function runCheat(
  session: Session,
  cheat: Cheat,
  selected: SnakeRecord | undefined,
  argument = '',
): string {
  const result = cheat.run(session, selected, argument)
  record(session)
  session.notifyChanged()
  return result
}

// ---------------------------------------------------------------------------
// Implementations that need more than a line
// ---------------------------------------------------------------------------

function spawnDesigned(session: Session, argument: string): string {
  let text = argument.trim()
  let sex: Sex = 'female'
  const sexMatch = /^(male|female)\s*:/i.exec(text)
  if (sexMatch) {
    sex = sexMatch[1]!.toLowerCase() as Sex
    text = text.slice(sexMatch[0].length).trim()
  }

  const wanted = new Map<string, AllelePair>()
  for (const clause of text.split(',').map((c) => c.trim()).filter(Boolean)) {
    const [locusId, pairText] = clause.split('=').map((s) => s.trim())
    if (!locusId || !pairText) throw new Error(`Could not read “${clause}”. Write it as locus=allele/allele.`)
    const [a, b] = pairText.split('/').map((s) => s.trim())
    wanted.set(locusId, [a || null, b || a || null])
  }

  // Whichever species declares the first named locus. With nothing named, the first loaded one.
  const first = [...wanted.keys()][0]
  const loaded =
    Object.values(session.species).find((s) =>
      first ? s.authored.loci.some((l) => l.id === first) : true,
    ) ?? Object.values(session.species)[0]
  if (!loaded) throw new Error('No species are loaded.')

  const index = session.state.flags.bump('snakesSpawned')
  const id = `cheat-${index}`
  const overrides: Record<string, AllelePair> = Object.fromEntries(wanted)
  const individual: Individual = {
    id,
    species: loaded.authored.id,
    genotype: makeGenotype(loaded.playable, sex, {
      ...seedFounderLoad(loaded.pool, loaded.playable, id),
      ...overrides,
    }),
    parents: null,
    mutations: [],
  }
  const phenotype = geneticsEngine.express(individual, loaded.playable)
  session.addRecord({
    individual,
    name: `${phenotype.label} ${loaded.authored.label}`,
    acquiredTurn: session.turn,
    source: 'founder',
    inbreeding: 0,
    expressedLoad: expressedLoad(individual, loaded.pool).map((e) => e.locus),
  })
  return `Made a ${sex} ${phenotype.label} ${loaded.authored.label}.`
}

/**
 * An RNG whose coin always lands heads.
 *
 * `applyMutation` gates on `rng.chance(ratePerAllele)`, which at the shipped rate is a one-in-
 * twenty-five-thousand event — the entire point of the constant. Forcing the gate rather than
 * raising the rate means the cheat exercises **the real mutation code path**, including which
 * novel-allele generator fires and how the allele is named. A cheat that took a shortcut around
 * the code it is meant to help you debug would be worse than no cheat.
 */
function alwaysChance(rng: Rng): Rng {
  return { ...rng, chance: () => true, fork: (label) => alwaysChance(rng.fork(label)) }
}

function forceMutation(session: Session, selected: SnakeRecord | undefined, argument: string): string {
  if (!selected) throw new Error('Pick a snake first.')
  const species = session.speciesOf(selected)
  const locusId = argument.trim() || species.authored.loci[0]!.id
  const locus = species.playable.loci.find((l) => l.id === locusId)
  if (!locus) throw new Error(`'${locusId}' is not a locus of ${species.authored.label}.`)
  if (!locus.mutation) {
    throw new Error(`'${locusId}' declares no mutation spec, so there is nothing here to force.`)
  }

  const pair = selected.individual.genotype.loci[locusId]
  const from = pair?.[0] ?? locus.wildType
  const rng = alwaysChance(makeRng(`cheat:${selected.individual.id}:${locusId}:${session.turn}`))
  const event = applyMutation(locus, from, selected.individual.id, rng)
  if (!event) throw new Error(`'${locusId}' has no allele it could mutate into.`)
  const next: AllelePair = [event.to, pair?.[1] ?? locus.wildType]

  const individual: Individual = {
    ...selected.individual,
    genotype: {
      ...selected.individual.genotype,
      loci: { ...selected.individual.genotype.loci, [locusId]: next },
    },
    mutations: [...selected.individual.mutations, event],
  }
  session.replaceIndividual(selected.individual.id, individual)
  return `${selected.name} now carries ${event.to} at ${locusId}.`
}

function rerollClutch(session: Session, selected: SnakeRecord | undefined, argument: string): string {
  if (!selected) throw new Error('Pick a snake first.')
  const seed = argument.trim() || `reroll:${session.turn}`
  const mate = session
    .residents()
    .find(
      (r) =>
        r.individual.id !== selected.individual.id &&
        r.individual.species === selected.individual.species &&
        session.sexOf(r) !== session.sexOf(selected),
    )
  if (!mate) throw new Error(`Nothing on the roster can pair with ${selected.name}.`)
  const babies = session.breed(selected.individual.id, mate.individual.id, seed)
  return `Re-rolled with seed “${seed}” — ${babies.map((b) => b.name).join(', ') || 'no hatchlings'}.`
}

// ---------------------------------------------------------------------------
// Seeding a founder collection — used by the "spawn a starter set" path
// ---------------------------------------------------------------------------

/**
 * A pair of unrelated animals of one species, guaranteed one of each sex.
 *
 * The rehab handing you two animals you cannot breed to each other is the worst possible first
 * thirty seconds, and left to chance it happens a quarter of the time.
 */
export function foundingPair(session: Session, speciesId: string): readonly SnakeRecord[] {
  const loaded = session.species[speciesId]
  if (!loaded) throw new Error(`foundingPair: no species '${speciesId}'`)
  const out: SnakeRecord[] = []
  for (const sex of ['female', 'male'] as const) {
    const index = session.state.flags.bump('snakesSpawned')
    const id = `founder-${index}`
    const rng = makeRng(`${session.state.worldSeed}:founder:${index}`)
    const overrides: Record<string, AllelePair> = {}
    for (const locus of loaded.authored.loci) {
      if (!rng.chance(0.25)) continue
      const chromosomes =
        sex === loaded.playable.sexSystem.heterogameticSex
          ? ([
              loaded.playable.sexSystem.homogameticChromosome,
              loaded.playable.sexSystem.heterogameticChromosome,
            ] as const)
          : ([
              loaded.playable.sexSystem.homogameticChromosome,
              loaded.playable.sexSystem.homogameticChromosome,
            ] as const)
      overrides[locus.id] = rng.pick(possiblePairs(locus, chromosomes))
    }
    const individual: Individual = {
      id,
      species: speciesId,
      genotype: makeGenotype(loaded.playable, sex, {
        ...overrides,
        ...seedFounderLoad(loaded.pool, loaded.playable, id),
      }),
      parents: null,
      mutations: [],
    }
    const phenotype = geneticsEngine.express(individual, loaded.playable)
    const founder: SnakeRecord = {
      individual,
      name: `${phenotype.label} ${loaded.authored.label}`,
      acquiredTurn: session.turn,
      source: 'founder',
      inbreeding: inbreedingCoefficient(individual, () => undefined),
      expressedLoad: expressedLoad(individual, loaded.pool).map((e) => e.locus),
    }
    session.addRecord(founder)
    session.noteEvidence(id, {
      kind: 'observedPhenotype',
      phenotypeKey: loaded.playable.phenotypeKey(phenotype),
    })
    out.push(founder)
  }
  return out
}

export type { IndividualId }
