/**
 * Tests for genetic load, and for the one thing this feature must never quietly become.
 *
 * The fixtures here are a whole miniature population — sixty hidden load loci, founders drawn
 * from them, and twelve independent lines bred through `breed()` for four generations. That is
 * deliberate. Genetic load is not a function you can unit-test into confidence; the claim being
 * made is about what happens to a *line* over generations, so the test has to breed some.
 *
 * Where a rate is asserted it is an **exact expectation** from `punnett()`, not a count of
 * sampled eggs. The engine computes closed-form probabilities everywhere else and there is no
 * reason to sample here either; the sampled clutches below exist to confirm that real eggs match
 * the arithmetic, not to estimate it.
 *
 * Nothing in this file names a trait, a species, or a snake.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { Individual, Sex, SexSystem, SpeciesDefinition } from './types'
import { makeGenotype, sexOf } from './genotype'
import { breed } from './breeding'
import { punnett } from './distribution'
import { checkViability } from './viability'
import type { PedigreeLookup } from './pedigree'
import { inbreedingCoefficient, kinship } from './pedigree'
import type { GeneticLoadPool, LoadAllele } from './load'
import {
  FOUNDER_LOAD_ALLELES,
  LOAD_POOL_SIZE,
  expressedLoad,
  loadLocus,
  loadViabilityRules,
  seedFounderLoad,
  vigor,
} from './load'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SYSTEM: SexSystem = {
  id: 'hetero-male',
  homogameticChromosome: 'H',
  heterogameticChromosome: 'K',
  heterogameticSex: 'male',
}

interface TestPhenotype {
  readonly look: string
}

/**
 * A pool at the real documented size, half of whose entries stop an egg hatching and half of
 * which produce a hatchling that needs extra care. The alternation is arbitrary and is only here
 * so both outcomes are exercised.
 */
function makePool(size: number = LOAD_POOL_SIZE): GeneticLoadPool {
  const entries: LoadAllele[] = []
  for (let i = 0; i < size; i++) {
    entries.push({
      locus: `load-${i}`,
      allele: `load-variant-${i}`,
      outcome: i % 2 === 0 ? 'eggDoesNotHatch' : 'needsExtraCare',
      explanation:
        `Two copies of load-variant-${i} met in this egg. Both parents carried one hidden copy, ` +
        `masked by a wild-type copy in each of them.`,
    })
  }
  return { id: 'test-load', entries }
}

function makeSpecies(pool: GeneticLoadPool): SpeciesDefinition<TestPhenotype> {
  return {
    id: 'test-species',
    label: 'Test species',
    sexSystem: SYSTEM,
    loci: pool.entries.map((entry) => loadLocus(entry)),
    polygenic: [],
    basePhenotype: () => ({ look: 'plain' }),
    projections: [],
    modifiers: [],
    viability: loadViabilityRules(pool),
    phenotypeKey: (p) => p.look,
    phenotypeLabel: (p) => p.look,
  }
}

/** A collection that breeds, remembers everyone, and can answer pedigree questions. */
function colony(pool: GeneticLoadPool, species: SpeciesDefinition<TestPhenotype>) {
  const byId = new Map<string, Individual>()
  const lookup: PedigreeLookup = (id) => byId.get(id)

  const founder = (id: string, sex: Sex): Individual => {
    const individual: Individual = {
      id,
      species: species.id,
      genotype: makeGenotype(species, sex, seedFounderLoad(pool, species, id)),
      parents: null,
      mutations: [],
    }
    byId.set(id, individual)
    return individual
  }

  const mate = (mother: Individual, father: Individual, clutchSize: number, seed: string) => {
    const clutch = breed({ mother, father, clutchSize, seed }, species)
    for (const hatchling of clutch.hatched) byId.set(hatchling.id, hatchling)
    return clutch
  }

  /** The exact fraction of this pairing's eggs expected to hatch. Computed, never sampled. */
  const hatchProbability = (mother: Individual, father: Individual): number =>
    1 - punnett(mother, father, species).nonViableProbability

  return { lookup, founder, mate, hatchProbability, everyone: () => [...byId.values()] }
}

