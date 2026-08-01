/**
 * A working, but deliberately simplified, `GeneticsEngine` implementation used only by this
 * directory's and `src/game/`'s tests.
 *
 * `src/genetics/**` is agent 05's directory — this file is not, and was never meant to be, a
 * substitute for it. It exists because the content and game-shell tests this dispatch requires
 * ("each real trait inherits as its documented mode," "Y-linked shows sex-differential
 * inheritance," "non-viable genotype changes hatch ratios," a real breeding action producing a
 * real clutch) need *some* engine to run against, and 05's implementation may not have landed
 * yet. Everything here is written strictly against `genetics/types.ts`; nothing in
 * `src/species/` or `src/game/` imports this file outside of tests, and production wiring
 * should import the real engine once it exists.
 *
 * Known, deliberate simplifications (fine for a test double, would not be fine for the shipped
 * engine): `punnett()` enumerates the requested loci by brute force rather than the factored
 * representation the architect spec calls for; `inferKnowledge()` only handles `parentage`
 * (via a from-belief approximation, not full marginalisation over uncertain parents) and
 * `geneTest` evidence, leaving `observedPhenotype` and `offspring` evidence as a no-op.
 * Mutation is implemented but exercised by none of this game's content.
 */
import { makeRng } from '../../lib/rng'
import type { Rng } from '../../lib/rng'
import type {
  AllelePair,
  AlleleSlot,
  ClutchRequest,
  Clutch,
  DiscoveredAllele,
  Evidence,
  Gamete,
  GeneticKnowledge,
  GeneticsEngine,
  Genotype,
  Individual,
  LocusId,
  MutationEvent,
  NovelAlleleGenerator,
  Observation,
  OffspringDistribution,
  PhenotypeOutcome,
  PunnettOptions,
  Sex,
  SpeciesDefinition,
  TraitValue,
  TraitValues,
  UnhatchedEgg,
  Viability,
  Weighted,
} from '../../genetics/types'
import { key as genotypeKey } from '../support/genotypeKey'

function otherSex(sex: Sex): Sex {
  return sex === 'male' ? 'female' : 'male'
}

function pickWeighted<T>(rng: Rng, weighted: readonly Weighted<T>[]): T | undefined {
  if (weighted.length === 0) return undefined
  const total = weighted.reduce((sum, w) => sum + w.probability, 0)
  let roll = rng.range(0, total)
  for (const w of weighted) {
    roll -= w.probability
    if (roll <= 0) return w.value
  }
  return weighted[weighted.length - 1]?.value
}

interface CombinedOutcome {
  readonly sexChromosomes: readonly [string, string]
  readonly loci: Readonly<Record<LocusId, AllelePair>>
  readonly probability: number
  readonly viable: boolean
  readonly ruleId?: string
}

/** `P` varies per call site; this internal bookkeeping type deliberately erases it. */
interface RawDistribution {
  readonly species: SpeciesDefinition<object>
  readonly lociFilter: readonly LocusId[]
  readonly viableCombined: readonly CombinedOutcome[]
}

interface GameteOutcome {
  readonly sexChromosome: string
  readonly loci: Readonly<Record<LocusId, AlleleSlot>>
}

export class ReferenceGeneticsEngine implements GeneticsEngine {
  private readonly novelAlleleGenerators = new Map<string, NovelAlleleGenerator>()
  private readonly rawDistributions = new WeakMap<OffspringDistribution, RawDistribution>()

  sexOf(genotype: Genotype, system: { homogameticChromosome: string; heterogameticSex: Sex }): Sex {
    const [c0, c1] = genotype.sexChromosomes
    const bothHomogametic = c0 === system.homogameticChromosome && c1 === system.homogameticChromosome
    return bothHomogametic ? otherSex(system.heterogameticSex) : system.heterogameticSex
  }

