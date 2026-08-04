/**
 * A wild-caught snake arrives a mystery, and the mystery is priced.
 *
 * Three claims live here, and they are the same claim seen from three sides:
 *
 * 1. An animal with no paperwork knows about itself **only what a keeper holding it could find
 *    out** — how it looks, and what sex it is. Everything on its card is `inferKnowledge`
 *    conditioning on those two facts, so a visible recessive comes back proven and a
 *    normal-looking animal comes back a coin-flip at every recessive locus.
 * 2. It does not arrive guaranteed outbred. `F = 0` is a claim about its parents that nobody can
 *    make, so arrivals are drawn from a distribution and the inbred ones carry expressed load.
 * 3. **What you can prove is worth money.** Two animals with the same genotype and the same
 *    appearance fetch different prices when one has been proven out and the other has not.
 */
import { describe, expect, it } from 'vitest'
import { Session } from './session'
import { estimateValue, proofOf, traitStrengthOf } from './market'
import {
  FOUNDER_INBREEDING_BANDS,
  PROOF_PRICE_MULTIPLIER_MIN,
  TRAIT_STRENGTH_PRICE_PREMIUM_MAX,
  founderInbreedingFrom,
  salePrice,
} from './tuning'
import { makeGenotype } from '../genetics/genotype'
import type { AllelePair, Genotype } from '../genetics/types'
import type { SnakeRecord } from './roster'

const canonical = (pair: AllelePair): string =>
  [...pair].filter((a): a is string => a !== null).sort().join('/')

function arrivals(seed: string, count: number): { session: Session; records: SnakeRecord[] } {
  const session = new Session({ worldSeed: seed, gateMode: 'instant' })
  const records: SnakeRecord[] = []
  for (let i = 0; i < count; i++) records.push(session.spawnRandom('ball-python'))
  return { session, records }
}

// ---------------------------------------------------------------------------
// A. What a wild-caught animal knows about itself
// ---------------------------------------------------------------------------

describe('a new arrival carries only phenotype-supported knowledge', () => {
  it('never rules out its own genotype — belief is conditioned on looking, not invented', () => {
    const { session, records } = arrivals('arrival-honesty', 120)

    for (const record of records) {
      const knowledge = session.knowledgeOf(record)
      for (const [locusId, belief] of Object.entries(knowledge.loci)) {
        const truth = canonical(record.individual.genotype.loci[locusId]!)
        if (belief.kind === 'certain') {
          expect(canonical(belief.pair), `${record.individual.id} at ${locusId}`).toBe(truth)
        } else if (belief.kind === 'posterior') {
          expect(
            belief.distribution[truth] ?? 0,
            `${record.individual.id} at ${locusId} gives its own genotype zero probability`,
          ).toBeGreaterThan(0)
        }
      }
    }
  })

  it('proves a visible recessive, because you can see it is homozygous', () => {
    const { session, records } = arrivals('arrival-proof', 200)

    const visible = records.filter((r) => {
      const pair = r.individual.genotype.loci['albino']!
      return pair[0] === pair[1] && pair[0] !== 'wild-type'
    })
    expect(visible.length, 'no arrival was homozygous at albino — widen the sample').toBeGreaterThan(0)

    for (const record of visible) {
      const belief = session.beliefAt(record, 'albino')
      expect(belief?.kind, `${record.individual.id} looks albino and should be proven`).toBe('certain')
    }
  })

  it('never claims a het it cannot see — a carrier arrives a maybe, every time', () => {
    const { session, records } = arrivals('arrival-hets', 200)

    const carriers = records.filter((r) => {
      const pair = r.individual.genotype.loci['albino']!
      return pair[0] !== pair[1] && (pair[0] === 'wild-type' || pair[1] === 'wild-type')
    })
    expect(carriers.length, 'no arrival was a het at albino — widen the sample').toBeGreaterThan(0)

    for (const record of carriers) {
      const belief = session.beliefAt(record, 'albino')
      expect(belief?.kind, `${record.individual.id} is a hidden carrier and cannot be certain`).toBe(
        'posterior',
      )
      if (belief?.kind !== 'posterior') continue
      // The wild-type-looking possibility has to still be on the table — that is what makes it a
      // maybe rather than a fact you happen to have written down.
      expect(belief.distribution['wild-type/wild-type'] ?? 0).toBeGreaterThan(0)
    }
  })

  it('leaves an invisible locus unknown rather than guessing at it', () => {
    const { session, records } = arrivals('arrival-invisible', 60)
    // `sparkle-eyes` changes only `eye.sizeScale`, which `phenotypeKeyFor` does not fold into the
    // key — so as far as the inference is concerned, looking at the animal says nothing at all
    // about this locus. It has to come back `unknown`, for every arrival, rather than defaulting
    // to a confident wild-type.
    const kinds = new Set(records.map((r) => session.beliefAt(r, 'sparkle-eyes')?.kind))
    expect(kinds).toEqual(new Set(['unknown']))
  })

  it('arrives less than fully proven, and proving it out moves the number', () => {
    const { session, records } = arrivals('arrival-proof-score', 40)

    for (const record of records) {
      const proof = session.proofOf(record)
      expect(proof).toBeGreaterThan(0)
      expect(proof, `${record.individual.id} arrived fully proven`).toBeLessThan(1)
    }

    const subject = records[0]!
    const before = session.proofOf(subject)
    for (const locus of session.speciesOf(subject).authored.loci) {
      session.noteEvidence(subject.individual.id, {
        kind: 'geneTest',
        locus: locus.id,
        pair: subject.individual.genotype.loci[locus.id]!,
      })
    }
    expect(session.proofOf(subject)).toBe(1)
    expect(session.proofOf(subject)).toBeGreaterThan(before)
  })
})

