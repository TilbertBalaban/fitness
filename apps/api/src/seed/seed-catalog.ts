import { resolve } from 'node:path';
import { config } from 'dotenv';

// Same reason as generate-corpus.ts (see its lines 1-8): this script runs through ts-node
// outside Nest's bootstrap, so nothing else guarantees .env is loaded before drizzle.module.ts's
// DATABASE_URL guard reads it. Harmless to call twice — dotenv never overwrites an already-set var.
config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] });

import { readFileSync } from 'node:fs';
import { and, eq, getTableColumns, inArray, isNull, notInArray, sql, type SQL } from 'drizzle-orm';
import { isCatalogSnapshot } from '@fitness/api-contracts';
import { db, pool, type Database } from '../db/drizzle.module';
import { exercise, exerciseMuscleMapping, muscleGroup } from '../db/schema';

// Postgres has a hard 65535-parameter-per-statement ceiling; batching in chunks of a few hundred
// keeps every bulk insert well under that while still issuing O(10) statements instead of O(900)
// (seeded-corpus-perf.e2e-spec.ts's standing objection to per-row query shapes).
const CHUNK_SIZE = 250;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

// Builds a bulk-upsert `set` clause that resolves per conflicting row via Postgres's `excluded`
// pseudo-table, rather than one static value shared by every row in the batch (drizzle-orm's own
// documented multi-row upsert pattern). Column keys are the Drizzle property names; the actual
// snake_case DB column name is read off the table's own column metadata, never hand-typed twice.
function excludedColumnsSet(table: object, keys: string[]): Record<string, SQL> {
  const columns = getTableColumns(table as never) as Record<string, { name: string }>;
  const set: Record<string, SQL> = {};
  for (const key of keys) {
    set[key] = sql.raw(`excluded.${columns[key].name}`);
  }
  return set;
}

export interface SeedCatalogResult {
  muscleGroupCount: number;
  exerciseCount: number;
  mappingCount: number;
  archivedCount: number;
}

