import type { Phenotype } from '../../render/contract'

/** Small helper so colour literals below don't repeat `{ r, g, b, a: 1 }` everywhere. */
export function rgb(r: number, g: number, b: number): Phenotype['baseColour'] {
  return { r, g, b, a: 1 }
}

/**
 * A fresh, unmodified ball python: normal ("wild-type") colouring and proportions, no trait
 * has touched it yet. Every projection and modifier in `loci/*.ts` starts from this and
 * rewrites it. `seed` is a placeholder — the engine overwrites it with a value derived from
 * the individual's id before anything reads it (see the determinism rules in
 * `genetics/types.ts`), so what is written here never actually reaches a render.
 */
export function ballPythonBasePhenotype(): Phenotype {
  return {
    seed: 'unseeded',
    label: 'Normal',
    baseColour: rgb(101, 74, 47),
    patternColour: rgb(43, 33, 22),
    bellyColour: rgb(232, 220, 196),
    eye: {
      irisColour: rgb(60, 45, 30),
      pupilColour: rgb(10, 10, 10),
      sizeScale: 1.3,
      highlight: true,
    },
    body: {
      lengthScale: 1,
      girthScale: 1.05,
      headScale: 1.2,
      taperExponent: 1.4,
    },
    effects: [],
    // `solid`, `blotches` and `belly` are real stages registered by `src/render/stages/`
    // (agent 06). `'@baseColour'` etc. are the pipeline's colour-reference sentinels — see
    // `render/pipeline.ts:COLOUR_REFS` — so a trait projection that only ever updates
    // `draft.baseColour`/`patternColour`/`bellyColour` (most of them, below) repaints correctly
    // with no stage change at all.
    stages: [
      { kind: 'base', name: 'solid', params: { colour: '@baseColour' } },
      { kind: 'pattern', name: 'blotches', params: { colour: '@patternColour' } },
      { kind: 'mask', name: 'belly', params: { colour: '@bellyColour' } },
    ],
    extra: {},
  }
}
