/**
 * Serpentine — quests: two scripted playthroughs, and why there are exactly two.
 *
 * Both instruments in `docs/quest-design.md` §B4 need a *real* game — a `Session`, a real bus, the
 * real recorder — because both are claims about what the game can and cannot produce, and neither
 * can be settled against invented observations.
 *
 * - {@link gameOnlyRun} exercises the game layer and emits **no `ui.*` intent at all**. What comes
 *   out is exactly the set of acts the game announces today, which is what `witness.test.ts` compares
 *   against the list of emit calls the UI still owes.
 * - {@link blindRun} is the uncomprehending player: it opens things, pairs whatever is to hand,
 *   advances time and sells at random, and it *does* emit `ui.*` intents, because the whole question
 *   is whether clicking around can complete a step that claims to prove understanding.
 *
 * Both are seeded and deterministic. A blind run that varies between runs would make the
 * anti-accident guarantee a coin toss that happens to have come up heads on the day it was written.
 */
import { makeRng } from '../../lib/rng'
import { pairingIdOf } from '../pairingId'
import { Session } from '../session'
import { beliefStateOf, individualShows, mechanismNameOf } from './belief'
import { emitIntent } from './observe'

/** Enough animals of one species that a breedable pair is certain. */
function stock(session: Session, speciesId: string, count: number): void {
  for (let i = 0; i < count; i++) session.spawnRandom(speciesId)
}

/**
 * Preview a pair, or `null` if the game refuses to describe it.
 *
 * `Session.previewPairing` throws when every possible offspring genotype is ruled non-viable —
 * `distribution.ts` has no distribution to report and says so rather than inventing one. A player
 * *can* select such a pair, so this is a live crash path in the breeding screen and it is reported
 * with the deposit; here it is caught, because a fixture that dies on round nine is a fixture that
 * silently stops testing everything after round nine.
 */
function previewOrNull(
  session: Session,
  motherId: string,
  fatherId: string,
): ReturnType<Session['previewPairing']> | null {
  try {
    return session.previewPairing(motherId, fatherId)
  } catch {
    return null
  }
}

/**
 * What an animal looks like, in the key space the preview's outcome rows use.
 *
 * Both sides go through `SpeciesDefinition.phenotypeKey`, which is what makes "the outcome you read
 * is the animal you opened" a comparison rather than a coincidence of two unrelated strings. A wired
 * card has the phenotype already — this is the same two calls it will make.
 */
function phenotypeKeyOf(session: Session, record: Parameters<Session['phenotype']>[0]): string {
  return session.speciesOf(record).playable.phenotypeKey(session.phenotype(record))
}

function breedablePair(session: Session): { motherId: string; fatherId: string } | null {
  const residents = session.residents()
  for (const mother of residents) {
    if (session.sexOf(mother) !== 'female') continue
    for (const father of residents) {
      if (session.sexOf(father) !== 'male') continue
      const preview = previewOrNull(session, mother.individual.id, father.individual.id)
      if (preview?.check.ok) {
        return { motherId: mother.individual.id, fatherId: father.individual.id }
      }
    }
  }
  return null
}

/**
 * Everything the game layer can announce on its own, in one run.
 *
 * Deliberately thorough rather than realistic: the point is coverage of the *emitters*, so it
 * renames, refuses a placement on purpose, gene-tests, sells, and advances time.
 */
export function gameOnlyRun(session: Session): void {
  stock(session, 'ball-python', 12)
  const residents = session.residents()
  const first = residents[0]
  if (first) {
    session.rename(first.individual.id, 'Kept')
    session.giveCareTo(first.individual.id)
    session.placeSnake(first.individual.id, 'habitat-1')
    session.geneTest(first.individual.id, session.speciesOf(first).authored.loci[0]?.id ?? '')
    session.unhouse(first.individual.id)
  }
  // A refusal is an act too: an empty patch of floor is not a habitat.
  if (residents[1]) session.placeSnake(residents[1].individual.id, 'no-such-habitat')

  const pair = breedablePair(session)
  if (pair) {
    session.breed(pair.motherId, pair.fatherId)
    session.advance(30)
  }
  session.advance(2)

  const spare = session.residents().find((record) => record.individual.id !== first?.individual.id)
  if (spare) session.sell(spare.individual.id)
}