const isCarrierOf = (individual: Individual, entry: LoadAllele): boolean => {
  const pair = individual.genotype.loci[entry.locus]
  return pair !== undefined && (pair[0] === entry.allele || pair[1] === entry.allele)
}

// ---------------------------------------------------------------------------
// Seeding founders
// ---------------------------------------------------------------------------

describe('seedFounderLoad', () => {
  const pool = makePool()
  const species = makeSpecies(pool)

  it('makes a founder a carrier — heterozygous, never homozygous', () => {
    const overrides = seedFounderLoad(pool, species, 'founder-1')
    const drawn = Object.entries(overrides)

    expect(drawn).toHaveLength(FOUNDER_LOAD_ALLELES)
    for (const [locusId, pair] of drawn) {
      const entry = pool.entries.find((e) => e.locus === locusId)!
      expect(pair).toEqual([entry.allele, 'wild-type'])
    }
  })

  it('is deterministic in the founder id, so nothing has to be stored', () => {
    expect(seedFounderLoad(pool, species, 'founder-1')).toEqual(
      seedFounderLoad(pool, species, 'founder-1'),
    )
    expect(seedFounderLoad(pool, species, 'founder-1')).not.toEqual(
      seedFounderLoad(pool, species, 'founder-2'),
    )
  })

  it('draws without replacement', () => {
    expect(new Set(Object.keys(seedFounderLoad(pool, species, 'founder-3', 10))).size).toBe(10)
  })

  it('keeps the pool large enough that unrelated founders rarely share a load allele', () => {
    // This is the property the whole feature rests on: if two unrelated founders routinely
    // shared load alleles, outcrossing would clear nothing and the mechanic would collapse into
    // "everything is a bit fragile". The doc comment on LOAD_POOL_SIZE predicts about k²/P,
    // which is 14.5% at the shipped constants.
    let shared = 0
    const pairs = 400
    for (let i = 0; i < pairs; i++) {
      const left = new Set(Object.keys(seedFounderLoad(pool, species, `unrelated-a-${i}`)))
      const right = Object.keys(seedFounderLoad(pool, species, `unrelated-b-${i}`))
      if (right.some((locus) => left.has(locus))) shared++
    }
    expect(shared / pairs).toBeLessThan(0.25)
  })

  it('refuses to seed load it cannot place, rather than seeding something wrong', () => {
    expect(() => seedFounderLoad(pool, species, 'x', LOAD_POOL_SIZE + 1)).toThrow(/declares only/)
    expect(() => seedFounderLoad(pool, species, 'x', -1)).toThrow(/non-negative/)

    const strayLocus: GeneticLoadPool = {
      id: 'stray',
      entries: [{ locus: 'not-a-locus', allele: 'v', outcome: 'needsExtraCare', explanation: '' }],
    }
    expect(() => seedFounderLoad(strayLocus, species, 'x', 1)).toThrow(/does not declare/)

    const strayAllele: GeneticLoadPool = {
      id: 'stray',
      entries: [{ locus: 'load-0', allele: 'nope', outcome: 'needsExtraCare', explanation: '' }],
    }
    expect(() => seedFounderLoad(strayAllele, species, 'x', 1)).toThrow(/does not declare it/)
  })

  it('refuses a sex-linked locus, which would not behave like hidden load at all', () => {
    const base = makeSpecies(pool)
    const species2: SpeciesDefinition<TestPhenotype> = {
      ...base,
      loci: base.loci.map((l, i) =>
        i === 0 ? { ...l, placement: { kind: 'sexLinked' as const, chromosome: 'H' } } : l,
      ),
    }
    const single: GeneticLoadPool = { id: 'one', entries: [pool.entries[0]!] }

    expect(() => seedFounderLoad(single, species2, 'x', 1)).toThrow(/sex-linked/)
  })
})

// ---------------------------------------------------------------------------
// Expression and consequences
// ---------------------------------------------------------------------------

describe('expressedLoad', () => {
  const pool = makePool()
  const species = makeSpecies(pool)
  const c = colony(pool, species)

  it('reports nothing for a carrier — that is the whole point of a recessive', () => {
    expect(expressedLoad(c.founder('carrier-only', 'female'), pool)).toEqual([])
  })

  it('reports the entries an animal is homozygous for, and only those', () => {
    const hom: Individual = {
      id: 'doubled-up',
      species: species.id,
      genotype: makeGenotype(species, 'female', {
        'load-1': ['load-variant-1', 'load-variant-1'],
        'load-2': ['load-variant-2', 'wild-type'],
      }),
      parents: null,
      mutations: [],
    }

    expect(expressedLoad(hom, pool).map((e) => e.allele)).toEqual(['load-variant-1'])
  })
})

