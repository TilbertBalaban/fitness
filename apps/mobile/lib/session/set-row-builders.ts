import { fromCanonicalKg, type ResolvedTarget, type WeightUnit } from '@fitness/api-contracts';
import type { KeypadField } from '@/components/NumericKeypad';
import type { SetRowReference, SetRowValues } from '@/components/SetRow';
import type { LoggedSetRow, PreviousSetReferenceMap, SessionExerciseRow } from '@/lib/db/session-query';
import { referenceKey } from '@/lib/db/session-query';

// The pure set-row-building logic shared by both workout.tsx's live subtree and
// EditingWorkoutScreen.tsx's editing subtree (05-10) — extracted here rather than one importing
// from the other, which would create a circular module dependency between a route file and the
// component it renders. workout.tsx re-exports every name below so its own existing test imports
// (`from '../workout'`) keep working unchanged.

// Reps/RIR prefill from the session_exercise snapshot every time a fresh draft slot opens (D-16);
// weight starts blank (Task 3 fills it from history). EMPTY_PRESCRIPTION's nulls flow straight
// through — a one-off exercise's draft carries no target and formatFieldValue renders the dash.
export function defaultDraftValues(exercise: SessionExerciseRow): SetRowValues {
  const reps = exercise.targetRepMax ?? exercise.targetRepMin;
  return {
    weight: null,
    reps: reps === null ? null : String(reps),
    rir: exercise.targetRir === null ? null : String(exercise.targetRir),
  };
}

export interface ActiveFieldState {
  exerciseId: string;
  setId: string | null;
  field: KeypadField;
  value: string | null;
  touched: boolean;
}

export interface RowOverride {
  weightKg?: string | null;
  reps?: number;
  rir?: number | null;
  completed?: boolean;
}

export interface ResolvedSetRow {
  setId: string | null;
  setIndex: number;
  values: SetRowValues;
  reference: SetRowReference;
  completed: boolean;
  // Omitted on the trailing draft row (always a working entry) — ExercisePageView only checks
  // this for the warm-up badge/ordering, never infers set type from position (RESEARCH Pitfall 2).
  setType?: string;
}

interface BuildSetRowsActiveField {
  setId: string | null;
  field: KeypadField;
  value: string | null;
  touched: boolean;
}

export interface BuildSetRowsReferenceContext {
  sessionExerciseId: string;
  referenceMap: PreviousSetReferenceMap;
}

const EMPTY_REFERENCE_CONTEXT: BuildSetRowsReferenceContext = { sessionExerciseId: '', referenceMap: {} };

function resolveReference(
  sessionExerciseId: string,
  setIndex: number,
  referenceMap: PreviousSetReferenceMap,
  weightUnit: WeightUnit,
): SetRowReference {
  const ref = referenceMap[referenceKey(sessionExerciseId, setIndex)];
  if (!ref) return { weight: null, reps: null };
  return { weight: fromCanonicalKg(ref.weightKg, weightUnit), reps: String(ref.reps) };
}

// Warm-up rows always render ahead of working rows, regardless of raw set_index — RESEARCH.md
// Pitfall 2: set_index is a flat, strictly-incrementing counter across the whole session_exercise,
// not a "which came first" signal, so a warm-up added after working sets already exist would sort
// after them without this explicit bucket-then-concat step.
function orderForDisplay(existingSets: LoggedSetRow[]): LoggedSetRow[] {
  const warmups = existingSets.filter((row) => row.setType === 'warmup');
  const working = existingSets.filter((row) => row.setType !== 'warmup');
  return [...warmups, ...working];
}

// Existing rows (DB truth, patched by any local override not yet reflected by a reload) plus
// exactly one trailing draft — the tracer's one-set-at-a-time model, which is what keeps a
// completed row's assigned set_index always equal to its position in this list (LOG-07 ordering).
export function buildSetRows(
  existingSets: LoggedSetRow[],
  rowOverrides: Record<string, RowOverride>,
  draftValues: SetRowValues,
  weightUnit: WeightUnit,
  activeField: BuildSetRowsActiveField | null,
  referenceContext: BuildSetRowsReferenceContext = EMPTY_REFERENCE_CONTEXT,
): ResolvedSetRow[] {
  const ordered = orderForDisplay(existingSets);
  const rows: ResolvedSetRow[] = ordered.map((row) => {
    const override = rowOverrides[row.id];
    const weightKg = override?.weightKg !== undefined ? override.weightKg : row.weightKg;
    const reps = override?.reps !== undefined ? override.reps : row.reps;
    const rir = override?.rir !== undefined ? override.rir : row.rir;
    const completed = override?.completed !== undefined ? override.completed : row.completed;

    let values: SetRowValues = {
      weight: fromCanonicalKg(weightKg, weightUnit),
      reps: String(reps),
      rir: rir === null ? null : String(rir),
    };
    if (activeField && activeField.setId === row.id && activeField.touched) {
      values = { ...values, [activeField.field]: activeField.value };
    }

    const reference = resolveReference(referenceContext.sessionExerciseId, row.setIndex, referenceContext.referenceMap, weightUnit);

    return { setId: row.id, setIndex: row.setIndex, values, reference, completed, setType: row.setType };
  });

  let draft = draftValues;
  if (activeField && activeField.setId === null && activeField.touched) {
    draft = { ...draft, [activeField.field]: activeField.value };
  }
  const draftSetIndex = existingSets.length + 1;
  const draftReference = resolveReference(referenceContext.sessionExerciseId, draftSetIndex, referenceContext.referenceMap, weightUnit);
  rows.push({ setId: null, setIndex: draftSetIndex, values: draft, reference: draftReference, completed: false });

  return rows;
}

const WEIGHT_STEP_KG = 2.5;
const WEIGHT_STEP_LB = 0.5;
const INTEGER_STEP = 1;

export function stepAmountFor(field: KeypadField, weightUnit: WeightUnit): number {
  if (field !== 'weight') return INTEGER_STEP;
  return weightUnit === 'lb' ? WEIGHT_STEP_LB : WEIGHT_STEP_KG;
}

// Everything ExercisePage's action bar and sheets (05-06) need beyond the SetRowView-facing props
// the screen already threads through — one entry per live (non-removed) session_exercise, built
// 1:1 with the `exercises` strip list, so a lookup miss should never happen in practice.
export interface ExercisePageData {
  sessionExerciseId: string;
  exerciseId: string;
  sessionId: string;
  userId: string | null;
  targets: ResolvedTarget;
  routineExerciseId: string | null;
  // Never persisted anywhere a live session can recover it after start (no cycle_id column on
  // workout_session or session_exercise) — write-back therefore always resolves to the base
  // routine_exercise row for a programmed exercise until cycle identity is threaded through
  // session creation. See WINDOWS #119.
  cycleId: string | null;
  hasNote: boolean;
  noteText: string | null;
}

export const EMPTY_PAGE_DATA: ExercisePageData = {
  sessionExerciseId: '',
  exerciseId: '',
  sessionId: '',
  userId: null,
  targets: { targetSets: null, targetRepMin: null, targetRepMax: null, targetRir: null, targetRestSeconds: null },
  routineExerciseId: null,
  cycleId: null,
  hasNote: false,
  noteText: null,
};