// ---------------------------------------------------------------------------
// B. F at spawn is a distribution
// ---------------------------------------------------------------------------

describe('arrivals are not all outbred', () => {
  it('founderInbreedingFrom lands in the band its roll selects, and nowhere else', () => {
    const total = FOUNDER_INBREEDING_BANDS.reduce((sum, band) => sum + band[0], 0)
    let cumulative = 0
    for (const [weight, min, max] of FOUNDER_INBREEDING_BANDS) {
      // Sample strictly inside this band's share of the roll space.
      const lower = cumulative / total
      cumulative += weight
      const upper = cumulative / total
      for (const t of [0.01, 0.5, 0.99]) {
        const roll = lower + (upper - lower) * t
        expect(founderInbreedingFrom(roll, 0)).toBeCloseTo(min, 10)
        expect(founderInbreedingFrom(roll, 1)).toBeCloseTo(max, 10)
        expect(founderInbreedingFrom(roll, 0.5)).toBeCloseTo((min + max) / 2, 10)
      }
    }
  })

  it('spreads real arrivals across the bands in roughly the declared proportions', () => {
    const { records } = arrivals('spawn-f-shape', 400)
    const fs = records.map((r) => r.inbreeding ?? -1)

    const total = FOUNDER_INBREEDING_BANDS.reduce((sum, band) => sum + band[0], 0)
    for (const [weight, min, max] of FOUNDER_INBREEDING_BANDS) {
      const share = fs.filter((f) => f >= min && f < max).length / fs.length
      // Generous, because this is asserting a shape rather than a seed: it fails if a band is
      // empty or if the mixture has quietly collapsed onto one of them.
      expect(share, `band ${min}–${max}`).toBeGreaterThan((weight / total) * 0.5)
      expect(share, `band ${min}–${max}`).toBeLessThan((weight / total) * 1.6)
    }
  })

  it('is not a flat zero, and does reach genuinely inbred animals', () => {
    const { records } = arrivals('spawn-f-spread', 400)
    const fs = records.map((r) => r.inbreeding ?? -1)
    const highest = FOUNDER_INBREEDING_BANDS[FOUNDER_INBREEDING_BANDS.length - 1]!

    expect(new Set(fs).size, 'every arrival got the same F').toBeGreaterThan(50)
    expect(Math.min(...fs)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...fs)).toBeLessThanOrEqual(highest[2])
    // Somebody's closed line. Rare, and it has to actually happen or the coefficient is decoration.
    expect(fs.filter((f) => f >= highest[1]).length).toBeGreaterThan(0)
  })

  it('an inbred arrival carries more expressed load than an outbred one', () => {
    const { records } = arrivals('spawn-f-load', 400)
    const expressed = (f: number, above: boolean) => {
      const group = records.filter((r) => (above ? (r.inbreeding ?? 0) >= f : (r.inbreeding ?? 0) < f))
      return group.reduce((sum, r) => sum + (r.expressedLoad?.length ?? 0), 0) / group.length
    }

    // D3: `F` is the probability two alleles at a locus are identical by descent, so an animal
    // with a real `F` is homozygous by descent somewhere — including at the load loci.
    expect(expressed(0.1, true)).toBeGreaterThan(expressed(0.02, false) + 0.05)
  })
})