/**
 * A long run of legal, uncomprehending play.
 *
 * The model of "uncomprehending" matters more than its length, and it is this: the player operates
 * every control correctly and *aims none of them*. Cards and notebook rows are opened at random,
 * previews are opened on whatever pair is to hand, pairings are committed without reading the odds,
 * time is advanced, animals are sold. Nothing here is illegal and nothing is malicious — this is
 * simply what clicking around looks like.
 *
 * What it deliberately does **not** do is systematically open the same locus on a parent and then on
 * its baby, or read a probability and then stake a pairing on it. Those are not "harder clicking";
 * they are the through-lines that only appear when someone is following an idea, which is precisely
 * why `docs/quest-design.md` §B1 counts them as evidence.
 *
 * ## What "opens everything" has to mean, or the guarantee is worthless
 *
 * The fixture's job is to be the *most* uncomprehending player that is still legal, and the failure
 * mode is subtle: any surface it declines to click is a surface whose predicate it silently exempts.
 * An earlier version of this run emitted six of the eleven `ui.*` intents and never opened a
 * viability explanation — which is the entire second half of pattern P6, so P6 was passing the
 * anti-accident test because the fixture had agreed not to test it. Every intent in the catalogue is
 * therefore emitted here, and the two that need a real payload are driven off the bus:
 * `ui.viabilityExplanationRead` carries the `clutchSeed` and `ruleId` the game just reported, and
 * card opens prefer freshly hatched animals, because a player who has just been handed a baby snake
 * clicks on it. That is novelty, not comprehension, and it is exactly the pressure a predicate that
 * claims to prove comprehension has to survive.
 */
export interface BlindOptions {
  /** How many rounds of clicking. A guarantee that holds only for a short run is not a guarantee. */
  readonly rounds?: number
}

