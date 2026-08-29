import { resolve } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { config } from 'dotenv';

// Repeats generate-corpus.ts's own bootstrap (see its lines 1-8) -- harmless here since this
// script never reads DATABASE_URL, kept only for consistency with the sibling seed script's
// entrypoint shape per 03-PATTERNS.md.
config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] });

import { MUSCLE_GROUPS, MUSCLE_GROUP_BODY_REGION } from '@fitness/api-contracts';
import type {
  CatalogSnapshot,
  CatalogSnapshotExercise,
  CatalogSnapshotMapping,
  CatalogSnapshotMuscleGroup,
  LoadType,
  MovementPattern,
  MuscleGroupId,
  MuscleRole,
} from '@fitness/api-contracts';
import {
  AMBIGUOUS_DELT,
  BODYWEIGHT_CONTRIBUTION_DEFAULTS,
  BODYWEIGHT_CONTRIBUTION_FAMILY_RULES,
  LOAD_TYPE_RULES,
  MOVEMENT_PATTERN_RULES,
  normalizeNameForMergeComparison,
  SHOULDER_DISAMBIGUATION_RULES,
  SOURCE_EQUIPMENT_TO_CANONICAL,
  SOURCE_MUSCLE_TO_CANONICAL,
  VARIATION_MODIFIER_PREFIXES,
  WEIGHT_FACTOR_FAMILY_RULES,
  WEIGHT_FACTOR_OVERRIDES,
} from './catalog-taxonomy';

// ---------------------------------------------------------------------------------------------
// Fixed, not Date.now() -- catalog_version is content-addressed and generated_at is set from the
// source file's own recorded fetch date (docs/catalog-dataset-license.md), so re-running this
// script produces a byte-identical artifact regardless of what day it is run.
// ---------------------------------------------------------------------------------------------
export const SOURCE_FETCHED_AT = '2026-08-18T00:00:00.000Z';
const SOURCE_IMAGE_BASE_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

export interface SourceExercise {
  id: string;
  name: string;
  force: string | null;
  level: string;
  mechanic: string | null;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  category: string;
  images: string[];
}

export interface ExclusionRecord {
  exercise_id: string;
  exercise_name: string;
  field: string;
  value: string;
  reason: string;
}

export interface MergeRecord {
  canonical_id: string;
  canonical_name: string;
  merged_names: string[];
  reason: string;
}

export interface DerivedFieldRecord {
  exercise_id: string;
  field: string;
  value: unknown;
  rule: string;
}

export interface NormalizationReport {
  source_record_count: number;
  normalized_count: number;
  merged_duplicate_count: number;
  excluded_count: number;
  movement_pattern_null_count: number;
  exclusions: ExclusionRecord[];
  merges: MergeRecord[];
  derived: DerivedFieldRecord[];
  catalog_version: string;
  generated_at: string;
}

export interface NormalizationResult {
  snapshot: CatalogSnapshot;
  report: NormalizationReport;
}

// ---------------------------------------------------------------------------------------------
// Deterministic serialization -- recursively sorts object keys (array order is left untouched,
// since array order is itself meaningful data, e.g. instructions/images/aliases). Used both for
// computing catalog_version and for writing the two output files, so what gets hashed is exactly
// what gets written, and a second run over the same input is byte-identical.
// ---------------------------------------------------------------------------------------------
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value), null, 2);
}

export function computeCatalogVersion(snapshotWithoutVersionOrTimestamp: unknown): string {
  const body = canonicalStringify(snapshotWithoutVersionOrTimestamp);
  return createHash('sha256').update(body).digest('hex').slice(0, 16);
}

