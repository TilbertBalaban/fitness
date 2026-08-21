import { eq } from 'drizzle-orm';
import { getPowerSync, type WriteDb } from '../powersync';
import { routineExercise } from '../schema';

// Answers the "what does a blank target mean" question CONTEXT.md left to discretion: null means
// deliberately unprescribed, never zero, and the builder always allows it. Nothing downstream may
// substitute a default for a null target — a null reaching log-set.ts is snapshotted as null, and
// a null reaching the progression engine means "the user did not prescribe this dimension".
export interface TargetDraft {
  targetSets: number | null;
  targetRepMin: number | null;
  targetRepMax: number | null;
  targetRir: number | null;
  targetRestSeconds: number | null;
}

export type TargetFieldError = 'whole-number' | 'negative' | 'not-a-number' | 'min-above-max' | 'below-minimum';

export type ParsedTargetField = { value: number | null } | { error: TargetFieldError };

// Trim, then: empty is unprescribed (never zero), a non-finite value is rejected, a non-integer is
// rejected, a negative is rejected. Never applies a per-field minimum — that is validateTargets's
// job, since the same numeric value (0) is valid for one field (rest) and invalid for another
// (sets).
export function parseTargetField(raw: string): ParsedTargetField {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { value: null };

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return { error: 'not-a-number' };
  if (!Number.isInteger(parsed)) return { error: 'whole-number' };
  if (parsed < 0) return { error: 'negative' };

  return { value: parsed };
}

export type TargetValidationErrors = Partial<Record<keyof TargetDraft, TargetFieldError>>;

// Range ordering is enforced here and not in apps/api/src/sync/sync.service.ts, on purpose. An
// invalid_field rejection is terminal — the client completes the crud transaction and the write is
// gone — so a server-side range check would silently discard a legitimate offline write the moment
// a range rule ever changed. The server validates shape (non-negative integer or null); this
// module validates intent.
export function validateTargets(draft: TargetDraft): TargetValidationErrors {
  const errors: TargetValidationErrors = {};

  if (draft.targetSets !== null && draft.targetSets < 1) {
    errors.targetSets = 'below-minimum';
  }
  if (draft.targetRepMin !== null && draft.targetRepMin < 1) {
    errors.targetRepMin = 'below-minimum';
  }
  if (draft.targetRepMin !== null && draft.targetRepMax !== null && draft.targetRepMax < draft.targetRepMin) {
    errors.targetRepMax = 'min-above-max';
  }

  return errors;
}

function firstErrorMessage(errors: TargetValidationErrors): string {
  const [field, code] = Object.entries(errors)[0] as [keyof TargetDraft, TargetFieldError];
  return `${field}: ${code}`;
}

// Writes all five columns every time, including the nulls — a partial write would leave a stale
// value behind for a field the user just cleared. Exactly one update, for the given
// routine_exercise id; a target write can never reach a sibling exercise or another day.
export async function setExerciseTargets(
  routineExerciseId: string,
  draft: TargetDraft,
  db: WriteDb = getPowerSync(),
): Promise<void> {
  const errors = validateTargets(draft);
  if (Object.keys(errors).length > 0) {
    throw new Error(firstErrorMessage(errors));
  }

  await db
    .update(routineExercise)
    .set({
      targetSets: draft.targetSets,
      targetRepMin: draft.targetRepMin,
      targetRepMax: draft.targetRepMax,
      targetRir: draft.targetRir,
      targetRestSeconds: draft.targetRestSeconds,
    })
    .where(eq(routineExercise.id, routineExerciseId));
}