export function blindRun(session: Session, seed = 'blind', options: BlindOptions = {}): void {
  const rng = makeRng(seed)
  stock(session, 'ball-python', 10)
  stock(session, 'corn-snake', 6)
  const bus = session.state.bus

  /** Non-viable eggs the game has reported. A clicker opens the explanation behind them. */
  const unreadExplanations: { clutchSeed: string; ruleId: string }[] = []
  /** Animals that hatched during the run. A clicker looks at the new baby. */
  const freshlyHatched: string[] = []

  const stopNotViable = bus.on('egg.notViable', ({ clutchSeed, ruleId }) => {
    unreadExplanations.push({ clutchSeed, ruleId })
  })
  const stopHatched = bus.on('egg.hatched', ({ individualId }) => {
    freshlyHatched.push(individualId)
  })

  for (let round = 0; round < (options.rounds ?? 24); round++) {
    const residents = session.residents()
    if (residents.length === 0) break
    const pick = () => residents[Math.floor(rng.next() * residents.length)] as (typeof residents)[number]

    emitIntent(bus, 'ui.screenOpened', { screen: rng.pick(['collection', 'breeding', 'store']) })
    emitIntent(bus, 'ui.habitatOpened', { habitatId: rng.pick(['habitat-1', 'habitat-2']) })
    emitIntent(bus, 'ui.glossaryTermOpened', {
      termId: rng.pick(['recessive', 'dominant', 'relatedness', 'genotype']),
    })

    // The game just reported that an egg did not hatch, and there is a control that says why. A
    // player who clicks everything clicks that too — it is one click on a screen already open, and
    // nothing about performing it requires having understood the answer.
    const explanation = unreadExplanations.shift()
    if (explanation) emitIntent(bus, 'ui.viabilityExplanationRead', explanation)

    // Open a card, and sometimes the notebook behind it. A freshly hatched animal wins the click
    // when there is one: being handed a new snake is what makes a person look at it.
    const newest = freshlyHatched.length > 0 && rng.chance(0.7) ? freshlyHatched.shift() : undefined
    const looked = (newest ? (residents.find((r) => r.individual.id === newest) ?? pick()) : pick())
    const parents = looked.individual.parents
    emitIntent(bus, 'ui.cardRevealed', { individualId: looked.individual.id })
    emitIntent(bus, 'ui.pedigreeOpened', { individualId: looked.individual.id, generations: 3 })
    emitIntent(bus, 'ui.cardOpened', {
      individualId: looked.individual.id,
      speciesId: looked.individual.species,
      // The real id, exactly as a wired card will send it. Emitting `''` here would make every
      // pattern that binds on `pairing` unreachable in this fixture, and the test would pass for a
      // reason that stops being true the week the UI lands.
      pairingId: parents ? pairingIdOf(parents[0], parents[1]) : '',
      // The real key, from the same function that produced the preview's outcome rows. A constant
      // here would let a P1 group bind the predicted outcome to the animal opened for free, which
      // is the opposite of what the field is for.
      phenotypeKey: phenotypeKeyOf(session, looked),
    })
    if (rng.chance(0.6)) {
      const loci = session.speciesOf(looked).authored.loci
      const locus = loci[Math.floor(rng.next() * loci.length)]
      if (locus) {
        emitIntent(bus, 'ui.notebookOpened', {
          individualId: looked.individual.id,
          speciesId: looked.individual.species,
        })
        // The real belief and the real mechanism, computed by the same functions the wired notebook
        // will call. Coin flips here would put a uniform 20% chance of `visible` on every row, which
        // is far above the real rate and would inflate exactly the signal P4 rests on.
        emitIntent(bus, 'ui.notebookLocusOpened', {
          individualId: looked.individual.id,
          speciesId: looked.individual.species,
          locusId: locus.id,
          mechanism: mechanismNameOf(locus),
          belief: beliefStateOf(session.beliefAt(looked, locus.id), locus),
        })
      }
    }

    // Preview a pair at random, and commit it about half the time. No odds are read.
    const mother = pick()
    const father = pick()
    const preview =
      mother.individual.id === father.individual.id
        ? null
        : previewOrNull(session, mother.individual.id, father.individual.id)
    if (preview) {
      // Whichever locus the breeding screen happens to have in view — a blind player does not choose
      // it, so the fixture does not either. `motherShows` / `fatherShows` are then computed for real
      // against that locus, and the locus itself now travels with them: this value used to be
      // computed here and thrown away, because `ui.pairingPreviewed` had no `locusId`. That omission
      // was the whole of what made P4 satisfiable by accident.
      const inView = session.speciesOf(mother).authored.loci[
        Math.floor(rng.next() * session.speciesOf(mother).authored.loci.length)
      ]
      emitIntent(bus, 'ui.pairingPreviewed', {
        motherId: mother.individual.id,
        fatherId: father.individual.id,
        speciesId: mother.individual.species,
        relatedness: preview.relatedness,
        nonViableProbability: preview.nonViableProbability,
        locusId: inView?.id ?? '',
        motherShows: inView ? individualShows(mother.individual, inView) : false,
        fatherShows: inView ? individualShows(father.individual, inView) : false,
      })
      // "Open everything on a screen" includes the outcome rows. Leaving these out would make the
      // blind run pass by never touching the surface pattern P1 is built on, which would be the
      // fixture protecting the predicate instead of testing it.
      if (rng.chance(0.5)) {
        const outcome = preview.outcomes?.[Math.floor(rng.next() * (preview.outcomes?.length ?? 1))]
        if (outcome) {
          emitIntent(bus, 'ui.punnettOutcomeInspected', {
            motherId: mother.individual.id,
            fatherId: father.individual.id,
            phenotypeKey: outcome.key,
            probability: outcome.probability,
          })
        }
      }
      if (preview.check.ok && rng.chance(0.5)) {
        session.breed(mother.individual.id, father.individual.id)
      }
    }

    if (rng.chance(0.4)) {
      const housed = pick()
      session.placeSnake(housed.individual.id, rng.pick(['habitat-1', 'habitat-2']))
    }

    session.advance(1 + Math.floor(rng.next() * 6))

    if (rng.chance(0.25)) {
      const sold = pick()
      if (session.record(sold.individual.id)) session.sell(sold.individual.id)
    }
  }

  stopNotViable()
  stopHatched()
}
