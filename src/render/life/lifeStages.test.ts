/**
 * What these tests are actually protecting.
 *
 * Three properties, all of which are easy to break by accident and none of which shows up as an
 * exception when you do:
 *
 * 1. **Age changes proportions, not scale.** The whole emotional payoff of watching a snake grow
 *    rests on a hatchling not being a small adult. That is a claim about *ratios*, so the tests
 *    normalise everything by body length before comparing — which is exactly the comparison a
 *    regression to "just scale it down" would fail.
 * 2. **An animal keeps its own markings at every age.** Guaranteed structurally rather than by
 *    care: the pattern texture is keyed on colours and stages, and age touches neither. Pinned
 *    here so that adding `body` to the cache key — a very reasonable-looking change — fails loudly
 *    instead of quietly regenerating every snake's pattern as it grows.
 * 3. **The age parameter defaults to exactly the old behaviour.** `widthProfile(body)` with no
 *    life shape must be byte-identical to what it produced before ages existed.
 *
 * Runs under vitest's `node` environment, so nothing here may touch `document` — which rules out
 * baking an actual texture. `phenotypeKey` is pure, and it is the thing that matters anyway.
 */

import { describe, expect, it } from 'vitest'
import { ADULT_SHAPE, bodyLength, widthProfile } from '../bodyShape'
import { rgba } from '../colour'
import { phenotypeKey } from '../texture'
import type { Phenotype } from '../contract'
import { eggShellFor } from './egg'
import { emergePath, staircase } from './hatch'
import { ageOfStage, lifeShapeAtAge, stageAtAge, eyeScaleAtAge, motionAtAge } from './stage'
import { resamplePath, sCurvePose } from './view'

const SUBJECT: Phenotype = {
  seed: 'test-individual-7',
  label: 'Test corn',
  baseColour: rgba(206, 122, 68),
  patternColour: rgba(140, 44, 38),
  bellyColour: rgba(240, 228, 205),
  eye: { irisColour: rgba(196, 120, 60), pupilColour: rgba(28, 20, 26), sizeScale: 1.35, highlight: true },
  body: { lengthScale: 1, girthScale: 1, headScale: 1.15, taperExponent: 1 },
  effects: [],
  stages: [
    { kind: 'base', name: 'solid', params: { colour: '@baseColour' } },
    { kind: 'pattern', name: 'bands', params: { colour: '@patternColour', bandCount: 21 } },
  ],
  extra: {},
}

/** Peak width and head width at an age, both as a fraction of that age's own body length. */
function shapeRatios(age: number): {
  headOverLength: number
  peakOverLength: number
  headOverPeak: number
  pinchAt: number
} {
  const shape = lifeShapeAtAge(age)
  const profile = widthProfile(SUBJECT.body, shape)
  const len = bodyLength(SUBJECT.body, shape)
  // Index 2 is the cheek — the widest point of the head. Index 4 is the mid-body peak. Taking a
  // `max` over the whole profile would silently return whichever of the two is larger, which is
  // precisely the quantity under test.
  const head = profile[2].value
  const peak = profile[4].value
  return {
    headOverLength: head / len,
    peakOverLength: peak / len,
    headOverPeak: head / peak,
    pinchAt: shape.headSpan,
  }
}

describe('the age parameter', () => {
  it('is continuous — the four stages are points on one line', () => {
    expect(ageOfStage('egg')).toBe(0)
    expect(ageOfStage('hatchling')).toBe(0)
    expect(ageOfStage('juvenile')).toBeGreaterThan(0)
    expect(ageOfStage('juvenile')).toBeLessThan(ageOfStage('adult'))
    expect(ageOfStage('adult')).toBe(1)
  })

  it('names an age without ever calling a body an egg', () => {
    expect(stageAtAge(0)).toBe('hatchling')
    expect(stageAtAge(0.45)).toBe('juvenile')
    expect(stageAtAge(1)).toBe('adult')
    for (let a = 0; a <= 1.0001; a += 0.01) {
      expect(stageAtAge(a)).not.toBe('egg')
    }
  })

  it('clamps rather than extrapolating', () => {
    expect(lifeShapeAtAge(-3)).toEqual(lifeShapeAtAge(0))
    expect(lifeShapeAtAge(9)).toEqual(lifeShapeAtAge(1))
  })

  it('grows the body monotonically', () => {
    let previous = 0
    for (let a = 0; a <= 1.0001; a += 0.05) {
      const len = bodyLength(SUBJECT.body, lifeShapeAtAge(a))
      expect(len).toBeGreaterThan(previous)
      previous = len
    }
  })
})

