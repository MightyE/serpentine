/**
 * **Deprecated shim.** Every constant that used to be defined here now lives in
 * `src/game/tuning.ts`, the repo's single constants file — see its
 * "FACILITY, HUSBANDRY, INFORMATION, REPUTATION" section.
 *
 * The file survives as a re-export rather than being deleted because `src/habitat/` imports from
 * it and is being written by another hand right now; breaking a sibling's in-flight module to
 * save one indirection is a bad trade. **Repoint those two imports at `game/tuning` and delete
 * this file** — a five-minute job, and nothing else references it.
 */
export {
  FACILITY_SLOTS_BY_TIER,
  FACILITY_TIER_COST,
  FACILITY_UPKEEP_BY_TIER,
  ENCLOSURE_TYPES,
  PROVISION_AXES,
  PROVISION_BASELINE,
  HUSBANDRY_RECEPTIVITY_SHARE,
  HUSBANDRY_SUPPORT_BONUS_MAX,
  EXTRA_CARE_MITIGATION_MAX,
  GENE_TEST_COST,
  FULL_PANEL_COST_MULTIPLIER,
  PEDIGREE_AUDIT_COST,
  provenPriceMultiplier,
  OUTCROSS_STOCK_PREMIUM,
  REPUTATION_FOR_STOCK_TIER,
  REPUTATION_AWARDS,
  type EnclosureTypeId,
  type EnclosureType,
  type ProvisionAxis
} from '../tuning'
