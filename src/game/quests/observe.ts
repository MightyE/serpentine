/**
 * Serpentine — quests: turning what happened into what a predicate may read.
 *
 * ## The one rule this file exists to enforce
 *
 * **A predicate may only read observations.** It may never call a session method, walk the roster,
 * or express a phenotype (`docs/quest-design.md` §B5). So everything a predicate could ever want to
 * know has to be *on the act at the moment it is recorded*, and this file is the only place allowed
 * to look anything up. That is what makes the evaluator a pure function of a recorded history, and
 * therefore testable with no renderer and no game (`evaluate.test.ts` does exactly that).
 *
 * The consequence is the enrichment below. `snake.sold` on the bus carries `{ individualId, price }`
 * and `ActPayloadMap` wants a `speciesId` too, so the recorder keeps a small id→species cache and
 * fills it in. It has to be a cache rather than a lookup because `market.ts` removes the animal from
 * the roster *before* it emits the sale — by the time the observer hears about it there is nothing
 * left to ask.
 *
 * ## Three families of act, and where each comes from
 *
 * 1. **Existing bus events**, mapped and enriched here. Nothing in `src/game/` changed for these.
 * 2. **New game-layer events** — `pairing.committed`, `snake.placed`, `geneTest.run` and the rest of
 *    the second table in §E2. Declared here, emitted by small additive calls in `session.ts`.
 * 3. **`ui.*` intents** — the deliberate acts on the surfaces that carry the concepts. Declared here
 *    and emitted by the UI. **These emit calls are not yet wired** (`src/ui/` was mid-edit when this
 *    landed); {@link PENDING_UI_EMITS} is the exact list, and every one is a one-line call to
 *    {@link emitIntent}. Until they land, the demonstrative tier is unreachable and the steps that
 *    depend on them simply never complete — which costs the player an unticked box and nothing else,
 *    because nothing in the game is behind a quest.
 *
 * ## Why `ui.pairingPreviewed` is an event and not a state read
 *
 * `Session.previewPairing` is a pure function called on every render, so its having been called is
 * worth nothing as evidence of intent. The player *opening* the preview is worth everything. Same
 * reasoning for every other member of the `ui.*` family: each one marks a moment where the player
 * chose to look at the thing the tutorial is about.
 */
import type { EventBus, GameEventMap, GameEventType, Unsubscribe } from '../seams'
import { pairingIdOf } from '../pairingId'
import type {
  ActKind,
  ActPayloadMap,
  Observation,
  SexName,
  StageName,
} from './types'

// ---------------------------------------------------------------------------
// New events
// ---------------------------------------------------------------------------

/**
 * The acts the game did not announce, declared next to the code that consumes them — the seam
 * `seams.ts` documents, used exactly as documented.
 *
 * Each payload is written as an indexed access into {@link ActPayloadMap} rather than spelled out,
 * so the bus event and the recorded observation cannot drift apart. If a field is added to the
 * catalogue, the emit site stops compiling, which is the direction that error should point.
 *
 * Note what is *not* here: no augmentation of an event `seams.ts` or another module already
 * declares. Declaration merging cannot change a member's type, and more to the point, three other
 * agents were editing this tree — enriching an existing payload in the recorder costs a cache and
 * touches nobody else's file.
 */
declare module '../seams' {
  interface GameEventMap {
    // -- game layer ---------------------------------------------------------
    'species.chosen': ActPayloadMap['species.chosen']
    'snake.named': ActPayloadMap['snake.named']
    'snake.placed': ActPayloadMap['snake.placed']
    'snake.unhoused': ActPayloadMap['snake.unhoused']
    'placement.refused': ActPayloadMap['placement.refused']
    /**
     * A pairing the player actually committed to, carrying a {@link pairingIdOf} that the preview,
     * the clutch and the hatchling's card all agree on. Patterns P1 and P4 bind on it.
     */
    'pairing.committed': ActPayloadMap['pairing.committed']
    'geneTest.run': ActPayloadMap['geneTest.run']

