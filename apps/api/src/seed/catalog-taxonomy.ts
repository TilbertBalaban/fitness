// The reviewable record of every free-exercise-db -> canonical-taxonomy judgment call this phase
// makes. Nothing in this file executes a normalization pass -- normalize-catalog.ts reads these
// tables and mechanically applies them, so every decision here is data a reviewer can read without
// tracing script control flow. Literal values (muscle groups, movement patterns, equipment types,
// load types) must stay in lockstep with packages/api-contracts/src/catalog.ts's tuples; nothing
// here invents a taxonomy member packages/api-contracts doesn't already declare.

import type {
  EquipmentType,
  LoadType,
  MovementPattern,
  MuscleGroupId,
  MuscleRole,
} from '@fitness/api-contracts';

// ---------------------------------------------------------------------------------------------
// Muscle vocabulary: free-exercise-db's 17 flat values -> the 19-member canonical MUSCLE_GROUPS.
// 'shoulders' is the one genuinely lossy mapping (the source has one shoulder bucket, the
// canonical taxonomy has three delt heads) -- it maps to the AMBIGUOUS_DELT sentinel instead of a
// canonical id, and is resolved through SHOULDER_DISAMBIGUATION_RULES below, never silently
// bucketed into a single delt head by this table alone.
// ---------------------------------------------------------------------------------------------
export const AMBIGUOUS_DELT = 'AMBIGUOUS_DELT' as const;

export const SOURCE_MUSCLE_TO_CANONICAL: Record<string, MuscleGroupId | typeof AMBIGUOUS_DELT> = {
  abdominals: 'abs',
  abductors: 'abductors',
  adductors: 'adductors',
  biceps: 'biceps',
  calves: 'calves',
  chest: 'chest',
  forearms: 'forearms',
  glutes: 'glutes',
  hamstrings: 'hamstrings',
  lats: 'lats',
  'lower back': 'lower_back',
  'middle back': 'upper_back_traps',
  neck: 'neck',
  quadriceps: 'quads',
  shoulders: AMBIGUOUS_DELT,
  traps: 'upper_back_traps',
  triceps: 'triceps',
};

export interface ShoulderDisambiguationRule {
  match: RegExp;
  primary: MuscleGroupId;
  secondary: MuscleGroupId[];
  why: string;
  // True only for the catch-all fallback -- the specific-name rules above it are a confident read
  // of the exercise name, not a guess, so only the fallback needs the derived-data provenance flag
  // must_haves' first prohibition requires for anything the heuristic invented rather than sourced.
  derived?: boolean;
}

// Ordered, first match wins -- resolves the AMBIGUOUS_DELT sentinel from the exercise's own name.
export const SHOULDER_DISAMBIGUATION_RULES: ShoulderDisambiguationRule[] = [
  {
    match: /lateral raise|side raise|upright row/i,
    primary: 'side_delts',
    secondary: [],
    why: 'Lateral/side raises and upright rows target the medial (side) deltoid head as the prime mover.',
  },
  {
    match: /reverse fly|reverse flye|rear delt|face pull|reverse pec deck|bent[- ]over.*raise/i,
    primary: 'rear_delts',
    secondary: [],
    why: 'Reverse flyes, rear-delt rows, face pulls and bent-over raises target the posterior deltoid head as the prime mover.',
  },
  {
    match: /front raise/i,
    primary: 'front_delts',
    secondary: ['side_delts'],
    why: 'Front raises isolate the anterior deltoid; the side head assists as a secondary mover through the same plane of motion.',
  },
  {
    match: /overhead press|shoulder press|military press|push press|arnold press/i,
    primary: 'front_delts',
    secondary: ['side_delts'],
    why: 'Overhead-pressing movements are anterior-deltoid-dominant with meaningful side-delt assistance through the pressing arc.',
  },
  {
    match: /.*/,
    primary: 'front_delts',
    secondary: ['side_delts', 'rear_delts'],
    why: 'No delt-region-specific name match -- front delts assumed as the most commonly worked head in an unclassified shoulder exercise, with both other heads assisting at reduced weight. This is a guess, not sourced data.',
    derived: true,
  },
];

