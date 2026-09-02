#!/usr/bin/env node
// Derives packages/program-generator/src/__fixtures__/catalog-2day-regression.ts from the real
// seeded catalog (apps/api/src/seed/data/catalog-normalized.json) for the D-11 regression suite.
// The fixture is a committed file, not a build step, so the package's tests never depend on
// apps/api at run time. Run via `node scripts/derive-generator-regression-fixture.cjs` and commit
// the result; the output is a pure function of the snapshot, so two runs diff clean.

const { existsSync, readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');

const repoRoot = resolve(__dirname, '..');
const SOURCE_PATH = 'apps/api/src/seed/data/catalog-normalized.json';
const OUTPUT_PATH = 'packages/program-generator/src/__fixtures__/catalog-2day-regression.ts';
const SCRIPT_INVOCATION = 'node scripts/derive-generator-regression-fixture.cjs';

// The union of the two `full_body_2` day patterns in packages/program-generator/src/split-templates.ts,
// in first-appearance order.
const TARGET_MUSCLE_GROUPS = [
  'chest',
  'lats',
  'quads',
  'front_delts',
  'biceps',
  'abs',
  'hamstrings',
  'glutes',
  'side_delts',
  'triceps',
];

// Six per group: chest and lats each take two slots on each of the two days and D-06 wants four
// distinct candidates for each, while quads, hamstrings and glutes each reach four slots in one
// day at the hardest cycle before the session fit trims — six covers every case with margin.
const EXERCISES_PER_GROUP = 6;

// The keys of MUSCLE_GROUP_VOLUME_CLASS in packages/program-generator/src/volume-landmarks.ts —
// the `MuscleGroupId` vocabulary the emitted module must typecheck against.
const MUSCLE_GROUP_IDS = new Set([
  'chest',
  'lats',
  'upper_back_traps',
  'quads',
  'hamstrings',
  'glutes',
  'front_delts',
  'side_delts',
  'rear_delts',
  'biceps',
  'triceps',
  'abs',
  'adductors',
  'calves',
  'lower_back',
  'forearms',
  'obliques',
  'abductors',
  'neck',
]);

class CatalogSnapshotError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CatalogSnapshotError';
  }
}

function loadSnapshot() {
  const sourcePath = resolve(repoRoot, SOURCE_PATH);
  if (!existsSync(sourcePath)) {
    throw new CatalogSnapshotError(`Catalog snapshot not found at ${SOURCE_PATH}`);
  }
  const snapshot = JSON.parse(readFileSync(sourcePath, 'utf-8'));
  if (!Array.isArray(snapshot.exercises) || snapshot.exercises.length === 0) {
    throw new CatalogSnapshotError(`${SOURCE_PATH} has no exercises`);
  }
  if (!Array.isArray(snapshot.mappings) || snapshot.mappings.length === 0) {
    throw new CatalogSnapshotError(`${SOURCE_PATH} has no mappings`);
  }
  return snapshot;
}

function compareStrings(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function selectExerciseIds(mappings) {
  const primaryIdsByGroup = new Map();
  for (const mapping of mappings) {
    if (mapping.role !== 'primary') continue;
    const ids = primaryIdsByGroup.get(mapping.muscle_group_id) ?? new Set();
    ids.add(mapping.exercise_id);
    primaryIdsByGroup.set(mapping.muscle_group_id, ids);
  }

  const selected = new Set();
  for (const muscleGroupId of TARGET_MUSCLE_GROUPS) {
    const candidates = [...(primaryIdsByGroup.get(muscleGroupId) ?? [])].sort(compareStrings);
    let taken = 0;
    for (const id of candidates) {
      if (taken >= EXERCISES_PER_GROUP) break;
      if (selected.has(id)) continue;
      selected.add(id);
      taken += 1;
    }
  }
  return selected;
}

function buildCatalog(snapshot) {
  const selected = selectExerciseIds(snapshot.mappings);

  const exercises = snapshot.exercises
    .filter((exercise) => selected.has(exercise.id))
    .map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      equipmentRequired: exercise.equipment_required,
      movementPattern: exercise.movement_pattern,
    }))
    .sort((a, b) => compareStrings(a.id, b.id));

  const mappings = snapshot.mappings
    .filter((mapping) => selected.has(mapping.exercise_id) && MUSCLE_GROUP_IDS.has(mapping.muscle_group_id))
    .map((mapping) => ({
      exerciseId: mapping.exercise_id,
      muscleGroupId: mapping.muscle_group_id,
      role: mapping.role,
      weightFactor: mapping.weight_factor,
    }))
    .sort(
      (a, b) =>
        compareStrings(a.exerciseId, b.exerciseId) ||
        compareStrings(a.muscleGroupId, b.muscleGroupId) ||
        compareStrings(a.role, b.role),
    );

  return { exercises, mappings };
}

function renderModule(catalog) {
  const header = [
    '// GENERATED FILE — do not hand-edit.',
    `// Produced by scripts/derive-generator-regression-fixture.cjs (run: \`${SCRIPT_INVOCATION}\`)`,
    `// from ${SOURCE_PATH}.`,
    '//',
    '// D-11: the real seeded catalog, trimmed to the muscle groups the 2-day full-body template',
    `// names (${EXERCISES_PER_GROUP} primary-mapped exercises per group, plus every mapping those`,
    '// exercises carry). Committed so the regression suite never depends on apps/api at run time;',
    '// regenerate with the script above whenever the snapshot changes.',
    '',
    "import type { GenerationCatalog } from '../result';",
    '',
    '',
  ].join('\n');

  return `${header}export const CATALOG_2DAY_REGRESSION: GenerationCatalog = ${JSON.stringify(catalog, null, 2)};\n`;
}

const catalog = buildCatalog(loadSnapshot());
writeFileSync(resolve(repoRoot, OUTPUT_PATH), renderModule(catalog));
console.log(
  `Wrote ${OUTPUT_PATH} (${catalog.exercises.length} exercises, ${catalog.mappings.length} mappings from ${SOURCE_PATH}).`,
);