    // -- ui intents ---------------------------------------------------------
    'ui.screenOpened': ActPayloadMap['ui.screenOpened']
    'ui.cardOpened': ActPayloadMap['ui.cardOpened']
    'ui.cardRevealed': ActPayloadMap['ui.cardRevealed']
    'ui.notebookOpened': ActPayloadMap['ui.notebookOpened']
    'ui.notebookLocusOpened': ActPayloadMap['ui.notebookLocusOpened']
    'ui.pairingPreviewed': ActPayloadMap['ui.pairingPreviewed']
    'ui.punnettOutcomeInspected': ActPayloadMap['ui.punnettOutcomeInspected']
    'ui.viabilityExplanationRead': ActPayloadMap['ui.viabilityExplanationRead']
    'ui.habitatOpened': ActPayloadMap['ui.habitatOpened']
    'ui.glossaryTermOpened': ActPayloadMap['ui.glossaryTermOpened']
    'ui.pedigreeOpened': ActPayloadMap['ui.pedigreeOpened']
  }
}

/** Every act whose name is a `ui.` intent. */
export type UiActKind = Extract<ActKind, `ui.${string}`>

/**
 * Emit one deliberate act from a component. The whole UI surface of this module.
 *
 * Deliberately the *only* export a component needs: a call site cannot record an act the catalogue
 * does not have, cannot get the field names wrong, and cannot reach the journal directly. Cheap
 * enough to call in a click handler — the recorder does one map lookup and one array push.
 */
export function emitIntent<K extends UiActKind & GameEventType>(
  bus: EventBus,
  act: K,
  fields: ActPayloadMap[K],
): void {
  // The augmentation above defines each of these payloads *as* its `ActPayloadMap` entry, but a
  // generic indexed access is not reducible, so the compiler cannot see the two are the same type.
  bus.emit(act, fields as unknown as GameEventMap[K])
}

/**
 * The emit calls the UI still owes, and where each one goes.
 *
 * Not documentation for its own sake: `witness.test.ts` asserts this set is exactly the set of acts
 * with no proven emitter, so wiring one up without deleting its entry here fails the build, and so
 * does deleting an entry without wiring it. That keeps the list honest as `src/ui/` lands, and it is
 * the handover for the follow-up dispatch.
 *
 * Every one is a single `emitIntent(bus, ..., {...})` in an existing handler. None of them needs new
 * state, and none of them may be emitted from a render path — an act recorded on render is not an
 * act (see the file header).
 */
export const PENDING_UI_EMITS: Readonly<Record<UiActKind, string>> = {
  'ui.screenOpened': 'App.tsx — on the tab switch that changes the visible screen.',
  'ui.cardOpened':
    'SnakeCard.tsx / Collection.tsx — when a card is opened, not when one is rendered in a list. ' +
    "`pairingId` is `pairingIdOf(mother, father)` from the animal's own parents, or '' for a founder. " +
    '`phenotypeKey` is `speciesOf(record).playable.phenotypeKey(session.phenotype(record))` — the ' +
    'same key space as the preview rows, and what pattern P1 binds the predicted outcome to.',
  'ui.cardRevealed': 'reveal.ts — when the first-ever reveal animation for an animal finishes.',
  'ui.notebookOpened': 'GenomeCard.tsx — when the notebook view is opened for an animal.',
  'ui.notebookLocusOpened':
    'GenomeCard.tsx — when one locus row is expanded. `mechanism` from `mechanismOf(locus)`, ' +
    '`belief` from `beliefStateOf(session.beliefAt(record, locusId), locus)`. Carries the concept, ' +
    'so P2 and P3 are both unreachable without it.',
  'ui.pairingPreviewed':
    'Breeding.tsx — when the preview is opened for a chosen pair, NOT on every previewPairing() ' +
    'render. `locusId` is the locus the screen has in view and `motherShows` / `fatherShows` are ' +
    'whether each parent visibly expresses *that* locus. Pattern P4 depends on all three: without ' +
    'the locus id the two booleans cannot be tied to the trait the hatchling turns out to show.',
  'ui.punnettOutcomeInspected':
    'Breeding.tsx — when one outcome row of the preview is inspected. Pattern P1 depends on it.',
  'ui.viabilityExplanationRead':
    'InFlight.tsx / the clutch report — when the explanation behind a non-viable egg is opened. ' +
    'Pattern P6 depends on it.',
  'ui.habitatOpened': 'Store.tsx — when a habitat is opened.',
  'ui.glossaryTermOpened': 'Interstitial.tsx — when a glossary term is expanded.',
  'ui.pedigreeOpened': 'GenomeCard.tsx — when the pedigree view is opened.',
}

