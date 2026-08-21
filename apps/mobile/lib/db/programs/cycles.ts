import { CYCLE_KINDS, EMPTY_TARGET, isEmptyOverride, resolveTarget, type CycleKind, type TargetOverride } from '@fitness/api-contracts';
import { and, eq } from 'drizzle-orm';
import { generateClientId } from '../id';
import { getPowerSync, type WriteDb } from '../powersync';
import { routineCycle, routineExerciseCycleTarget } from '../schema';
import { computeReorder } from './days';
import { appendOrderIndex } from './order-index';
import { validateTargets, type TargetDraft } from './targets';

export interface CycleDraft {
  name: string;
  kind: CycleKind;
  durationDays?: number | null;
}

export type CycleValidationError = 'name-required' | 'unknown-kind' | 'duration-required' | 'duration-too-small';

// A training or deload cycle's duration stays null: its length is the number of days in the
// routine's rotation, not a stored number. Only time off — a stretch of calendar with no rotation
// running at all — has a length of its own, which is why duration_days exists and why it is
// required exactly there.
export function validateCycle({ name, kind, durationDays }: CycleDraft): CycleValidationError | null {
  if (name.trim().length === 0) return 'name-required';
  if (!(CYCLE_KINDS as readonly string[]).includes(kind)) return 'unknown-kind';

  const duration = durationDays ?? null;
  if (kind === 'time_off' && duration === null) return 'duration-required';
  if (duration !== null && duration < 1) return 'duration-too-small';

  return null;
}

export interface AddCycleInput extends CycleDraft {
  routineId: string;
}

export async function addCycle(
  { routineId, name, kind, durationDays }: AddCycleInput,
  db: WriteDb = getPowerSync(),
): Promise<string> {
  const error = validateCycle({ name, kind, durationDays });
  if (error) throw new Error(error);

  const existingRows = await db
    .select({ orderIndex: routineCycle.orderIndex })
    .from(routineCycle)
    .where(eq(routineCycle.routineId, routineId));

  const id = generateClientId();
  await db.insert(routineCycle).values({
    id,
    routineId,
    orderIndex: appendOrderIndex(existingRows.map((row) => row.orderIndex)),
    name: name.trim(),
    kind,
    durationDays: durationDays ?? null,
  });

  return id;
}

export async function renameCycle(cycleId: string, name: string, db: WriteDb = getPowerSync()): Promise<void> {
  if (name.trim().length === 0) throw new Error('name-required' satisfies CycleValidationError);

  await db.update(routineCycle).set({ name: name.trim() }).where(eq(routineCycle.id, cycleId));
}

async function readCycle(cycleId: string, db: WriteDb) {
  const [row] = await db
    .select({ id: routineCycle.id, kind: routineCycle.kind, durationDays: routineCycle.durationDays })
    .from(routineCycle)
    .where(eq(routineCycle.id, cycleId));
  return row ?? null;
}

// Reads the row's current duration before writing: without that read a cycle could become
// durationless time off through a kind change that skipped the duration check addCycle enforces.
export async function setCycleKind(cycleId: string, kind: CycleKind, db: WriteDb = getPowerSync()): Promise<void> {
  if (!(CYCLE_KINDS as readonly string[]).includes(kind)) throw new Error('unknown-kind' satisfies CycleValidationError);

  const row = await readCycle(cycleId, db);
  if (kind === 'time_off' && (row?.durationDays ?? null) === null) {
    throw new Error('duration-required' satisfies CycleValidationError);
  }

  await db.update(routineCycle).set({ kind }).where(eq(routineCycle.id, cycleId));
}

export async function setCycleDuration(
  cycleId: string,
  durationDays: number | null,
  db: WriteDb = getPowerSync(),
): Promise<void> {
  if (durationDays !== null && durationDays < 1) throw new Error('duration-too-small' satisfies CycleValidationError);

  const row = await readCycle(cycleId, db);
  if (durationDays === null && row?.kind === 'time_off') {
    throw new Error('duration-required' satisfies CycleValidationError);
  }

  await db.update(routineCycle).set({ durationDays }).where(eq(routineCycle.id, cycleId));
}