// ---------------------------------------------------------------------------------------------
// Equipment vocabulary: all 12 non-null free-exercise-db equipment values -> the 12-member
// canonical EQUIPMENT_TYPES. A source record with `equipment: null` (77 of 873 records, mostly
// stretches/bodyweight mobility work) is NOT an unmapped value needing an exclusion -- it is
// legitimately absent equipment data, and equipment_required is itself a nullable column
// (packages/api-contracts/src/catalog.ts's CatalogSnapshotExercise). normalize-catalog.ts passes
// a null source equipment straight through as a null canonical value, never coercing it to
// 'other' and never excluding the exercise over it.
// ---------------------------------------------------------------------------------------------
export const SOURCE_EQUIPMENT_TO_CANONICAL: Record<string, EquipmentType> = {
  'body only': 'bodyweight',
  machine: 'machine',
  other: 'other',
  'foam roll': 'foam_roller',
  barbell: 'barbell',
  kettlebells: 'kettlebell',
  dumbbell: 'dumbbell',
  cable: 'cable',
  'medicine ball': 'medicine_ball',
  bands: 'band',
  'exercise ball': 'exercise_ball',
  'e-z curl bar': 'ez_bar',
};

// ---------------------------------------------------------------------------------------------
// Movement pattern: ordered, first match wins, evaluated against the exercise's own name.
// An exercise matching no rule below -- and whose source `mechanic` is not `'isolation'` -- gets
// `null`, a legal column value, rather than being forced into a bucket that doesn't fit
// (plyometric/strongman/olympic-lift-derivative movements make up most of this deliberately
// uncovered remainder; forcing them into one of the nine patterns would misrepresent them more
// than leaving them null).
// ---------------------------------------------------------------------------------------------
export interface MovementPatternRule {
  match: RegExp;
  pattern: MovementPattern;
  why: string;
}

export const MOVEMENT_PATTERN_RULES: MovementPatternRule[] = [
  {
    match: /upright row/i,
    pattern: 'vertical_pull',
    why: "Upright row drives the elbows vertically -- closer to a vertical pull than the horizontal-row family despite the word 'row' in its name.",
  },
  {
    match: /squat|leg press|lunge|split squat|step[- ]?up/i,
    pattern: 'squat',
    why: 'Knee-and-hip-dominant vertical movements sharing the squat pattern.',
  },
  {
    match: /deadlift|good morning|hip thrust|romanian|\brdl\b|glute bridge|hip raise|back extension|hyperextension|glute ham raise/i,
    pattern: 'hinge',
    why: 'Hip-hinge-dominant posterior-chain movements.',
  },
  {
    match: /clean|snatch|\bjerk\b/i,
    pattern: 'hinge',
    why: 'Olympic-lift derivatives are explosive hip-hinge extensions -- the closest of the nine patterns to their actual dominant joint action, not a perfect fit but truer than leaving avoidable coverage out.',
  },
  {
    match: /floor press|board press|chain press|close[- ]grip bench|incline press|decline press|bench press|chest press|push-up|pushup|\bdips?\b|chest push/i,
    pattern: 'horizontal_push',
    why: 'Supine/prone or dip-plane pressing movements sharing the horizontal-push pattern.',
  },
  {
    match: /overhead press|shoulder press|military press|push press|arnold press|bradford|\bpress\b/i,
    pattern: 'vertical_push',
    why: "Standing/seated overhead-oriented pressing not already matched by a bench/floor/board/close-grip name -- the generic word 'press' defaults to this pattern once the horizontal-push name variants above have already been matched.",
  },
  {
    match: /pull-up|pullup|chin-up|chinup|pulldown|pullover|chins\b/i,
    pattern: 'vertical_pull',
    why: 'Overhead-to-torso pulling movements sharing the vertical-pull pattern.',
  },
  {
    match: /row|face pull/i,
    pattern: 'horizontal_pull',
    why: 'Torso-plane pulling movements sharing the horizontal-pull pattern.',
  },
  {
    match: /farmer|carry|suitcase carry|drag/i,
    pattern: 'carry',
    why: 'Loaded-locomotion movements sharing the carry pattern.',
  },
  {
    match: /twist|woodchop|wood chop|rotation|russian twist|judo flip/i,
    pattern: 'rotation',
    why: 'Transverse-plane rotational movements.',
  },
  {
    match: /rollout|ab wheel|sit-up|situp|crunch|leg raise|knee raise|dead bug/i,
    pattern: 'isolation',
    why: "Core-isolation movements the source dataset's own `mechanic` field does not consistently tag `isolation`, so they are matched by name to avoid an avoidable null.",
  },
];

