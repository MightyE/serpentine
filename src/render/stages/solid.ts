/**
 * `base` stage — paint the whole animal one colour.
 *
 * The simplest possible stage, and the template for every other one. A `base` stage is the only
 * kind allowed to ignore the colour that came in, because it is the thing that starts the
 * picture. Everything after it builds on what it laid down.
 */

import type { Rgba, StageDefinition } from '../contract'
import { rgba } from '../colour'

type SolidParams = {
  /** Usually `'@baseColour'`, which the pipeline swaps for the phenotype's own base colour. */
  readonly colour: Rgba
}

export const solidStage: StageDefinition<SolidParams> = {
  kind: 'base',
  name: 'solid',
  describe: 'A single flat body colour.',
  defaults: {
    colour: rgba(120, 140, 90),
  },
  render: (_u, _v, _incoming, params) => params.colour,
}
