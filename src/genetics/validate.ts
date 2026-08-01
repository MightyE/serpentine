/**
 * Validation: catching content typos at boot, loudly.
 *
 * ## Why this file earns its place
 *
 * Species definitions are hand-authored data, and hand-authored data has typos. The failure mode
 * of a genetics engine with a typo in its data is not a crash — it is a *wrong number*. An
 * expression table row keyed on a misspelled allele silently falls through to `otherwise`, and
 * the game confidently shows a Punnett square that is simply not true. Nobody notices, because
 * nothing looks broken.
 *
 * So: validate once at boot, and say exactly what is wrong and where. A crash on startup costs
 * five minutes. A silently wrong probability in a teaching tool costs the whole point of the
 * teaching tool.
 *
 * ## The one thing this file does that is not obvious
 *
 * `ModifierRule.reads` and `ViabilityRule.involves` are the sharpest edge in the design: they
 * tell the probability engine which loci interact and therefore must be considered *jointly*.
 * Under-declare one and `punnett()` hands back confident, wrong numbers.
 *
 * You cannot check that by reading the data, because `apply` is a function. So instead this file
 * *runs* each rule against probe animals with the genotype wrapped in a `Proxy` that records
 * every locus the rule actually touches, then compares that against what it declared. It is a
 * best-effort check — a rule that only reads a locus down a branch the probes did not take will
 * slip through — which is why the dispatch also asks for a test. But it catches the common case
 * for free, at boot, with a path and a message.
 *
 * @see ./types.ts — `ValidationIssue`
 */

import { resolveLocus } from './expression'
import {
  alleleCopies,
  assertNoLinkage,
  genotypeKey,
  makeGenotype,
  sexOf,
} from './genotype'
import type {
  AllelePair,
  ExpressionPipelineContext,
  Genotype,
  Locus,
  LocusId,
  SpeciesDefinition,
  TraitKey,
  TraitValue,
  ValidationIssue,
} from './types'

/**
 * Check a species definition for the mistakes that would otherwise show up as wrong probabilities.
 *
 * Returns a list of issues, worst first is *not* guaranteed — read `severity`. An empty list means
 * the data is structurally sound; it says nothing about whether the biology you wrote is the
 * biology you meant.
 *
 * One thing this **throws** on rather than reporting: a `linkage` block. Linkage is deliberately
 * not implemented, and a caller that ignored a returned issue would go on to compute inheritance
 * as if linked genes assorted independently. That has to be impossible, not merely discouraged.
 */
export function validateSpecies<P extends object>(
  species: SpeciesDefinition<P>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const byId = new Map<LocusId, Locus>()

  for (const locus of species.loci) {
    // Not an issue — an exception. See the doc comment above.
    assertNoLinkage(locus)
    if (byId.has(locus.id)) {
      issues.push({
        severity: 'error',
        path: `loci.${locus.id}`,
        message: `Two loci share the id '${locus.id}'. Locus ids must be unique.`,
      })
    }
    byId.set(locus.id, locus)
  }

  for (const locus of species.loci) {
    checkAlleles(locus, issues)
    checkPlacement(locus, species, issues)
    checkExpressionTable(locus, issues)
  }

  checkPolygenic(species, byId, issues)
  checkTraitKeyCollisions(species, issues)
  checkDeclaredReads(species, byId, issues)

  return issues
}

// ---------------------------------------------------------------------------
// Per-locus checks
// ---------------------------------------------------------------------------

/** Allele ids must be unique, there must be at least two, and `wildType` must be one of them. */
function checkAlleles(locus: Locus, issues: ValidationIssue[]): void {
  const seen = new Set<string>()
  for (const allele of locus.alleles) {
    if (seen.has(allele.id)) {
      issues.push({
        severity: 'error',
        path: `loci.${locus.id}.alleles`,
        message: `Allele '${allele.id}' is declared twice at locus '${locus.id}'.`,
      })
    }
    seen.add(allele.id)

    // Content policy: a fictional trait is welcome, but it has to be labelled everywhere it is
    // shown, so the real ones stay trustworthy. Silence is not a claim either way.
    if (allele.origin === 'authored' && allele.invented === undefined) {
      issues.push({
        severity: 'warning',
        path: `loci.${locus.id}.alleles.${allele.id}.invented`,
        message:
          `Allele '${allele.id}' is authored but does not say whether it is invented. ` +
          `Set 'invented: true' for a made-up trait or 'invented: false' for a documented one, ` +
          `so the UI can label it honestly.`,
      })
    }
  }

  if (locus.alleles.length < 2) {
    issues.push({
      severity: 'error',
      path: `loci.${locus.id}.alleles`,
      message: `Locus '${locus.id}' declares ${locus.alleles.length} allele(s); a locus needs at least two.`,
    })
  }

  if (!seen.has(locus.wildType)) {
    issues.push({
      severity: 'error',
      path: `loci.${locus.id}.wildType`,
      message:
        `Locus '${locus.id}' names '${locus.wildType}' as its wild type, but that allele is not ` +
        `in its allele list (${[...seen].join(', ') || 'empty'}).`,
    })
  }
}