// ---------------------------------------------------------------------------------------------
// Load type: ordered predicate rules, first match wins. Every exercise reaching the end of this
// list with no match falls to the `external_weight` default in normalize-catalog.ts -- `load_type`
// is `notNull` and CHECK-constrained, so unlike movement_pattern there is no legal "uncovered"
// outcome; every exercise must resolve to exactly one of the six LOAD_TYPES.
// ---------------------------------------------------------------------------------------------
export interface SourceExerciseLike {
  name: string;
  equipment: string | null;
}

export interface LoadTypeRule {
  loadType: LoadType;
  why: string;
  test: (ex: SourceExerciseLike) => boolean;
}

export const LOAD_TYPE_RULES: LoadTypeRule[] = [
  {
    loadType: 'assisted',
    why: 'Name signals a machine or band subtracting from bodyweight (an assisted pull-up/dip stack).',
    test: (ex) => /assist/i.test(ex.name),
  },
  {
    loadType: 'bodyweight_plus_added',
    why: "Name signals an added external load layered on top of an otherwise-bodyweight movement (weighted pull-up/dip/squat/sit-up), excluding 'weighted ball' where the ball itself is the whole external load rather than an addition to a bodyweight movement.",
    test: (ex) => /weighted(?!\s+ball)/i.test(ex.name),
  },
  {
    loadType: 'time_based',
    why: 'Progression is tracked by duration held/performed, not reps (plank/isometric hold/wall sit).',
    test: (ex) => /plank|isometric|wall sit|\bhold\b/i.test(ex.name),
  },
  {
    loadType: 'external_weight',
    why: "The CONTEXT.md farmer's-carry case, resolved deliberately rather than by omission: for a loaded carry, the load -- not the distance -- is the axis that drives progression math, so it is external_weight with distance/time captured in cue text, never a second discriminator column.",
    test: (ex) => /farmer|carry|suitcase carry|sled/i.test(ex.name),
  },
  {
    loadType: 'bodyweight',
    why: "Source equipment is 'body only' with no assistance/added-load/hold signal above -- the lifter's own bodyweight is the entire resistance.",
    test: (ex) => ex.equipment === 'body only',
  },
];
// No explicit "everything else" rule object in the array above: normalize-catalog.ts applies
// external_weight as the default when no rule matches, matching the plan's own "everything else ->
// external_weight" instruction. Keeping the catch-all out of this reviewable list (rather than as
// a `test: () => true` entry that would always win if misordered) keeps the exhaustiveness explicit
// in the calling code instead of hidden inside a rule object.

// ---------------------------------------------------------------------------------------------
// Weight factor: per-exercise-family overrides, keyed by a family id. Families are matched against
// the exercise name via WEIGHT_FACTOR_FAMILY_RULES (ordered, first match wins, most specific
// first); the matched family's entries are then looked up by muscle_group_id against the mapping
// normalize-catalog.ts already derived from the source's own primaryMuscles/secondaryMuscles for
// that exercise. A muscle_group_id present on the exercise but absent from the matched family's
// entries -- or an exercise matching no family at all -- falls back to the role default (primary
// 1.00, secondary 0.50) and is flagged `derived: true` in the report, exactly as
// PITFALLS.md Pitfall 3 and D-04 require: weight_factor is real per-exercise-family data, not a
// binary 1.00/0.50 constant applied uniformly.
// ---------------------------------------------------------------------------------------------
export interface WeightFactorFamilyRule {
  family: string;
  match: RegExp;
}

export const WEIGHT_FACTOR_FAMILY_RULES: WeightFactorFamilyRule[] = [
  { family: 'stiff_leg_deadlift', match: /stiff[- ]leg deadlift|romanian deadlift|\brdl\b/i },
  { family: 'lunge_split_squat', match: /lunge|split squat/i },
  { family: 'hip_thrust', match: /hip thrust/i },
  { family: 'upright_row', match: /upright row/i },
  { family: 'deadlift', match: /deadlift/i },
  { family: 'squat', match: /squat/i },
  { family: 'bench_press', match: /bench press/i },
  { family: 'row', match: /row/i },
  {
    family: 'overhead_press',
    match: /overhead press|shoulder press|military press|push press|arnold press/i,
  },
  { family: 'pull_up_chin_up', match: /pull-up|pullup|chin-up|chinup|pulldown/i },
];

export interface WeightFactorOverrideEntry {
  muscle_group_id: MuscleGroupId;
  role: MuscleRole;
  // Decimal-as-exact-string, two decimal places, fitting numeric(4,2) without rounding -- same
  // convention CatalogSnapshotMapping.weight_factor documents.
  weight_factor: string;
}

