import { fromCanonicalKg, type ResolvedTarget, type SetType, type WeightUnit } from '@fitness/api-contracts';
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
  // The RAW storage index — resolveReference keys the previous-actual lookup off THIS value, so it
  // must never shift when a child consumes an index (CF-03, D-23). Never rendered directly in the
  // set-number column once displaySetIndex exists — that column reads displaySetIndex for a parent
  // and nothing for a child.
  setIndex: number;
  values: SetRowValues;
  reference: SetRowReference;
  completed: boolean;
  // Omitted on the trailing draft row (always a working entry) — ExercisePageView only checks
  // this for the warm-up badge/ordering, never infers set type from position (RESEARCH Pitfall 2).
  setType?: string;
  // Null on the trailing draft row (no logged_set exists yet to carry a note) and on any existing
  // row with no note — feeds SetRowView's hasNote dot and the set-level NoteSheet's initial text.
  noteText?: string | null;
  // Phase 7 D-05/D-20: additive. Null/undefined on a plain row and on the trailing draft.
  parentSetId?: string | null;
  side?: string | null;
  // D-23: the row's position among parent rows only (1, 2, 3…), computed during the
  // parent-then-children flatten below — never the raw setIndex, never written back to storage.
  // Undefined on every child row; set on every parent row and on the trailing draft.
  displaySetIndex?: number;
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

// Warm-up rows always render ahead of every other row, regardless of raw set_index — RESEARCH.md
// Pitfall 2: set_index is a flat, strictly-incrementing counter across the whole session_exercise,
// not a "which came first" signal. Warm-ups are never grouped (D-07/D-20 restrict a parent role to
// normal/myorep rows), so bucketing them first and THEN tree-flattening the remainder is the
// correct composition order (07-RESEARCH.md Assumption A1).
//
// The remainder is flattened parent-then-children: a row with a null parentSetId is a parent and
// keeps its incoming relative order; every other row is grouped by its parentSetId and emitted
// immediately after that parent, sorted by ascending setIndex with a stable comparator (Array.sort
// is stable in this runtime, so a tie on setIndex preserves incoming relative order rather than
// reordering nondeterministically). A row whose parentSetId names an id absent from this input (an
// orphan) is appended after every parent group rather than dropped — a logged set is never
// silently invisible (07-RESEARCH.md Pitfall 2 / T-7-03).
function orderForDisplay(existingSets: LoggedSetRow[]): LoggedSetRow[] {
  const warmups = existingSets.filter((row) => row.setType === 'warmup');
  const nonWarmups = existingSets.filter((row) => row.setType !== 'warmup');

  const parents = nonWarmups.filter((row) => (row.parentSetId ?? null) === null);
  const parentIds = new Set(parents.map((row) => row.id));

  const childrenByParent = new Map<string, LoggedSetRow[]>();
  const orphans: LoggedSetRow[] = [];
  for (const row of nonWarmups) {
    const parentSetId = row.parentSetId ?? null;
    if (parentSetId === null) continue;
    if (!parentIds.has(parentSetId)) {
      orphans.push(row);
      continue;
    }
    const group = childrenByParent.get(parentSetId) ?? [];
    group.push(row);
    childrenByParent.set(parentSetId, group);
  }
  for (const group of childrenByParent.values()) {
    group.sort((a, b) => a.setIndex - b.setIndex);
  }

  const flattened: LoggedSetRow[] = [];
  for (const parent of parents) {
    flattened.push(parent);
    flattened.push(...(childrenByParent.get(parent.id) ?? []));
  }
  flattened.push(...orphans);

  return [...warmups, ...flattened];
}

interface BlankSubEntryInput {
  parentSetId?: string | null;
  completed: boolean;
  reps: number;
  weightKg: string | null;
}

