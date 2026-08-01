import type { Phenotype } from '../../render/contract'
import { rgb } from '../ballPython/phenotype'

export { rgb }

/**
 * A fresh, unmodified corn snake: normal orange-and-black-saddled colouring. See
 * `ballPython/phenotype.ts:ballPythonBasePhenotype` for the `seed` placeholder note — the same
 * applies here.
 */
export function cornSnakeBasePhenotype(): Phenotype {
  return {
    seed: 'unseeded',
    label: 'Normal',
    baseColour: rgb(214, 96, 42),
    patternColour: rgb(150, 40, 20),
    bellyColour: rgb(245, 235, 210),
    eye: {
      irisColour: rgb(120, 60, 20),
      pupilColour: rgb(10, 10, 10),
      sizeScale: 1.25,
      highlight: true,
    },
    body: {
      lengthScale: 1.1,
      girthScale: 0.85,
      headScale: 1.1,
      taperExponent: 1.7,
    },
    effects: [],
    // `solid`, `bands` and `belly` are real stages registered by `src/render/stages/` (agent
    // 06); `'@...'` is the pipeline's colour-reference sentinel (`render/pipeline.ts`). See
    // `ballPython/phenotype.ts` for the fuller explanation of why this means most trait
    // projections never have to touch `stages` at all.
    stages: [
      { kind: 'base', name: 'solid', params: { colour: '@baseColour' } },
      { kind: 'pattern', name: 'bands', params: { colour: '@patternColour' } },
      { kind: 'mask', name: 'belly', params: { colour: '@bellyColour' } },
    ],
    extra: {},
  }
}