export const WEIGHT_FACTOR_OVERRIDES: Record<string, WeightFactorOverrideEntry[]> = {
  // The ARCHITECTURE.md canonical example D-04 was written to require: primary hamstrings,
  // secondary glutes at half, secondary lower back at less again -- never a flat 1.00/0.50 split.
  stiff_leg_deadlift: [
    { muscle_group_id: 'hamstrings', role: 'primary', weight_factor: '1.00' },
    { muscle_group_id: 'glutes', role: 'secondary', weight_factor: '0.50' },
    { muscle_group_id: 'lower_back', role: 'secondary', weight_factor: '0.30' },
  ],
  lunge_split_squat: [
    { muscle_group_id: 'quads', role: 'primary', weight_factor: '0.90' },
    { muscle_group_id: 'glutes', role: 'primary', weight_factor: '0.75' },
    { muscle_group_id: 'hamstrings', role: 'secondary', weight_factor: '0.35' },
  ],
  hip_thrust: [
    { muscle_group_id: 'glutes', role: 'primary', weight_factor: '1.00' },
    { muscle_group_id: 'hamstrings', role: 'secondary', weight_factor: '0.40' },
    { muscle_group_id: 'lower_back', role: 'secondary', weight_factor: '0.20' },
  ],
  upright_row: [
    { muscle_group_id: 'side_delts', role: 'primary', weight_factor: '1.00' },
    { muscle_group_id: 'upper_back_traps', role: 'secondary', weight_factor: '0.40' },
    { muscle_group_id: 'biceps', role: 'secondary', weight_factor: '0.30' },
  ],
  // Conventional/sumo/other non-stiff-leg deadlift variants: a genuinely fuller-body pull than the
  // stiff-leg family above, with real quad and grip involvement a flat split would erase.
  deadlift: [
    { muscle_group_id: 'hamstrings', role: 'primary', weight_factor: '0.85' },
    { muscle_group_id: 'glutes', role: 'primary', weight_factor: '0.90' },
    { muscle_group_id: 'lower_back', role: 'secondary', weight_factor: '0.45' },
    { muscle_group_id: 'quads', role: 'secondary', weight_factor: '0.35' },
    { muscle_group_id: 'upper_back_traps', role: 'secondary', weight_factor: '0.30' },
    { muscle_group_id: 'forearms', role: 'secondary', weight_factor: '0.25' },
  ],
  squat: [
    { muscle_group_id: 'quads', role: 'primary', weight_factor: '1.00' },
    { muscle_group_id: 'glutes', role: 'primary', weight_factor: '0.70' },
    { muscle_group_id: 'hamstrings', role: 'secondary', weight_factor: '0.35' },
    { muscle_group_id: 'lower_back', role: 'secondary', weight_factor: '0.25' },
    { muscle_group_id: 'abs', role: 'secondary', weight_factor: '0.20' },
  ],
  bench_press: [
    { muscle_group_id: 'chest', role: 'primary', weight_factor: '1.00' },
    { muscle_group_id: 'front_delts', role: 'secondary', weight_factor: '0.55' },
    { muscle_group_id: 'triceps', role: 'secondary', weight_factor: '0.50' },
  ],
  row: [
    { muscle_group_id: 'lats', role: 'primary', weight_factor: '0.90' },
    { muscle_group_id: 'upper_back_traps', role: 'primary', weight_factor: '0.70' },
    { muscle_group_id: 'rear_delts', role: 'secondary', weight_factor: '0.45' },
    { muscle_group_id: 'biceps', role: 'secondary', weight_factor: '0.35' },
  ],
  overhead_press: [
    { muscle_group_id: 'front_delts', role: 'primary', weight_factor: '1.00' },
    { muscle_group_id: 'side_delts', role: 'primary', weight_factor: '0.60' },
    { muscle_group_id: 'triceps', role: 'secondary', weight_factor: '0.45' },
    { muscle_group_id: 'upper_back_traps', role: 'secondary', weight_factor: '0.25' },
  ],
  pull_up_chin_up: [
    { muscle_group_id: 'lats', role: 'primary', weight_factor: '1.00' },
    { muscle_group_id: 'biceps', role: 'secondary', weight_factor: '0.55' },
    { muscle_group_id: 'upper_back_traps', role: 'secondary', weight_factor: '0.35' },
    { muscle_group_id: 'rear_delts', role: 'secondary', weight_factor: '0.25' },
  ],
};

