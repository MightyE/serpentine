import type { Phenotype, Rgba } from '../../render/contract'

/**
 * Shared `SpeciesDefinition.phenotypeKey` for both species. Colours are rounded before being
 * folded into the key so a polygenic trait's small environmental jitter (see
 * `piebald.ts:piebaldWhitePercentage`) does not split one visually-indistinguishable animal
 * into dozens of Punnett-table rows — the coarseness `SpeciesDefinition.phenotypeKey`'s doc
 * comment asks for.
 */
function roundColour(c: Rgba): string {
  const round = (n: number) => Math.round(n / 8) * 8
  return `${round(c.r)},${round(c.g)},${round(c.b)}`
}

export function phenotypeKeyFor(p: Phenotype): string {
  return [
    roundColour(p.baseColour),
    roundColour(p.patternColour),
    roundColour(p.eye.irisColour),
    [...p.effects].sort().join(','),
    p.stages.map((s) => `${s.kind}:${s.name}`).sort().join(','),
  ].join('|')
}

/** Composes a player-facing label: the base look reads as just the token, everything after
 * the first trait reads as a space-joined list. */
export function withLabel(current: string, token: string): string {
  return current === 'Normal' ? token : `${current} ${token}`
}