  deriveTraits<P extends object>(individual: Individual, species: SpeciesDefinition<P>): TraitValues {
    const sex = this.sexOf(individual.genotype, species.sexSystem)
    let traits: Record<string, TraitValue> = {}

    for (const locus of species.loci) {
      const pair = individual.genotype.loci[locus.id] ?? [null, null]
      let values: TraitValues
      if (locus.expression.kind === 'table') {
        const k = genotypeKey(...pair)
        values = locus.expression.entries[k] ?? locus.expression.otherwise
      } else {
        values = locus.expression.resolve(pair, {
          genotype: individual.genotype,
          sex,
          individualId: individual.id,
          locus,
        })
      }
      traits = { ...traits, ...values }
    }

    for (const poly of species.polygenic) {
      let value = poly.baseline
      for (const contribution of poly.contributions) {
        const pair = individual.genotype.loci[contribution.locus] ?? [null, null]
        for (const allele of pair) {
          if (allele && contribution.perAllele[allele] !== undefined) {
            value += contribution.perAllele[allele]!
          }
        }
      }
      if (poly.environmentSd > 0) {
        const rng = makeRng(individual.id).fork('polygenic').fork(poly.key)
        value += rng.gaussian() * poly.environmentSd
      }
      const [min, max] = poly.clamp
      traits[poly.key] = Math.min(max, Math.max(min, value))
    }

    return traits
  }

  express<P extends object>(individual: Individual, species: SpeciesDefinition<P>): P {
    const sex = this.sexOf(individual.genotype, species.sexSystem)
    const traits = this.deriveTraits(individual, species)
    const draft = species.basePhenotype()
    Object.assign(draft, { seed: individual.id })
    const ctx = { genotype: individual.genotype, sex, individualId: individual.id, traits }
    for (const projection of species.projections) {
      projection.apply(draft, traits[projection.key] ?? null, ctx)
    }
    for (const modifier of species.modifiers) {
      modifier.apply(draft, ctx)
    }
    return draft
  }

  checkViability<P extends object>(genotype: Genotype, species: SpeciesDefinition<P>): Viability {
    const sex = this.sexOf(genotype, species.sexSystem)
    for (const rule of species.viability) {
      if (rule.isNonViable(genotype, sex)) {
        return { viable: false, ruleId: rule.id, explanation: rule.explanation }
      }
    }
    return { viable: true }
  }

  makeGamete<P extends object>(parent: Individual, species: SpeciesDefinition<P>, rng: Rng): Gamete {
    const slot = rng.int(0, 1)
    const sexChromosome = parent.genotype.sexChromosomes[slot]!
    const alleles: Record<LocusId, AlleleSlot> = {}
    const mutations: MutationEvent[] = []

    for (const locus of species.loci) {
      let allele: AlleleSlot
      if (locus.placement.kind === 'sexLinked') {
        allele =
          sexChromosome === locus.placement.chromosome
            ? parent.genotype.loci[locus.id]?.[slot] ?? null
            : null
      } else {
        const pick = rng.int(0, 1)
        allele = parent.genotype.loci[locus.id]?.[pick] ?? null
      }
      if (locus.mutation && allele !== null && rng.chance(locus.mutation.ratePerAllele)) {
        const outcome = pickWeighted(rng, locus.mutation.outcomes)
        if (outcome && outcome !== allele) {
          mutations.push({ locus: locus.id, from: allele, to: outcome, parent: parent.id })
          allele = outcome
        }
      }
      alleles[locus.id] = allele
    }

    return { sexChromosome, alleles, mutations }
  }

  breed<P extends object>(request: ClutchRequest, species: SpeciesDefinition<P>): Clutch {
    const clutchRng = makeRng(request.seed)
    const meiosisRng = clutchRng.fork('meiosis')
    const hatched: Individual[] = []
    const unhatched: UnhatchedEgg[] = []

    for (let i = 0; i < request.clutchSize; i++) {
      const momGamete = this.makeGamete(request.mother, species, meiosisRng)
      const dadGamete = this.makeGamete(request.father, species, meiosisRng)
      const sexChromosomes: readonly [string, string] = [momGamete.sexChromosome, dadGamete.sexChromosome]
      const loci: Record<LocusId, AllelePair> = {}
      for (const locus of species.loci) {
        loci[locus.id] = [momGamete.alleles[locus.id] ?? null, dadGamete.alleles[locus.id] ?? null]
      }
      const genotype: Genotype = { sexChromosomes, loci }
      const viability = this.checkViability(genotype, species)
      if (!viability.viable) {
        unhatched.push({ genotype, explanation: viability.explanation!, ruleId: viability.ruleId! })
      } else {
        hatched.push({
          id: `${request.seed}:egg:${i}`,
          species: species.id,
          genotype,
          parents: [request.mother.id, request.father.id],
          mutations: [...momGamete.mutations, ...dadGamete.mutations],
        })
      }
    }

    return { seed: request.seed, mother: request.mother.id, father: request.father.id, hatched, unhatched }
  }

