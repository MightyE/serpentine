import { describe, expect, it } from 'vitest'
import { ballPython } from './ballPython'
import { ReferenceGeneticsEngine } from './testSupport/referenceEngine'
import { makeIndividual, sexLinkedPair, wildTypeGenotype, withLoci } from './testSupport/fixtures'

const engine = new ReferenceGeneticsEngine()

function traitsFor(overrides: Record<string, readonly [string | null, string | null]>, sex: 'male' | 'female' = 'male') {
  const genotype = withLoci(wildTypeGenotype(ballPython, sex), overrides)
  const individual = makeIndividual(ballPython, genotype)
  return engine.deriveTraits(individual, ballPython)
}

describe('ball python: albino complex (simple recessive + compound heterozygote)', () => {
  it.each([
    [['wild-type', 'wild-type'], 'wildType'],
    [['wild-type', 'albino'], 'wildType'],
    [['wild-type', 'candy'], 'wildType'],
    [['albino', 'albino'], 'albino'],
    [['candy', 'candy'], 'candy'],
    [['albino', 'candy'], 'ultramel'],
  ] as const)('albino=%s -> albinoPigment=%s', (pair, expected) => {
    expect(traitsFor({ albino: pair }).albinoPigment).toBe(expected)
  })
})

describe('ball python: pinstripe (dominant, no super form)', () => {
  it.each([
    [['wild-type', 'wild-type'], false],
    [['wild-type', 'pinstripe'], true],
    [['pinstripe', 'pinstripe'], true],
  ] as const)('pinstripe=%s -> pinstripe=%s', (pair, expected) => {
    expect(traitsFor({ pinstripe: pair }).pinstripe).toBe(expected)
  })

  it('het and homozygous read identically — that is the mode, not a bug', () => {
    const het = traitsFor({ pinstripe: ['wild-type', 'pinstripe'] }).pinstripe
    const hom = traitsFor({ pinstripe: ['pinstripe', 'pinstripe'] }).pinstripe
    expect(het).toBe(hom)
  })
})

describe('ball python: pastel (incomplete dominant, distinct super form)', () => {
  it.each([
    [['wild-type', 'wild-type'], 'wildType'],
    [['wild-type', 'pastel'], 'pastel'],
    [['pastel', 'pastel'], 'superPastel'],
  ] as const)('pastel=%s -> pastelIntensity=%s', (pair, expected) => {
    expect(traitsFor({ pastel: pair }).pastelIntensity).toBe(expected)
  })

  it('het and homozygous are distinct values, unlike pinstripe', () => {
    const het = traitsFor({ pastel: ['wild-type', 'pastel'] }).pastelIntensity
    const hom = traitsFor({ pastel: ['pastel', 'pastel'] }).pastelIntensity
    expect(het).not.toBe(hom)
  })
})

describe('ball python: blue-eyed leucistic complex (multi-allele series)', () => {
  it.each([
    [['wild-type', 'wild-type'], 'wildType'],
    [['wild-type', 'lesser'], 'hetLesser'],
    [['wild-type', 'mojave'], 'hetMojave'],
    [['wild-type', 'butter'], 'hetButter'],
    [['lesser', 'lesser'], 'bel'],
    [['mojave', 'mojave'], 'bel'],
    [['lesser', 'mojave'], 'bel'],
    [['lesser', 'butter'], 'bel'],
    [['mojave', 'butter'], 'bel'],
  ] as const)('bel=%s -> belForm=%s', (pair, expected) => {
    expect(traitsFor({ bel: pair }).belForm).toBe(expected)
  })

  it('two different complex members produce the same result as one doubled', () => {
    expect(traitsFor({ bel: ['lesser', 'mojave'] }).belForm).toBe(traitsFor({ bel: ['lesser', 'lesser'] }).belForm)
  })
})

