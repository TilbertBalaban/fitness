import { eq, inArray, isNull } from 'drizzle-orm';
import { isCatalogSnapshot, type CatalogSnapshot } from '@fitness/api-contracts';
import catalogSnapshotJson from '../../assets/catalog/catalog-snapshot.json';
import { getPowerSync, type WriteDb } from '../db/powersync';
import { catalogMeta, exerciseMuscleMapping, muscleGroup, seededExercise } from '../db/schema';

const CATALOG_META_ID = 'singleton';

export type CatalogLoadStatus = 'loaded' | 'current' | 'invalid';

export interface CatalogLoadResult {
  status: CatalogLoadStatus;
  catalogVersion?: string;
}

// Reads the applied catalog_version through the ordinary select path — no raw SQL, so it works
// identically whether the singleton row exists yet or not (undefined -> null).
export async function readCatalogVersion(db: WriteDb = getPowerSync()): Promise<string | null> {
  const [row] = await db
    .select({ catalogVersion: catalogMeta.catalogVersion })
    .from(catalogMeta)
    .where(eq(catalogMeta.id, CATALOG_META_ID));
  return row?.catalogVersion ?? null;
}

function muscleMappingId(exerciseId: string, muscleGroupId: string): string {
  return `${exerciseId}:${muscleGroupId}`;
}

// db.transaction(async (tx) => {...})'s own tx parameter is typed narrower than WriteDb itself
// (missing the `db`/`watch` fields PowerSyncSQLiteDatabase carries) even though it supports every
// query-builder method this function calls — extracted directly from WriteDb['transaction']'s own
// declared callback signature so this always matches whatever the SDK's real type is, rather than
// hand-guessing a parallel interface that could drift from it.
type TransactionHandle = Parameters<Parameters<WriteDb['transaction']>[0]>[0];