describe('proportions, not scale', () => {
  it('reproduces the pre-age renderer exactly when no life shape is given', () => {
    expect(widthProfile(SUBJECT.body)).toEqual(widthProfile(SUBJECT.body, ADULT_SHAPE))
    expect(bodyLength(SUBJECT.body)).toEqual(bodyLength(SUBJECT.body, ADULT_SHAPE))
  })

  it('lands an age of 1 exactly on the adult shape', () => {
    expect(lifeShapeAtAge(1)).toEqual(ADULT_SHAPE)
    expect(widthProfile(SUBJECT.body, lifeShapeAtAge(1))).toEqual(widthProfile(SUBJECT.body))
    expect(eyeScaleAtAge(1)).toBe(1)
  })

  it('gives a hatchling a much bigger head *relative to its own length*', () => {
    const baby = shapeRatios(0)
    const adult = shapeRatios(1)
    // The test that a uniform scale-down would fail: both of these are length-normalised, so
    // shrinking the whole animal leaves them untouched.
    expect(baby.headOverLength / adult.headOverLength).toBeGreaterThan(1.7)
    expect(baby.peakOverLength / adult.peakOverLength).toBeGreaterThan(1.4)
  })

  it('gives a hatchling a head wider than its belly, and an adult one narrower', () => {
    expect(shapeRatios(0).headOverPeak).toBeGreaterThan(1)
    expect(shapeRatios(1).headOverPeak).toBeLessThan(1)
  })

  it('moves the neck pinch further down the body on a hatchling', () => {
    expect(shapeRatios(0).pinchAt).toBeGreaterThan(shapeRatios(1).pinchAt * 1.5)
  })

  it('blunts the snout and softens the neck for the young', () => {
    expect(lifeShapeAtAge(0).snoutBlunt).toBeGreaterThan(lifeShapeAtAge(1).snoutBlunt)
    expect(lifeShapeAtAge(0).neckPinch).toBeGreaterThan(lifeShapeAtAge(1).neckPinch)
  })

  it('interpolates every ratio monotonically, so growth never doubles back', () => {
    const keys = ['lengthMul', 'girthMul', 'headMul', 'headSpan', 'neckPinch', 'snoutBlunt'] as const
    for (const key of keys) {
      const series: number[] = []
      for (let a = 0; a <= 1.0001; a += 0.05) series.push(lifeShapeAtAge(a)[key])
      const rising = series[series.length - 1] > series[0]
      for (let i = 1; i < series.length; i++) {
        if (rising) expect(series[i]).toBeGreaterThanOrEqual(series[i - 1])
        else expect(series[i]).toBeLessThanOrEqual(series[i - 1])
      }
    }
  })

  it('makes the eyes proportionally larger on the young, and the motion wobblier', () => {
    // Big, but bounded: past about 1.4 the eye is wider than the skull and stops reading as a
    // large eye on a head at all. Both ends of this range are load-bearing.
    expect(eyeScaleAtAge(0)).toBeGreaterThan(1.2)
    expect(eyeScaleAtAge(0)).toBeLessThan(1.4)
    expect(motionAtAge(0).waveMul).toBeGreaterThan(motionAtAge(1).waveMul)
    expect(motionAtAge(0).speedMul).toBeLessThan(motionAtAge(1).speedMul)
    expect(motionAtAge(0).turnMul).toBeGreaterThan(motionAtAge(1).turnMul)
  })
})

describe('an individual keeps its markings across every stage', () => {
  it('does not key the pattern on anything age changes', () => {
    const adultKey = phenotypeKey(SUBJECT)
    for (const age of [0, 0.2, 0.45, 0.8, 1]) {
      const shape = lifeShapeAtAge(age)
      // What growing actually does to a phenotype, if a caller chooses to bake it in: change
      // the body, and nothing else.
      const grown: Phenotype = {
        ...SUBJECT,
        body: {
          ...SUBJECT.body,
          lengthScale: SUBJECT.body.lengthScale * shape.lengthMul,
          girthScale: SUBJECT.body.girthScale * shape.girthMul,
          headScale: SUBJECT.body.headScale * shape.headMul,
        },
        eye: { ...SUBJECT.eye, sizeScale: SUBJECT.eye.sizeScale * eyeScaleAtAge(age) },
      }
      expect(phenotypeKey(grown)).toBe(adultKey)
    }
  })

  it('does give a different individual different markings', () => {
    expect(phenotypeKey({ ...SUBJECT, seed: 'someone-else' })).not.toBe(phenotypeKey(SUBJECT))
  })
})

