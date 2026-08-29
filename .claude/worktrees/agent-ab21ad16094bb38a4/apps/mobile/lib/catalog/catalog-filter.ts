import { EQUIPMENT_TYPES, MOVEMENT_PATTERNS, MUSCLE_GROUPS } from '@fitness/api-contracts';
import type { SearchableExercise } from './search-index';

// The minimum shape applyCatalogFilters/deriveFacets need. Callers pass their own richer
// exercise type (whatever the screen also needs for rendering) — this module only ever reads
// these three fields off it, plus `id`/`name`/`aliases` inherited from SearchableExercise.
export interface CatalogExercise extends SearchableExercise {
  movementPattern: string | null;
  equipmentRequired: string | null;
}

export interface CatalogMuscleMapping {
  exerciseId: string;
  muscleGroupId: string;
}

// Mirrors apps/mobile/lib/db/schema.ts's userExercisePreference row shape: archivedAt here is
// the same nullable timestamp as that table's archived_at column — non-null means archived for
// that userId, and this module never reads any other per-user preference state.
export interface CatalogPreference {
  userId: string;
  exerciseId: string;
  archivedAt: string | null;
}

// AND across dimensions, OR within a dimension (stated so it is not inferred). An empty array
// for a dimension means that dimension is inactive — the same result as selecting every one of
// its values, which is why the test suite asserts both directions rather than only one.
export interface CatalogFilters {
  muscleGroupIds: string[];
  equipment: string[];
  movementPatterns: string[];
}

export interface FacetValues {
  muscleGroupIds: string[];
  equipment: string[];
  movementPatterns: string[];
}

function buildMuscleGroupsByExercise(mappings: CatalogMuscleMapping[]): Map<string, Set<string>> {
  const byExercise = new Map<string, Set<string>>();
  for (const mapping of mappings) {
    const existing = byExercise.get(mapping.exerciseId);
    if (existing) {
      existing.add(mapping.muscleGroupId);
    } else {
      byExercise.set(mapping.exerciseId, new Set([mapping.muscleGroupId]));
    }
  }
  return byExercise;
}

// Exported (03-10) so smart-swap.ts's exclusion set reuses this exact predicate rather than a
// second implementation — PITFALLS.md §11's "one archive code path" rule applies across modules,
// not just within this file.
export function buildArchivedSet(preferences: CatalogPreference[], userId: string | null): Set<string> {
  if (userId === null) return new Set();
  const archived = new Set<string>();
  for (const preference of preferences) {
    if (preference.userId === userId && preference.archivedAt !== null) {
      archived.add(preference.exerciseId);
    }
  }
  return archived;
}

// Archive exclusion is part of the filter, not a caller responsibility — one code path for
// every exercise regardless of origin, seeded or custom (PITFALLS.md §11: archive-logic bugs
// are a top corruption risk, and two code paths is how they arrive). `userId` is taken
// explicitly and matched per-row, so one user's archive state can never suppress a row for
// another user (threat T-03-27).
export function applyCatalogFilters<T extends CatalogExercise>(
  exercises: T[],
  mappings: CatalogMuscleMapping[],
  preferences: CatalogPreference[],
  filters: CatalogFilters,
  userId: string | null,
): T[] {
  const archived = buildArchivedSet(preferences, userId);
  const muscleGroupsByExercise = buildMuscleGroupsByExercise(mappings);

  const muscleFilterActive = filters.muscleGroupIds.length > 0;
  const equipmentFilterActive = filters.equipment.length > 0;
  const movementFilterActive = filters.movementPatterns.length > 0;

  return exercises.filter((exercise) => {
    if (archived.has(exercise.id)) return false;

    if (muscleFilterActive) {
      const groups = muscleGroupsByExercise.get(exercise.id);
      const matches = groups ? filters.muscleGroupIds.some((id) => groups.has(id)) : false;
      if (!matches) return false;
    }

    if (equipmentFilterActive) {
      if (exercise.equipmentRequired === null) return false;
      if (!filters.equipment.includes(exercise.equipmentRequired)) return false;
    }

    if (movementFilterActive) {
      // A null movement_pattern is excluded whenever the movement-pattern facet is active — it
      // is still reachable by name search, since search and filter are independent code paths.
      if (exercise.movementPattern === null) return false;
      if (!filters.movementPatterns.includes(exercise.movementPattern)) return false;
    }

    return true;
  });
}

// The minimum shape sortCatalogResults needs — deliberately narrower than ScoredExercise so a
// caller can sort any scored, named, identified list without also carrying `aliases`.
export interface SortableCatalogResult {
  id: string;
  name: string;
  score: number;
}