  private possibleGametes<P extends object>(
    parent: Individual,
    species: SpeciesDefinition<P>,
    lociFilter: readonly LocusId[],
  ): Weighted<GameteOutcome>[] {
    const sexLoci = species.loci.filter(
      (l) => l.placement.kind === 'sexLinked' && lociFilter.includes(l.id),
    )
    const autoLoci = species.loci.filter(
      (l) => l.placement.kind === 'autosomal' && lociFilter.includes(l.id),
    )

    const bySlotKey = new Map<string, { outcome: GameteOutcome; probability: number }>()
    for (const slot of [0, 1] as const) {
      const chromosome = parent.genotype.sexChromosomes[slot]!
      const loci: Record<LocusId, AlleleSlot> = {}
      for (const locus of sexLoci) {
        const placement = locus.placement as { kind: 'sexLinked'; chromosome: string }
        loci[locus.id] =
          placement.chromosome === chromosome ? parent.genotype.loci[locus.id]?.[slot] ?? null : null
      }
      const dedupeKey = `${chromosome}|${JSON.stringify(loci)}`
      const existing = bySlotKey.get(dedupeKey)
      if (existing) existing.probability += 0.5
      else bySlotKey.set(dedupeKey, { outcome: { sexChromosome: chromosome, loci }, probability: 0.5 })
    }
    let outcomes: Weighted<GameteOutcome>[] = [...bySlotKey.values()].map((v) => ({
      value: v.outcome,
      probability: v.probability,
    }))

    for (const locus of autoLoci) {
      const pair = parent.genotype.loci[locus.id] ?? [null, null]
      const byAllele = new Map<string, number>()
      for (const slot of [0, 1] as const) {
        const a = pair[slot]
        const k = a ?? '\u0000null'
        byAllele.set(k, (byAllele.get(k) ?? 0) + 0.5)
      }
      const next: Weighted<GameteOutcome>[] = []
      for (const existing of outcomes) {
        for (const [k, p] of byAllele) {
          const allele = k === '\u0000null' ? null : k
          next.push({
            value: { ...existing.value, loci: { ...existing.value.loci, [locus.id]: allele } },
            probability: existing.probability * p,
          })
        }
      }
      outcomes = next
    }
    return outcomes
  }