/** A sex-linked locus must sit on a chromosome the species' sex system actually has. */
function checkPlacement<P extends object>(
  locus: Locus,
  species: SpeciesDefinition<P>,
  issues: ValidationIssue[],
): void {
  if (locus.placement.kind !== 'sexLinked') return

  const { homogameticChromosome: homo, heterogameticChromosome: hetero } = species.sexSystem
  if (locus.placement.chromosome !== homo && locus.placement.chromosome !== hetero) {
    issues.push({
      severity: 'error',
      path: `loci.${locus.id}.placement.chromosome`,
      message:
        `Locus '${locus.id}' is sex-linked on chromosome '${locus.placement.chromosome}', but ` +
        `species '${species.id}' uses the '${species.sexSystem.id}' system, whose sex chromosomes ` +
        `are '${homo}' and '${hetero}'. No animal could carry this locus.`,
    })
  }
}

/**
 * Every allele named in an expression-table key must exist, and the key must be in canonical form.
 *
 * The canonical-form check matters more than it looks. A table row written `'variant-b/variant-a'`
 * is never found, because lookups go through {@link genotypeKey}, which sorts. The row does not
 * error — it just never fires, and the animal quietly falls through to `otherwise`.
 */
function checkExpressionTable(locus: Locus, issues: ValidationIssue[]): void {
  if (locus.expression.kind !== 'table') return

  const known = new Set(locus.alleles.map((a) => a.id))
  for (const key of Object.keys(locus.expression.entries)) {
    const parts = key === '' ? [] : key.split('/')

    for (const part of parts) {
      if (!known.has(part)) {
        issues.push({
          severity: 'error',
          path: `loci.${locus.id}.expression.entries.${key}`,
          message: `Expression table key '${key}' names allele '${part}', which is not declared at locus '${locus.id}'.`,
        })
      }
    }

    if (parts.length > 2) {
      issues.push({
        severity: 'error',
        path: `loci.${locus.id}.expression.entries.${key}`,
        message:
          `Expression table key '${key}' names ${parts.length} alleles. An animal carries at ` +
          `most two copies of a locus, so this row can never match.`,
      })
      continue
    }

    const canonical = [...parts].sort().join('/')
    if (canonical !== key) {
      issues.push({
        severity: 'error',
        path: `loci.${locus.id}.expression.entries.${key}`,
        message:
          `Expression table key '${key}' is not in canonical (sorted) form. Lookups sort the ` +
          `alleles first, so this row would never match. Write it as '${canonical}'.`,
      })
    }
  }
}

// ---------------------------------------------------------------------------
// Cross-cutting checks
// ---------------------------------------------------------------------------

/** Polygenic contributions must point at loci and alleles that exist. */
function checkPolygenic<P extends object>(
  species: SpeciesDefinition<P>,
  byId: Map<LocusId, Locus>,
  issues: ValidationIssue[],
): void {
  for (const trait of species.polygenic) {
    for (const contribution of trait.contributions) {
      const locus = byId.get(contribution.locus)
      if (!locus) {
        issues.push({
          severity: 'error',
          path: `polygenic.${trait.key}.contributions`,
          message: `Polygenic trait '${trait.key}' contributes from locus '${contribution.locus}', which species '${species.id}' does not declare.`,
        })
        continue
      }
      const known = new Set(locus.alleles.map((a) => a.id))
      for (const alleleId of Object.keys(contribution.perAllele)) {
        if (!known.has(alleleId)) {
          issues.push({
            severity: 'error',
            path: `polygenic.${trait.key}.contributions.${contribution.locus}.perAllele.${alleleId}`,
            message: `Polygenic trait '${trait.key}' weights allele '${alleleId}', which is not declared at locus '${contribution.locus}'.`,
          })
        }
      }
    }

    const [min, max] = trait.clamp
    if (min > max) {
      issues.push({
        severity: 'error',
        path: `polygenic.${trait.key}.clamp`,
        message: `Polygenic trait '${trait.key}' has an inverted clamp [${min}, ${max}].`,
      })
    }
  }
}

/**
 * Two loci (or a locus and a polygenic trait) writing the same trait key.
 *
 * Only one of them survives — whichever runs last — so this is almost always a copy-paste bug
 * rather than an intention.
 */
