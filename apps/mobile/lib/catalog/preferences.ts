import { and, eq } from 'drizzle-orm';
import { generateClientId } from '../db/id';
import { type WriteDb } from '../db/powersync';
import { userExercisePreference } from '../db/schema';

// The default shape for an exercise with no preference row yet — never null/undefined, so every
// caller (this module's own setters, catalog-filter.ts, the detail screen) can read `.archivedAt`
// and `.neverSuggest` unconditionally.
export interface ExercisePreference {
  archivedAt: string | null;
  neverSuggest: boolean;
}

const DEFAULT_PREFERENCE: ExercisePreference = { archivedAt: null, neverSuggest: false };

interface PreferenceRow {
  id: string;
  archivedAt: string | null;
  neverSuggest: boolean;
}

async function findPreferenceRow(
  db: WriteDb,
  userId: string,
  exerciseId: string,
): Promise<PreferenceRow | undefined> {
  const [row] = await db
    .select({
      id: userExercisePreference.id,
      archivedAt: userExercisePreference.archivedAt,
      neverSuggest: userExercisePreference.neverSuggest,
    })
    .from(userExercisePreference)
    .where(and(eq(userExercisePreference.userId, userId), eq(userExercisePreference.exerciseId, exerciseId)));
  return row;
}

export async function readPreference(db: WriteDb, userId: string, exerciseId: string): Promise<ExercisePreference> {
  const row = await findPreferenceRow(db, userId, exerciseId);
  if (!row) return { ...DEFAULT_PREFERENCE };
  return { archivedAt: row.archivedAt, neverSuggest: row.neverSuggest };
}

// The actual write, shared by every setter below. Takes the already-resolved existing row (or
// undefined) rather than re-querying, so a caller that already needed the existing row for its own
// branch (setArchived's no-op check) does not pay for a second lookup. Read-then-write rather than
// a blind insert, because the local table has an `id` primary key while the uniqueness that
// matters is the (user_id, exercise_id) pair — a blind insert would create a second row locally
// that the server's unique constraint then rejects. Stamps updated_at on every write.
async function writePreference(
  db: WriteDb,
  userId: string,
  exerciseId: string,
  existing: PreferenceRow | undefined,
  patch: Partial<Pick<PreferenceRow, 'archivedAt' | 'neverSuggest'>>,
): Promise<void> {
  const updatedAt = new Date().toISOString();

  if (existing) {
    await db
      .update(userExercisePreference)
      .set({ ...patch, updatedAt })
      .where(eq(userExercisePreference.id, existing.id));
    return;
  }

  await db.insert(userExercisePreference).values({
    id: generateClientId(),
    userId,
    exerciseId,
    archivedAt: patch.archivedAt ?? null,
    neverSuggest: patch.neverSuggest ?? false,
    updatedAt,
  });
}

// The shared upsert entry point for a setter that does not need its own separate existing-row
// branch (setNeverSuggest) — reads, then delegates to writePreference.
async function upsertPreference(
  db: WriteDb,
  userId: string,
  exerciseId: string,
  patch: Partial<Pick<PreferenceRow, 'archivedAt' | 'neverSuggest'>>,
): Promise<void> {
  const existing = await findPreferenceRow(db, userId, exerciseId);
  await writePreference(db, userId, exerciseId, existing, patch);
}

// Archive and never-suggest are independent fields — this setter writes only archivedAt, never
// neverSuggest, so "never-suggest without archiving" (EXER-07) stays expressible. Never writes to
// `exercise.archivedAt` or `seededExercise.archivedAt`: for a seeded row that column is shared
// state, and writing it would archive the exercise for every user (T-03-14). One archive code path
// for every exercise, seeded or custom, lives here and only here.
export async function setArchived(db: WriteDb, userId: string, exerciseId: string, archived: boolean): Promise<void> {
  const existing = await findPreferenceRow(db, userId, exerciseId);

  if (archived) {
    // Already-archived is a real no-op branch, not an incidental consequence: re-stamping would
    // move the recorded archive time away from when the user actually archived it and produce a
    // pointless sync op.
    if (existing?.archivedAt != null) return;
    await writePreference(db, userId, exerciseId, existing, { archivedAt: new Date().toISOString() });
    return;
  }

  // Never archived — nothing to clear, and no row worth creating just to record "not archived",
  // which is already the default for a row that does not exist.
  if (!existing) return;
  await writePreference(db, userId, exerciseId, existing, { archivedAt: null });
}

export async function setNeverSuggest(
  db: WriteDb,
  userId: string,
  exerciseId: string,
  neverSuggest: boolean,
): Promise<void> {
  await upsertPreference(db, userId, exerciseId, { neverSuggest });
}

export interface DetailActionVisibility {
  showEdit: boolean;
  showDuplicate: boolean;
  archiveLabel: 'Archive' | 'Unarchive';
}

// The detail screen's control-visibility predicate, extracted here (rather than inlined in the
// hook-bearing screen component) so it stays unit-testable without a renderer. `exerciseOwnerId`
// is null for every seeded exercise (seededExercise carries no owner column at all) and the
// current user's own id for a custom row the screen loaded from `exercise` — PowerSync's sync
// rules only ever deliver a user's own rows there, so a non-null, non-matching owner id is not a
// reachable case in production, but the equality check is written explicitly rather than assumed.
// Duplicate is offered regardless of ownership (a user may want a second copy of their own
// exercise too); Edit is offered only when owned — a seeded exercise never renders Edit.
export function resolveDetailActions(
  currentUserId: string | null,
  exerciseOwnerId: string | null,
  archivedAt: string | null,
): DetailActionVisibility {
  const owned = exerciseOwnerId !== null && exerciseOwnerId === currentUserId;
  return {
    showEdit: owned,
    showDuplicate: true,
    archiveLabel: archivedAt !== null ? 'Unarchive' : 'Archive',
  };
}
