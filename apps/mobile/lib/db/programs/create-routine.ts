import { isNull } from 'drizzle-orm';
import { generateClientId } from '../id';
import { getPowerSync, type WriteDb } from '../powersync';
import { routine } from '../schema';

export interface CreateRoutineInput {
  name: string;
  goal?: string | null;
  createdFromTemplateId?: string | null;
}

// status: 'draft' from the first keystroke is the draft-persistence decision this phase makes: a
// half-built program is a real synced row that survives an app kill and reaches the other device,
// not in-memory state committed at the end. The name is trimmed once, here, at the write boundary
// — never re-trimmed on read. A trimmed-empty name throws rather than silently skipping the write,
// matching the server's own invalid_field rejection (hasInvalidField in sync.service.ts) so the
// client never produces an op the server would reject anyway.
export async function createRoutine(input: CreateRoutineInput, db: WriteDb = getPowerSync()): Promise<string> {
  const name = input.name.trim();
  if (name.length === 0) {
    throw new Error('Program name is required');
  }

  const id = generateClientId();

  await db.insert(routine).values({
    id,
    name,
    goal: input.goal ?? null,
    status: 'draft',
    progressionFrozen: false,
    source: 'user',
    createdFromTemplateId: input.createdFromTemplateId ?? null,
    archivedAt: null,
  });

  return id;
}

export interface RoutineSummary {
  id: string;
  name: string;
  status: string;
  goal: string | null;
}

// One select, no per-row follow-up: the builder's tree loader in 04-02 extends this file's
// one-query-per-table rule, and PITFALLS.md §13 names program -> days -> exercises as the
// textbook N+1. Sorted in JavaScript by name then id so the order is total and stable even when
// two programs share a name.
export async function loadRoutines(db: WriteDb = getPowerSync()): Promise<RoutineSummary[]> {
  const rows = await db
    .select({ id: routine.id, name: routine.name, status: routine.status, goal: routine.goal })
    .from(routine)
    .where(isNull(routine.archivedAt));

  return rows.slice().sort((a, b) => {
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    if (a.id === b.id) return 0;
    return a.id < b.id ? -1 : 1;
  });
}