// ---------------------------------------------------------------------------
// The recorder
// ---------------------------------------------------------------------------

/**
 * What the recorder is allowed to ask the game.
 *
 * Narrow on purpose, and read-only: this is the *only* place in the quest system that touches game
 * state, so keeping the surface to five questions is what stops the boundary from moving. Every one
 * is answered at record time and baked into the observation, never re-asked during evaluation.
 */
export interface ObserverWorld {
  turn(): number
  speciesOf(individualId: string): string | undefined
  sexOf(individualId: string): SexName | undefined
  stageOf(individualId: string): StageName | undefined
  /** Which locus a viability rule reads. `ViabilityRule.involves[0]`; `''` when unknown. */
  locusForRule(ruleId: string): string | undefined
}

export type ObservationSink = <K extends ActKind>(act: K, fields: ActPayloadMap[K]) => void

export interface Recorder {
  /** Subscribe to everything. Returns one unsubscribe that drops every subscription. */
  attach(bus: EventBus, sink: ObservationSink): Unsubscribe
}

/**
 * Build a recorder.
 *
 * `priorJournal` is the restored save's observations, and it is not optional in spirit: the
 * `clutchSeed → pairingId` map below is rebuilt from it, which is what lets a clutch laid before a
 * reload still hatch into an act that binds to the pairing the player committed to. Both fields it
 * needs are already persisted on the `clutch.laid` observation, so this costs nothing extra in the
 * save — see `docs/quest-design.md` §A5.
 */
