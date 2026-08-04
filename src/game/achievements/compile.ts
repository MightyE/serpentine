/**
 * Serpentine — turning an achievement's requirement data into the thing the game already
 * understands.
 *
 * `seams.ts` is explicit that `UnlockRegistry` is the one place that answers "can I do this yet?",
 * and that building a second notion of availability would mean two answers that drift. So an
 * `Achievement` compiles down to an `Unlock`, the same way a `TalentNode` does — the requirement
 * tree is an *authoring* format, never a second evaluator.
 *
 * Three things fall out of the tree that a closure could not have given us:
 *
 * - {@link watchedFlags} — the flags an achievement reads. This is the index that keeps evaluation
 *   cheap: a flag change re-checks only the achievements that could possibly care.
 * - {@link describeRequirement} — the legible reason `seams.ts` makes mandatory, generated from
 *   the same data it describes, so the two cannot disagree.
 * - {@link requirementProgress} — how far along you are, which is what the browsable list draws
 *   and what makes an unearned achievement a goal rather than a locked box.
 */
import type { FlagId, ProgressView, Unlock, UnlockCondition } from '../seams'
import type { CoverageIndex } from './coverage'
import { quantileLabel } from './coverage'
import type { Achievement, Requirement } from './types'
import { achievementUnlockId } from './types'

/** Every flag a requirement reads, deduplicated. Walks the tree; never evaluates anything. */
export function watchedFlags(requirement: Requirement, coverage: CoverageIndex): readonly FlagId[] {
  const out = new Set<FlagId>()
  const walk = (node: Requirement): void => {
    switch (node.kind) {
      case 'atLeast':
      case 'isTrue':
        out.add(node.flag)
        return
      case 'coverage':
        for (const flag of coverage.get(node.set)?.memberFlags ?? []) out.add(flag)
        return
      case 'all':
      case 'any':
        for (const child of node.of) walk(child)
    }
  }
  walk(requirement)
  return [...out]
}

export function describeRequirement(requirement: Requirement, coverage: CoverageIndex): string {
  switch (requirement.kind) {
    case 'atLeast':
    case 'isTrue':
      return requirement.describe
    case 'coverage': {
      const set = coverage.get(requirement.set)
      const label = set?.label ?? requirement.set
      return requirement.fraction >= 1
        ? `produce every one of ${label}`
        : `produce ${quantileLabel(requirement.fraction)} of ${label}`
    }
    case 'all':
      return requirement.of.map((child) => describeRequirement(child, coverage)).join(', and ')
    case 'any':
      return requirement.describe
  }
}

export function isRequirementMet(
  requirement: Requirement,
  view: ProgressView,
  coverage: CoverageIndex,
): boolean {
  switch (requirement.kind) {
    case 'atLeast':
      return view.count(requirement.flag) >= requirement.value
    case 'isTrue':
      return view.flag(requirement.flag) === true
    case 'coverage': {
      const { done, total } = coverage.progress(requirement.set, view)
      // An unknown or empty set is never met. 0/0 must not read as complete.
      if (total === 0) return false
      return done / total >= requirement.fraction - 1e-9
    }
    case 'all':
      return requirement.of.every((child) => isRequirementMet(child, view, coverage))
    case 'any':
      return requirement.of.some((child) => isRequirementMet(child, view, coverage))
  }
}

/** How far along, as a fraction in `[0, 1]`, plus the counts a UI wants to print. */
export interface RequirementProgress {
  readonly label: string
  readonly done: number
  readonly total: number
  readonly fraction: number
}

/**
 * One progress line per leaf of the requirement, in tree order.
 *
 * Leaves rather than a single rolled-up number, because "3 of 5 recessives, and 1 of 2 species" is
 * a plan and "40%" is a mood.
 */
export function requirementProgress(
  requirement: Requirement,
  view: ProgressView,
  coverage: CoverageIndex,
): readonly RequirementProgress[] {
  switch (requirement.kind) {
    case 'atLeast': {
      const done = Math.min(view.count(requirement.flag), requirement.value)
      return [
        { label: requirement.describe, done, total: requirement.value, fraction: done / requirement.value },
      ]
    }
    case 'isTrue': {
      const done = view.flag(requirement.flag) === true ? 1 : 0
      return [{ label: requirement.describe, done, total: 1, fraction: done }]
    }
    case 'coverage': {
      const { done, total } = coverage.progress(requirement.set, view)
      const needed = Math.max(1, Math.ceil(total * requirement.fraction))
      const reached = Math.min(done, needed)
      return [
        {
          label: describeRequirement(requirement, coverage),
          done: reached,
          total: needed,
          fraction: needed === 0 ? 0 : reached / needed,
        },
      ]
    }
    case 'all':
    case 'any':
      return requirement.of.flatMap((child) => requirementProgress(child, view, coverage))
  }
}

/**
 * The `Unlock` an achievement becomes.
 *
 * A root-level `all` becomes one `UnlockCondition` per child rather than one compound condition,
 * because `UnlockRegistry.pending` reports the *unmet conditions* — and "you still need to prove a
 * het" is a better thing to show a player than one long sentence with the finished half still in it.
 */
export function compileAchievement(achievement: Achievement, coverage: CoverageIndex): Unlock {
  const parts: Requirement[] =
    achievement.requires.kind === 'all' ? [...achievement.requires.of] : [achievement.requires]

  const requires: UnlockCondition[] = parts.map((part) => ({
    describe: describeRequirement(part, coverage),
    isMet: (view: ProgressView) => isRequirementMet(part, view, coverage),
  }))

  return {
    id: achievementUnlockId(achievement.id),
    label: achievement.label,
    description: achievement.description,
    requires,
    // Achievements grant nothing through the unlock system: what they pay is handed over by the
    // engine when the award fires, once, and recorded in a flag. An unlock's `grants` is
    // recomputed from scratch on every evaluate, so a reward living there would be paid forever.
    grants: [],
    hidden: achievement.hidden ?? false,
  }
}
