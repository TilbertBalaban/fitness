import {
  loadExerciseDetail,
  sortMuscleTargets,
  type RawMuscleTarget,
} from '../exercise-detail';
import { exercise, seededExercise } from '../../db/schema';

// A raw joined row exactly as queryDetailRows' select+leftJoin+leftJoin+where would return it —
// one row per (exercise, mapping, muscle_group) combination, or a single all-null-mapping row for
// an exercise with no mappings at all (LEFT JOIN semantics).
interface FakeRow {
  id: string;
  name: string;
  aliases: string | null;
  movementPattern: string | null;
  equipmentRequired: string | null;
  loadType: string;
  unilateral: boolean;
  instructionsText: string | null;
  cueText: string | null;
  imageUrls: string | null;
  muscleGroupId: string | null;
  muscleGroupName: string | null;
  muscleGroupBodyRegion: string | null;
  role: string | null;
  weightFactor: string | null;
}

// Mirrors queryDetailRows' exact call chain (select -> from -> leftJoin -> leftJoin -> where) so
// loadExerciseDetail's union-of-two-tables and row-shaping logic is unit-testable without a real
// database — the fake pre-supplies already-"joined" rows per table rather than evaluating a real
// join condition, since every call site builds the identical join shape.
function fakeDb(rowsByTable: Map<unknown, FakeRow[]>) {
  return {
    select: () => ({
      from: (table: unknown) => ({
        leftJoin: () => ({
          leftJoin: () => ({
            where: () => Promise.resolve(rowsByTable.get(table) ?? []),
          }),
        }),
      }),
    }),
  } as unknown as Parameters<typeof loadExerciseDetail>[0];
}

const BASE_FIELDS = {
  id: 'ex-1',
  name: 'Bench Press',
  aliases: null,
  movementPattern: 'horizontal_push',
  equipmentRequired: 'barbell',
  loadType: 'external_weight',
  unilateral: false,
  instructionsText: null,
  cueText: null,
  imageUrls: null,
};

function mappingRow(overrides: Partial<FakeRow>): FakeRow {
  return { ...BASE_FIELDS, muscleGroupId: null, muscleGroupName: null, muscleGroupBodyRegion: null, role: null, weightFactor: null, ...overrides };
}

