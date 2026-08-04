/**
 * Serpentine — achievements, assembled.
 *
 * ## Wiring it into the game, in full
 *
 * ```ts
 * const coverage = buildCoverage(playableSpecies())
 * const tally = createTallyRecorder(bus, flags, (id) => subjectOf(lookupSnake(id), speciesOf(id)))
 * const achievements = createAchievementEngine({
 *   bus, flags, coverage, view: createProgressView(flags, registry), registry,
 *   catalogue: ACHIEVEMENTS,
 *   onAward: (achievement, reward) => payReward(reward),
 * })
 * ```
 *
 * Four lines, and two of them are the seams the game already had. `createAchievementEngine` runs a
 * sweep as it is constructed, so a save loaded from an older build earns whatever it had already
 * done before the first frame is drawn.
 *
 * ## What is not wired yet, and why that is safe
 *
 * Several tallies have no event to ride yet — placements, correct predictions, viability
 * explanations read, outcross recoveries, pedigree depth, extra-care residents. `TallyRecorder`
 * exposes a `note…()` call for each, to be made by whichever system lands the mechanic. Until
 * then those counters stay at zero and the achievements reading them stay legibly pending, with a
 * progress bar at 0/N and a `describe` that says what to go and do. That is the correct behaviour
 * for a mechanic that does not exist, and it is why the catalogue could be written before the
 * game finished being written. `docs/achievements-design.md` lists them.
 */
import type { Individual, SpeciesDefinition } from '../../genetics/types'
import type { TalentMilestone } from '../progression/types'
import type { TallySubject } from './tallies'
import { visibleAlleles } from './traits'
import { ACHIEVEMENTS } from './catalogue'
import { achievementReward } from './engine'
import type { Achievement } from './types'
import { earnedFlagId } from './types'

export { ACHIEVEMENTS, BALL, CORN, HOG } from './catalogue'
export { CANONICAL_ODDS, ODDS_KEYS, odds } from './canonicalOdds'
export type { CanonicalOdds, OddsKey } from './canonicalOdds'
export {
  compileAchievement,
  describeRequirement,
  isRequirementMet,
  requirementProgress,
  watchedFlags,
} from './compile'
export type { RequirementProgress } from './compile'
export { QUANTILES, buildCoverage, coverageId, quantileLabel } from './coverage'
export type { CoverageIndex, CoverageSet } from './coverage'
export {
  ENTRY_CLUTCH_GROSS,
  RUNG_THRESHOLDS,
  clutchEquivalents,
  clutchesForConfidence,
  explainEffort,
  rungFor,
  stepClutchEquivalents,
} from './effort'
export type { EffortStep, Rung } from './effort'
export {
  EARNED_FLAG_PREFIX,
  achievementReward,
  createAchievementEngine,
} from './engine'
export type { AchievementEngine, AchievementEngineOptions, AchievementView } from './engine'
export {
  CAPSTONE_VALUE,
  MAX_GRANTS_PER_ACHIEVEMENT,
  MAX_REPUTATION_PER_ACHIEVEMENT,
  MONEY_SHARE_BY_RUNG,
  REWARD_INVARIANTS,
  VALUE_PER_CLUTCH_EQUIVALENT,
  VALUE_PER_REPUTATION,
  VALUE_PER_STOCK_OFFER,
  VALUE_PER_TALENT_POINT,
  VALUE_PER_TITLE,
  VALUE_PER_UNLOCK,
  grantValue,
  rewardsFor,
  roundMoney,
  validateReward,
} from './reward'
export type { Grant, Reward, RewardBreakdown, RewardProblem } from './reward'
export { EXISTING_FLAGS, TALLY, TALLY_PREFIX, createTallyRecorder } from './tallies'
export type { TallyLookup, TallyRecorder, TallySubject } from './tallies'
export { dominanceOf, morphList, visibleAlleles } from './traits'
export type { Dominance, VisibleAllele } from './traits'
export { CATEGORIES, achievementUnlockId, earnedFlagId } from './types'
export type { Achievement, AchievementId, Category, CategoryId, CoverageSetId, Requirement } from './types'

/**
 * Everything the tally needs to know about one animal, computed once by the caller that already
 * has both the animal and its species.
 *
 * ### The phenotype key is the visible alleles, not the rendered appearance
 *
 * `phenotypeKey` decides what "an animal that looks like one you have already produced" means, and
 * it is derived from the set of alleles the animal is visibly showing rather than from the
 * renderer's output. That is a deliberate simplification with a real edge: two piebalds with
 * different `piebaldWhitePercent` get the same key, so the second one is not a novel phenotype.
 *
 * It is the right call anyway. Keying on rendered pixels would make every polygenic animal novel,
 * which would turn "produce twenty-five distinct appearances" into a counter that advances on
 * every hatchling — a grind wearing a variety costume, and the exact thing the charter's principle
 * 8 forbids. Keying on genotype instead means the counter only moves when you have genuinely made
 * something new.
 */
export function subjectOf<P extends object>(
  individual: Individual,
  species: SpeciesDefinition<P>,
): TallySubject {
  const visible = visibleAlleles(individual, species)
  const phenotypeKey = visible
    .map((allele) => `${allele.locusId}:${allele.alleleId}`)
    .sort()
    .join('+')
  return {
    speciesId: species.id,
    phenotypeKey: phenotypeKey === '' ? 'wild-type' : phenotypeKey,
    visible,
  }
}

/**
 * The achievements that pay a talent point, as `TalentMilestone`s.
 *
 * ### Why this is an export rather than the engine handing out points
 *
 * `TalentPoints.earned` is derived from milestones on every read, never stored — which is what
 * makes it impossible for a save file to lose a point. If the achievement engine granted points
 * directly it would have to store a running total somewhere, and there would then be two answers
 * to "how many points do I have" with nothing keeping them in step.
 *
 * So an achievement that pays a talent point becomes a milestone whose condition is *that
 * achievement's earned flag*. The talent tree stays the only authority on points, achievements
 * stay the only authority on what has been done, and the two compose through a flag instead of
 * duplicating each other. Add this to the tree's spec alongside `STARTER_MILESTONES`.
 */
export const ACHIEVEMENT_MILESTONES: readonly TalentMilestone[] = ACHIEVEMENTS.flatMap(
  (achievement: Achievement): TalentMilestone[] =>
    (achievement.grants ?? [])
      .filter((grant) => grant.kind === 'talentPoint')
      .map((grant) => ({
        id: `achievement:${achievement.id}`,
        describe: achievement.description,
        points: grant.points,
        isMet: (view) => view.flag(earnedFlagId(achievement.id)) === true,
      })),
)

/** Total money the catalogue can ever pay. For the economy's own invariants, and for the doc. */
export function totalCatalogueMoney(catalogue: readonly Achievement[] = ACHIEVEMENTS): number {
  return catalogue.reduce((total, achievement) => total + achievementReward(achievement).money, 0)
}