// The shape a freshly inserted, not-yet-filled sub-entry has: logged_set.reps is NOT NULL and
// cannot store "no value", so a child row awaiting its first real number is stored with reps 0.
// A three-field agreement, never an inference from position (07-RESEARCH.md Pitfall 2) — a real
// 0-rep child the lifter deliberately logged as failed-before-a-rep would also need `completed`
// true or a non-null weight to distinguish itself, which this predicate requires exactly.
export function isBlankSubEntry(row: BlankSubEntryInput): boolean {
  return (row.parentSetId ?? null) !== null && !row.completed && row.reps === 0 && row.weightKg === null;
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
  // D-23: a parent's displayed set number is its position among parent rows only — a running
  // count kept in the same pass as the row map, never a second traversal and never written back
  // to row.setIndex (which stays the raw storage value resolveReference keys off, CF-03).
  let parentCount = 0;
  const rows: ResolvedSetRow[] = ordered.map((row) => {
    const override = rowOverrides[row.id];
    const weightKg = override?.weightKg !== undefined ? override.weightKg : row.weightKg;
    const reps = override?.reps !== undefined ? override.reps : row.reps;
    const rir = override?.rir !== undefined ? override.rir : row.rir;
    const completed = override?.completed !== undefined ? override.completed : row.completed;
    const parentSetId = row.parentSetId ?? null;
    const side = row.side ?? null;

    const blank = isBlankSubEntry({ parentSetId, completed, reps, weightKg });

    let values: SetRowValues = {
      weight: blank ? null : fromCanonicalKg(weightKg, weightUnit),
      reps: blank ? null : String(reps),
      rir: rir === null ? null : String(rir),
    };
    if (activeField && activeField.setId === row.id && activeField.touched) {
      values = { ...values, [activeField.field]: activeField.value };
    }

    const reference = resolveReference(referenceContext.sessionExerciseId, row.setIndex, referenceContext.referenceMap, weightUnit);
    const displaySetIndex = parentSetId === null ? ++parentCount : undefined;

    return {
      setId: row.id,
      setIndex: row.setIndex,
      values,
      reference,
      completed,
      setType: row.setType,
      noteText: row.notes,
      parentSetId,
      side,
      displaySetIndex,
    };
  });

  let draft = draftValues;
  if (activeField && activeField.setId === null && activeField.touched) {
    draft = { ...draft, [activeField.field]: activeField.value };
  }
  // Mirrors logSet's own max(set_index) + 1 (log-set.ts), not existingSets.length (WR-01) — a
  // warm-up regeneration after working sets already exist can leave gaps in the raw set_index
  // sequence (orderForDisplay buckets warm-ups first for RENDERING, but assigned indices stay
  // whatever logSet computed at insert time), so a plain count silently diverges from the index
  // logSet will actually assign next, keying the draft row's reference lookup off the wrong
  // historical set for this position.
  const draftSetIndex = existingSets.length === 0 ? 1 : Math.max(...existingSets.map((row) => row.setIndex)) + 1;
  const draftReference = resolveReference(referenceContext.sessionExerciseId, draftSetIndex, referenceContext.referenceMap, weightUnit);
  rows.push({
    setId: null,
    setIndex: draftSetIndex,
    values: draft,
    reference: draftReference,
    completed: false,
    noteText: null,
    parentSetId: null,
    side: null,
    displaySetIndex: parentCount + 1,
  });

  return rows;
}

// D-08's three groupable set types and the exact Copywriting Contract label each one's "+ Add"
// control carries — the one place this text lives; SetRow.tsx's SetGroupAddControl and
// ExercisePage.tsx's render site both take the label as a prop, never re-deriving the string.
export const GROUP_ADD_LABEL: Partial<Record<SetType, string>> = {
  drop: '+ Add Drop',
  myorep: '+ Add Myorep Set',
  partial: '+ Add Partial',
};

// The group's kind decides which "+ Add" label applies and, via resolveGroupAddControls below,
// whether the control may appear at all. D-07's divergence: for a myorep the PARENT is the
// activation set, so a myorep parent's own setType answers the question regardless of whether it
// has children yet — every other groupable type answers from its children's shared setType
// instead, since D-07 keeps a drop/partial parent typed `normal`. A `warmup` parent is never a
// group of any kind this phase builds.
export function groupKindFor(parentRow: ResolvedSetRow, childRows: ResolvedSetRow[]): SetType | null {
  if (parentRow.setType === 'warmup') return null;
  if (parentRow.setType === 'myorep') return 'myorep';
  const childType = childRows[0]?.setType;
  return (childType as SetType | undefined) ?? null;
}

export interface GroupAddControl {
  parentSetId: string;
  kind: SetType;
  label: string;
  visible: boolean;
}

// Generalises D-08 ("revealed once a sub-entry is completed") to myorep's activation-set case,
// where the group's most recently added entry is the parent itself rather than a sub-entry (D-07)
// — resolveGroupAddControls keys `visible` off whichever row is that "most recent entry": the
// last child when the group has any, the parent itself when it does not. The control never fires
// on its own; one deliberate tap per mini-set is the decision (D-08).
export function resolveGroupAddControls(rows: ResolvedSetRow[]): GroupAddControl[] {
  const controls: GroupAddControl[] = [];
  for (const parent of rows) {
    if (parent.setId === null) continue; // the trailing draft row never owns a group
    if ((parent.parentSetId ?? null) !== null) continue; // only a parent can own a group's control
    const children = rows.filter((candidate) => candidate.parentSetId === parent.setId);
    const kind = groupKindFor(parent, children);
    if (kind === null) continue;
    const label = GROUP_ADD_LABEL[kind];
    if (label === undefined) continue;
    const lastEntry = children.length > 0 ? children[children.length - 1] : parent;
    controls.push({ parentSetId: parent.setId, kind, label, visible: lastEntry.completed });
  }
  return controls;
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
