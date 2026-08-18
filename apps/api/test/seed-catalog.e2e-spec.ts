import { resolve } from 'node:path';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';

config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] });

import { db, pool } from '../src/db/drizzle.module';
import { exercise, exerciseMuscleMapping, muscleGroup, user } from '../src/db/schema';
import { seedCatalog } from '../src/seed/seed-catalog';
import type { CatalogSnapshot } from '@fitness/api-contracts';

// seedCatalog's own archive-drift step (step 4) scans EVERY `exercise` row where
// source='seed' AND user_id IS NULL — not just the rows this test cares about. Running it
// directly against the shared dev database would archive the real ~870-row seeded catalog the
// moment a test snapshot omits most of it. Every test below therefore runs seedCatalog against a
// transaction/savepoint that is deliberately never committed (a thrown sentinel forces Postgres to
// roll the whole thing back), so this suite can freely exercise archive-drift, rename-in-place and
// idempotency without touching — even transiently-but-persistently — any row this suite didn't
// create. drizzle-orm's PgTransaction implements nested `db.transaction()` calls as real SAVEPOINTs
// on node-postgres, so seedCatalog's own internal `database.transaction(...)` call nests cleanly
// inside this outer one.
class RollbackSentinel extends Error {}

async function withRollback<T>(fn: (tx: typeof db) => Promise<T>): Promise<T> {
  let captured: T | undefined;
  try {
    await db.transaction(async (tx) => {
      captured = await fn(tx as unknown as typeof db);
      throw new RollbackSentinel('test-only rollback — not a real failure');
    });
  } catch (err) {
    if (!(err instanceof RollbackSentinel)) throw err;
  }
  return captured as T;
}

const RUN = `st${Date.now()}`;

function snapshot(overrides: Partial<CatalogSnapshot>): CatalogSnapshot {
  return {
    catalog_version: `${RUN}-v1`,
    generated_at: '2026-01-01T00:00:00.000Z',
    muscle_groups: [
      { id: 'chest', name: 'Chest', body_region: 'chest' },
      { id: 'triceps', name: 'Triceps', body_region: 'arms' },
    ],
    exercises: [],
    mappings: [],
    ...overrides,
  };
}

function exerciseFixture(id: string, name: string): CatalogSnapshot['exercises'][number] {
  return {
    id,
    name,
    aliases: null,
    movement_pattern: 'horizontal_push',
    equipment_required: 'barbell',
    load_type: 'external_weight',
    unilateral: false,
    instructions_text: null,
    cue_text: null,
    image_urls: [],
    bodyweight_contribution_pct: null,
    variation_of_id: null,
    source: 'seed',
  };
}

afterAll(async () => {
  await pool.end();
});

