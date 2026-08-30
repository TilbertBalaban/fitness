import { and, eq } from 'drizzle-orm';
import { generateClientId } from './id';
import { type WriteDb } from './powersync';
import { loadExerciseNameMap } from './programs/load-program';
import { excludedExercise } from './schema';

// Nothing in this module writes `exercise` or `seededExercise`. For a seeded row those are shared
// columns: writing one would exclude the exercise for every user, the same trap preferences.ts
// documents for archiving. An exclusion is per-user state and lives only in excluded_exercise.

// Shown for a row whose exercise id resolves to no seeded or custom name, so a synced exclusion is
// still removable rather than silently dropped from the list.
export const UNKNOWN_EXCLUDED_EXERCISE_NAME = 'Unavailable exercise';

export interface ExcludedExerciseRow {
  id: string;
  exerciseId: string;
  createdAt: string;
}

export interface ExcludedExerciseSummary {
  exerciseId: string;
  name: string;
}

async function findExclusionRow(
  db: WriteDb,
  userId: string,
  exerciseId: string,
): Promise<ExcludedExerciseRow | undefined> {
  const [row] = await db
    .select({
      id: excludedExercise.id,
      exerciseId: excludedExercise.exerciseId,
      createdAt: excludedExercise.createdAt,
    })
    .from(excludedExercise)
    .where(and(eq(excludedExercise.userId, userId), eq(excludedExercise.exerciseId, exerciseId)));
  return row;
}

// Sorted in JavaScript rather than left in query order so the array is totally ordered and two
// calls over the same local database agree — the generator's input must not vary by row order.
export async function loadExcludedExerciseIds(db: WriteDb, userId: string): Promise<string[]> {
  const rows = await db
    .select({ exerciseId: excludedExercise.exerciseId })
    .from(excludedExercise)
    .where(eq(excludedExercise.userId, userId));

  return rows.map((row) => row.exerciseId).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export async function loadExcludedExercises(db: WriteDb, userId: string): Promise<ExcludedExerciseSummary[]> {
  const exerciseIds = await loadExcludedExerciseIds(db, userId);
  if (exerciseIds.length === 0) return [];

  const names = await loadExerciseNameMap(db);
  return exerciseIds.map((exerciseId) => ({
    exerciseId,
    name: names.get(exerciseId) ?? UNKNOWN_EXCLUDED_EXERCISE_NAME,
  }));
}

export async function isExcluded(db: WriteDb, userId: string, exerciseId: string): Promise<boolean> {
  return (await findExclusionRow(db, userId, exerciseId)) !== undefined;
}

// Read-then-insert rather than a blind insert: the local table has an `id` primary key while the
// uniqueness that matters is the (user_id, exercise_id) pair, so a blind insert would create a
// second local row the server's unique constraint then rejects. An existing row is a no-op —
// re-stamping would move createdAt away from when the user actually excluded it and emit a
// pointless sync op.
export async function addExclusion(db: WriteDb, userId: string, exerciseId: string): Promise<void> {
  if (await findExclusionRow(db, userId, exerciseId)) return;

  await db.insert(excludedExercise).values({
    id: generateClientId(),
    userId,
    exerciseId,
    createdAt: new Date().toISOString(),
  });
}

// A hard delete, matching 11-02's server-side decision to keep excluded_exercise out of
// HARD_DELETE_FORBIDDEN. A client-side soft archive would produce a row the server has no column
// for.
export async function removeExclusion(db: WriteDb, userId: string, exerciseId: string): Promise<void> {
  const existing = await findExclusionRow(db, userId, exerciseId);
  if (!existing) return;

  await db.delete(excludedExercise).where(eq(excludedExercise.id, existing.id));
}