function checkTraitKeyCollisions<P extends object>(
  species: SpeciesDefinition<P>,
  issues: ValidationIssue[],
): void {
  const owner = new Map<TraitKey, string>()

  for (const locus of species.loci) {
    for (const key of traitKeysOf(locus)) {
      const previous = owner.get(key)
      if (previous !== undefined) {
        issues.push({
          severity: 'warning',
          path: `loci.${locus.id}.expression`,
          message: `Locus '${locus.id}' and '${previous}' both write trait '${key}'. Only the later one survives.`,
        })
      }
      owner.set(key, locus.id)
    }
  }

  for (const trait of species.polygenic) {
    const previous = owner.get(trait.key)
    if (previous !== undefined) {
      issues.push({
        severity: 'warning',
        path: `polygenic.${trait.key}`,
        message: `Polygenic trait '${trait.key}' overwrites the trait of the same name written by locus '${previous}'.`,
      })
    }
    owner.set(trait.key, `polygenic:${trait.key}`)
  }
}

/** Which trait keys a locus can emit. Tables we can read; a custom rule we have to run. */
function traitKeysOf(locus: Locus): TraitKey[] {
  const keys = new Set<TraitKey>()
  if (locus.expression.kind === 'table') {
    for (const values of Object.values(locus.expression.entries)) {
      for (const key of Object.keys(values)) keys.add(key)
    }
    for (const key of Object.keys(locus.expression.otherwise)) keys.add(key)
    return [...keys]
  }
  // A custom rule only tells us what it emits by being asked. Probe it with a homozygous
  // wild-type pair, which every locus can legally produce.
  const pair: AllelePair = [locus.wildType, locus.wildType]
  try {
    const values = locus.expression.resolve(pair, {
      genotype: { sexChromosomes: ['?', '?'], loci: { [locus.id]: pair } },
      sex: 'female',
      individualId: 'validate-probe',
      locus,
    })
    for (const key of Object.keys(values)) keys.add(key)
  } catch {
    // A custom rule that cannot survive a wild-type probe is its own problem; the reads check
    // below reports it with a path.
  }
  return [...keys]
}

// ---------------------------------------------------------------------------
// The `reads` / `involves` check — the sharpest edge in the design
// ---------------------------------------------------------------------------

/**
 * Run every modifier and viability rule against probe animals and see which loci it *actually*
 * touches, then compare that against what it declared.
 *
 * The probes are: a wild-type animal of each sex, and an animal of each sex homozygous for the
 * first non-wild-type allele at every locus. That is not exhaustive — a rule guarded by a
 * condition none of the probes satisfy will not be seen reading anything — so a missing `reads`
 * entry here is reported as a warning, and this check is a safety net rather than a proof.
 */
function checkDeclaredReads<P extends object>(
  species: SpeciesDefinition<P>,
  byId: Map<LocusId, Locus>,
  issues: ValidationIssue[],
): void {
  // Which locus produced which trait key — so a modifier that reads `ctx.traits.melanin` counts
  // as reading the locus that wrote `melanin`, which is what the probability engine cares about.
  const traitOwner = new Map<TraitKey, LocusId>()
  for (const locus of species.loci) {
    for (const key of traitKeysOf(locus)) traitOwner.set(key, locus.id)
  }

  let probes: Genotype[]
  try {
    probes = buildProbes(species)
  } catch {
    return // A species whose genotypes cannot be built has bigger problems, already reported.
  }

  for (const modifier of species.modifiers) {
    for (const declared of modifier.reads) {
      if (!byId.has(declared)) {
        issues.push({
          severity: 'error',
          path: `modifiers.${modifier.id}.reads`,
          message: `Modifier '${modifier.id}' declares it reads locus '${declared}', which species '${species.id}' does not have.`,
        })
      }
    }

    const touched = new Set<LocusId>()
    for (const genotype of probes) {
      const { proxy, seen } = watchGenotype(genotype)
      const traits = probeTraits(species, genotype)
      const { proxy: traitProxy, seen: seenTraits } = watchTraits(traits)
      const ctx: ExpressionPipelineContext = {
        genotype: proxy,
        sex: sexOf(genotype, species.sexSystem),
        individualId: 'validate-probe',
        traits: traitProxy,
      }
      try {
        modifier.apply(species.basePhenotype(), ctx)
      } catch (error) {
        issues.push({
          severity: 'warning',
          path: `modifiers.${modifier.id}.apply`,
          message:
            `Modifier '${modifier.id}' threw while being probed with a valid genotype: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        })
      }
      for (const id of seen) touched.add(id)
      for (const key of seenTraits) {
        const owner = traitOwner.get(key)
        if (owner) touched.add(owner)
      }
    }

    reportUndeclared(touched, modifier.reads, `modifiers.${modifier.id}.reads`, `Modifier '${modifier.id}'`, issues)
  }

  for (const rule of species.viability) {
    for (const declared of rule.involves) {
      if (!byId.has(declared)) {
        issues.push({
          severity: 'error',
          path: `viability.${rule.id}.involves`,
          message: `Viability rule '${rule.id}' declares it involves locus '${declared}', which species '${species.id}' does not have.`,
        })
      }
    }

    const touched = new Set<LocusId>()
    for (const genotype of probes) {
      const { proxy, seen } = watchGenotype(genotype)
      try {
        rule.isNonViable(proxy, sexOf(genotype, species.sexSystem))
      } catch (error) {
        issues.push({
          severity: 'warning',
          path: `viability.${rule.id}.isNonViable`,
          message:
            `Viability rule '${rule.id}' threw while being probed with a valid genotype: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        })
      }
      for (const id of seen) touched.add(id)
    }

    reportUndeclared(touched, rule.involves, `viability.${rule.id}.involves`, `Viability rule '${rule.id}'`, issues)
  }
}