  private buildDistribution<P extends object>(
    species: SpeciesDefinition<P>,
    lociFilter: readonly LocusId[],
    combined: readonly CombinedOutcome[],
  ): OffspringDistribution {
    const nonViable = combined.filter((c) => !c.viable)
    const viable = combined.filter((c) => c.viable)
    const nonViableProbability = nonViable.reduce((sum, c) => sum + c.probability, 0)
    const viableMass = viable.reduce((sum, c) => sum + c.probability, 0) || 1

    const reasonMass = new Map<string, number>()
    for (const c of nonViable) {
      if (c.ruleId) reasonMass.set(c.ruleId, (reasonMass.get(c.ruleId) ?? 0) + c.probability)
    }
    const nonViableReasons: Weighted<string>[] = [...reasonMass.entries()].map(([value, probability]) => ({
      value,
      probability,
    }))

    const lociMarginals: Record<LocusId, Weighted<AllelePair>[]> = {}
    for (const id of lociFilter) {
      const byPair = new Map<string, { pair: AllelePair; probability: number }>()
      for (const c of viable) {
        const pair = c.loci[id]!
        const sortKey = [...pair].sort().join('/')
        const existing = byPair.get(sortKey)
        if (existing) existing.probability += c.probability
        else byPair.set(sortKey, { pair, probability: c.probability })
      }
      lociMarginals[id] = [...byPair.values()].map((v) => ({
        value: v.pair,
        probability: v.probability / viableMass,
      }))
    }

    const sexMass = new Map<Sex, number>()
    for (const c of viable) {
      const sex = this.sexOf({ sexChromosomes: c.sexChromosomes, loci: {} }, species.sexSystem)
      sexMass.set(sex, (sexMass.get(sex) ?? 0) + c.probability)
    }
    const sexRatio = {
      male: (sexMass.get('male') ?? 0) / viableMass,
      female: (sexMass.get('female') ?? 0) / viableMass,
    }

    const interactionGroups = computeInteractionGroups(species, lociFilter)

    const joint = (loci: readonly LocusId[]): Weighted<Genotype>[] => {
      const byKey = new Map<string, { genotype: Genotype; probability: number }>()
      for (const c of viable) {
        const subset: Record<LocusId, AllelePair> = {}
        for (const id of loci) subset[id] = c.loci[id]!
        const genotype: Genotype = { sexChromosomes: c.sexChromosomes, loci: subset }
        const k = JSON.stringify(genotype)
        const existing = byKey.get(k)
        if (existing) existing.probability += c.probability
        else byKey.set(k, { genotype, probability: c.probability })
      }
      return [...byKey.values()].map((v) => ({ value: v.genotype, probability: v.probability / viableMass }))
    }

    const phenotypes = (): Weighted<PhenotypeOutcome>[] => {
      const byKey = new Map<string, { outcome: PhenotypeOutcome; probability: number }>()
      for (const c of viable) {
        const genotype: Genotype = { sexChromosomes: c.sexChromosomes, loci: c.loci }
        const individual: Individual = {
          id: 'punnett-preview',
          species: species.id,
          genotype,
          parents: null,
          mutations: [],
        }
        const phenotype = this.express(individual, species)
        const k = species.phenotypeKey(phenotype)
        const existing = byKey.get(k)
        if (existing) existing.probability += c.probability
        else byKey.set(k, { outcome: { key: k, label: species.phenotypeLabel(phenotype) }, probability: c.probability })
      }
      return [...byKey.values()].map((v) => ({ value: v.outcome, probability: v.probability / viableMass }))
    }

    const distribution: OffspringDistribution = {
      species: species.id,
      nonViableProbability,
      nonViableReasons,
      lociMarginals,
      sexRatio,
      interactionGroups,
      joint,
      phenotypes,
    }
    this.rawDistributions.set(distribution, {
      species: species as unknown as SpeciesDefinition<object>,
      lociFilter,
      viableCombined: viable,
    })
    return distribution
  }

  punnett<P extends object>(
    mother: Individual,
    father: Individual,
    species: SpeciesDefinition<P>,
    options?: PunnettOptions,
  ): OffspringDistribution {
    if (this.sexOf(mother.genotype, species.sexSystem) === this.sexOf(father.genotype, species.sexSystem)) {
      throw new Error('punnett: parents must be of different sexes')
    }
    if (mother.species !== species.id || father.species !== species.id) {
      throw new Error('punnett: parents must belong to the given species')
    }
    const lociFilter = options?.loci ?? species.loci.map((l) => l.id)
    const maxJoint = options?.maxJointOutcomes ?? 50_000

    const momGametes = this.possibleGametes(mother, species, lociFilter)
    const dadGametes = this.possibleGametes(father, species, lociFilter)
    if (momGametes.length * dadGametes.length > maxJoint) {
      throw new Error(`punnett: combination space exceeds maxJointOutcomes for loci [${lociFilter.join(', ')}]`)
    }

    const combined: CombinedOutcome[] = []
    for (const m of momGametes) {
      for (const d of dadGametes) {
        const sexChromosomes: readonly [string, string] = [m.value.sexChromosome, d.value.sexChromosome]
        const loci: Record<LocusId, AllelePair> = {}
        for (const id of lociFilter) {
          loci[id] = [m.value.loci[id] ?? null, d.value.loci[id] ?? null]
        }
        const genotype: Genotype = { sexChromosomes, loci }
        const viability = this.checkViability(genotype, species)
        combined.push({
          sexChromosomes,
          loci,
          probability: m.probability * d.probability,
          viable: viability.viable,
          ruleId: viability.ruleId,
        })
      }
    }

    return this.buildDistribution(species, lociFilter, combined)
  }

