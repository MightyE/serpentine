/**
 * Hand-written phenotypes for the render lab.
 *
 * These are **fixtures, not content**. Real trait data lives in `src/species/`; these exist so
 * the renderer can be looked at, tweaked and broken without breeding anything or touching the
 * genetics engine. That is the whole payoff of the phenotype boundary: to test the renderer you
 * write out an appearance by hand and hand it over.
 *
 * They are also the fastest way to learn the stage system. Read one, change a number, reload.
 */

import type { Phenotype } from '../contract'
import { rgba } from '../colour'

/** Sensible eyes: oversized, with a catchlight. See `head.ts` for why. */
function eyes(iris: [number, number, number], sizeScale = 1.35): Phenotype['eye'] {
  return {
    irisColour: rgba(iris[0], iris[1], iris[2]),
    pupilColour: rgba(28, 20, 26),
    sizeScale,
    highlight: true,
  }
}

function body(
  lengthScale: number,
  girthScale: number,
  headScale: number,
  taperExponent = 1,
): Phenotype['body'] {
  return { lengthScale, girthScale, headScale, taperExponent }
}

const EMPTY: Readonly<Record<string, never>> = {}

export const FIXTURES: readonly Phenotype[] = [
  {
    seed: 'fixture-corn-normal',
    label: 'Corn — wild type',
    baseColour: rgba(206, 122, 68),
    patternColour: rgba(140, 44, 38),
    bellyColour: rgba(240, 228, 205),
    eye: eyes([196, 120, 60]),
    body: body(1, 1, 1.15),
    effects: [],
    stages: [
      { kind: 'base', name: 'solid', params: { colour: '@baseColour' } },
      {
        kind: 'pattern',
        name: 'bands',
        params: { colour: '@patternColour', bandCount: 21, duty: 0.5, reach: 0.78, wobble: 0.3 },
      },
      { kind: 'mask', name: 'belly', params: { colour: '@bellyColour', start: 0.76 } },
    ],
    extra: EMPTY,
  },
  {
    seed: 'fixture-corn-amel',
    label: 'Corn — amelanistic',
    baseColour: rgba(206, 122, 68),
    patternColour: rgba(140, 44, 38),
    bellyColour: rgba(240, 228, 205),
    eye: eyes([224, 96, 96], 1.4),
    body: body(1, 1, 1.15),
    effects: [],
    stages: [
      { kind: 'base', name: 'solid', params: { colour: '@baseColour' } },
      {
        kind: 'pattern',
        name: 'bands',
        params: { colour: '@patternColour', bandCount: 21, duty: 0.5, reach: 0.78, wobble: 0.3 },
      },
      { kind: 'mask', name: 'belly', params: { colour: '@bellyColour', start: 0.76 } },
      // The same three stages as above, plus one line. That line is the whole morph.
      { kind: 'modifier', name: 'albino', params: { amount: 1, warmHue: 26 } },
    ],
    extra: EMPTY,
  },
  {
    seed: 'fixture-corn-ghost',
    label: 'Corn — ghost (low contrast)',
    baseColour: rgba(150, 128, 112),
    patternColour: rgba(92, 74, 70),
    bellyColour: rgba(232, 226, 214),
    eye: eyes([140, 132, 150], 1.35),
    body: body(1, 1.02, 1.12),
    effects: [],
    stages: [
      { kind: 'base', name: 'solid', params: { colour: '@baseColour' } },
      { kind: 'pattern', name: 'bands', params: { colour: '@patternColour', bandCount: 20, reach: 0.8 } },
      { kind: 'mask', name: 'belly', params: { colour: '@bellyColour' } },
      { kind: 'modifier', name: 'ghost', params: { amount: 0.72, midpoint: 0.6 } },
    ],
    extra: EMPTY,
  },
  {
    seed: 'fixture-ball-normal',
    label: 'Ball python — wild type',
    baseColour: rgba(196, 168, 92),
    patternColour: rgba(58, 44, 36),
    bellyColour: rgba(244, 240, 228),
    eye: eyes([132, 104, 70], 1.3),
    body: body(0.92, 1.5, 1.2, 1.25),
    effects: [],
    stages: [
      { kind: 'base', name: 'solid', params: { colour: '@baseColour' } },
      {
        kind: 'pattern',
        name: 'blotches',
        params: { colour: '@patternColour', scaleU: 8, scaleV: 0.55, threshold: 0.47, octaves: 3 },
      },
      { kind: 'mask', name: 'belly', params: { colour: '@bellyColour', start: 0.78 } },
    ],
    extra: EMPTY,
  },
  {
    seed: 'fixture-ball-pied',
    label: 'Ball python — piebald',
    baseColour: rgba(186, 156, 88),
    patternColour: rgba(52, 40, 32),
    bellyColour: rgba(246, 242, 232),
    eye: eyes([120, 96, 66], 1.3),
    body: body(0.92, 1.5, 1.2, 1.25),
    effects: [],
    stages: [
      { kind: 'base', name: 'solid', params: { colour: '@baseColour' } },
      { kind: 'pattern', name: 'blotches', params: { colour: '@patternColour', scaleU: 8, scaleV: 0.55 } },
      { kind: 'mask', name: 'belly', params: { colour: '@bellyColour', start: 0.8 } },
      // A mask, so it wipes out the pattern rather than mixing with it.
      { kind: 'mask', name: 'piebald', params: { coverage: 0.45, scale: 3.1, spareHead: 0.26 } },
    ],
    extra: EMPTY,
  },
  {
    seed: 'fixture-ball-clown',
    label: 'Ball python — reduced pattern',
    baseColour: rgba(200, 158, 96),
    patternColour: rgba(64, 46, 40),
    bellyColour: rgba(248, 244, 232),
    eye: eyes([150, 116, 74], 1.32),
    body: body(0.9, 1.5, 1.22, 1.25),
    effects: [],
    stages: [
      { kind: 'base', name: 'solid', params: { colour: '@baseColour' } },
      { kind: 'pattern', name: 'blotches', params: { colour: '@patternColour', scaleU: 7, scaleV: 0.5 } },
      { kind: 'mask', name: 'belly', params: { colour: '@bellyColour', start: 0.82 } },
      { kind: 'modifier', name: 'patternReduction', params: { amount: 0.82, keepDorsal: 0.36, towards: '@baseColour' } },
    ],
    extra: EMPTY,
  },
  {
    seed: 'fixture-garter-striped',
    label: 'Garter — striped',
    baseColour: rgba(58, 84, 66),
    patternColour: rgba(238, 224, 138),
    bellyColour: rgba(224, 232, 214),
    eye: eyes([70, 60, 44], 1.4),
    body: body(0.95, 0.66, 1.1, 1.5),
    effects: [],
    stages: [
      { kind: 'base', name: 'solid', params: { colour: '@baseColour' } },
      { kind: 'pattern', name: 'stripes', params: { colour: '@patternColour', stripeCount: 3, thickness: 0.34 } },
      { kind: 'pattern', name: 'speckle', params: { colour: rgba(28, 34, 30), density: 52, radius: 0.26, strength: 0.5 } },
      { kind: 'mask', name: 'belly', params: { colour: '@bellyColour', start: 0.84 } },
    ],
    extra: EMPTY,
  },
  {
    seed: 'fixture-hatchling',
    label: 'Hatchling (big head, small body)',
    baseColour: rgba(122, 152, 118),
    patternColour: rgba(52, 74, 58),
    bellyColour: rgba(238, 240, 226),
    // Bigger eyes and a bigger head relative to the body: the baby-schema cue, on purpose.
    eye: eyes([94, 138, 96], 1.75),
    body: body(0.55, 1.1, 1.55, 0.9),
    effects: [],
    stages: [
      { kind: 'base', name: 'solid', params: { colour: '@baseColour' } },
      { kind: 'pattern', name: 'bands', params: { colour: '@patternColour', bandCount: 14, reach: 0.66, softness: 0.14 } },
      { kind: 'mask', name: 'belly', params: { colour: '@bellyColour' } },
    ],
    extra: EMPTY,
  },
  {
    seed: 'fixture-fictional-starlight',
    label: 'Starlight (invented)',
    baseColour: rgba(38, 34, 66),
    patternColour: rgba(168, 190, 255),
    bellyColour: rgba(74, 70, 110),
    eye: eyes([180, 205, 255], 1.5),
    body: body(1.05, 0.9, 1.18, 1.1),
    effects: ['glitter', 'glow'],
    stages: [
      { kind: 'base', name: 'solid', params: { colour: '@baseColour' } },
      { kind: 'pattern', name: 'speckle', params: { colour: '@patternColour', density: 34, radius: 0.3, softness: 0.2 } },
      { kind: 'mask', name: 'belly', params: { colour: '@bellyColour', start: 0.8, strength: 0.8 } },
    ],
    extra: EMPTY,
  },
  {
    seed: 'fixture-fictional-aurora',
    label: 'Aurora (invented)',
    baseColour: rgba(46, 96, 108),
    patternColour: rgba(150, 245, 210),
    bellyColour: rgba(210, 246, 240),
    eye: eyes([120, 240, 210], 1.45),
    body: body(1.1, 1.05, 1.15, 1.05),
    effects: ['iridescent', 'drift'],
    stages: [
      { kind: 'base', name: 'solid', params: { colour: '@baseColour' } },
      { kind: 'pattern', name: 'bands', params: { colour: '@patternColour', bandCount: 30, duty: 0.42, reach: 0.9, softness: 0.16 } },
      { kind: 'mask', name: 'belly', params: { colour: '@bellyColour', start: 0.86, strength: 0.7 } },
    ],
    extra: EMPTY,
  },
  {
    seed: 'fixture-combo-albino-pied',
    label: 'Combo — albino + piebald',
    baseColour: rgba(126, 96, 44),
    patternColour: rgba(56, 42, 34),
    bellyColour: rgba(248, 244, 234),
    eye: eyes([232, 138, 128], 1.38),
    body: body(0.95, 1.42, 1.2, 1.2),
    effects: [],
    stages: [
      { kind: 'base', name: 'solid', params: { colour: '@baseColour' } },
      { kind: 'pattern', name: 'blotches', params: { colour: '@patternColour', scaleU: 8, scaleV: 0.55 } },
      { kind: 'mask', name: 'belly', params: { colour: '@bellyColour', start: 0.8 } },
      { kind: 'mask', name: 'piebald', params: { coverage: 0.42, scale: 3, spareHead: 0.25 } },
      // Neither of these two lines knows the other exists. That is the point of the pipeline.
      { kind: 'modifier', name: 'albino', params: { amount: 1, warmHue: 42 } },
    ],
    extra: EMPTY,
  },
  {
    seed: 'fixture-combo-ghost-clown',
    label: 'Combo — ghost + reduced',
    baseColour: rgba(126, 138, 120),
    patternColour: rgba(64, 62, 58),
    bellyColour: rgba(232, 230, 220),
    eye: eyes([118, 126, 118], 1.36),
    body: body(1, 1.2, 1.18, 1.1),
    effects: [],
    stages: [
      { kind: 'base', name: 'solid', params: { colour: '@baseColour' } },
      { kind: 'pattern', name: 'blotches', params: { colour: '@patternColour', scaleU: 9, scaleV: 0.6 } },
      { kind: 'mask', name: 'belly', params: { colour: '@bellyColour' } },
      { kind: 'modifier', name: 'patternReduction', params: { amount: 0.7, keepDorsal: 0.3, towards: '@baseColour' } },
      { kind: 'modifier', name: 'ghost', params: { amount: 0.6 } },
    ],
    extra: EMPTY,
  },
]