// ---------------------------------------------------------------------------
// C. Pricing
// ---------------------------------------------------------------------------

/** Put an animal of a chosen genotype on the roster, observed the way an arrival is observed. */
function place(session: Session, id: string, genotype: Genotype, inbreeding: number): SnakeRecord {
  const loaded = session.species['ball-python']!
  const individual = {
    id,
    species: loaded.authored.id,
    genotype,
    parents: null,
    mutations: [],
  }
  const record: SnakeRecord = {
    individual,
    name: id,
    acquiredTurn: 0,
    source: 'purchased',
    inbreeding,
    expressedLoad: [],
  }
  session.state.roster.add(record)
  session.noteEvidence(id, {
    kind: 'observedPhenotype',
    phenotypeKey: loaded.playable.phenotypeKey(session.phenotype(record)),
  })
  session.noteEvidence(id, { kind: 'observedSex', sex: session.sexOf(record) })
  return record
}

describe('what you can prove is what you can sell', () => {
  it('TWO SNAKES WITH THE SAME GENOTYPE PRICE DIFFERENTLY WHEN ONE OF THEM IS PROVEN', () => {
    const session = new Session({ worldSeed: 'proof-pricing', gateMode: 'instant' })
    const playable = session.species['ball-python']!.playable

    // A normal-looking female carrying one copy of albino. Nothing about her appearance says so.
    const genotype = () =>
      makeGenotype(playable, 'female', { albino: ['albino', 'wild-type'] })

    const mystery = place(session, 'unpapered', genotype(), 0.05)
    const documented = place(session, 'proven-out', genotype(), 0.05)

    // Identical animals. Same alleles, same sex, same inbreeding, same everything the renderer
    // and the biology can see.
    expect(documented.individual.genotype).toEqual(mystery.individual.genotype)
    expect(session.phenotype(documented).label).toBe(session.phenotype(mystery).label)
    expect(session.vigorOf(documented)).toBe(session.vigorOf(mystery))

    // The only difference: somebody did the work on one of them.
    for (const locus of session.speciesOf(documented).authored.loci) {
      session.noteEvidence('proven-out', {
        kind: 'geneTest',
        locus: locus.id,
        pair: documented.individual.genotype.loci[locus.id]!,
      })
    }

    expect(session.proofOf(documented)).toBe(1)
    expect(session.proofOf(mystery)).toBeLessThan(1)

    // And that difference is money.
    expect(session.valueOf(documented)).toBeGreaterThan(session.valueOf(mystery))

    // Exactly as much money as the proof term says: nothing else moved. The tolerance is one
    // currency unit at a tier-1 base of 90, because `valueOf` rounds to whole money.
    const proof = session.proofOf(mystery)
    const expected = PROOF_PRICE_MULTIPLIER_MIN + (1 - PROOF_PRICE_MULTIPLIER_MIN) * proof
    const ratio = session.valueOf(mystery) / session.valueOf(documented)
    expect(Math.abs(ratio - expected)).toBeLessThan(1 / session.valueOf(documented))
  })

  it('proving one locus out is worth money on its own', () => {
    const session = new Session({ worldSeed: 'incremental-proof', gateMode: 'instant' })
    const playable = session.species['ball-python']!.playable
    const record = place(session, 'subject', makeGenotype(playable, 'male', {}), 0)

    const before = session.valueOf(record)
    session.noteEvidence('subject', {
      kind: 'geneTest',
      locus: 'glimmer-genes',
      pair: record.individual.genotype.loci['glimmer-genes']!,
    })
    expect(session.valueOf(record)).toBeGreaterThan(before)
  })

  it('a more inbred animal of the same morph is worth less', () => {
    const session = new Session({ worldSeed: 'f-pricing', gateMode: 'instant' })
    const playable = session.species['ball-python']!.playable
    const genotype = () => makeGenotype(playable, 'female', {})

    const healthy = place(session, 'outbred', genotype(), 0)
    const inbred = place(session, 'line-bred', genotype(), 0.3)

    expect(session.inbreedingOf(inbred)).toBeGreaterThan(session.inbreedingOf(healthy))
    expect(session.vigorOf(inbred)).toBeLessThan(session.vigorOf(healthy))
    expect(session.valueOf(inbred)).toBeLessThan(session.valueOf(healthy))
  })

  it('scores trait strength off breeding value, so an ordinary animal pays exactly base', () => {
    const session = new Session({ worldSeed: 'trait-strength', gateMode: 'instant' })
    const authored = session.species['ball-python']!.authored
    const playable = session.species['ball-python']!.playable

    const plain = place(session, 'plain', makeGenotype(playable, 'male', {}), 0)
    const highWhite = place(
      session,
      'high-white',
      makeGenotype(playable, 'male', { piebald: ['piebald', 'piebald'] }),
      0,
    )

    expect(traitStrengthOf(plain.individual, authored)).toBe(0)
    expect(traitStrengthOf(highWhite.individual, authored)).toBe(1)

    // Two animals of the same genotype score identically — the non-heritable part of a polygenic
    // value is deliberately not priced, so an id cannot be worth money.
    const twin = place(session, 'plain-twin', makeGenotype(playable, 'male', {}), 0)
    expect(traitStrengthOf(twin.individual, authored)).toBe(
      traitStrengthOf(plain.individual, authored),
    )
  })

  it('prices the four terms multiplicatively, and defaults every new one to neutral', () => {
    // The economy model in `tuning.test.ts` calls the three-argument form. That has to keep
    // meaning what it meant, or the charter invariants are measuring a different function.
    expect(salePrice(2, 0, 1)).toBe(salePrice(2, 0, 1, 1, 0))

    const proven = salePrice(2, 0, 1, 1, 0)
    const unproven = salePrice(2, 0, 1, 0, 0)
    expect(unproven / proven).toBeCloseTo(PROOF_PRICE_MULTIPLIER_MIN, 10)

    const striking = salePrice(2, 0, 1, 1, 1)
    expect(striking / proven).toBeCloseTo(1 + TRAIT_STRENGTH_PRICE_PREMIUM_MAX, 10)
  })

  it('reports 2/3 proof for the classic 66% possible het', () => {
    // `economy-design.md`'s number, locus for locus: a normal-looking hatchling out of two proven
    // carriers is two-thirds likely to be a het, and that is what the proof term reads.
    expect(
      proofOf({
        individual: 'possible-het',
        loci: {
          albino: {
            kind: 'posterior',
            distribution: { 'albino/wild-type': 2 / 3, 'wild-type/wild-type': 1 / 3 },
          },
        },
      }),
    ).toBeCloseTo(2 / 3, 10)

    expect(
      proofOf({
        individual: 'proven',
        loci: { albino: { kind: 'certain', pair: ['albino', 'wild-type'] } },
      }),
    ).toBe(1)
  })

  it('leaves an animal nobody knows anything about at the uncertainty floor, not at zero', () => {
    const session = new Session({ worldSeed: 'uncertainty-floor', gateMode: 'instant' })
    const playable = session.species['ball-python']!.playable
    const record = place(session, 'anonymous', makeGenotype(playable, 'male', {}), 0)
    const phenotype = session.phenotype(record)

    const unknowable = estimateValue(phenotype, { proof: 0 })
    expect(unknowable).toBeGreaterThan(0)
    expect(unknowable).toBe(Math.round(salePrice(1, 0, 1, 0, 0)))
    expect(unknowable).toBeLessThan(estimateValue(phenotype, { proof: 1 }))
  })
})
