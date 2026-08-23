/**
 * The morph name has two axes, and they are independent.
 *
 * A keeper shops and breeds on "what colour" and "what pattern" as separate questions. The
 * combined {@link Phenotype.label} cannot answer either one on its own: reading "Lavender
 * Superconda" and knowing which half is the pattern requires already knowing the traits, which is
 * exactly the knowledge a new player does not have. So `colourMorph` and `patternMorph` carry the
 * split, and these tests hold them to it.
 *
 * The two hognose traits below are the clean teaching pair the split exists for, and each is the
 * textbook case of its own inheritance mode:
 *
 *   - **Lavender** — simple recessive, pigment only. One copy shows nothing at all.
 *   - **Anaconda** — incomplete dominant, markings only. One copy is Anaconda, two is a third and
 *     more extreme phenotype, Superconda. (Never "co-dominant" — see `loci/anaconda.ts`.)
 *
 * Run against the real `geneticsEngine`, not `testSupport/referenceEngine`, because what is under
 * test is what the shipped projections actually write onto a phenotype.
 */
import { describe, expect, it } from 'vitest'
import { geneticsEngine } from '../genetics'
import type { AllelePair } from '../genetics/types'
import type { Phenotype } from '../render/contract'
import { allSpecies } from '.'
import { hognose } from './hognose'
import { makeIndividual, wildTypeGenotype, withLoci } from './testSupport/fixtures'

const LAVENDER = 'hognose-lavender'
const ANACONDA = 'hognose-anaconda'

function look(overrides: Record<string, AllelePair>): Phenotype {
  const genotype = withLoci(wildTypeGenotype(hognose, 'male'), overrides)
  return geneticsEngine.express(makeIndividual(hognose, genotype), hognose)
}

const WILD = look({})

/** Everything about an animal's colouring, so "did this trait touch the colour" has one answer. */
const pigmentOf = (p: Phenotype) => ({
  base: p.baseColour,
  pattern: p.patternColour,
  belly: p.bellyColour,
  iris: p.eye.irisColour,
})

const stageNames = (p: Phenotype) => p.stages.map((s) => `${s.kind}:${s.name}`)

describe('lavender: a recessive colour morph', () => {
  it('shows nothing on either axis with one copy', () => {
    const het = look({ [LAVENDER]: ['wild-type', 'lavender'] })
    expect(het.colourMorph).toBe('Normal')
    expect(het.patternMorph).toBe('Normal')
    expect(pigmentOf(het)).toEqual(pigmentOf(WILD))
  })

  it('names the colour axis with two copies, and leaves the pattern axis alone', () => {
    const lavender = look({ [LAVENDER]: ['lavender', 'lavender'] })
    expect(lavender.colourMorph).toBe('Lavender')
    expect(lavender.patternMorph).toBe('Normal')
  })

  it('changes the pigment and not the markings', () => {
    const lavender = look({ [LAVENDER]: ['lavender', 'lavender'] })
    expect(pigmentOf(lavender)).not.toEqual(pigmentOf(WILD))
    expect(stageNames(lavender)).toEqual(stageNames(WILD))
    // Pale purple, not merely "different": lavender is a washed-out mauve, so blue must survive
    // where green does not, and the whole thing must stay light.
    const { r, g, b } = lavender.baseColour
    expect(b).toBeGreaterThan(g)
    expect(r).toBeGreaterThan(g)
    expect(Math.min(r, g, b)).toBeGreaterThan(120)
  })
})

describe('anaconda: an incomplete-dominant pattern morph', () => {
  const conda = look({ [ANACONDA]: ['wild-type', 'anaconda'] })
  const superconda = look({ [ANACONDA]: ['anaconda', 'anaconda'] })

  it('gives each dose its own name on the pattern axis', () => {
    expect(conda.patternMorph).toBe('Anaconda')
    expect(superconda.patternMorph).toBe('Superconda')
    // The three-phenotype signature of incomplete dominance: heterozygote is neither parent.
    expect(conda.patternMorph).not.toBe(WILD.patternMorph)
    expect(conda.patternMorph).not.toBe(superconda.patternMorph)
  })

  it('leaves the colour axis untouched at both doses', () => {
    expect(conda.colourMorph).toBe('Normal')
    expect(superconda.colourMorph).toBe('Normal')
    expect(pigmentOf(conda)).toEqual(pigmentOf(WILD))
    expect(pigmentOf(superconda)).toEqual(pigmentOf(WILD))
  })

  it('reduces the markings at one copy and removes them at two', () => {
    // One copy re-tunes the blotches in place; the stage list is the same shape.
    expect(stageNames(conda)).toEqual(stageNames(WILD))
    expect(conda.stages).not.toEqual(WILD.stages)
    // Two copies adds the reduction pass on top.
    expect(stageNames(superconda)).toContain('modifier:patternReduction')
    expect(stageNames(WILD)).not.toContain('modifier:patternReduction')
  })
})

describe('the two axes compose', () => {
  it('names a lavender superconda on both, independently', () => {
    const both = look({
      [LAVENDER]: ['lavender', 'lavender'],
      [ANACONDA]: ['anaconda', 'anaconda'],
    })
    expect(both.colourMorph).toBe('Lavender')
    expect(both.patternMorph).toBe('Superconda')
    expect(both.label).toBe('Lavender Superconda')
    // Each axis matches the animal carrying that trait alone — they do not interfere.
    expect(both.colourMorph).toBe(look({ [LAVENDER]: ['lavender', 'lavender'] }).colourMorph)
    expect(both.patternMorph).toBe(look({ [ANACONDA]: ['anaconda', 'anaconda'] }).patternMorph)
    expect(pigmentOf(both)).toEqual(pigmentOf(look({ [LAVENDER]: ['lavender', 'lavender'] })))
  })
})

describe('every species keeps the axes and the label in step', () => {
  const words = (s: string) => (s === 'Normal' ? [] : s.split(' '))

  it('never names an axis something the full label does not say', () => {
    for (const species of allSpecies) {
      for (const locus of species.loci) {
        if (locus.placement.kind !== 'autosomal') continue
        for (const a of locus.alleles) {
          for (const b of locus.alleles) {
            const genotype = withLoci(wildTypeGenotype(species, 'male'), {
              [locus.id]: [a.id, b.id] as AllelePair,
            })
            const p = geneticsEngine.express(makeIndividual(species, genotype), species)
            const label = p.label.split(' ')
            const where = `${species.id}/${locus.id} ${a.id}+${b.id}`
            for (const w of [...words(p.colourMorph), ...words(p.patternMorph)]) {
              expect(label, `${where}: axis word "${w}" missing from label "${p.label}"`).toContain(w)
            }
          }
        }
      }
    }
  })

  it('starts every species wild type on both axes', () => {
    for (const species of allSpecies) {
      const base = species.basePhenotype()
      expect(base.colourMorph, species.id).toBe('Normal')
      expect(base.patternMorph, species.id).toBe('Normal')
    }
  })
})