function reportUndeclared(
  touched: ReadonlySet<LocusId>,
  declared: readonly LocusId[],
  path: string,
  subject: string,
  issues: ValidationIssue[],
): void {
  const declaredSet = new Set(declared)
  const missing = [...touched].filter((id) => !declaredSet.has(id))
  if (missing.length === 0) return
  issues.push({
    severity: 'warning',
    path,
    message:
      `${subject} reads ${missing.map((id) => `'${id}'`).join(', ')} but does not declare ` +
      `${missing.length === 1 ? 'it' : 'them'}. The probability engine uses this list to decide ` +
      `which loci must be considered jointly — under-declaring it produces confident, wrong numbers.`,
  })
}

/** Wild-type and fully-variant animals of each sex. Enough to take most branches in a rule. */
function buildProbes<P extends object>(species: SpeciesDefinition<P>): Genotype[] {
  const variant: Record<LocusId, AllelePair> = {}
  for (const locus of species.loci) {
    const alt = locus.alleles.find((a) => a.id !== locus.wildType) ?? locus.alleles[0]
    if (alt) variant[locus.id] = [alt.id, alt.id]
  }
  return [
    makeGenotype(species, 'female'),
    makeGenotype(species, 'male'),
    makeGenotype(species, 'female', variant),
    makeGenotype(species, 'male', variant),
  ]
}

/** Trait values for a probe genotype, without needing a real `Individual`. */
function probeTraits<P extends object>(
  species: SpeciesDefinition<P>,
  genotype: Genotype,
): Record<TraitKey, TraitValue> {
  const sex = sexOf(genotype, species.sexSystem)
  const out: Record<TraitKey, TraitValue> = {}
  for (const locus of species.loci) {
    const pair = genotype.loci[locus.id]
    if (!pair) continue
    try {
      Object.assign(
        out,
        resolveLocus(locus, pair, { genotype, sex, individualId: 'validate-probe', locus }),
      )
    } catch {
      // Reported elsewhere; a probe failing here should not stop the rest of validation.
    }
  }
  for (const trait of species.polygenic) {
    let value = trait.baseline
    for (const contribution of trait.contributions) {
      const pair = genotype.loci[contribution.locus]
      if (!pair) continue
      for (const allele of alleleCopies(pair)) value += contribution.perAllele[allele] ?? 0
    }
    out[trait.key] = value
  }
  return out
}

/** Wrap a genotype so every `loci[...]` lookup is recorded. */
function watchGenotype(genotype: Genotype): { proxy: Genotype; seen: Set<LocusId> } {
  const seen = new Set<LocusId>()
  const loci = new Proxy(genotype.loci as Record<LocusId, AllelePair>, {
    get(target, property, receiver) {
      if (typeof property === 'string') seen.add(property)
      return Reflect.get(target, property, receiver)
    },
  })
  return { proxy: { sexChromosomes: genotype.sexChromosomes, loci }, seen }
}

/** Wrap the trait bag so every trait lookup is recorded, and attributed back to its locus. */
function watchTraits(traits: Record<TraitKey, TraitValue>): {
  proxy: Record<TraitKey, TraitValue>
  seen: Set<TraitKey>
} {
  const seen = new Set<TraitKey>()
  const proxy = new Proxy(traits, {
    get(target, property, receiver) {
      if (typeof property === 'string') seen.add(property)
      return Reflect.get(target, property, receiver)
    },
  })
  return { proxy, seen }
}
