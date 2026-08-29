import { eq } from 'drizzle-orm';
import {
  EQUIPMENT_TYPES,
  LOAD_TYPES,
  MOVEMENT_PATTERNS,
  MUSCLE_GROUPS,
  MUSCLE_ROLES,
  type EquipmentType,
  type LoadType,
  type MovementPattern,
  type MuscleGroupId,
  type MuscleRole,
} from '@fitness/api-contracts';
import { generateClientId } from '../db/id';
import type { WriteDb } from '../db/powersync';
import { exercise, exerciseMuscleMapping, seededExercise } from '../db/schema';
import type { ExerciseDetail } from './exercise-detail';

// tx parameter type extracted from WriteDb['transaction']'s own declared callback signature
// (matches apps/mobile/lib/catalog/load-snapshot.ts's identical extraction) so this always
// matches whatever the SDK's real transaction handle type is, rather than a hand-guessed
// parallel interface that could drift from it.
type TransactionHandle = Parameters<Parameters<WriteDb['transaction']>[0]>[0];
type Tx = WriteDb | TransactionHandle;

export interface MuscleMappingDraft {
  muscleGroupId: MuscleGroupId | string;
  role: MuscleRole;
  // Exact-decimal-as-string override — omitted, the role's default is used (see
  // DEFAULT_WEIGHT_FACTOR_BY_ROLE below).
  weightFactor?: string;
}

export interface CustomExerciseDraft {
  name: string;
  // null is the explicit, never-silently-defaulted "unanswered" state (E4 UI Considerations,
  // EXER-08) — a draft is only ever save-able once a real LoadType has been chosen.
  loadType: LoadType | null;
  equipmentRequired?: EquipmentType | null;
  movementPattern?: MovementPattern | null;
  unilateral?: boolean;
  instructionsText?: string | null;
  cueText?: string | null;
  muscleMappings?: MuscleMappingDraft[];
}

export type CustomExerciseErrorField = 'name' | 'load_type' | 'equipment_required' | 'movement_pattern' | 'muscle_mappings';
export type CustomExerciseErrors = Partial<Record<CustomExerciseErrorField, string>>;

export class CustomExerciseValidationError extends Error {
  errors: CustomExerciseErrors;

  constructor(errors: CustomExerciseErrors) {
    super('Invalid custom exercise draft');
    this.errors = errors;
  }
}

const LOAD_TYPE_SET = new Set<string>(LOAD_TYPES);
const EQUIPMENT_TYPE_SET = new Set<string>(EQUIPMENT_TYPES);
const MOVEMENT_PATTERN_SET = new Set<string>(MOVEMENT_PATTERNS);
const MUSCLE_GROUP_SET = new Set<string>(MUSCLE_GROUPS);
const MUSCLE_ROLE_SET = new Set<string>(MUSCLE_ROLES);

const DEFAULT_WEIGHT_FACTOR_BY_ROLE: Record<MuscleRole, string> = {
  primary: '1.00',
  secondary: '0.50',
};

// A code-point limit, not a byte or UTF-16-code-unit limit (T-03-36, DoS mitigation) — a name
// built from astral-plane emoji (each 2 UTF-16 code units, 4 UTF-8 bytes) must count as one
// character per emoji, not two or four.
export const MAX_NAME_LENGTH = 200;

const NAME_REQUIRED_ERROR = 'Name is required.';
const NAME_TOO_LONG_ERROR = 'Name is too long.';
const LOAD_TYPE_REQUIRED_ERROR = 'Select a tracking type.';
const EQUIPMENT_INVALID_ERROR = 'Select a valid equipment type.';
const MOVEMENT_PATTERN_INVALID_ERROR = 'Select a valid movement pattern.';
const MUSCLE_MAPPING_INVALID_ERROR = 'Select a valid muscle group and role.';

// A string made only of whitespace and/or Unicode combining marks (category M) has no visible
// base character — "́́" round-trips through NFC unchanged (there is nothing to
// compose it with) and is not caught by a plain trim/length check, but it is exactly as empty
// in spirit as a whitespace-only name.
const ONLY_WHITESPACE_OR_COMBINING_MARKS = /^[\s\p{M}]*$/u;

// Storage normalization, not the search normalization search-index.ts owns: NFC-compose, trim,
// collapse internal whitespace. Deliberately does NOT lowercase and does NOT strip diacritics —
// destroying the user's own casing/accents would be a silent edit of their data.
export function normalizeExerciseName(raw: string): string {
  return raw.normalize('NFC').trim().replace(/\s+/g, ' ');
}