// Testable unit: accepts an already-open `db` handle (the real pooled `db`, or a transaction/
// savepoint passed by a caller that wants the whole call rolled back) and the raw, unvalidated
// artifact. Validates before opening its own transaction (T-03-23) — a shape failure never
// reaches a write, so the fail-closed path always leaves every table exactly as it found them.
export async function seedCatalog(database: Database, snapshotInput: unknown): Promise<SeedCatalogResult> {
  if (!isCatalogSnapshot(snapshotInput)) {
    throw new Error(
      'Catalog artifact failed isCatalogSnapshot validation — refusing to seed a partial or malformed catalog.',
    );
  }
  const snapshot = snapshotInput;

  return database.transaction(async (tx) => {
    // 1. muscle_group — upsert on id.
    for (const batch of chunk(snapshot.muscle_groups, CHUNK_SIZE)) {
      await tx
        .insert(muscleGroup)
        .values(batch.map((group) => ({ id: group.id, name: group.name, bodyRegion: group.body_region })))
        .onConflictDoUpdate({
          target: muscleGroup.id,
          set: excludedColumnsSet(muscleGroup, ['name', 'bodyRegion']),
        });
    }

    // 2. exercise — upsert on id, scoped to the seeded population (is_custom false, user_id null,
    // source literal 'seed'). The `set` clause deliberately omits `archivedAt`: re-seeding a row
    // that step 4 previously archived must not silently un-archive it.
    //
    // variation_of_id is deliberately forced to null in THIS pass and resolved separately in a
    // second pass below (T-03-23-adjacent finding, not in the plan's own action text): the
    // self-referencing exercise_variation_of_id_exercise_id_fk constraint means a row in chunk N
    // can point at a row that only exists in chunk N+1, and Postgres checks a non-deferred FK at
    // the end of each individual statement, not the end of the transaction — chunking the exercise
    // upsert (required for the ~900-row batch-size discipline above) makes a forward self-reference
    // fail with a real FK violation the moment the artifact contains any variation grouping ordered
    // after its own parent. Pass 2 runs only after every id in this artifact is guaranteed to exist.
    const exerciseIds = snapshot.exercises.map((item) => item.id);
    const exerciseRows = snapshot.exercises.map((item) => ({
      id: item.id,
      userId: null,
      name: item.name,
      aliases: item.aliases,
      movementPattern: item.movement_pattern,
      equipmentRequired: item.equipment_required,
      loadType: item.load_type,
      unilateral: item.unilateral,
      instructionsText: item.instructions_text,
      cueText: item.cue_text,
      imageUrls: item.image_urls,
      bodyweightContributionPct: item.bodyweight_contribution_pct,
      isCustom: false,
      variationOfId: null as string | null,
      source: 'seed',
    }));
    for (const batch of chunk(exerciseRows, CHUNK_SIZE)) {
      await tx
        .insert(exercise)
        .values(batch)
        .onConflictDoUpdate({
          target: exercise.id,
          set: excludedColumnsSet(exercise, [
            'name',
            'aliases',
            'movementPattern',
            'equipmentRequired',
            'loadType',
            'unilateral',
            'instructionsText',
            'cueText',
            'imageUrls',
            'bodyweightContributionPct',
          ]),
        });
    }

    // 2b. variation_of_id resolution pass — every id in this artifact now exists in `exercise`
    // (pass 2 above), so a self-reference in either direction resolves regardless of source order.
    // Runs over every exercise in the artifact, not just the ones with a non-null value, so a
    // variation grouping removed in a newer artifact is cleared (converges), not left stale.
    for (const batch of chunk(snapshot.exercises, CHUNK_SIZE)) {
      const rows = sql.join(
        batch.map((item) => sql`(${item.id}::text, ${item.variation_of_id}::text)`),
        sql`, `,
      );
      await tx.execute(sql`
        UPDATE exercise AS e
        SET variation_of_id = v.variation_of_id
        FROM (VALUES ${rows}) AS v(id, variation_of_id)
        WHERE e.id = v.id
      `);
    }

    // 3. exercise_muscle_mapping — delete-then-insert scoped to this artifact's exercise ids only,
    // so a changed mapping set converges instead of accumulating stale rows. Never touches mappings
    // belonging to an exercise this artifact doesn't mention (e.g. one already archived).
    if (exerciseIds.length > 0) {
      for (const idBatch of chunk(exerciseIds, CHUNK_SIZE)) {
        await tx.delete(exerciseMuscleMapping).where(inArray(exerciseMuscleMapping.exerciseId, idBatch));
      }
    }
    // Deduplicate on (exercise_id, muscle_group_id) — the table's own composite primary key — before
    // insert. The committed catalog-normalized.json (03-04) carries 43 rows sharing a pair with
    // another row (mostly identical near-duplicates from two source muscle names normalizing to the
    // same canonical group, plus one genuine primary/secondary disagreement for the same pair); a
    // raw insert of the artifact as-is violates exercise_muscle_mapping's own PK. 'primary' wins over
    // 'secondary' for a genuine disagreement (the stronger claim); the first occurrence wins for an
    // exact duplicate (equivalent either way). This is a defensive read-side fix, not a rewrite of
    // the committed artifact — 03-04's own normalization output is unchanged on disk.
    const dedupedMappings = new Map<string, (typeof snapshot.mappings)[number]>();
    for (const mapping of snapshot.mappings) {
      const key = `${mapping.exercise_id}|${mapping.muscle_group_id}`;
      const existing = dedupedMappings.get(key);
      if (!existing || (existing.role !== 'primary' && mapping.role === 'primary')) {
        dedupedMappings.set(key, mapping);
      }
    }
    const mappingRows = [...dedupedMappings.values()].map((mapping) => ({
      exerciseId: mapping.exercise_id,
      muscleGroupId: mapping.muscle_group_id,
      role: mapping.role,
      weightFactor: mapping.weight_factor,
    }));
    for (const batch of chunk(mappingRows, CHUNK_SIZE)) {
      await tx.insert(exerciseMuscleMapping).values(batch);
    }

    // 4. Archive drift — a seeded row absent from this artifact is archived, never deleted:
    // personal_record.exercise_id and session_exercise.exercise_id are both notNull, and a hard
    // delete would break both (PITFALLS.md §11). Scoped to source='seed' AND user_id IS NULL, so
    // a user's own custom exercise can never be touched by this statement.
    const archiveWhere =
      exerciseIds.length > 0
        ? and(eq(exercise.source, 'seed'), isNull(exercise.userId), isNull(exercise.archivedAt), notInArray(exercise.id, exerciseIds))
        : and(eq(exercise.source, 'seed'), isNull(exercise.userId), isNull(exercise.archivedAt));
    const archived = await tx
      .update(exercise)
      .set({ archivedAt: new Date() })
      .where(archiveWhere)
      .returning({ id: exercise.id });

    return {
      muscleGroupCount: snapshot.muscle_groups.length,
      exerciseCount: snapshot.exercises.length,
      mappingCount: mappingRows.length,
      archivedCount: archived.length,
    };
  });
}

function main(): void {
  const artifactPath = resolve(__dirname, 'data/catalog-normalized.json');
  const snapshot: unknown = JSON.parse(readFileSync(artifactPath, 'utf-8'));

  seedCatalog(db, snapshot)
    .then((result) => {
      // eslint-disable-next-line no-console
      console.log(
        `Seeded ${result.exerciseCount} exercises, ${result.muscleGroupCount} muscle groups, ` +
          `${result.mappingCount} mappings (${result.archivedCount} prior seed row(s) archived as drift).`,
      );
      return pool.end();
    })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      pool.end().finally(() => process.exit(1));
    });
}

if (require.main === module) {
  main();
}