export interface MoveCycleInput {
  routineId: string;
  cycleId: string;
  beforeId: string | null;
  afterId: string | null;
}

export async function moveCycle(
  { routineId, cycleId, beforeId, afterId }: MoveCycleInput,
  db: WriteDb = getPowerSync(),
): Promise<void> {
  const siblings = await db
    .select({ id: routineCycle.id, orderIndex: routineCycle.orderIndex })
    .from(routineCycle)
    .where(eq(routineCycle.routineId, routineId));

  const updates = computeReorder(siblings, cycleId, beforeId, afterId);
  for (const update of updates) {
    await db.update(routineCycle).set({ orderIndex: update.orderIndex }).where(eq(routineCycle.id, update.id));
  }
}

// The override children cascade at the database level on both sides (04-07), and the server emits
// their tombstones — deleting them here would emit redundant crud ops for rows the cascade already
// removes.
export async function removeCycle(cycleId: string, db: WriteDb = getPowerSync()): Promise<void> {
  await db.delete(routineCycle).where(eq(routineCycle.id, cycleId));
}

export interface CycleTargetKey {
  routineExerciseId: string;
  cycleId: string;
}

export interface SetCycleTargetInput extends CycleTargetKey {
  override: TargetOverride;
}

function normalizeOverride(override: TargetOverride): TargetDraft {
  return resolveTarget(EMPTY_TARGET, override);
}

async function readOverrideId({ routineExerciseId, cycleId }: CycleTargetKey, db: WriteDb): Promise<string | null> {
  const [row] = await db
    .select({ id: routineExerciseCycleTarget.id })
    .from(routineExerciseCycleTarget)
    .where(
      and(
        eq(routineExerciseCycleTarget.routineExerciseId, routineExerciseId),
        eq(routineExerciseCycleTarget.cycleId, cycleId),
      ),
    );
  return row?.id ?? null;
}

// The function the override table's sparseness depends on. An override that overrides nothing is
// deleted rather than written: without that branch a program with six cycles accumulates one row
// per exercise per cycle, which is the per-week duplication the architecture rejects (D-02/D-10).
// An existing pair is always updated, never inserted alongside — the server's unique
// (routine_exercise_id, cycle_id) constraint would reject the whole aggregate.
export async function setCycleTarget(
  { routineExerciseId, cycleId, override }: SetCycleTargetInput,
  db: WriteDb = getPowerSync(),
): Promise<void> {
  const draft = normalizeOverride(override);
  const errors = validateTargets(draft);
  if (Object.keys(errors).length > 0) {
    const [field, code] = Object.entries(errors)[0];
    throw new Error(`${field}: ${code}`);
  }

  const existingId = await readOverrideId({ routineExerciseId, cycleId }, db);

  if (isEmptyOverride(override)) {
    if (existingId) {
      await db.delete(routineExerciseCycleTarget).where(eq(routineExerciseCycleTarget.id, existingId));
    }
    return;
  }

  if (existingId) {
    await db
      .update(routineExerciseCycleTarget)
      .set(draft)
      .where(eq(routineExerciseCycleTarget.id, existingId));
    return;
  }

  await db.insert(routineExerciseCycleTarget).values({
    id: generateClientId(),
    routineExerciseId,
    cycleId,
    ...draft,
  });
}

export async function clearCycleTarget(
  { routineExerciseId, cycleId }: CycleTargetKey,
  db: WriteDb = getPowerSync(),
): Promise<void> {
  await db
    .delete(routineExerciseCycleTarget)
    .where(
      and(
        eq(routineExerciseCycleTarget.routineExerciseId, routineExerciseId),
        eq(routineExerciseCycleTarget.cycleId, cycleId),
      ),
    );
}
