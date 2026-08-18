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

// The one write path a validated CatalogSnapshot ever goes through — shared by loadCatalogSnapshot
// (bundled first-install asset) and refresh-catalog.ts's refreshCatalog (a later downloaded
// artifact), so the two can never diverge (03-05 Task 3's own instruction: "extract that path into
// a shared internal function rather than copying it"). Runs inside a transaction the caller opens.
export async function applyCatalogSnapshot(tx: WriteDb | TransactionHandle, snapshot: CatalogSnapshot): Promise<void> {
  for (const group of snapshot.muscle_groups) {
    await tx
      .insert(muscleGroup)
      .values({ id: group.id, name: group.name, bodyRegion: group.body_region })
      .onConflictDoUpdate({
        target: muscleGroup.id,
        set: { name: group.name, bodyRegion: group.body_region },
      });
  }

  // WINDOWS #32: seeded rows go into seededExercise (localOnly — zero ps_crud entries), never the
  // ordinary synced `exercise` table. `exercise` is reserved for a user's own custom rows, which
  // this function never writes to at all — the must_haves truth ("a refresh... replaces seeded
  // rows without deleting or modifying any row where is_custom is true") is structurally
  // guaranteed by table separation, not by a WHERE is_custom=false filter that could be forgotten.
  //
  // `archivedAt` is deliberately absent from both the insert values and the onConflictDoUpdate
  // `set` below — SQLite defaults an omitted nullable column to NULL on insert (a fresh row starts
  // unarchived), and omitting it from `set` means re-seeding a row the archive-drift pass below
  // previously archived never silently un-archives it (mirrors seed-catalog.ts's server-side rule).
  const exerciseIds = snapshot.exercises.map((item) => item.id);
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
    await tx
      .insert(seededExercise)
      .values(values)
      .onConflictDoUpdate({ target: seededExercise.id, set: values });
  }

  // Archive drift — a seeded row absent from this artifact is archived, never deleted: a set
  // logged on this device before the row vanished could still reference its id, and a hard delete
  // has no reference-check backstop here any more than seed-catalog.ts's server-side equivalent
  // does (PITFALLS.md §11). The vanished-id set is computed here, in JS, via a plain diff against
  // an ordinary select — not inside a single compound WHERE clause — so the update only ever runs,
  // and only ever targets, ids genuinely absent from this artifact. On a fresh device (nothing
  // previously loaded) or a same-version reload, activeIds is empty or fully covered by
  // exerciseIds, vanishedIds is empty, and the update below is skipped entirely.
  const appliedAt = new Date().toISOString();
  if (exerciseIds.length > 0) {
    const activeRows = await tx
      .select({ id: seededExercise.id })
      .from(seededExercise)
      .where(isNull(seededExercise.archivedAt));
    const currentIds = new Set(exerciseIds);
    const vanishedIds = activeRows.map((row) => row.id).filter((id) => !currentIds.has(id));
    if (vanishedIds.length > 0) {
      await tx.update(seededExercise).set({ archivedAt: appliedAt }).where(inArray(seededExercise.id, vanishedIds));
    }
  }

  for (const mapping of snapshot.mappings) {
    const id = muscleMappingId(mapping.exercise_id, mapping.muscle_group_id);
    const values = {
      id,
      exerciseId: mapping.exercise_id,
      muscleGroupId: mapping.muscle_group_id,
      role: mapping.role,
      weightFactor: mapping.weight_factor,
    };
    await tx
      .insert(exerciseMuscleMapping)
      .values(values)
      .onConflictDoUpdate({ target: exerciseMuscleMapping.id, set: values });
  }

  const metaValues = { id: CATALOG_META_ID, catalogVersion: snapshot.catalog_version, appliedAt };
  await tx
    .insert(catalogMeta)
    .values(metaValues)
    .onConflictDoUpdate({ target: catalogMeta.id, set: metaValues });
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