// ---------------------------------------------------------------------------------------------
// Bodyweight contribution: per-load-type defaults plus named-family overrides, matching
// docs/catalog-load-types.md's own "Per-family seed defaults" table exactly. Keys are either a
// LOAD_TYPES member (the load-type-level default) or a named family id (checked first, before the
// load-type default, and only ever applied to a bodyweight/bodyweight_plus_added/assisted-loaded
// exercise -- an external_weight/time_based/distance_based row always gets null regardless of
// whether its name happens to match a family regex below).
//
// external_weight/time_based/distance_based map to `null`, not a decimal string -- the concept
// does not apply to those load types (docs/catalog-load-types.md's own table). This is a
// deliberate, sourced exception, not an oversight in the value shape.
// ---------------------------------------------------------------------------------------------
export const BODYWEIGHT_CONTRIBUTION_DEFAULTS: Record<string, string | null> = {
  external_weight: null,
  time_based: null,
  distance_based: null,
  bodyweight: '1.000',
  bodyweight_plus_added: '1.000',
  assisted: '0.950',
  pull_up_chin_up: '1.000',
  dip: '0.950',
  push_up: '0.640',
  inverted_row: '0.600',
  split_squat_lunge: '0.850',
  bodyweight_squat: '0.650',
};

export interface BodyweightContributionFamilyRule {
  family: string;
  match: RegExp;
}

// Ordered, first match wins. Only consulted for an exercise whose load_type is bodyweight,
// bodyweight_plus_added or assisted -- see the module comment above.
export const BODYWEIGHT_CONTRIBUTION_FAMILY_RULES: BodyweightContributionFamilyRule[] = [
  { family: 'pull_up_chin_up', match: /pull-up|pullup|chin-up|chinup|pulldown/i },
  { family: 'dip', match: /\bdips?\b/i },
  { family: 'push_up', match: /push-up|pushup/i },
  { family: 'inverted_row', match: /inverted row/i },
  { family: 'split_squat_lunge', match: /lunge|split squat/i },
  // Broad /squat/i is safe here only because this table is gated on load_type already being
  // bodyweight/bodyweight_plus_added/assisted -- a barbell/dumbbell squat never reaches this rule
  // since its load_type is external_weight, resolved and gated well before this lookup runs.
  { family: 'bodyweight_squat', match: /squat/i },
];

// ---------------------------------------------------------------------------------------------
// Near-duplicate merge: names that differ only in a trailing parenthetical qualifier AND whose
// entire structured metadata (equipment, primaryMuscles, secondaryMuscles, force, mechanic, level)
// is identical are treated as the same underlying exercise presented two ways -- e.g. "Band Good
// Morning" vs "Band Good Morning (Pull Through)", which the source dataset itself classifies
// identically on every field but instructions. A name match alone is NOT sufficient (see
// PITFALLS.md Pitfall 5's warning against 1:1-import granularity loss): "Barbell Squat" and
// "Bodyweight Squat" share a name after equipment-word stripping but are genuinely different
// exercises (different equipment, different load_type) and must never merge -- which is exactly
// why this normalization does not strip leading equipment words from the comparison key at all,
// only a single trailing parenthetical, and additionally requires every structured field to match.
// ---------------------------------------------------------------------------------------------
export function normalizeNameForMergeComparison(name: string): string {
  let n = name.toLowerCase();
  n = n.replace(/\s*\([^)]*\)\s*$/, ''); // strip ONLY a trailing parenthetical qualifier
  n = n.replace(/[^a-z0-9\s]/g, ' ');
  n = n.replace(/\s+/g, ' ').trim();
  if (n.endsWith('s') && !n.endsWith('ss') && n.length > 3) n = n.slice(0, -1);
  return n;
}

// ---------------------------------------------------------------------------------------------
// Variation grouping (D-03: a variation is a full Exercise row, never a separate table). A child
// exercise's variation_of_id is set to a parent's id only when stripping a known modifier prefix
// from the child's name yields an EXACT match against another exercise's name already present in
// the source -- a mechanical, conservative rule that never guesses a parent that doesn't exist.
// Where no such parent exists, variation_of_id stays null, which is the documented, legal default.
// ---------------------------------------------------------------------------------------------
export const VARIATION_MODIFIER_PREFIXES: RegExp[] = [
  /^incline\s+/i,
  /^decline\s+/i,
  /^close[- ]grip\s+/i,
  /^wide[- ]grip\s+/i,
  /^seated\s+/i,
  /^standing\s+/i,
  /^single[- ]leg\s+/i,
  /^single[- ]arm\s+/i,
  /^one[- ]arm\s+/i,
  /^alternating\s+/i,
];