// The stable total order: relevance score descending, then name ascending over a locale-aware
// comparator, then id ascending. The id tie-break is what makes this order *total* rather than
// merely deterministic-in-practice — two equal-scoring, identically-named rows (or a re-render
// over shuffled input) can never swap places.
export function sortCatalogResults<T extends SortableCatalogResult>(scored: T[]): T[] {
  return [...scored].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const nameCompare = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    if (nameCompare !== 0) return nameCompare;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });
}

// Per-dimension distinct values actually present in the catalog, in the contract package's
// canonical declared order (stable chip order across renders) rather than alphabetical, and
// omitting a dimension whose value set is empty — deriveFacets returns an empty array for that
// dimension, and FilterChipRow renders nothing at all when it receives one.
export function deriveFacets(exercises: CatalogExercise[], mappings: CatalogMuscleMapping[]): FacetValues {
  const presentMuscleGroups = new Set<string>();
  const exerciseIds = new Set(exercises.map((exercise) => exercise.id));
  for (const mapping of mappings) {
    if (exerciseIds.has(mapping.exerciseId)) presentMuscleGroups.add(mapping.muscleGroupId);
  }

  const presentEquipment = new Set<string>();
  const presentMovementPatterns = new Set<string>();
  for (const exercise of exercises) {
    if (exercise.equipmentRequired !== null) presentEquipment.add(exercise.equipmentRequired);
    if (exercise.movementPattern !== null) presentMovementPatterns.add(exercise.movementPattern);
  }

  return {
    muscleGroupIds: MUSCLE_GROUPS.filter((id) => presentMuscleGroups.has(id)),
    equipment: EQUIPMENT_TYPES.filter((id) => presentEquipment.has(id)),
    movementPatterns: MOVEMENT_PATTERNS.filter((id) => presentMovementPatterns.has(id)),
  };
}

// --- Screen-presentational helpers ---------------------------------------------------------
// The exercises list screen (apps/mobile/app/exercises/index.tsx) has no component-render test
// available in this codebase (@testing-library/react-native is not installed) — per Task 3's own
// action, its pure presentational decisions (pluralization, the +N collapse threshold, facet-row
// visibility, which of loading/error/empty/populated state to show, and snake_case facet-id
// display formatting) are extracted here as small exported functions instead, so <behavior>'s
// screen-state assertions stay unit-testable without a rendered tree.

// "{n} exercise" / "{n} exercises" — the exact Copywriting Contract pluralization. n=0 is the
// caller's job to route to the empty state instead of calling this at all.
export function formatResultCount(count: number): string {
  return `${count} exercise${count === 1 ? '' : 's'}`;
}

// The Clear Filters action is visible whenever any dimension carries a selection.
export function hasActiveFilters(filters: CatalogFilters): boolean {
  return filters.muscleGroupIds.length > 0 || filters.equipment.length > 0 || filters.movementPatterns.length > 0;
}

export interface CollapsedTags {
  visible: string[];
  overflowCount: number;
}

// The +N collapse threshold: renders at most `maxVisible` tag chips before folding the remainder
// into a single "+N" chip, so a long tag list can never grow past its allotted row height into a
// third wrapped line.
export function collapseTags(tags: string[], maxVisible: number): CollapsedTags {
  if (tags.length <= maxVisible) return { visible: tags, overflowCount: 0 };
  return { visible: tags.slice(0, maxVisible), overflowCount: tags.length - maxVisible };
}

export type ExerciseListScreenState = 'loading' | 'error' | 'empty' | 'populated';

export interface ExerciseListScreenStateInput {
  failed: boolean;
  rows: unknown[] | null;
  resultCount: number;
}

// Which of the four screen states (UI-SPEC E1) to render — a local-catalog load failure always
// wins, then "still loading" (rows not read yet), then the search/filter result count.
export function deriveExerciseListScreenState({ failed, rows, resultCount }: ExerciseListScreenStateInput): ExerciseListScreenState {
  if (failed) return 'error';
  if (rows === null) return 'loading';
  if (resultCount === 0) return 'empty';
  return 'populated';
}

// snake_case facet id -> a readable chip label ("horizontal_push" -> "Horizontal Push"). Muscle
// groups carry a real display name from the seeded muscle_group table instead and never go
// through this — it exists only for the equipment and movement-pattern facets, whose ids are the
// only readable form available.
export function formatFacetLabel(id: string): string {
  return id
    .split('_')
    .filter((part) => part.length > 0)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}
