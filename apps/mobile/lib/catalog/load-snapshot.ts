import { eq } from 'drizzle-orm';
import { isCatalogSnapshot } from '@fitness/api-contracts';
import catalogSnapshotJson from '../../assets/catalog/catalog-snapshot.json';
import { getPowerSync, type WriteDb } from '../db/powersync';
import { catalogMeta, exercise, exerciseMuscleMapping, muscleGroup } from '../db/schema';

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

// Structural validation runs before the transaction opens (T-03-08) — a shape failure never
// reaches a write, so the fail-closed path always leaves every table exactly as it found them.
export async function loadCatalogSnapshot(db: WriteDb = getPowerSync()): Promise<CatalogLoadResult> {
  if (!isCatalogSnapshot(catalogSnapshotJson)) {
    return { status: 'invalid' };
  }
  const snapshot = catalogSnapshotJson;

  const currentVersion = await readCatalogVersion(db);
  if (currentVersion === snapshot.catalog_version) {
    return { status: 'current', catalogVersion: snapshot.catalog_version };
  }

  const appliedAt = new Date().toISOString();

  await db.transaction(async (tx) => {
    for (const group of snapshot.muscle_groups) {
      await tx
        .insert(muscleGroup)
        .values({ id: group.id, name: group.name, bodyRegion: group.body_region })
        .onConflictDoUpdate({
          target: muscleGroup.id,
          set: { name: group.name, bodyRegion: group.body_region },
        });
    }

    for (const item of snapshot.exercises) {
      const values = {
        id: item.id,
        userId: null,
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
        isCustom: false,
        variationOfId: item.variation_of_id,
        source: item.source,
        archivedAt: null,
      };
      await tx.insert(exercise).values(values).onConflictDoUpdate({ target: exercise.id, set: values });
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
  });

  return { status: 'loaded', catalogVersion: snapshot.catalog_version };
}