// Kept deliberately in step with apps/api/src/sync/sync.service.ts's server-side
// hasInvalidField exercise branch (03-03) so a write never passes this client check and then
// fails at the server.
export function validateCustomExercise(draft: CustomExerciseDraft): CustomExerciseErrors {
  const errors: CustomExerciseErrors = {};

  const name = normalizeExerciseName(draft.name);
  if (ONLY_WHITESPACE_OR_COMBINING_MARKS.test(name)) {
    errors.name = NAME_REQUIRED_ERROR;
  } else if ([...name].length > MAX_NAME_LENGTH) {
    errors.name = NAME_TOO_LONG_ERROR;
  }

  if (draft.loadType === null || draft.loadType === undefined || !LOAD_TYPE_SET.has(draft.loadType)) {
    errors.load_type = LOAD_TYPE_REQUIRED_ERROR;
  }

  if (draft.equipmentRequired != null && !EQUIPMENT_TYPE_SET.has(draft.equipmentRequired)) {
    errors.equipment_required = EQUIPMENT_INVALID_ERROR;
  }

  if (draft.movementPattern != null && !MOVEMENT_PATTERN_SET.has(draft.movementPattern)) {
    errors.movement_pattern = MOVEMENT_PATTERN_INVALID_ERROR;
  }

  const mappings = draft.muscleMappings ?? [];
  const hasInvalidMapping = mappings.some(
    (mapping) => !MUSCLE_GROUP_SET.has(mapping.muscleGroupId) || !MUSCLE_ROLE_SET.has(mapping.role),
  );
  if (hasInvalidMapping) {
    errors.muscle_mappings = MUSCLE_MAPPING_INVALID_ERROR;
  }

  return errors;
}

function muscleMappingId(exerciseId: string, muscleGroupId: string): string {
  return `${exerciseId}:${muscleGroupId}`;
}

async function insertMuscleMappings(tx: Tx, exerciseId: string, mappings: MuscleMappingDraft[]): Promise<void> {
  for (const mapping of mappings) {
    await tx.insert(exerciseMuscleMapping).values({
      id: muscleMappingId(exerciseId, mapping.muscleGroupId),
      exerciseId,
      muscleGroupId: mapping.muscleGroupId,
      role: mapping.role,
      weightFactor: mapping.weightFactor ?? DEFAULT_WEIGHT_FACTOR_BY_ROLE[mapping.role],
    });
  }
}

// Issues the id first, before any write and with no network involved (D-02): every
// user-authored row carries a client-generated UUID issued before any network round-trip, so an
// exercise created in a basement gym has its identity immediately. The exercise row and its
// mapping rows land in one local transaction — a failure partway through leaves neither, matching
// apps/mobile/lib/catalog/load-snapshot.ts's transaction discipline.
export async function createCustomExercise(db: WriteDb, userId: string, draft: CustomExerciseDraft): Promise<string> {
  const errors = validateCustomExercise(draft);
  if (Object.keys(errors).length > 0) throw new CustomExerciseValidationError(errors);

  const id = generateClientId();
  const name = normalizeExerciseName(draft.name);
  const mappings = draft.muscleMappings ?? [];

  await db.transaction(async (tx) => {
    await tx.insert(exercise).values({
      id,
      userId,
      name,
      aliases: null,
      movementPattern: draft.movementPattern ?? null,
      equipmentRequired: draft.equipmentRequired ?? null,
      loadType: draft.loadType as string,
      unilateral: draft.unilateral ?? false,
      instructionsText: draft.instructionsText ?? null,
      cueText: draft.cueText ?? null,
      imageUrls: null,
      bodyweightContributionPct: null,
      isCustom: true,
      variationOfId: null,
      source: 'user',
      archivedAt: null,
      serverSeq: null,
    });

    await insertMuscleMappings(tx, id, mappings);
  });

  return id;
}