function humanizeMuscleGroupName(id: MuscleGroupId): string {
  return id
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ---------------------------------------------------------------------------------------------
// Step 1: muscle mapping. Resolves AMBIGUOUS_DELT through SHOULDER_DISAMBIGUATION_RULES; a source
// muscle value absent from SOURCE_MUSCLE_TO_CANONICAL is an exclusion (defensive -- the live
// dataset's 17-value vocabulary is fully covered by catalog-taxonomy.ts, so this path is not
// expected to trigger against the currently-committed source, but a future re-fetch that adds a
// new muscle value must never silently drop the exercise carrying it).
// ---------------------------------------------------------------------------------------------
interface RawMuscleMapping {
  muscleGroupId: MuscleGroupId;
  role: MuscleRole;
}

function mapMuscles(
  source: SourceExercise,
  derived: DerivedFieldRecord[],
): { mappings: RawMuscleMapping[]; exclusions: ExclusionRecord[] } {
  const mappings: RawMuscleMapping[] = [];
  const exclusions: ExclusionRecord[] = [];

  const roles: Array<[string[], MuscleRole]> = [
    [source.primaryMuscles, 'primary'],
    [source.secondaryMuscles, 'secondary'],
  ];

  for (const [muscles, role] of roles) {
    for (const sourceMuscle of muscles) {
      const canonical = SOURCE_MUSCLE_TO_CANONICAL[sourceMuscle];
      if (canonical === undefined) {
        exclusions.push({
          exercise_id: source.id,
          exercise_name: source.name,
          field: role === 'primary' ? 'primaryMuscles' : 'secondaryMuscles',
          value: sourceMuscle,
          reason: `Source muscle value '${sourceMuscle}' has no entry in SOURCE_MUSCLE_TO_CANONICAL.`,
        });
        continue;
      }
      if (canonical === AMBIGUOUS_DELT) {
        const rule =
          SHOULDER_DISAMBIGUATION_RULES.find((r) => r.match.test(source.name)) ??
          SHOULDER_DISAMBIGUATION_RULES[SHOULDER_DISAMBIGUATION_RULES.length - 1];
        mappings.push({ muscleGroupId: rule.primary, role });
        for (const secondary of rule.secondary) {
          mappings.push({ muscleGroupId: secondary, role: 'secondary' });
        }
        if (rule.derived) {
          derived.push({
            exercise_id: source.id,
            field: 'exercise_muscle_mapping (shoulder disambiguation)',
            value: { primary: rule.primary, secondary: rule.secondary },
            rule: rule.why,
          });
        }
        continue;
      }
      mappings.push({ muscleGroupId: canonical, role });
    }
  }

  return { mappings, exclusions };
}

// ---------------------------------------------------------------------------------------------
// Step 2: weight factors. Looks up each mapping's muscle_group_id against the matched family's
// WEIGHT_FACTOR_OVERRIDES entries; a mapping with no family match, or a family match with no
// entry for that specific muscle_group_id, falls back to the role default (primary 1.00,
// secondary 0.50) and is flagged derived: true -- exactly PITFALLS.md Pitfall 3's mechanical check.
// ---------------------------------------------------------------------------------------------
function resolveWeightFactors(
  source: SourceExercise,
  mappings: RawMuscleMapping[],
  derived: DerivedFieldRecord[],
): CatalogSnapshotMapping[] {
  const familyRule = WEIGHT_FACTOR_FAMILY_RULES.find((r) => r.match.test(source.name));
  const overrideEntries = familyRule ? WEIGHT_FACTOR_OVERRIDES[familyRule.family] : undefined;

  return mappings.map((mapping) => {
    const override = overrideEntries?.find((e) => e.muscle_group_id === mapping.muscleGroupId);
    const weightFactor = override?.weight_factor ?? (mapping.role === 'primary' ? '1.00' : '0.50');
    if (!override) {
      derived.push({
        exercise_id: source.id,
        field: `exercise_muscle_mapping.weight_factor (${mapping.muscleGroupId})`,
        value: weightFactor,
        rule: familyRule
          ? `Family '${familyRule.family}' matched but has no override entry for ${mapping.muscleGroupId} -- fell back to the role default.`
          : 'No WEIGHT_FACTOR_FAMILY_RULES match for this exercise name -- fell back to the role default.',
      });
    }
    return {
      exercise_id: `seed_${source.id}`,
      muscle_group_id: mapping.muscleGroupId,
      role: mapping.role,
      weight_factor: weightFactor,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Step 3: movement pattern (name rules, then mechanic:'isolation' fallback, else null -- a legal
// value) and equipment (direct lookup; null source equipment passes through as null, never an
// exclusion -- see catalog-taxonomy.ts's module comment on SOURCE_EQUIPMENT_TO_CANONICAL).
// ---------------------------------------------------------------------------------------------
function classifyMovementPattern(source: SourceExercise, derived: DerivedFieldRecord[]): MovementPattern | null {
  const rule = MOVEMENT_PATTERN_RULES.find((r) => r.match.test(source.name));
  if (rule) return rule.pattern;
  if (source.mechanic === 'isolation') {
    derived.push({
      exercise_id: source.id,
      field: 'movement_pattern',
      value: 'isolation',
      rule: "No name-based MOVEMENT_PATTERN_RULES match; source mechanic is 'isolation', applied as the pattern.",
    });
    return 'isolation';
  }
  return null;
}

function classifyEquipment(
  source: SourceExercise,
  exclusions: ExclusionRecord[],
): { equipment: string | null; excluded: boolean } {
  if (source.equipment === null) return { equipment: null, excluded: false };
  const canonical = SOURCE_EQUIPMENT_TO_CANONICAL[source.equipment];
  if (canonical === undefined) {
    exclusions.push({
      exercise_id: source.id,
      exercise_name: source.name,
      field: 'equipment',
      value: source.equipment,
      reason: `Source equipment value '${source.equipment}' has no entry in SOURCE_EQUIPMENT_TO_CANONICAL.`,
    });
    return { equipment: null, excluded: true };
  }
  return { equipment: canonical, excluded: false };
}

// ---------------------------------------------------------------------------------------------
// Step 4: load type. Every exercise must resolve to exactly one of the six LOAD_TYPES; the throw
// below is a completeness backstop, not a reachable path against LOAD_TYPE_RULES' own coverage
// (assisted/bodyweight_plus_added/time_based/carry-family/bodyweight all have explicit rules, and
// anything unmatched defaults to external_weight) -- a silent default here would surface only
// later as a Postgres exercise_load_type_check violation, which this guard turns into a build-time
// failure instead.
// ---------------------------------------------------------------------------------------------
function classifyLoadType(source: SourceExercise): LoadType {
  const rule = LOAD_TYPE_RULES.find((r) => r.test(source));
  const loadType: LoadType | undefined = rule?.loadType ?? 'external_weight';
  if (!loadType) {
    throw new Error(`Exercise '${source.id}' reached the end of load-type classification unclassified.`);
  }
  return loadType;
}

// ---------------------------------------------------------------------------------------------
// Step 5: bodyweight contribution. Only consulted for bodyweight/bodyweight_plus_added/assisted;
// every non-null value here is inherently derived (free-exercise-db carries no such field at all)
// so every assignment is logged to the report's provenance section, per must_haves' first
// prohibition.
// ---------------------------------------------------------------------------------------------
function classifyBodyweightContribution(
  source: SourceExercise,
  loadType: LoadType,
  derived: DerivedFieldRecord[],
): string | null {
  if (loadType === 'external_weight' || loadType === 'time_based' || loadType === 'distance_based') {
    return BODYWEIGHT_CONTRIBUTION_DEFAULTS[loadType];
  }
  const familyRule = BODYWEIGHT_CONTRIBUTION_FAMILY_RULES.find((r) => r.match.test(source.name));
  const value = familyRule
    ? (BODYWEIGHT_CONTRIBUTION_DEFAULTS[familyRule.family] ?? BODYWEIGHT_CONTRIBUTION_DEFAULTS[loadType])
    : BODYWEIGHT_CONTRIBUTION_DEFAULTS[loadType];

  if (value !== null) {
    derived.push({
      exercise_id: source.id,
      field: 'bodyweight_contribution_pct',
      value,
      rule: familyRule
        ? `Family '${familyRule.family}' seed default (docs/catalog-load-types.md).`
        : `Load-type '${loadType}' seed default (docs/catalog-load-types.md) -- no named-family match.`,
    });
  }
  return value;
}

// ---------------------------------------------------------------------------------------------
// Step 6: near-duplicate detection/merge. See catalog-taxonomy.ts's module comment on
// normalizeNameForMergeComparison for why this requires exact structured-field equality, not name
// similarity alone.
// ---------------------------------------------------------------------------------------------
interface NormalizedCandidate {
  source: SourceExercise;
  loadType: LoadType;
  movementPattern: MovementPattern | null;
  equipment: string | null;
  mappings: CatalogSnapshotMapping[];
  bodyweightContributionPct: string | null;
}

function mergeGroupKey(source: SourceExercise): string {
  return [
    normalizeNameForMergeComparison(source.name),
    source.equipment ?? '',
    [...source.primaryMuscles].sort().join(','),
    [...source.secondaryMuscles].sort().join(','),
    source.force ?? '',
    source.mechanic ?? '',
    source.level,
  ].join('|');
}

function buildImageUrls(images: string[]): string[] {
  return images.map((relativePath) => `${SOURCE_IMAGE_BASE_URL}${relativePath}`);
}

function mergeCandidates(
  candidates: NormalizedCandidate[],
  merges: MergeRecord[],
): NormalizedCandidate[] {
  const groups = new Map<string, NormalizedCandidate[]>();
  for (const candidate of candidates) {
    const key = mergeGroupKey(candidate.source);
    const group = groups.get(key);
    if (group) group.push(candidate);
    else groups.set(key, [candidate]);
  }

  const merged: NormalizedCandidate[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      merged.push(group[0]);
      continue;
    }
    const canonical = group.reduce((richest, current) =>
      current.source.instructions.join(' ').length > richest.source.instructions.join(' ').length
        ? current
        : richest,
    );
    const others = group.filter((c) => c !== canonical);
    merges.push({
      canonical_id: `seed_${canonical.source.id}`,
      canonical_name: canonical.source.name,
      merged_names: others.map((c) => c.source.name),
      reason:
        'Name matches after stripping a trailing parenthetical qualifier, and every structured ' +
        'source field (equipment, primaryMuscles, secondaryMuscles, force, mechanic, level) is ' +
        'identical -- same underlying exercise, presented two ways in the source. The row with the ' +
        'richest instructions text is kept as canonical; the other name(s) become aliases.',
    });
    merged.push(canonical);
  }
  return merged;
}

// ---------------------------------------------------------------------------------------------
// Step 7: variation grouping (D-03). Conservative and mechanical: only links a child to a parent
// when stripping a known modifier prefix yields an EXACT match against another exercise's name
// already present in the merged output. No fuzzy matching, no guessed parents.
// ---------------------------------------------------------------------------------------------
function resolveVariationOfIds(exercises: CatalogSnapshotExercise[]): void {
  const byExactName = new Map(exercises.map((e) => [e.name.toLowerCase(), e]));
  for (const exercise of exercises) {
    for (const prefix of VARIATION_MODIFIER_PREFIXES) {
      if (!prefix.test(exercise.name)) continue;
      const strippedName = exercise.name.replace(prefix, '').trim().toLowerCase();
      const parent = byExactName.get(strippedName);
      if (parent && parent.id !== exercise.id) {
        exercise.variation_of_id = parent.id;
      }
      break;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------------------------
export function normalizeCatalog(source: SourceExercise[]): NormalizationResult {
  const exclusions: ExclusionRecord[] = [];
  const derived: DerivedFieldRecord[] = [];
  const merges: MergeRecord[] = [];
  let movementPatternNullCount = 0;

  const candidates: NormalizedCandidate[] = [];
  const excludedIds = new Set<string>();

  for (const ex of source) {
    const { mappings: rawMappings, exclusions: muscleExclusions } = mapMuscles(ex, derived);
    if (muscleExclusions.length > 0) {
      exclusions.push(...muscleExclusions);
      excludedIds.add(ex.id);
      continue;
    }

    const { equipment, excluded: equipmentExcluded } = classifyEquipment(ex, exclusions);
    if (equipmentExcluded) {
      excludedIds.add(ex.id);
      continue;
    }

    const loadType = classifyLoadType(ex);
    const movementPattern = classifyMovementPattern(ex, derived);
    if (movementPattern === null) movementPatternNullCount += 1;
    const bodyweightContributionPct = classifyBodyweightContribution(ex, loadType, derived);
    const mappings = resolveWeightFactors(ex, rawMappings, derived);

    candidates.push({
      source: ex,
      loadType,
      movementPattern,
      equipment,
      mappings,
      bodyweightContributionPct,
    });
  }

  const mergedCandidates = mergeCandidates(candidates, merges);
  const mergedDuplicateCount = candidates.length - mergedCandidates.length;

  const mergedByCanonicalId = new Map<string, NormalizedCandidate[]>();
  for (const group of groupOriginalsByCanonical(candidates, mergedCandidates)) {
    mergedByCanonicalId.set(group.canonicalId, group.members);
  }

  const exercises: CatalogSnapshotExercise[] = mergedCandidates.map((candidate) => {
    const id = `seed_${candidate.source.id}`;
    const members = mergedByCanonicalId.get(id) ?? [candidate];
    const aliases = members
      .filter((m) => m.source.id !== candidate.source.id)
      .map((m) => m.source.name);

    return {
      id,
      name: candidate.source.name,
      aliases: aliases.length > 0 ? aliases : null,
      movement_pattern: candidate.movementPattern,
      equipment_required: (candidate.equipment as CatalogSnapshotExercise['equipment_required']) ?? null,
      load_type: candidate.loadType,
      unilateral: false,
      instructions_text:
        candidate.source.instructions.length > 0 ? candidate.source.instructions.join(' ') : null,
      // No source field maps to a short-form "cue" distinct from the full instructions -- left
      // null rather than synthesizing generated commentary text (A-EXER-03's flagged assumption;
      // see this plan's SUMMARY for the resulting UI-detail-screen implication).
      cue_text: null,
      image_urls: buildImageUrls(candidate.source.images),
      bodyweight_contribution_pct: candidate.bodyweightContributionPct,
      variation_of_id: null,
      source: 'free-exercise-db',
    };
  });

  resolveVariationOfIds(exercises);

  const mappings: CatalogSnapshotMapping[] = mergedCandidates.flatMap((c) => c.mappings);

  const muscleGroups: CatalogSnapshotMuscleGroup[] = MUSCLE_GROUPS.map((id) => ({
    id,
    name: humanizeMuscleGroupName(id),
    body_region: MUSCLE_GROUP_BODY_REGION[id],
  }));

  const bodyWithoutVersion = { muscle_groups: muscleGroups, exercises, mappings };
  const catalogVersion = computeCatalogVersion(bodyWithoutVersion);

  const snapshot: CatalogSnapshot = {
    catalog_version: catalogVersion,
    generated_at: SOURCE_FETCHED_AT,
    muscle_groups: muscleGroups,
    exercises,
    mappings,
  };

  const report: NormalizationReport = {
    source_record_count: source.length,
    normalized_count: exercises.length,
    merged_duplicate_count: mergedDuplicateCount,
    excluded_count: excludedIds.size,
    movement_pattern_null_count: movementPatternNullCount,
    exclusions,
    merges,
    derived,
    catalog_version: catalogVersion,
    generated_at: SOURCE_FETCHED_AT,
  };

  return { snapshot, report };
}

function groupOriginalsByCanonical(
  all: NormalizedCandidate[],
  mergedCanonicals: NormalizedCandidate[],
): Array<{ canonicalId: string; members: NormalizedCandidate[] }> {
  const canonicalIds = new Set(mergedCanonicals.map((c) => `seed_${c.source.id}`));
  const byKey = new Map<string, NormalizedCandidate[]>();
  for (const candidate of all) {
    const key = mergeGroupKey(candidate.source);
    const group = byKey.get(key);
    if (group) group.push(candidate);
    else byKey.set(key, [candidate]);
  }
  const result: Array<{ canonicalId: string; members: NormalizedCandidate[] }> = [];
  for (const group of byKey.values()) {
    const canonical = group.find((c) => canonicalIds.has(`seed_${c.source.id}`));
    if (canonical) result.push({ canonicalId: `seed_${canonical.source.id}`, members: group });
  }
  return result;
}

function main(): void {
  const sourcePath = resolve(__dirname, 'data/free-exercise-db.source.json');
  const source = JSON.parse(readFileSync(sourcePath, 'utf-8')) as SourceExercise[];

  const { snapshot, report } = normalizeCatalog(source);

  const snapshotPath = resolve(__dirname, 'data/catalog-normalized.json');
  const reportPath = resolve(__dirname, 'data/catalog-normalization-report.json');
  writeFileSync(snapshotPath, `${canonicalStringify(snapshot)}\n`, 'utf-8');
  writeFileSync(reportPath, `${canonicalStringify(report)}\n`, 'utf-8');

  // eslint-disable-next-line no-console
  console.log(
    `Normalized ${report.normalized_count} exercises (${report.merged_duplicate_count} merged, ` +
      `${report.excluded_count} excluded) from ${report.source_record_count} source records. ` +
      `catalog_version=${report.catalog_version}`,
  );
}

if (require.main === module) {
  main();
}
