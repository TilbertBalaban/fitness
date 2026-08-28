import { eq } from 'drizzle-orm';
import type { SetType } from '@fitness/api-contracts';
import { logSet } from './log-set';
import { getPowerSync, type WriteDb, type WriteTx } from './powersync';
import { loggedSet } from './schema';

// D-09's confirm ("Change Set Type?", naming the count) must always precede this call —
// clearSubEntries is the phase's only place logged training data is deleted with no tombstone
// and no undo. Runs as a single transaction so an interruption between the select and the delete
// can never leave a group half-deleted. It never touches the parent row itself — only rows whose
// parentSetId equals the argument.
export async function clearSubEntries(parentSetId: string, db: WriteDb = getPowerSync()): Promise<number> {
  return db.transaction(async (tx: WriteTx) => {
    const children = await tx.select({ id: loggedSet.id }).from(loggedSet).where(eq(loggedSet.parentSetId, parentSetId));
    if (children.length === 0) return 0;

    await tx.delete(loggedSet).where(eq(loggedSet.parentSetId, parentSetId));
    return children.length;
  });
}

// The UI-SPEC's per-child remove glyph: deliberately un-confirmed, unlike clearSubEntries above,
// because removing one mistaken mini-set is a low-cost, obviously-corrective action rather than
// group-level data loss. Refuses to delete a row whose own parentSetId is null — a mistaken call
// with a parent row's id can never silently orphan that parent's children.
export async function removeSubEntry(setId: string, db: WriteDb = getPowerSync()): Promise<boolean> {
  const [row] = await db.select({ parentSetId: loggedSet.parentSetId }).from(loggedSet).where(eq(loggedSet.id, setId));
  if (!row || row.parentSetId === null) return false;

  await db.delete(loggedSet).where(eq(loggedSet.id, setId));
  return true;
}

export interface AddSubEntryInput {
  sessionExerciseId: string;
  parentSetId: string;
  setType: SetType;
  side?: string | null;
}

// The D-08 "+ Add {type}" control's write. Re-reads the parent row's own session_exercise_id and
// refuses when it differs from the caller's — the client-side half of T-7-01/T-7-03's cross-
// exercise grouping defence — before delegating the actual insert to logSet, the only place a
// logged_set row is ever created (never a second, duplicated insert path). Weight starts null
// (canonical kg, CF-05 — a mutation never converts) and reps 0, completed false: the blank-slot
// shape isBlankSubEntry recognises, and set_index is assigned by logSet's own existing
// select-max-then-insert transaction, never re-derived here.
export async function addSubEntry(
  { sessionExerciseId, parentSetId, setType, side }: AddSubEntryInput,
  db: WriteDb = getPowerSync(),
): Promise<string> {
  const [parent] = await db
    .select({ sessionExerciseId: loggedSet.sessionExerciseId })
    .from(loggedSet)
    .where(eq(loggedSet.id, parentSetId));
  if (!parent || parent.sessionExerciseId !== sessionExerciseId) {
    throw new Error('addSubEntry: parent row belongs to a different session_exercise');
  }

  return logSet(
    {
      sessionExerciseId,
      setType,
      parentSetId,
      side: side ?? null,
      weight: { value: null, unit: 'kg' },
      reps: 0,
      completed: false,
    },
    db,
  );
}