// Updates the existing row by id inside one transaction, replacing its mapping rows wholesale.
// Never touches id/user_id/is_custom/source/archived_at — exactly the fields
// apps/api/src/sync/patch-update-set.ts's EXERCISE_PATCH_FIELDS marks non-patchable (03-03), so
// writing them locally would produce an op the server rejects. The ownership check below is
// defense-in-depth only: 03-03's server-side not_owner rejection is the authoritative control
// (T-03-33) and remains in place regardless of this client-side guard.
export async function updateCustomExercise(db: WriteDb, userId: string, id: string, draft: CustomExerciseDraft): Promise<void> {
  const errors = validateCustomExercise(draft);
  if (Object.keys(errors).length > 0) throw new CustomExerciseValidationError(errors);

  const name = normalizeExerciseName(draft.name);
  const mappings = draft.muscleMappings ?? [];

  await db.transaction(async (tx) => {
    const [existing] = await tx.select({ userId: exercise.userId }).from(exercise).where(eq(exercise.id, id));
    if (!existing || existing.userId !== userId) {
      throw new Error('not_owner');
    }

    await tx
      .update(exercise)
      .set({
        name,
        movementPattern: draft.movementPattern ?? null,
        equipmentRequired: draft.equipmentRequired ?? null,
        loadType: draft.loadType as string,
        unilateral: draft.unilateral ?? false,
        instructionsText: draft.instructionsText ?? null,
        cueText: draft.cueText ?? null,
      })
      .where(eq(exercise.id, id));

    await tx.delete(exerciseMuscleMapping).where(eq(exerciseMuscleMapping.exerciseId, id));
    await insertMuscleMappings(tx, id, mappings);
  });
}

interface DuplicatableExerciseSource {
  name: string;
  aliases: string | null;
  movementPattern: string | null;
  equipmentRequired: string | null;
  loadType: string;
  unilateral: boolean;
  instructionsText: string | null;
  cueText: string | null;
  imageUrls: string | null;
  bodyweightContributionPct: string | null;
}

// Seeded rows live in localOnly seededExercise (WINDOWS #32); custom rows stay in the synced
// exercise table. An id is unique across both, mirroring the union read path
// apps/mobile/lib/catalog/exercise-detail.ts already establishes. Explicit column projection
// (not `.select()`) keeps the two tables' differing shapes (seededExercise has no
// userId/isCustom) unified under one return type.
async function selectDuplicatableSource(tx: Tx, id: string): Promise<DuplicatableExerciseSource | null> {
  const seededRows = await tx
    .select({
      name: seededExercise.name,
      aliases: seededExercise.aliases,
      movementPattern: seededExercise.movementPattern,
      equipmentRequired: seededExercise.equipmentRequired,
      loadType: seededExercise.loadType,
      unilateral: seededExercise.unilateral,
      instructionsText: seededExercise.instructionsText,
      cueText: seededExercise.cueText,
      imageUrls: seededExercise.imageUrls,
      bodyweightContributionPct: seededExercise.bodyweightContributionPct,
    })
    .from(seededExercise)
    .where(eq(seededExercise.id, id));
  if (seededRows[0]) return seededRows[0];

  const customRows = await tx
    .select({
      name: exercise.name,
      aliases: exercise.aliases,
      movementPattern: exercise.movementPattern,
      equipmentRequired: exercise.equipmentRequired,
      loadType: exercise.loadType,
      unilateral: exercise.unilateral,
      instructionsText: exercise.instructionsText,
      cueText: exercise.cueText,
      imageUrls: exercise.imageUrls,
      bodyweightContributionPct: exercise.bodyweightContributionPct,
    })
    .from(exercise)
    .where(eq(exercise.id, id));
  return customRows[0] ?? null;
}

// Reads the source exercise and its mappings, issues a fresh client UUID, and writes a
// user-owned copy — is_custom true, source 'user', variation_of_id set to the source id (D-03: a
// variation is a full Exercise row, never a separate table). The source row is read-only
// throughout: this function never opens sourceId for write, which is what makes the
// source-byte-identical test in custom-exercise.test.ts meaningful rather than incidental.
//
// The mapping rows are localOnly on the client (apps/mobile/lib/db/powersync.ts) — a duplicate's
// muscle mappings exist on the device but do not sync. The same duplicate opened on a second
// device shows the exercise without its mappings until a later phase adds a per-user mapping
// sync path.
export async function duplicateExercise(db: WriteDb, userId: string, sourceId: string): Promise<string> {
  const newId = generateClientId();

  await db.transaction(async (tx) => {
    const source = await selectDuplicatableSource(tx, sourceId);
    if (!source) throw new Error('exercise_not_found');

    await tx.insert(exercise).values({
      id: newId,
      userId,
      name: source.name,
      aliases: source.aliases,
      movementPattern: source.movementPattern,
      equipmentRequired: source.equipmentRequired,
      loadType: source.loadType,
      unilateral: source.unilateral,
      instructionsText: source.instructionsText,
      cueText: source.cueText,
      imageUrls: source.imageUrls,
      bodyweightContributionPct: source.bodyweightContributionPct,
      isCustom: true,
      variationOfId: sourceId,
      source: 'user',
      archivedAt: null,
      serverSeq: null,
    });

    const sourceMappings = await tx
      .select({
        muscleGroupId: exerciseMuscleMapping.muscleGroupId,
        role: exerciseMuscleMapping.role,
        weightFactor: exerciseMuscleMapping.weightFactor,
      })
      .from(exerciseMuscleMapping)
      .where(eq(exerciseMuscleMapping.exerciseId, sourceId));

    for (const mapping of sourceMappings) {
      await tx.insert(exerciseMuscleMapping).values({
        id: muscleMappingId(newId, mapping.muscleGroupId),
        exerciseId: newId,
        muscleGroupId: mapping.muscleGroupId,
        role: mapping.role,
        weightFactor: mapping.weightFactor,
      });
    }
  });

  return newId;
}