describe('ball python: champagne (incomplete dominant, homozygous-lethal super)', () => {
  it.each([
    [['wild-type', 'wild-type'], 'wildType'],
    [['wild-type', 'champagne'], 'champagne'],
  ] as const)('champagne=%s -> champagneIntensity=%s', (pair, expected) => {
    expect(traitsFor({ champagne: pair }).champagneIntensity).toBe(expected)
  })

  it('champagne heterozygotes are flagged needing extra care (welfare, per findings)', () => {
    const genotype = withLoci(wildTypeGenotype(ballPython, 'male'), { champagne: ['wild-type', 'champagne'] })
    const phenotype = engine.express(makeIndividual(ballPython, genotype), ballPython)
    expect(phenotype.effects).toContain('needsExtraCare')
  })

  it('super champagne (homozygous) is non-viable — an egg, never a death', () => {
    const genotype = withLoci(wildTypeGenotype(ballPython, 'male'), { champagne: ['champagne', 'champagne'] })
    const viability = engine.checkViability(genotype, ballPython)
    expect(viability.viable).toBe(false)
    expect(viability.ruleId).toBe('super-champagne-lethal')
    expect(viability.explanation).toBeTruthy()
  })

  it('a champagne x champagne clutch hatches roughly 2:1, not 1:2:1 — the lethal super removed', () => {
    const mother = makeIndividual(
      ballPython,
      withLoci(wildTypeGenotype(ballPython, 'female'), { champagne: ['wild-type', 'champagne'] }),
      'mother',
    )
    const father = makeIndividual(
      ballPython,
      withLoci(wildTypeGenotype(ballPython, 'male'), { champagne: ['wild-type', 'champagne'] }),
      'father',
    )
    const clutch = engine.breed(
      { mother, father, clutchSize: 400, seed: 'champagne-clutch-test' },
      ballPython,
    )
    const totalEggs = clutch.hatched.length + clutch.unhatched.length
    expect(totalEggs).toBe(400)
    // Expect ~25% non-viable (the champagne/champagne quarter of a 1:2:1 Punnett square).
    const nonViableFraction = clutch.unhatched.length / totalEggs
    expect(nonViableFraction).toBeGreaterThan(0.15)
    expect(nonViableFraction).toBeLessThan(0.35)
    for (const egg of clutch.unhatched) {
      expect(egg.ruleId).toBe('super-champagne-lethal')
    }
    // Of the survivors, none should be homozygous champagne — the whole point of the rule.
    for (const hatchling of clutch.hatched) {
      const pair = hatchling.genotype.loci.champagne
      expect(pair?.[0] === 'champagne' && pair?.[1] === 'champagne').toBe(false)
    }
  })

  it('punnett() reports the same non-viable fraction in closed form', () => {
    const mother = makeIndividual(
      ballPython,
      withLoci(wildTypeGenotype(ballPython, 'female'), { champagne: ['wild-type', 'champagne'] }),
      'mother',
    )
    const father = makeIndividual(
      ballPython,
      withLoci(wildTypeGenotype(ballPython, 'male'), { champagne: ['wild-type', 'champagne'] }),
      'father',
    )
    const distribution = engine.punnett(mother, father, ballPython, { loci: ['champagne'] })
    expect(distribution.nonViableProbability).toBeCloseTo(0.25, 5)
    expect(distribution.nonViableReasons).toEqual([
      { value: 'super-champagne-lethal', probability: 0.25 },
    ])
  })
})

describe('ball python: coral glow / banana (Y-linked, sex-linked)', () => {
  it('females never carry it — the locus does not exist on their chromosomes', () => {
    const genotype = wildTypeGenotype(ballPython, 'female')
    expect(genotype.loci['coral-glow']).toEqual([null, null])
    expect(traitsFor({}, 'female').coralGlowPresent).toBe(false)
  })

  it('a wild-type male is hemizygous, one allele, not two', () => {
    const genotype = wildTypeGenotype(ballPython, 'male')
    const pair = genotype.loci['coral-glow']
    expect(pair?.filter((a) => a !== null)).toEqual(['wild-type'])
  })

  it('a male with coral-glow on his Y expresses it', () => {
    expect(traitsFor({ 'coral-glow': sexLinkedPair(ballPython, 'male', 'coral-glow', 'coral-glow') }, 'male').coralGlowPresent).toBe(
      true,
    )
  })

  it('a Coral Glow father passes it to all sons and no daughters (Y-linked transmission)', () => {
    const father = makeIndividual(
      ballPython,
      withLoci(wildTypeGenotype(ballPython, 'male'), {
        'coral-glow': sexLinkedPair(ballPython, 'male', 'coral-glow', 'coral-glow'),
      }),
      'father',
    )
    const mother = makeIndividual(ballPython, wildTypeGenotype(ballPython, 'female'), 'mother')
    const clutch = engine.breed({ mother, father, clutchSize: 300, seed: 'coral-glow-clutch-test' }, ballPython)
    expect(clutch.hatched.length).toBeGreaterThan(0)

    let sons = 0
    let sonsWithCoralGlow = 0
    let daughters = 0
    let daughtersWithCoralGlow = 0
    for (const hatchling of clutch.hatched) {
      const sex = engine.sexOf(hatchling.genotype, ballPython.sexSystem)
      const pair = hatchling.genotype.loci['coral-glow']
      const carries = pair?.[0] === 'coral-glow' || pair?.[1] === 'coral-glow'
      if (sex === 'male') {
        sons++
        if (carries) sonsWithCoralGlow++
      } else {
        daughters++
        if (carries) daughtersWithCoralGlow++
      }
    }
    expect(sons).toBeGreaterThan(0)
    expect(daughters).toBeGreaterThan(0)
    expect(sonsWithCoralGlow).toBe(sons) // every son
    expect(daughtersWithCoralGlow).toBe(0) // no daughter
  })
})
