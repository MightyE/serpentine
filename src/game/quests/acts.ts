/**
 * Serpentine — quests: the act catalogue at runtime.
 *
 * `ActPayloadMap` is types, and types are gone by the time a test runs. Three instruments need the
 * same information as *values* — the witness synthesiser, the blind playthrough, and the emitter
 * audit — so it lives here once rather than three times.
 *
 * {@link ACT_DEFAULTS} is typed `{ [K in ActKind]: ActPayloadMap[K] }`, which makes the table
 * exhaustive by construction: adding an act to the catalogue without adding a specimen here is a
 * compile error, and every field name in it is checked against the real payload. That is the whole
 * reason to write the table this way rather than as a list of field names.
 */
import type { ActKind, ActPayloadMap } from './types'

/**
 * One well-formed specimen of every act.
 *
 * The values are deliberately recognisable rather than realistic — `w-mother`, `w-locus` — because
 * they appear in test failure messages, and "which id is this" is the first question a failing
 * witness raises. Numbers sit in the middle of their plausible range so that a `lt` or `gt` filter
 * has room to move in either direction.
 */
export const ACT_DEFAULTS: { [K in ActKind]: ActPayloadMap[K] } = {
  'turn.advanced': { turn: 1 },
  'money.changed': { balance: 1000, delta: 100, reason: 'w-reason' },
  'snake.matured': { individualId: 'w-animal', speciesId: 'w-species', sex: 'female' },
  'clutch.laid': { pairingId: 'w-pairing', clutchSeed: 'w-clutch', eggCount: 4 },
  'clutch.hatched': {
    pairingId: 'w-pairing',
    clutchSeed: 'w-clutch',
    hatchedCount: 3,
    unhatchedCount: 1,
  },
  'egg.hatched': {
    individualId: 'w-animal',
    clutchSeed: 'w-clutch',
    pairingId: 'w-pairing',
    speciesId: 'w-species',
  },
  'egg.notViable': { clutchSeed: 'w-clutch', ruleId: 'w-rule', locusId: 'w-locus' },
  'pairing.lapsed': { pairingId: 'w-pairing', reason: 'w-reason' },
  'trait.discovered': { speciesId: 'w-species', locusId: 'w-locus', value: 'w-value' },
  'allele.discovered': { speciesId: 'w-species', locusId: 'w-locus', alleleId: 'w-allele' },

  'species.chosen': { speciesId: 'w-species' },
  'snake.acquired': { individualId: 'w-animal', speciesId: 'w-species', source: 'rescued' },
  'snake.bought': { individualId: 'w-animal', speciesId: 'w-species', price: 200 },
  'snake.sold': { individualId: 'w-animal', speciesId: 'w-species', price: 200 },
  'snake.named': { individualId: 'w-animal', name: 'w-name' },
  'snake.comforted': { individualId: 'w-animal' },
  'snake.placed': {
    individualId: 'w-animal',
    speciesId: 'w-species',
    sex: 'female',
    habitatId: 'w-habitat',
    stage: 'adult',
  },
  'snake.unhoused': { individualId: 'w-animal', habitatId: 'w-habitat' },
  'placement.refused': { individualId: 'w-animal', habitatId: 'w-habitat', reasonId: 'capacity' },
  'pairing.introduced': {
    pairingId: 'w-pairing',
    motherId: 'w-mother',
    fatherId: 'w-father',
    speciesId: 'w-species',
    relatedness: 0.125,
  },
  'pairing.committed': {
    pairingId: 'w-pairing',
    motherId: 'w-mother',
    fatherId: 'w-father',
    speciesId: 'w-species',
    relatedness: 0.125,
    nonViableProbability: 0.1,
  },
  'geneTest.run': {
    individualId: 'w-animal',
    locusId: 'w-locus',
    speciesId: 'w-species',
    cost: 150,
  },
  'genetics.proven': { individualId: 'w-animal', locusId: 'w-locus', speciesId: 'w-species' },

  'ui.screenOpened': { screen: 'collection' },
  'ui.cardOpened': {
    individualId: 'w-animal',
    speciesId: 'w-species',
    pairingId: 'w-pairing',
    phenotypeKey: 'w-phenotype',
  },
  'ui.cardRevealed': { individualId: 'w-animal' },
  'ui.notebookOpened': { individualId: 'w-animal', speciesId: 'w-species' },
  'ui.notebookLocusOpened': {
    individualId: 'w-animal',
    speciesId: 'w-species',
    locusId: 'w-locus',
    mechanism: 'recessive',
    belief: 'possibleHet',
  },
  'ui.pairingPreviewed': {
    motherId: 'w-mother',
    fatherId: 'w-father',
    speciesId: 'w-species',
    relatedness: 0.125,
    nonViableProbability: 0.1,
    locusId: 'w-locus',
    motherShows: false,
    fatherShows: false,
  },
  'ui.punnettOutcomeInspected': {
    motherId: 'w-mother',
    fatherId: 'w-father',
    phenotypeKey: 'w-phenotype',
    probability: 0.25,
  },
  'ui.viabilityExplanationRead': { clutchSeed: 'w-clutch', ruleId: 'w-rule' },
  'ui.habitatOpened': { habitatId: 'w-habitat' },
  'ui.glossaryTermOpened': { termId: 'w-term' },
  'ui.pedigreeOpened': { individualId: 'w-animal', generations: 3 },
}

export const ALL_ACTS: readonly ActKind[] = Object.keys(ACT_DEFAULTS) as ActKind[]

/**
 * Acts that cannot be performed again on demand.
 *
 * §B5: *no step may depend on a one-time resource — every act referenced by a demonstrative signal
 * must be repeatable from any reachable game state, so a player who missed it can always go and do
 * it.* These three are not. A trait or an allele is discovered once per species and never again, and
 * a card's first reveal is finished once per animal; a player who was not on a quest at the moment it
 * happened can never make it happen again for that subject, and for a whole-species discovery may
 * never be able to at all.
 *
 * They stay in the catalogue because a weak step may legitimately mention one — noticing a discovery
 * is a fine incidental step. `witness.test.ts` asserts only that no *demonstrative* signal does.
 */
export const ONE_TIME_ACTS: ReadonlySet<ActKind> = new Set<ActKind>([
  'trait.discovered',
  'allele.discovered',
  'ui.cardRevealed',
])

/**
 * The canonical field an act carries for each bind key, where it carries one directly.
 *
 * `pairing` is absent for `ui.pairingPreviewed` and `ui.punnettOutcomeInspected` on purpose: they
 * name the two parents instead, and `bindValueOf` derives the id. The synthesiser handles that pair
 * of fields as a special case for the same reason.
 */
export const BIND_FIELD = {
  individual: 'individualId',
  pairing: 'pairingId',
  clutch: 'clutchSeed',
  locus: 'locusId',
  species: 'speciesId',
  habitat: 'habitatId',
  offspring: 'individualId',
  phenotype: 'phenotypeKey',
} as const