// Which user_id (if any) owns this id in the synced exercise table — null both when the id is a
// seeded row (seededExercise, never exercise) and when the row's stored user_id is itself null
// (a legacy pre-03-02 seed row, per 03-03-SUMMARY.md's upstream_state note). Both cases correctly
// route resolveEditAccess to 'not-permitted' below.
export async function getExerciseOwnerUserId(db: WriteDb, id: string): Promise<string | null> {
  const [row] = await db.select({ userId: exercise.userId }).from(exercise).where(eq(exercise.id, id));
  return row ? row.userId : null;
}

// --- Screen-presentational helpers ---------------------------------------------------------
// apps/mobile/app/exercises/new.tsx and edit/[id].tsx have no component-render test available
// in this codebase (@testing-library/react-native is not installed) — per this plan's own
// instruction, the forms' presentational decisions (whether Save is enabled, which state the
// edit route renders, prefilling a draft from a loaded detail, and whether the write function
// gets called at all) are extracted here as small exported, unit-tested functions instead of
// asserted against a rendered tree.

// Save is enabled once name and load_type are both set — equipment, cues and instructions may
// stay empty (E4 UI Considerations, "partial" row). Deliberately narrower than
// validateCustomExercise: an invalid equipment_required/movement_pattern/muscle mapping is still
// caught at submit time via the inline per-field error, not by keeping Save disabled.
export function isSaveEnabled(draft: CustomExerciseDraft): boolean {
  const errors = validateCustomExercise(draft);
  return errors.name === undefined && errors.load_type === undefined;
}

export type EditAccess = 'owned' | 'not-permitted';

// A seeded row (ownerUserId null) and another user's row both route to 'not-permitted' — the
// edit route never distinguishes the two in its rendered state, only in the reason (T-03-33).
export function resolveEditAccess(ownerUserId: string | null, currentUserId: string | null): EditAccess {
  if (currentUserId !== null && ownerUserId === currentUserId) return 'owned';
  return 'not-permitted';
}

// Converts a loaded ExerciseDetail (apps/mobile/lib/catalog/exercise-detail.ts) into an editable
// draft — the edit form's pre-fill. detail.loadType/equipmentRequired/movementPattern are always
// members of their respective vocabularies on read (the row could not have been written
// otherwise), so casting here is a read of already-validated storage, not a new trust boundary.
export function draftFromExerciseDetail(detail: ExerciseDetail): CustomExerciseDraft {
  return {
    name: detail.name,
    loadType: detail.loadType as LoadType,
    equipmentRequired: (detail.equipmentRequired as EquipmentType | null) ?? null,
    movementPattern: (detail.movementPattern as MovementPattern | null) ?? null,
    unilateral: detail.unilateral,
    instructionsText: detail.instructionsText,
    cueText: detail.cueText,
    muscleMappings: [
      ...detail.primaryMuscles.map((target) => ({
        muscleGroupId: target.muscleGroupId,
        role: 'primary' as const,
        weightFactor: target.weightFactor,
      })),
      ...detail.secondaryMuscles.map((target) => ({
        muscleGroupId: target.muscleGroupId,
        role: 'secondary' as const,
        weightFactor: target.weightFactor,
      })),
    ],
  };
}

export type SubmitOutcome = { ok: true; id: string } | { ok: false; errors: CustomExerciseErrors };

// Validates before calling the write function at all, so an invalid draft never reaches
// createCustomExercise/updateCustomExercise — the screen renders errors.<field> inline and never
// queues a write for a draft this function rejected.
export async function submitNewExercise(db: WriteDb, userId: string, draft: CustomExerciseDraft): Promise<SubmitOutcome> {
  const errors = validateCustomExercise(draft);
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const id = await createCustomExercise(db, userId, draft);
  return { ok: true, id };
}

export async function submitEditExercise(
  db: WriteDb,
  userId: string,
  id: string,
  draft: CustomExerciseDraft,
): Promise<SubmitOutcome> {
  const errors = validateCustomExercise(draft);
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  await updateCustomExercise(db, userId, id, draft);
  return { ok: true, id };
}