export function createRecorder(
  world: ObserverWorld,
  priorJournal: readonly Observation[] = [],
): Recorder {
  /** id → species, populated from every act that carries both. Survives the animal being sold. */
  const speciesById = new Map<string, string>()
  /** clutchSeed → pairingId. The join `clutch.hatched` and `egg.hatched` cannot make themselves. */
  const seedToPairing = new Map<string, string>()
  /** pairingId → clutch seeds still incubating, oldest first. Clutches hatch in the order laid. */
  const pendingSeeds = new Map<string, string[]>()

  const rememberSeed = (pairingId: string, clutchSeed: string): void => {
    seedToPairing.set(clutchSeed, pairingId)
    const queue = pendingSeeds.get(pairingId) ?? []
    if (!queue.includes(clutchSeed)) queue.push(clutchSeed)
    pendingSeeds.set(pairingId, queue)
  }

  /** The oldest un-hatched seed for this pair, consumed. Falls back to the newest known. */
  const takeSeed = (pairingId: string): string => {
    const queue = pendingSeeds.get(pairingId)
    if (queue && queue.length > 0) return queue.shift() as string
    for (const [seed, pairing] of seedToPairing) if (pairing === pairingId) return seed
    return ''
  }

  for (const past of priorJournal) {
    const fields = past.fields as Record<string, unknown>
    if (typeof fields.speciesId === 'string' && typeof fields.individualId === 'string') {
      speciesById.set(fields.individualId, fields.speciesId)
    }
    if (past.act === 'clutch.laid') {
      const laid = past.fields as ActPayloadMap['clutch.laid']
      rememberSeed(laid.pairingId, laid.clutchSeed)
    }
    if (past.act === 'clutch.hatched') {
      const hatched = past.fields as ActPayloadMap['clutch.hatched']
      const queue = pendingSeeds.get(hatched.pairingId)
      if (queue) queue.shift()
    }
  }

  const species = (individualId: string): string => {
    const known = world.speciesOf(individualId)
    if (known) {
      speciesById.set(individualId, known)
      return known
    }
    return speciesById.get(individualId) ?? ''
  }

  function attach(bus: EventBus, sink: ObservationSink): Unsubscribe {
    const subscriptions: Unsubscribe[] = []
    /** Pass an event through unchanged. Legitimate only where the bus payload *is* the act payload. */
    const identity = <K extends ActKind & GameEventType>(act: K): void => {
      subscriptions.push(
        bus.on(act, (payload) => {
          sink(act, payload as unknown as ActPayloadMap[K])
        }),
      )
    }

    // -- consequences, enriched ---------------------------------------------

    identity('turn.advanced')
    identity('money.changed')
    identity('trait.discovered')
    identity('allele.discovered')

    subscriptions.push(
      bus.on('snake.matured', ({ individualId }) => {
        sink('snake.matured', {
          individualId,
          speciesId: species(individualId),
          sex: world.sexOf(individualId) ?? 'female',
        })
      }),
    )

    subscriptions.push(
      bus.on('clutch.laid', ({ motherId, fatherId, eggCount, clutchSeed }) => {
        const pairingId = pairingIdOf(motherId, fatherId)
        rememberSeed(pairingId, clutchSeed)
        sink('clutch.laid', { pairingId, clutchSeed, eggCount })
      }),
    )

    subscriptions.push(
      bus.on('clutch.hatched', ({ motherId, fatherId, hatchedCount, unhatchedCount }) => {
        const pairingId = pairingIdOf(motherId, fatherId)
        sink('clutch.hatched', {
          pairingId,
          clutchSeed: takeSeed(pairingId),
          hatchedCount,
          unhatchedCount,
        })
      }),
    )

    subscriptions.push(
      bus.on('egg.hatched', ({ individualId, clutchSeed }) => {
        sink('egg.hatched', {
          individualId,
          clutchSeed,
          pairingId: seedToPairing.get(clutchSeed) ?? '',
          speciesId: species(individualId),
        })
      }),
    )

    subscriptions.push(
      bus.on('egg.notViable', ({ clutchSeed, ruleId }) => {
        sink('egg.notViable', {
          clutchSeed,
          ruleId,
          locusId: world.locusForRule(ruleId) ?? '',
        })
      }),
    )

    subscriptions.push(
      bus.on('pairing.lapsed', ({ motherId, fatherId, reason }) => {
        sink('pairing.lapsed', { pairingId: pairingIdOf(motherId, fatherId), reason })
      }),
    )

    // -- deliberate acts, enriched ------------------------------------------

    subscriptions.push(
      bus.on('snake.acquired', ({ individualId, source }) => {
        sink('snake.acquired', { individualId, speciesId: species(individualId), source })
      }),
    )

    subscriptions.push(
      bus.on('snake.bought', ({ individualId, price }) => {
        sink('snake.bought', { individualId, speciesId: species(individualId), price })
      }),
    )

    subscriptions.push(
      bus.on('snake.sold', ({ individualId, price }) => {
        sink('snake.sold', { individualId, speciesId: species(individualId), price })
      }),
    )

    subscriptions.push(
      bus.on('snake.comforted', ({ individualId }) => {
        sink('snake.comforted', { individualId })
      }),
    )

    subscriptions.push(
      bus.on('genetics.proven', ({ individualId, locusId }) => {
        sink('genetics.proven', { individualId, locusId, speciesId: species(individualId) })
      }),
    )

    // -- new game-layer acts, already in catalogue shape --------------------

    identity('species.chosen')
    identity('snake.named')
    identity('snake.placed')
    identity('snake.unhoused')
    identity('placement.refused')
    identity('geneTest.run')

    subscriptions.push(
      bus.on('pairing.committed', (payload) => {
        speciesById.set(payload.motherId, payload.speciesId)
        speciesById.set(payload.fatherId, payload.speciesId)
        sink('pairing.committed', payload)
      }),
    )

    // -- ui intents ---------------------------------------------------------

    identity('ui.screenOpened')
    identity('ui.cardOpened')
    identity('ui.cardRevealed')
    identity('ui.notebookOpened')
    identity('ui.notebookLocusOpened')
    identity('ui.pairingPreviewed')
    identity('ui.punnettOutcomeInspected')
    identity('ui.viabilityExplanationRead')
    identity('ui.habitatOpened')
    identity('ui.glossaryTermOpened')
    identity('ui.pedigreeOpened')

    return () => {
      for (const unsubscribe of subscriptions) unsubscribe()
    }
  }

  return { attach }
}

/**
 * `pairing.introduced` is deliberately absent from the recorder.
 *
 * The bus emits it and `session.ts` emits `pairing.committed` from the same call, with a pairing id
 * and the two judgement fields the introduction does not carry. Recording both would put two acts in
 * the journal for one click, which is exactly the "second counter for the same fact" the design
 * forbids — and the weaker of the two would be the one a careless predicate reached for. Content
 * that wants the commitment gets `pairing.committed`; the act stays in {@link ActPayloadMap} because
 * a lapsed pairing is still a thing a quest may want to talk about.
 */
export const NOT_RECORDED: readonly ActKind[] = ['pairing.introduced']
