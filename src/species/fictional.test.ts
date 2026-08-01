import { describe, expect, it } from 'vitest'
import { ballPython } from './ballPython'
import { cornSnake } from './cornSnake'
import { ReferenceGeneticsEngine } from './testSupport/referenceEngine'
import { makeIndividual, wildTypeGenotype, withLoci } from './testSupport/fixtures'

const engine = new ReferenceGeneticsEngine()

describe('fictional: umbra (masking epistasis — the demonstration real content is barred from)', () => {
  it('amelanistic alone removes black pigment as usual', () => {
    const phenotype = engine.express(
      makeIndividual(cornSnake, withLoci(wildTypeGenotype(cornSnake, 'male'), { amel: ['amel', 'amel'] })),
      cornSnake,
    )
    expect(phenotype.baseColour).not.toEqual({ r: 214, g: 96, b: 42, a: 1 })
  })

  it('umbra/umbra masks amelanistic entirely, regardless of the amel genotype', () => {
    const phenotype = engine.express(
      makeIndividual(
        cornSnake,
        withLoci(wildTypeGenotype(cornSnake, 'male'), { amel: ['amel', 'amel'], umbra: ['umbra', 'umbra'] }),
      ),
      cornSnake,
    )
    // Back to the normal wild-type colour, as if amel were never there.
    expect(phenotype.baseColour).toEqual({ r: 214, g: 96, b: 42, a: 1 })
  })

  it('one copy of umbra is not enough to mask anything', () => {
    const phenotype = engine.express(
      makeIndividual(
        cornSnake,
        withLoci(wildTypeGenotype(cornSnake, 'male'), {
          amel: ['amel', 'amel'],
          umbra: ['wild-type', 'umbra'],
        }),
      ),
      cornSnake,
    )
    expect(phenotype.baseColour).not.toEqual({ r: 214, g: 96, b: 42, a: 1 })
  })
})

describe('fictional: glimmer (polygenic value drives a continuous render parameter)', () => {
  it('two shimmer+ copies produce a denser speckle stage than one copy', () => {
    const oneCopy = engine.express(
      makeIndividual(
        ballPython,
        withLoci(wildTypeGenotype(ballPython, 'male'), { 'glimmer-genes': ['wild-type', 'shimmer-plus'] }),
      ),
      ballPython,
    )
    const twoCopies = engine.express(
      makeIndividual(
        ballPython,
        withLoci(wildTypeGenotype(ballPython, 'male'), { 'glimmer-genes': ['shimmer-plus', 'shimmer-plus'] }),
      ),
      ballPython,
    )
    const density = (p: typeof oneCopy) =>
      p.stages.find((s) => s.name === 'speckle' && s.kind === 'pattern')?.params.density as number

    expect(density(twoCopies)).toBeGreaterThan(density(oneCopy))
  })

  it('wild-type (no shimmer+ copies) still shows the baseline ambient shimmer — there is no gate', () => {
    // The point of this trait is "continuous value, no discrete on/off" (contrast with
    // piebald's discrete gene gating a continuous background trait) — so baseline > 0 is
    // deliberate, and a wild-type animal's density should be the *lowest*, not absent.
    const wildType = engine.express(makeIndividual(ballPython, wildTypeGenotype(ballPython, 'male')), ballPython)
    const oneCopy = engine.express(
      makeIndividual(
        ballPython,
        withLoci(wildTypeGenotype(ballPython, 'male'), { 'glimmer-genes': ['wild-type', 'shimmer-plus'] }),
      ),
      ballPython,
    )
    const density = (p: typeof wildType) =>
      p.stages.find((s) => s.name === 'speckle' && s.kind === 'pattern')?.params.density as number
    expect(density(wildType)).toBeLessThan(density(oneCopy))
  })
})

describe('fictional: sparkle eyes (the cookbook worked example)', () => {
  it('one copy scales up eye size', () => {
    const phenotype = engine.express(
      makeIndividual(
        ballPython,
        withLoci(wildTypeGenotype(ballPython, 'male'), { 'sparkle-eyes': ['wild-type', 'sparkle-eyes'] }),
      ),
      ballPython,
    )
    const wildType = engine.express(makeIndividual(ballPython, wildTypeGenotype(ballPython, 'male')), ballPython)
    expect(phenotype.eye.sizeScale).toBeGreaterThan(wildType.eye.sizeScale)
  })
})

describe('fictional: empath (reads game state, not genotype, for its visual payoff)', () => {
  it('the locus only ever sets a marker — no colour or effect changes here', () => {
    const phenotype = engine.express(
      makeIndividual(ballPython, withLoci(wildTypeGenotype(ballPython, 'male'), { empath: ['wild-type', 'empath'] })),
      ballPython,
    )
    expect(phenotype.extra.empathPresent).toBe(true)
    // Deliberately no effect tag yet — that decision belongs to game/moodOverlay.ts.
    expect(phenotype.effects).not.toContain('radiantMood')
  })
})