  conditionOn(distribution: OffspringDistribution, observation: Observation): OffspringDistribution {
    const raw = this.rawDistributions.get(distribution)
    if (!raw) throw new Error('conditionOn: distribution was not produced by this engine')
    const filtered = raw.viableCombined.filter((c) => {
      const genotype: Genotype = { sexChromosomes: c.sexChromosomes, loci: c.loci }
      if (observation.kind === 'sex') {
        return this.sexOf(genotype, raw.species.sexSystem) === observation.sex
      }
      const individual: Individual = {
        id: 'condition-preview',
        species: raw.species.id,
        genotype,
        parents: null,
        mutations: [],
      }
      const phenotype = this.express(individual, raw.species)
      return raw.species.phenotypeKey(phenotype) === observation.phenotypeKey
    })
    return this.buildDistribution(raw.species, raw.lociFilter, filtered)
  }

  carrierProbability(distribution: OffspringDistribution, locus: LocusId, allele: string): number {
    const marginal = distribution.lociMarginals[locus]
    if (!marginal) return 0
    return marginal.reduce((sum, w) => sum + (w.value.includes(allele) ? w.probability : 0), 0)
  }

  /**
   * Simplified on purpose (see file header): handles `geneTest` (collapses to certain) and
   * `parentage` (a from-belief approximation — combines the two parents' own recorded
   * `GeneticKnowledge` for a locus only when both are already `certain`; anything short of
   * that returns `unknown` for that locus rather than attempting a full marginalisation over
   * uncertain parents). `observedPhenotype` and `offspring` evidence are accepted but do not
   * change belief — the real engine (05) is expected to implement the full Bayesian version
   * the architect spec describes.
   */
  inferKnowledge<P extends object>(
    individual: string,
    evidence: readonly Evidence[],
    species: SpeciesDefinition<P>,
    others: Readonly<Record<string, GeneticKnowledge>>,
  ): GeneticKnowledge {
    const loci: Record<LocusId, GeneticKnowledge['loci'][string]> = {}
    for (const locus of species.loci) loci[locus.id] = { kind: 'unknown' }

    for (const e of evidence) {
      if (e.kind === 'geneTest') {
        loci[e.locus] = { kind: 'certain', pair: e.pair }
      } else if (e.kind === 'parentage') {
        const motherKnowledge = others[e.mother]
        const fatherKnowledge = others[e.father]
        if (!motherKnowledge || !fatherKnowledge) continue
        for (const locus of species.loci) {
          const m = motherKnowledge.loci[locus.id]
          const f = fatherKnowledge.loci[locus.id]
          if (m?.kind === 'certain' && f?.kind === 'certain') {
            const distribution: Record<string, number> = {}
            for (const ma of m.pair) {
              for (const fa of f.pair) {
                const k = genotypeKey(ma, fa)
                distribution[k] = (distribution[k] ?? 0) + 0.25
              }
            }
            loci[locus.id] = { kind: 'posterior', distribution }
          }
        }
      }
      // 'observedPhenotype' and 'offspring': see doc comment above.
    }

    return { individual, loci }
  }

  registerNovelAlleleGenerator(generator: NovelAlleleGenerator): void {
    this.novelAlleleGenerators.set(generator.id, generator)
  }

  restoreDiscoveredAlleles(discovered: readonly DiscoveredAllele[]): void {
    for (const d of discovered) {
      if (!this.novelAlleleGenerators.has(d.generatorId)) {
        throw new Error(`restoreDiscoveredAlleles: unknown generator id "${d.generatorId}"`)
      }
    }
  }
}

function computeInteractionGroups<P extends object>(
  species: SpeciesDefinition<P>,
  lociFilter: readonly LocusId[],
): readonly (readonly LocusId[])[] {
  const parent = new Map<LocusId, LocusId>()
  const find = (id: LocusId): LocusId => {
    let root = id
    while (parent.get(root) && parent.get(root) !== root) root = parent.get(root)!
    return root
  }
  const union = (a: LocusId, b: LocusId) => {
    parent.set(find(a), find(b))
  }
  for (const id of lociFilter) parent.set(id, id)

  const groups: (readonly LocusId[])[] = []
  for (const rule of [...species.modifiers, ...species.viability]) {
    const involved = ('reads' in rule ? rule.reads : rule.involves).filter((id) => lociFilter.includes(id))
    for (let i = 1; i < involved.length; i++) union(involved[0]!, involved[i]!)
  }

  const byRoot = new Map<LocusId, LocusId[]>()
  for (const id of lociFilter) {
    const root = find(id)
    const list = byRoot.get(root) ?? []
    list.push(id)
    byRoot.set(root, list)
  }
  for (const list of byRoot.values()) groups.push(list)
  return groups
}
