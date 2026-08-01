import type { Phenotype } from '../../render/contract'
import { rgb } from '../ballPython/phenotype'
import { HOGNOSE_SNOUT_SHAPE } from '../../render/snout'

export { rgb }

/**
 * A fresh, unmodified western hognose: warm tan-brown with irregular dark-brown dorsal blotches,
 * a pale belly, and — the whole point of this species — a body that reads as **short and stout**
 * next to the corn snake's sleek whip and the ball python's long heft, topped with an upturned
 * snout no other species in this game has.
 *
 * ## Why these particular `body` numbers
 *
 * `BodyProportions` (`render/contract.ts`) is the only lever available without touching
 * `render/bodyShape.ts` (owned elsewhere this cycle — see this cycle's hognose execution
 * deposit). Real adult western hognose run notably shorter than either the corn snake or ball
 * python already in this game (commonly 14–24in nose to tail vs. a corn snake's 24–72in and a
 * ball python's 3–5ft) and are proportionally thick-bodied with a short, blunt tail rather than a
 * whippy one:
 *
 * - `lengthScale: 0.7` — shorter than both existing species (corn snake `1.1`, ball python `0.92`).
 * - `girthScale: 1.4` — thicker than both (corn snake `0.85`, ball python `1.05`) — the "stout"
 *   half of the brief.
 * - `headScale: 1.0` — a hognose's head is unremarkable in *size*; the upturned snout is a shape
 *   difference, not a size one, which is exactly why it needed its own render module instead of
 *   riding on this field.
 * - `taperExponent: 0.9` — lower than every other species here (corn snake `1.7`, ball python
 *   `1.4`, even the garter's `1.5`), which keeps the tail thick for longer rather than whipping
 *   thin — hognose really do have conspicuously stubby tails.
 *
 * ## The snout
 *
 * `extra.snoutShape` is the hook `src/render/snout/` reads. Every hognose phenotype carries it
 * from the base outward — no trait ever needs to set it, because it is what the species *is*,
 * not what a morph does to it. See `src/render/snout/index.ts` for the draw code and the one-line
 * wiring another agent needs to make it actually appear on screen.
 */
export function hognoseBasePhenotype(): Phenotype {
  return {
    seed: 'unseeded',
    label: 'Normal',
    baseColour: rgb(176, 146, 96),
    patternColour: rgb(92, 62, 40),
    bellyColour: rgb(238, 222, 182),
    eye: {
      irisColour: rgb(112, 84, 50),
      pupilColour: rgb(12, 10, 8),
      sizeScale: 1.3,
      highlight: true,
    },
    body: {
      lengthScale: 0.7,
      girthScale: 1.4,
      headScale: 1.0,
      taperExponent: 0.9,
    },
    effects: [],
    // `solid`, `blotches` and `belly` are real stages registered by `src/render/stages/`.
    // Hognose blotches are irregular and blocky rather than the corn snake's regular bands —
    // `blotches` (the ball-python pattern stage) is the closer real-world match; tuned smaller
    // and tighter than the ball python's since a hognose's saddles are notably smaller relative
    // to its body.
    stages: [
      { kind: 'base', name: 'solid', params: { colour: '@baseColour' } },
      {
        kind: 'pattern',
        name: 'blotches',
        params: { colour: '@patternColour', scaleU: 11, scaleV: 0.62, threshold: 0.5, octaves: 3 },
      },
      { kind: 'mask', name: 'belly', params: { colour: '@bellyColour', start: 0.74 } },
    ],
    extra: { snoutShape: HOGNOSE_SNOUT_SHAPE },
  }
}