describe('the two outcomes, and the ones that do not exist', () => {
  const pool = makePool()
  const species = makeSpecies(pool)

  it('turns an egg-blocking entry into an ordinary viability rule with its own explanation', () => {
    const genotype = makeGenotype(species, 'female', {
      'load-0': ['load-variant-0', 'load-variant-0'],
    })
    const result = checkViability(genotype, species)

    expect(result.viable).toBe(false)
    expect(result.explanation).toMatch(/masked by a wild-type copy/)
  })

  it('lets a needs-extra-care entry hatch, and reports it as a fact about the animal', () => {
    const genotype = makeGenotype(species, 'female', {
      'load-1': ['load-variant-1', 'load-variant-1'],
    })
    expect(checkViability(genotype, species).viable).toBe(true)

    const resident: Individual = {
      id: 'needs-extra-care',
      species: species.id,
      genotype,
      parents: null,
      mutations: [],
    }
    expect(expressedLoad(resident, pool).map((e) => e.outcome)).toEqual(['needsExtraCare'])
  })

  it('declares a rule for every egg-blocking entry and none for the rest', () => {
    const rules = loadViabilityRules(pool)
    const blocking = pool.entries.filter((e) => e.outcome === 'eggDoesNotHatch')

    expect(rules).toHaveLength(blocking.length)
    expect(rules.every((r) => r.involves.length === 1)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// The payoff: line-bred lineages, and one outcross
// ---------------------------------------------------------------------------

/**
 * Twelve independent lines, each from its own pair of unrelated founders, each closed by four
 * generations of full-sib mating, and each then paired once with a fresh unrelated founder.
 *
 * Twelve rather than one because a closed line is only two animals wide, so **drift is part of
 * the story**: about half of these lines lose their load alleles entirely along the way and stay
 * perfectly healthy. That is real — it is why some line-bred lines are fine — and averaging over
 * lines is the only honest way to state a claim about what line-breeding *tends* to do.
 */
function lineBreedingStudy() {
  const pool = makePool()
  const species = makeSpecies(pool)
  const c = colony(pool, species)

  const LINES = 12
  const CLOSED_GENERATIONS = 4
  const CLUTCH = 24

  const lines = []
  for (let n = 0; n < LINES; n++) {
    let mother = c.founder(`line-${n}-dam`, 'female')
    let father = c.founder(`line-${n}-sire`, 'male')
    const f: number[] = []
    const hatchProbability: number[] = []

    for (let generation = 1; generation <= CLOSED_GENERATIONS; generation++) {
      f.push(kinship(mother, father, c.lookup))
      hatchProbability.push(c.hatchProbability(mother, father))

      const clutch = c.mate(mother, father, CLUTCH, `line-${n}:generation-${generation}`)
      const pick = (sex: Sex): Individual => {
        const found = clutch.hatched.find((h) => sexOf(h.genotype, SYSTEM) === sex)
        if (!found) throw new Error(`test fixture: no ${sex} in clutch ${clutch.seed}`)
        return found
      }
      // No selection at all: whichever two came out first. Selecting for load would rig the
      // result, and selecting against it would hide the mechanic being tested.
      mother = pick('female')
      father = pick('male')
    }

    // `mother` and `father` are now full sibs out of the fourth generation, each carrying
    // F = 0.5. The final comparison keeps *her* fixed and swaps only the sire, so the recovery
    // below cannot be an artefact of having picked a different, luckier female.
    const unrelated = c.founder(`line-${n}-outcross-sire`, 'male')
    lines.push({
      f,
      hatchProbability,
      lineBred: mother,
      brother: father,
      unrelated,
      closedF: kinship(mother, father, c.lookup),
      closedHatchProbability: c.hatchProbability(mother, father),
      outcrossF: kinship(mother, unrelated, c.lookup),
      outcrossHatchProbability: c.hatchProbability(mother, unrelated),
    })
  }

  return { pool, species, colony: c, lines }
}

describe('line-breeding and the outcross that reverses it', () => {
  const study = lineBreedingStudy()
  const mean = (values: readonly number[]): number =>
    values.reduce((total, v) => total + v, 0) / values.length
  const at = (generation: number): number[] =>
    study.lines.map((line) => line.hatchProbability[generation]!)

  it('climbs the textbook full-sib inbreeding series in every line', () => {
    for (const line of study.lines) {
      expect(line.f).toEqual([0, 0.25, 0.375, 0.5])
    }
  })

  it('stamps that coefficient onto the hatchlings themselves', () => {
    // Not a second calculation: the number read off a hatchling is the number the pre-pairing
    // warning showed for its parents, which is what makes the warning worth showing.
    const line = study.lines[0]!
    const clutch = study.colony.mate(line.lineBred, line.brother, 8, 'confirmation-clutch')
    expect(clutch.hatched.length).toBeGreaterThan(0)
    for (const hatchling of clutch.hatched) {
      expect(inbreedingCoefficient(hatchling, study.colony.lookup)).toBe(line.closedF)
    }
  })

  it('drops the expected hatch rate as the lines close', () => {
    expect(mean(at(0))).toBeGreaterThan(0.95)
    expect(mean(at(3))).toBeLessThan(mean(at(0)) - 0.1)
    // Not a uniform dusting: some lines are badly affected and some are untouched, because a
    // closed line either keeps its founders' load alleles or drifts free of them.
    expect(Math.min(...at(3))).toBeLessThan(0.7)
    expect(Math.max(...at(3))).toBe(1)
  })

  it('recovers completely, in one generation, in every single line', () => {
    // The whole mechanic, and the same female on both sides of it. She is unchanged — she still
    // carries every load allele she inherited. All that changed is who she was paired with, and
    // because the unrelated sire's load was drawn from a pool of sixty, none of it lines up
    // with hers.
    for (const line of study.lines) {
      expect(line.closedF).toBe(0.59375)
      expect(line.outcrossF).toBe(0)
      expect(line.outcrossHatchProbability).toBe(1)
      expect(line.outcrossHatchProbability).toBeGreaterThanOrEqual(line.closedHatchProbability)
    }
    expect(mean(study.lines.map((l) => l.outcrossHatchProbability))).toBeGreaterThan(
      mean(study.lines.map((l) => l.closedHatchProbability)),
    )
  })

  it('behaves that way in real eggs, not just in the arithmetic', () => {
    // Take the worst-affected line and actually lay both clutches, from the same female.
    const worst = [...study.lines].sort(
      (a, b) => a.closedHatchProbability - b.closedHatchProbability,
    )[0]!

    const closedClutch = study.colony.mate(worst.lineBred, worst.brother, 200, 'sampled:closed')
    const outcrossClutch = study.colony.mate(worst.lineBred, worst.unrelated, 200, 'sampled:outcross')

    expect(closedClutch.unhatched.length).toBeGreaterThan(0)
    expect(
      closedClutch.unhatched.every((e) => /masked by a wild-type copy/.test(e.explanation)),
    ).toBe(true)
    expect(outcrossClutch.unhatched).toEqual([])
    expect(outcrossClutch.hatched.length).toBeGreaterThan(closedClutch.hatched.length)
  })

  it('produces hatchlings that need extra care, who hatch and stay', () => {
    // The other outcome, and the one the rehab framing is built around: these animals are here,
    // they are fine, and they are the reason the place exists.
    const residents = study.colony
      .everyone()
      .filter((animal) =>
        expressedLoad(animal, study.pool).some((e) => e.outcome === 'needsExtraCare'),
      )

    expect(residents.length).toBeGreaterThan(0)
  })

  it('does not pretend the load went away — the outcrossed hatchlings are carriers', () => {
    // The honest half of the story, and why line-breeding stays a decision rather than a mistake
    // you can undo: outcrossing masks the load, it does not remove it. Bred back into the line,
    // the same alleles pair up again.
    const line = study.lines[0]!
    const clutch = study.colony.mate(line.lineBred, line.unrelated, 40, 'sampled:carriers')
    const carriers = clutch.hatched.filter((h) =>
      study.pool.entries.some((entry) => isCarrierOf(h, entry)),
    )

    expect(carriers.length).toBeGreaterThan(0)
    expect(carriers.every((h) => expressedLoad(h, study.pool).length === 0)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Vigor: displayed, never simulated
// ---------------------------------------------------------------------------

describe('vigor', () => {
  const pool = makePool()
  const species = makeSpecies(pool)
  const c = colony(pool, species)
  const clear = c.founder('clear-founder', 'female')

  it('is 1 for an outcrossed animal with nothing expressed, and falls with F', () => {
    expect(vigor(clear, pool, 0)).toBe(1)
    expect(vigor(clear, pool, 0.25)).toBe(0.75)
    expect(vigor(clear, pool, 0.5)).toBe(0.5)
  })

  it('falls further for each expressed load locus', () => {
    const resident: Individual = {
      id: 'resident',
      species: species.id,
      genotype: makeGenotype(species, 'female', {
        'load-1': ['load-variant-1', 'load-variant-1'],
      }),
      parents: null,
      mutations: [],
    }
    expect(vigor(resident, pool, 0)).toBeLessThan(vigor(clear, pool, 0))
  })

  it('stays inside 0..1 for nonsense input rather than producing a nonsense readout', () => {
    expect(vigor(clear, pool, 5)).toBe(0)
    expect(vigor(clear, pool, -5)).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// The guards
// ---------------------------------------------------------------------------

/**
 * These read the engine's source as text. That is unusual for a unit test and it is the right
 * tool here: the properties asserted are about what the code is *allowed to reference*, and no
 * runtime assertion can catch a caller that has not been written yet.
 *
 * The patterns are assembled from string fragments so that each guard does not match its own
 * source. Without that, this block would be the only thing in the repo that failed it.
 */
describe('source guards', () => {
  const src = join(fileURLToPath(new URL('.', import.meta.url)), '..')
  const mine = ['pedigree.ts', 'load.ts', 'pedigree.test.ts', 'load.test.ts']

  const filesUnder = (dir: string): string[] => {
    const out: string[] = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) out.push(...filesUnder(full))
      else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) out.push(full)
    }
    return out
  }

  const readMine = (name: string): string => readFileSync(join(src, 'genetics', name), 'utf8')

  it('proves nothing in the engine consumes vigor', () => {
    // The guard the whole design rests on. Delete `vigor` and the biology must be unchanged; if
    // anything below referenced it, the readout would have become a simulated stat, which is the
    // one thing this feature was specified not to be.
    const engineFiles = [
      ...filesUnder(join(src, 'genetics')),
      ...filesUnder(join(src, 'species')),
      ...filesUnder(join(src, 'render')),
    ]
    const declaredHere = [join(src, 'genetics', 'load.ts'), join(src, 'genetics', 'load.test.ts')]
    const offenders = engineFiles.filter(
      (file) =>
        !declaredHere.includes(file) &&
        new RegExp('\\b' + 'vigor' + '\\b', 'i').test(readFileSync(file, 'utf8')),
    )

    expect(offenders).toEqual([])
  })

  it('keeps vigor out of the load module even from inside', () => {
    const source = readMine('load.ts')
    expect(source.indexOf('export function ' + 'vigor')).toBeGreaterThan(-1)
    expect(source.replace(/export function vigor/g, '')).not.toMatch(
      new RegExp('\\b' + 'vigor' + '\\s*\\('),
    )
  })

  it('keeps the vocabulary this feature was specified with', () => {
    const forbidden = new RegExp(
      '\\b(' + ['d' + 'ie\\w*', 'd' + 'eath', 'k' + 'ill\\w*', 'c' + 'ull\\w*', 'e' + 'uthan\\w*'].join('|') + ')\\b',
      'i',
    )
    for (const name of mine) {
      expect({ name, found: forbidden.exec(readMine(name))?.[0] ?? null }).toEqual({
        name,
        found: null,
      })
    }
  })

  it('keeps unseeded randomness out', () => {
    const unseeded = new RegExp('Math' + '\\.random')
    for (const name of mine) {
      expect({ name, found: unseeded.test(readMine(name)) }).toEqual({ name, found: false })
    }
  })
})