// Every PowerSync-managed table (localOnly ones included) is a SQLite VIEW with INSTEAD OF
// triggers, and SQLite refuses to prepare an upsert clause against a view — confirmed at the
// engine level (.planning/debug/exercise-catalog-load-failure.md). Every write below is therefore
// built only from plain single-row INSERT and condition-scoped UPDATE, never onConflictDoUpdate or
// onConflictDoNothing.
//
// The one write path a validated CatalogSnapshot ever goes through — shared by loadCatalogSnapshot
// (bundled first-install asset) and refresh-catalog.ts's refreshCatalog (a later downloaded
// artifact), so the two can never diverge (03-05 Task 3's own instruction: "extract that path into
// a shared internal function rather than copying it"). Runs inside a transaction the caller opens.
export async function applyCatalogSnapshot(tx: WriteDb | TransactionHandle, snapshot: CatalogSnapshot): Promise<void> {
  const existingGroupRows = await tx.select({ id: muscleGroup.id }).from(muscleGroup);
  const existingGroupIds = new Set(existingGroupRows.map((row) => row.id));
  for (const group of snapshot.muscle_groups) {
    const values = { id: group.id, name: group.name, bodyRegion: group.body_region };
    if (existingGroupIds.has(group.id)) {
      const { id: _id, ...set } = values;
      await tx.update(muscleGroup).set(set).where(eq(muscleGroup.id, group.id));
    } else {
      await tx.insert(muscleGroup).values(values);
      existingGroupIds.add(group.id);
    }
  }

  // WINDOWS #32: seeded rows go into seededExercise (localOnly — zero ps_crud entries), never the
  // ordinary synced `exercise` table. `exercise` is reserved for a user's own custom rows, which
  // this function never writes to at all — the must_haves truth ("a refresh... replaces seeded
  // rows without deleting or modifying any row where is_custom is true") is structurally
  // guaranteed by table separation, not by a WHERE is_custom=false filter that could be forgotten.
  //
  // `archivedAt` is deliberately absent from both the insert values and the update's derived `set`
  // below — SQLite defaults an omitted nullable column to NULL on insert (a fresh row starts
  // unarchived), and omitting it from `set` means re-seeding a row the archive-drift pass below
  // previously archived never silently un-archives it (mirrors seed-catalog.ts's server-side rule).
  //
  // Read once, before any write: existingExerciseRows feeds both the insert/update branch below
  // and the archive-drift diff, so a row this pass touches is always classified correctly whether
  // it was previously archived or not (an isNull-filtered read here would misclassify an archived
  // row as new and raise a uniqueness failure on the first refresh after any archive).
  const exerciseIds = snapshot.exercises.map((item) => item.id);
  const existingExerciseRows = await tx.select({ id: seededExercise.id, archivedAt: seededExercise.archivedAt }).from(seededExercise);
  const existingExerciseIds = new Set(existingExerciseRows.map((row) => row.id));
  for (const item of snapshot.exercises) {
    const values = {
      id: item.id,
      name: item.name,
      aliases: item.aliases ? JSON.stringify(item.aliases) : null,
      movementPattern: item.movement_pattern,
      equipmentRequired: item.equipment_required,
      loadType: item.load_type,
      unilateral: item.unilateral,
      instructionsText: item.instructions_text,
      cueText: item.cue_text,
      imageUrls: JSON.stringify(item.image_urls),
      bodyweightContributionPct: item.bodyweight_contribution_pct,
      variationOfId: item.variation_of_id,
      source: item.source,
    };
    if (existingExerciseIds.has(item.id)) {
      const { id: _id, ...set } = values;
      await tx.update(seededExercise).set(set).where(eq(seededExercise.id, item.id));
    } else {
      await tx.insert(seededExercise).values(values);
      existingExerciseIds.add(item.id);
    }
  }

  // Archive drift — a seeded row absent from this artifact is archived, never deleted: a set
  // logged on this device before the row vanished could still reference its id, and a hard delete
  // has no reference-check backstop here any more than seed-catalog.ts's server-side equivalent
  // does (PITFALLS.md §11). The vanished-id set is computed here, in JS, via a plain diff against
  // the read taken above — not inside a single compound WHERE clause — so the update only ever
  // runs, and only ever targets, ids genuinely absent from this artifact. On a fresh device
  // (nothing previously loaded) or a same-version reload, activeIds is empty or fully covered by
  // exerciseIds, vanishedIds is empty, and the update below is skipped entirely.
  const appliedAt = new Date().toISOString();
  if (exerciseIds.length > 0) {
    const currentIds = new Set(exerciseIds);
    const vanishedIds = existingExerciseRows
      .filter((row) => row.archivedAt === null || row.archivedAt === undefined)
      .map((row) => row.id)
      .filter((id) => !currentIds.has(id));
    if (vanishedIds.length > 0) {
      await tx.update(seededExercise).set({ archivedAt: appliedAt }).where(inArray(seededExercise.id, vanishedIds));
    }
  }

  const existingMappingRows = await tx.select({ id: exerciseMuscleMapping.id }).from(exerciseMuscleMapping);
  const existingMappingIds = new Set(existingMappingRows.map((row) => row.id));
  for (const mapping of snapshot.mappings) {
    const id = muscleMappingId(mapping.exercise_id, mapping.muscle_group_id);
    const values = {
      id,
      exerciseId: mapping.exercise_id,
      muscleGroupId: mapping.muscle_group_id,
      role: mapping.role,
      weightFactor: mapping.weight_factor,
    };
    if (existingMappingIds.has(id)) {
      const { id: _id, ...set } = values;
      await tx.update(exerciseMuscleMapping).set(set).where(eq(exerciseMuscleMapping.id, id));
    } else {
      await tx.insert(exerciseMuscleMapping).values(values);
      existingMappingIds.add(id);
    }
  }

  const existingMetaRows = await tx.select({ id: catalogMeta.id }).from(catalogMeta);
  const existingMetaIds = new Set(existingMetaRows.map((row) => row.id));
  const metaValues = { id: CATALOG_META_ID, catalogVersion: snapshot.catalog_version, appliedAt };
  if (existingMetaIds.has(CATALOG_META_ID)) {
    const { id: _id, ...set } = metaValues;
    await tx.update(catalogMeta).set(set).where(eq(catalogMeta.id, CATALOG_META_ID));
  } else {
    await tx.insert(catalogMeta).values(metaValues);
  }
}

// snapshotOverride exists purely for tests to drive a deliberately malformed artifact through
// this function without touching the bundled JSON asset (WINDOWS #23-style injection seam,
// matching log-set.ts's db parameter) — production call sites never pass it.
//
// Structural validation runs before the transaction opens (T-03-08) — a shape failure never
// reaches a write, so the fail-closed path always leaves every table exactly as it found them.
export async function loadCatalogSnapshot(
  db: WriteDb = getPowerSync(),
  snapshotOverride: unknown = catalogSnapshotJson,
): Promise<CatalogLoadResult> {
  if (!isCatalogSnapshot(snapshotOverride)) {
    return { status: 'invalid' };
  }
  const snapshot = snapshotOverride;

  const currentVersion = await readCatalogVersion(db);
  if (currentVersion === snapshot.catalog_version) {
    return { status: 'current', catalogVersion: snapshot.catalog_version };
  }

  await db.transaction(async (tx) => {
    await applyCatalogSnapshot(tx, snapshot);
  });

  return { status: 'loaded', catalogVersion: snapshot.catalog_version };
}