describe('sortMuscleTargets', () => {
  const chest: RawMuscleTarget = { muscleGroupId: 'chest', name: 'Chest', bodyRegion: 'chest', weightFactor: '0.30', role: 'secondary' };
  const triceps: RawMuscleTarget = { muscleGroupId: 'triceps', name: 'Triceps', bodyRegion: 'arms', weightFactor: '1.00', role: 'primary' };
  const shoulders: RawMuscleTarget = { muscleGroupId: 'front_delts', name: 'Front Delts', bodyRegion: 'shoulders', weightFactor: '0.90', role: 'secondary' };

  it('orders primary before secondary, then weight_factor descending, then muscle group name ascending', () => {
    const sorted = sortMuscleTargets([chest, triceps, shoulders]);
    expect(sorted.map((target) => target.muscleGroupId)).toEqual(['triceps', 'front_delts', 'chest']);
  });

  it('compares weight_factor numerically, not lexically — 0.30 sorts below 1.00 and 0.90 sorts above 0.10', () => {
    const low: RawMuscleTarget = { muscleGroupId: 'a', name: 'A', bodyRegion: 'core', weightFactor: '0.10', role: 'secondary' };
    const mid: RawMuscleTarget = { muscleGroupId: 'b', name: 'B', bodyRegion: 'core', weightFactor: '0.30', role: 'secondary' };
    const high: RawMuscleTarget = { muscleGroupId: 'c', name: 'C', bodyRegion: 'core', weightFactor: '0.90', role: 'secondary' };
    const top: RawMuscleTarget = { muscleGroupId: 'd', name: 'D', bodyRegion: 'core', weightFactor: '1.00', role: 'secondary' };

    const sorted = sortMuscleTargets([mid, low, top, high]);
    expect(sorted.map((target) => target.muscleGroupId)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('breaks a tied role+weight_factor pair by muscle group name ascending', () => {
    const b: RawMuscleTarget = { muscleGroupId: 'b', name: 'Biceps', bodyRegion: 'arms', weightFactor: '0.50', role: 'secondary' };
    const a: RawMuscleTarget = { muscleGroupId: 'a', name: 'Abs', bodyRegion: 'core', weightFactor: '0.50', role: 'secondary' };

    const sorted = sortMuscleTargets([b, a]);
    expect(sorted.map((target) => target.name)).toEqual(['Abs', 'Biceps']);
  });
});

describe('loadExerciseDetail', () => {
  it('returns an exercise with three mappings ordered primary first, then weight_factor descending, then name ascending', async () => {
    const rows: FakeRow[] = [
      mappingRow({ muscleGroupId: 'chest', muscleGroupName: 'Chest', muscleGroupBodyRegion: 'chest', role: 'secondary', weightFactor: '0.30' }),
      mappingRow({ muscleGroupId: 'triceps', muscleGroupName: 'Triceps', muscleGroupBodyRegion: 'arms', role: 'primary', weightFactor: '1.00' }),
      mappingRow({ muscleGroupId: 'front_delts', muscleGroupName: 'Front Delts', muscleGroupBodyRegion: 'shoulders', role: 'secondary', weightFactor: '0.90' }),
    ];
    const db = fakeDb(new Map<unknown, FakeRow[]>([[seededExercise, rows]]));

    const detail = await loadExerciseDetail(db, 'ex-1');

    expect(detail?.primaryMuscles.map((m) => m.muscleGroupId)).toEqual(['triceps']);
    expect(detail?.secondaryMuscles.map((m) => m.muscleGroupId)).toEqual(['front_delts', 'chest']);
  });

  it('returns an empty secondary list, not undefined, when an exercise has no secondary mappings', async () => {
    const rows: FakeRow[] = [
      mappingRow({ muscleGroupId: 'triceps', muscleGroupName: 'Triceps', muscleGroupBodyRegion: 'arms', role: 'primary', weightFactor: '1.00' }),
    ];
    const db = fakeDb(new Map<unknown, FakeRow[]>([[seededExercise, rows]]));

    const detail = await loadExerciseDetail(db, 'ex-1');

    expect(detail?.secondaryMuscles).toEqual([]);
  });

  it('returns empty primary and secondary lists and does not throw for an exercise with no mappings at all', async () => {
    const rows: FakeRow[] = [mappingRow({})];
    const db = fakeDb(new Map<unknown, FakeRow[]>([[seededExercise, rows]]));

    const detail = await loadExerciseDetail(db, 'ex-1');

    expect(detail?.primaryMuscles).toEqual([]);
    expect(detail?.secondaryMuscles).toEqual([]);
  });

  it('returns null rather than throwing for an unknown exercise id', async () => {
    const db = fakeDb(new Map<unknown, FakeRow[]>([[seededExercise, []], [exercise, []]]));

    const detail = await loadExerciseDetail(db, 'nonexistent');

    expect(detail).toBeNull();
  });

  it('normalizes absent cue_text, instructions_text and aliases to null/[] rather than the string "undefined"', async () => {
    const rows: FakeRow[] = [mappingRow({ cueText: null, instructionsText: null, aliases: null })];
    const db = fakeDb(new Map<unknown, FakeRow[]>([[seededExercise, rows]]));

    const detail = await loadExerciseDetail(db, 'ex-1');

    expect(detail?.cueText).toBeNull();
    expect(detail?.instructionsText).toBeNull();
    expect(detail?.aliases).toEqual([]);
  });

  it('returns an empty array, not a stray value, when image_urls is stored as an empty-array string', async () => {
    const rows: FakeRow[] = [mappingRow({ imageUrls: '[]' })];
    const db = fakeDb(new Map<unknown, FakeRow[]>([[seededExercise, rows]]));

    const detail = await loadExerciseDetail(db, 'ex-1');

    expect(detail?.imageUrls).toEqual([]);
  });

  it('falls back to the custom exercise table when the seeded table has no matching row', async () => {
    const rows: FakeRow[] = [mappingRow({ id: 'custom-1', name: 'My Custom Move' })];
    const db = fakeDb(new Map<unknown, FakeRow[]>([[seededExercise, []], [exercise, rows]]));

    const detail = await loadExerciseDetail(db, 'custom-1');

    expect(detail?.name).toBe('My Custom Move');
  });
});