describe('seedCatalog (e2e, rolled back — never commits against the shared dev database)', () => {
  it('inserts exactly the artifact muscle-group, exercise and mapping counts on an empty starting point', async () => {
    await withRollback(async (tx) => {
      const idA = `${RUN}-a`;
      const idB = `${RUN}-b`;
      const snap = snapshot({
        exercises: [exerciseFixture(idA, 'Test Bench Press'), exerciseFixture(idB, 'Test Overhead Press')],
        mappings: [
          { exercise_id: idA, muscle_group_id: 'chest', role: 'primary', weight_factor: '1.00' },
          { exercise_id: idA, muscle_group_id: 'triceps', role: 'secondary', weight_factor: '0.50' },
          { exercise_id: idB, muscle_group_id: 'triceps', role: 'primary', weight_factor: '1.00' },
        ],
      });

      const result = await seedCatalog(tx, snap);

      expect(result.exerciseCount).toBe(2);
      expect(result.muscleGroupCount).toBe(2);
      expect(result.mappingCount).toBe(3);

      const exerciseRows = await tx.select().from(exercise).where(eq(exercise.id, idA));
      expect(exerciseRows).toHaveLength(1);
      expect(exerciseRows[0].source).toBe('seed');
      expect(exerciseRows[0].isCustom).toBe(false);
      expect(exerciseRows[0].userId).toBeNull();

      const mappingRows = await tx.select().from(exerciseMuscleMapping).where(eq(exerciseMuscleMapping.exerciseId, idA));
      expect(mappingRows).toHaveLength(2);
    });
  });

  it('is idempotent: seeding the same artifact twice leaves identical row counts and contents', async () => {
    await withRollback(async (tx) => {
      const idA = `${RUN}-idem-a`;
      const snap = snapshot({
        exercises: [exerciseFixture(idA, 'Idempotent Row')],
        mappings: [{ exercise_id: idA, muscle_group_id: 'chest', role: 'primary', weight_factor: '1.00' }],
      });

      await seedCatalog(tx, snap);
      const [firstRow] = await tx.select().from(exercise).where(eq(exercise.id, idA));
      const firstMappings = await tx.select().from(exerciseMuscleMapping).where(eq(exerciseMuscleMapping.exerciseId, idA));

      const second = await seedCatalog(tx, snap);
      const [secondRow] = await tx.select().from(exercise).where(eq(exercise.id, idA));
      const secondMappings = await tx.select().from(exerciseMuscleMapping).where(eq(exerciseMuscleMapping.exerciseId, idA));

      expect(second.exerciseCount).toBe(1);
      expect(secondRow).toEqual(firstRow);
      expect(secondMappings).toEqual(firstMappings);
      expect(secondMappings).toHaveLength(1);
    });
  });

  it('leaves a pre-existing user-owned custom exercise byte-identical', async () => {
    await withRollback(async (tx) => {
      const userId = `${RUN}-user`;
      const customId = `${RUN}-custom`;
      await tx.insert(user).values({ id: userId, name: 'Seed Test User', email: `${RUN}@example.com` });
      await tx.insert(exercise).values({
        id: customId,
        userId,
        name: 'My Custom Curl',
        loadType: 'external_weight',
        unilateral: false,
        isCustom: true,
        source: 'custom',
      });
      const [before] = await tx.select().from(exercise).where(eq(exercise.id, customId));

      const idA = `${RUN}-custom-adjacent`;
      await seedCatalog(tx, snapshot({ exercises: [exerciseFixture(idA, 'Adjacent Seed Row')] }));

      const [after] = await tx.select().from(exercise).where(eq(exercise.id, customId));
      expect(after).toEqual(before);
    });
  });

  it('updates a renamed row in place, keeping its id — never inserts a second row for a rename', async () => {
    await withRollback(async (tx) => {
      const id = `${RUN}-rename`;
      await seedCatalog(tx, snapshot({ exercises: [exerciseFixture(id, 'Original Name')] }));
      const [before] = await tx.select().from(exercise).where(eq(exercise.id, id));

      const renamed = { ...exerciseFixture(id, 'Original Name'), name: 'Renamed Exercise' };
      await seedCatalog(tx, snapshot({ exercises: [renamed] }));
      const rows = await tx.select().from(exercise).where(eq(exercise.id, id));

      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(before.id);
      expect(rows[0].name).toBe('Renamed Exercise');
    });
  });

  it('archives (never deletes) a seeded row that disappears from a newer artifact, and does not un-archive it on a later re-seed', async () => {
    await withRollback(async (tx) => {
      const staying = `${RUN}-stays`;
      const vanishing = `${RUN}-vanishes`;
      await seedCatalog(
        tx,
        snapshot({
          exercises: [exerciseFixture(staying, 'Stays'), exerciseFixture(vanishing, 'Vanishes Next Run')],
        }),
      );

      const secondRun = await seedCatalog(tx, snapshot({ exercises: [exerciseFixture(staying, 'Stays')] }));
      expect(secondRun.archivedCount).toBeGreaterThanOrEqual(1);

      const [vanishedRow] = await tx.select().from(exercise).where(eq(exercise.id, vanishing));
      expect(vanishedRow).toBeDefined(); // archived, not deleted
      expect(vanishedRow.archivedAt).not.toBeNull();

      const [stayingRow] = await tx.select().from(exercise).where(eq(exercise.id, staying));
      expect(stayingRow.archivedAt).toBeNull();

      // Re-seeding the same (now-absent) row's id again is not exercised here — the vanished id
      // simply never appears in a subsequent artifact in production. What matters is that a
      // *different* row's re-seed does not touch archivedAt on this already-archived one.
      await seedCatalog(tx, snapshot({ exercises: [exerciseFixture(staying, 'Stays Renamed Again')] }));
      const [stillArchived] = await tx.select().from(exercise).where(eq(exercise.id, vanishing));
      expect(stillArchived.archivedAt).not.toBeNull();
    });
  });

  it('rejects an artifact that fails isCatalogSnapshot and writes nothing', async () => {
    await withRollback(async (tx) => {
      // A run-unique muscle-group id, not one of the 19 real canonical ids (e.g. 'chest') — those
      // are expected to already exist from a real, previously-committed seed run in this shared dev
      // database, so asserting their absence would be a false failure unrelated to this test.
      const bogusGroupId = `${RUN}-bogus-group`;
      const malformed = {
        ...snapshot({
          muscle_groups: [{ id: bogusGroupId as never, name: 'Bogus', body_region: 'chest' }],
        }),
        catalog_version: '',
      };

      await expect(seedCatalog(tx, malformed)).rejects.toThrow();

      const rows = await tx.select().from(muscleGroup).where(eq(muscleGroup.id, bogusGroupId));
      expect(rows).toHaveLength(0);
    });
  });

  it('never issues a hard DELETE against the exercise table (source inspection)', () => {
    // Structural guard mirroring the plan's own acceptance criterion — asserted here too so a
    // regression shows up in the test suite, not only in a separate grep-based check.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('node:fs') as typeof import('node:fs');
    const source = fs
      .readFileSync(resolve(__dirname, '../src/seed/seed-catalog.ts'), 'utf-8')
      .split('\n')
      .filter((line: string) => !line.trim().startsWith('//'))
      .join('\n');
    expect(source).not.toMatch(/delete\(exercise\)/);
  });
});
