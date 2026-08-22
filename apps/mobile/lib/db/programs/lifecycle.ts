import type { RoutineStatus } from '@fitness/api-contracts';
import { eq } from 'drizzle-orm';
import { getPowerSync, type WriteDb } from '../powersync';
import { routine, userPreference } from '../schema';

// Typed against the shared vocabulary rather than written as a bare string: if 'ready' ever leaves
// ROUTINE_STATUSES, this annotation fails the typecheck instead of shipping a status the server's
// CHECK constraint rejects.
const READY_STATUS: RoutineStatus = 'ready';

const DEFAULT_WEIGHT_UNIT = 'kg';

export async function loadActiveRoutineId(userId: string, db: WriteDb = getPowerSync()): Promise<string | null> {
  const [row] = await db
    .select({ activeRoutineId: userPreference.activeRoutineId })
    .from(userPreference)
    .where(eq(userPreference.id, userId));

  return row?.activeRoutineId ?? null;
}

export async function loadProgressionFrozen(routineId: string, db: WriteDb = getPowerSync()): Promise<boolean> {
  const [row] = await db
    .select({ progressionFrozen: routine.progressionFrozen })
    .from(routine)
    .where(eq(routine.id, routineId));

  return row?.progressionFrozen ?? false;
}

export interface ActivateRoutineInput {
  userId: string;
  routineId: string;
}

// A single nullable column on a single row is what makes "exactly one active program" structurally
// true (D-14) — activating a second program overwrites this column rather than adding a row, so two
// actives cannot be represented at all. The row's id IS the user id (04-04's option-a wire
// contract): the server resolves ownership from the id with no database read, so a client-generated
// uuid here would produce a row the server can never match.
export async function activateRoutine(
  { userId, routineId }: ActivateRoutineInput,
  db: WriteDb = getPowerSync(),
): Promise<void> {
  const [existing] = await db
    .select({ id: userPreference.id })
    .from(userPreference)
    .where(eq(userPreference.id, userId));

  if (existing) {
    await db.update(userPreference).set({ activeRoutineId: routineId }).where(eq(userPreference.id, userId));
    return;
  }

  await db.insert(userPreference).values({
    id: userId,
    userId,
    weightUnit: DEFAULT_WEIGHT_UNIT,
    defaultEquipmentProfileId: null,
    activeRoutineId: routineId,
  });
}

export async function clearActiveRoutine(userId: string, db: WriteDb = getPowerSync()): Promise<void> {
  await db.update(userPreference).set({ activeRoutineId: null }).where(eq(userPreference.id, userId));
}

// Exactly one column. Freeze is orthogonal to both status and the active pointer (D-16): a program
// that is active AND frozen must stay representable, and writing status or archived_at alongside
// this would collapse three independent facts into one.
export async function setProgressionFrozen(
  routineId: string,
  frozen: boolean,
  db: WriteDb = getPowerSync(),
): Promise<void> {
  await db.update(routine).set({ progressionFrozen: frozen }).where(eq(routine.id, routineId));
}

export interface ArchiveRoutineInput {
  userId: string;
  routineId: string;
}

// A timestamp, never a delete (D-05): workout_session.routine_day_id points into this program's days
// with no foreign key, so a destroyed routine orphans history that cannot be reconstructed. The
// server's own HARD_DELETE_FORBIDDEN rejects a routine delete independently.
//
// The conditional pointer clear is what keeps "archived AND active" unrepresentable — the two rows
// would otherwise be free to disagree.
export async function archiveRoutine(
  { userId, routineId }: ArchiveRoutineInput,
  db: WriteDb = getPowerSync(),
): Promise<void> {
  await db.update(routine).set({ archivedAt: new Date().toISOString() }).where(eq(routine.id, routineId));

  const [preference] = await db
    .select({ activeRoutineId: userPreference.activeRoutineId })
    .from(userPreference)
    .where(eq(userPreference.id, userId));

  if (preference?.activeRoutineId === routineId) {
    await clearActiveRoutine(userId, db);
  }
}

// Restoring returns a program to the library; it never activates it. Activation is a separate,
// explicit act (PROG-08), so a restore cannot silently displace whatever the user is currently
// running.
export async function restoreRoutine(routineId: string, db: WriteDb = getPowerSync()): Promise<void> {
  await db.update(routine).set({ archivedAt: null }).where(eq(routine.id, routineId));
}

// The "I have finished authoring this" transition (D-15). Nothing gates on it: a draft that is never
// marked ready is still a real, synced, fully usable program.
export async function markRoutineReady(routineId: string, db: WriteDb = getPowerSync()): Promise<void> {
  await db.update(routine).set({ status: READY_STATUS }).where(eq(routine.id, routineId));
}

export async function renameRoutine(routineId: string, name: string, db: WriteDb = getPowerSync()): Promise<void> {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error('Program name is required');
  }

  await db.update(routine).set({ name: trimmed }).where(eq(routine.id, routineId));
}

export interface LibraryRoutineRow {
  id: string;
  name: string;
  status: string;
  goal: string | null;
  archivedAt: string | null;
  progressionFrozen: boolean;
}

// Deliberately not loadRoutines (create-routine.ts), which filters archived rows out at the SQL
// level: the library is the only surface from which an archived program can be restored, so a
// partial read here would make PROG-07's restore unreachable. Sorted in JavaScript by name then id
// for the same reason loadRoutines is — the order must be total even when two programs share a name.
export async function loadLibraryRoutines(db: WriteDb = getPowerSync()): Promise<LibraryRoutineRow[]> {
  const rows = await db
    .select({
      id: routine.id,
      name: routine.name,
      status: routine.status,
      goal: routine.goal,
      archivedAt: routine.archivedAt,
      progressionFrozen: routine.progressionFrozen,
    })
    .from(routine);

  return rows.slice().sort((a, b) => {
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    if (a.id === b.id) return 0;
    return a.id < b.id ? -1 : 1;
  });
}
