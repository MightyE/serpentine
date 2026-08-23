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

/**
 * Which side of an animal's look a trait changes.
 *
 * Deliberately about the *animal*, not the implementation. Ball python albino recolours by
 * appending a `modifier` render stage, so "does this projection touch `stages`" would file it
 * under pattern; it is a colour morph, and a player would be baffled to read otherwise. Read what
 * the trait does to the snake and pick from that.
 */
export type MorphAxis = 'colour' | 'pattern'

/**
 * Record a trait on its axis and keep the combined label in step.
 *
 * Replaces a bare `label: withLabel(draft.label, token)` in a projection. Returns all three name
 * fields so one spread keeps them consistent — the axis that was not named is written back
 * unchanged, which costs nothing and removes the failure where a projection advances the label
 * and forgets the axis, leaving a snake whose name says Superconda and whose `patternMorph` says
 * Normal.
 *
 * A trait that genuinely changes both — pigment *and* markings — passes both axes and appears in
 * both names. A trait that is neither (a fictional behavioural one, say) should keep calling
 * {@link withLabel} directly rather than being forced onto an axis it does not belong on.
 */
export function withMorph(
  draft: Pick<Phenotype, 'label' | 'colourMorph' | 'patternMorph'>,
  axis: MorphAxis | readonly MorphAxis[],
  token: string,
): Pick<Phenotype, 'label' | 'colourMorph' | 'patternMorph'> {
  const axes: readonly MorphAxis[] = typeof axis === 'string' ? [axis] : axis
  return {
    label: withLabel(draft.label, token),
    colourMorph: axes.includes('colour') ? withLabel(draft.colourMorph, token) : draft.colourMorph,
    patternMorph: axes.includes('pattern') ? withLabel(draft.patternMorph, token) : draft.patternMorph,
  }
}
