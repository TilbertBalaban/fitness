import { CYCLE_KINDS, EMPTY_TARGET, isEmptyOverride, resolveTarget, type CycleKind, type TargetOverride } from '@fitness/api-contracts';
import { and, eq } from 'drizzle-orm';
import { generateClientId } from '../id';
import { getPowerSync, type WriteDb } from '../powersync';
import { routineCycle, routineExercise, routineExerciseCycleTarget } from '../schema';
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
  // Number.isInteger before the comparison: a form field parsed with Number('') is 0 but
  // Number('abc') is NaN, and every comparison against NaN is false, so a bare `< 1` would let a
  // non-numeric duration through to the row.
  if (duration !== null && (!Number.isInteger(duration) || duration < 1)) return 'duration-too-small';

  return null;
}

// The codes above are internal; these are the strings a user reads. Kept beside the union so a new
// code cannot be added without the switch failing to typecheck.
export function cycleErrorMessage(error: CycleValidationError): string {
  switch (error) {
    case 'name-required':
      return 'Cycle name is required.';
    case 'unknown-kind':
      return 'Choose Training, Deload or Time off.';
    case 'duration-required':
      return 'Time off needs a length in days.';
    case 'duration-too-small':
      return 'Days off must be a whole number of at least 1.';
  }
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

// The edit path's single write, and the reason a durationless time-off cycle is unrepresentable
// from either door: name, kind and duration are one draft validated by the same validateCycle rule
// addCycle enforces, then written as one update. Splitting it into a kind write and a duration
// write is what let the Edit Cycle form produce `kind = 'time_off'` with `duration_days = null` —
// a cycle resolveNextUp can only step over.
//
// One update also means one crud op: there is no intermediate row for a sync to observe, so the
// invariant survives a push that lands between the two halves of the edit. It does NOT survive two
// devices editing the same cycle concurrently — routine_cycle reconciles by row-level LWW like
// every other row — which is why resolveNextUp keeps its defensive skip.
export async function updateCycle(
  cycleId: string,
  { name, kind, durationDays }: CycleDraft,
  db: WriteDb = getPowerSync(),
): Promise<void> {
  const error = validateCycle({ name, kind, durationDays });
  if (error) throw new Error(error);

  await db
    .update(routineCycle)
    .set({ name: name.trim(), kind, durationDays: durationDays ?? null })
    .where(eq(routineCycle.id, cycleId));
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

// What is stored: the sparse override with every un-named field explicitly null. Deliberately not
// the value that gets validated — writing the resolved merge here would turn every override into a
// five-column copy of the base and destroy the table's sparseness.
function normalizeOverride(override: TargetOverride): TargetDraft {
  return resolveTarget(EMPTY_TARGET, override);
}

async function readBaseTarget(routineExerciseId: string, db: WriteDb): Promise<TargetDraft | null> {
  const [row] = await db
    .select({
      targetSets: routineExercise.targetSets,
      targetRepMin: routineExercise.targetRepMin,
      targetRepMax: routineExercise.targetRepMax,
      targetRir: routineExercise.targetRir,
      targetRestSeconds: routineExercise.targetRestSeconds,
    })
    .from(routineExercise)
    .where(eq(routineExercise.id, routineExerciseId));
  return row ?? null;
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

  // Validated against the base it will be merged with, not against EMPTY_TARGET. An override
  // naming only one half of the rep range has one null half, and validateTargets' ordering rule
  // needs both — so validating the sparse override alone never range-checks it at all, and the
  // slot row would render an inverted range the user never typed.
  const base = await readBaseTarget(routineExerciseId, db);
  const errors = validateTargets(resolveTarget(base ?? EMPTY_TARGET, override));
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