describe('the egg', () => {
  it('is the same egg every time for the same animal', () => {
    expect(eggShellFor(SUBJECT)).toEqual(eggShellFor(SUBJECT))
  })

  it('is a different egg for a different animal', () => {
    expect(eggShellFor({ ...SUBJECT, seed: 'other' })).not.toEqual(eggShellFor(SUBJECT))
  })

  it('barely hints at what is inside', () => {
    const vivid = eggShellFor({ ...SUBJECT, baseColour: rgba(255, 0, 0) })
    const plain = eggShellFor({ ...SUBJECT, baseColour: rgba(0, 0, 255) })
    // Same seed, wildly different animals: the shells must still look like shells. A shift of
    // more than ~20 in any channel would start letting a player call the morph from the egg.
    expect(Math.abs(vivid.shellColour.r - plain.shellColour.r)).toBeLessThan(20)
    expect(Math.abs(vivid.shellColour.b - plain.shellColour.b)).toBeLessThan(20)
  })

  it('is oblong the way a snake egg is, not round and not pointed', () => {
    const shell = eggShellFor(SUBJECT)
    expect(shell.elongation).toBeGreaterThan(1.4)
    expect(shell.elongation).toBeLessThan(2)
  })
})

describe('the hatch', () => {
  it('emerges in surges rather than smoothly', () => {
    expect(staircase(0)).toBe(0)
    expect(staircase(1)).toBe(1)
    let previous = 0
    for (let p = 0; p <= 1.0001; p += 0.02) {
      const value = staircase(p)
      expect(value).toBeGreaterThanOrEqual(previous - 1e-9)
      previous = value
    }
    // The property that distinguishes it from a smoothstep: somewhere there is a pause, i.e. an
    // interval where almost nothing happens.
    const deltas: number[] = []
    for (let i = 0; i < 50; i++) deltas.push(staircase((i + 1) / 50) - staircase(i / 50))
    expect(Math.min(...deltas)).toBeLessThan(Math.max(...deltas) * 0.2)
  })

  it('lays the whole hatchling out along its path once it is fully emerged', () => {
    const geom = { centre: { x: 100, y: 100 }, length: 40, tilt: 0.2 }
    const shell = eggShellFor(SUBJECT)
    const full = 108
    const path = emergePath(geom, shell, full, 1)
    let measured = 0
    for (let i = 1; i < path.length; i++) {
      measured += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y)
    }
    expect(measured).toBeCloseTo(full, 5)
    expect(emergePath(geom, shell, full, 0)).toHaveLength(0)
  })
})

describe('growing without teleporting', () => {
  it('keeps the head where it was and re-spaces the rest', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 30, y: 0 },
    ]
    const out = resamplePath(path, 4, 5)
    expect(out[0]).toEqual({ x: 0, y: 0 })
    for (let i = 1; i < out.length; i++) {
      expect(Math.hypot(out[i].x - out[i - 1].x, out[i].y - out[i - 1].y)).toBeCloseTo(5, 6)
    }
  })

  it('extends straight off the tail when the animal grew longer than its old path', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]
    const out = resamplePath(path, 4, 10)
    expect(out).toHaveLength(4)
    expect(out[3].x).toBeCloseTo(30, 6)
    expect(out[3].y).toBeCloseTo(0, 6)
  })
})

describe('the showcase pose', () => {
  it('spaces points at the segment length, so ages differ in length and not in curvature', () => {
    const bounds = { x: 0, y: 0, width: 300, height: 200 }
    for (const seg of [2, 6]) {
      const pose = sCurvePose(bounds, 20, seg)
      for (let i = 1; i < pose.length; i++) {
        const d = Math.hypot(pose[i].x - pose[i - 1].x, pose[i].y - pose[i - 1].y)
        expect(d).toBeGreaterThan(seg * 0.9)
        expect(d).toBeLessThan(seg * 1.1)
      }
    }
  })
})
