import { resolve } from 'node:path';
import { config } from 'dotenv';
import { Client } from 'pg';

config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] });

// This gate exists because typecheck and build pass whether or not the database was ever migrated:
// the TypeScript types come from schema.ts, not from the live server. Without this, an unmigrated
// database is a false-positive green across the whole suite. Grows with the barrel — every table
// declared in apps/api/src/db/schema.ts's `schema` object must be named here.
const REQUIRED_TABLES = [
  'user',
  'session',
  'account',
  'verification',
  'workout_session',
  'session_exercise',
  'logged_set',
  'muscle_group',
  'exercise',
  'exercise_muscle_mapping',
  'user_exercise_preference',
  'equipment_profile',
  'routine',
  'routine_day',
  'routine_exercise',
  'personal_record',
  'body_metric',
  'progress_photo',
  'user_preference',
  'sync_conflict_log',
  'sync_tombstone',
] as const;

// Snake-case, as emitted into schema.ts — the Drizzle property names are camelCase but the DB
// columns are not, and asserting the TS names would pass against a database that has none of them.
const REQUIRED_USER_COLUMNS = ['id', 'email', 'email_verified'] as const;

// Per-table required-column maps, covering the columns whose absence would be silent — a
// TypeScript type mismatch here would still compile, so only a live-database read catches it.
const REQUIRED_COLUMNS: Record<string, readonly string[]> = {
  workout_session: ['id', 'user_id', 'started_at', 'timezone', 'local_date', 'server_seq'],
  logged_set: ['id', 'session_exercise_id', 'set_index', 'weight_kg', 'reps', 'completed', 'parent_set_id'],
  session_exercise: ['id', 'session_id', 'target_sets', 'target_rep_min', 'target_rep_max', 'superset_group_id'],
  user_preference: ['id', 'user_id', 'weight_unit', 'active_routine_id', 'server_seq'],
  routine: ['id', 'user_id', 'name', 'status', 'source', 'archived_at', 'progression_frozen', 'server_seq'],
  exercise: [
    'id',
    'user_id',
    'load_type',
    'bodyweight_contribution_pct',
    'archived_at',
    'is_custom',
    'variation_of_id',
    'source',
  ],
  user_exercise_preference: ['id', 'user_id', 'exercise_id', 'archived_at', 'never_suggest', 'updated_at', 'server_seq'],
};

let pg: Client;

beforeAll(async () => {
  pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();
}, 30000);

afterAll(async () => {
  if (pg) await pg.end();
});

describe('Schema parity (e2e)', () => {
  it('has every table schema.ts declares present in the live database', async () => {
    const { rows } = await pg.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );

    // Assert the query returned something at all before comparing sets — an empty result compared
    // against an empty expectation would pass while proving nothing.
    expect(rows.length).toBeGreaterThan(0);

    const present = new Set(rows.map((r) => r.table_name));
    for (const table of REQUIRED_TABLES) {
      expect(present.has(table)).toBe(true);
    }
  });

  it('has every required column on the user table', async () => {
    const { rows } = await pg.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'user'`,
    );

    expect(rows.length).toBeGreaterThan(0);

    const present = new Set(rows.map((r) => r.column_name));
    for (const column of REQUIRED_USER_COLUMNS) {
      expect(present.has(column)).toBe(true);
    }
  });

  it.each(Object.entries(REQUIRED_COLUMNS))('has every required column on %s', async (table, columns) => {
    const { rows } = await pg.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1`,
      [table],
    );

    expect(rows.length).toBeGreaterThan(0);

    const present = new Set(rows.map((r) => r.column_name));
    for (const column of columns) {
      expect(present.has(column)).toBe(true);
    }
  });

  it('stores logged_set.weight_kg as numeric, never a binary float', async () => {
    // A column silently created as double precision would satisfy every TypeScript type in the
    // repository while making D-04's no-drift guarantee false — this is the only place that can
    // catch it.
    const { rows } = await pg.query<{ data_type: string }>(
      `SELECT data_type FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'logged_set' AND column_name = 'weight_kg'`,
    );

    expect(rows.length).toBe(1);
    expect(rows[0].data_type).toBe('numeric');
  });

  it('enforces email uniqueness at the database level, not only in application code', async () => {
    // The concurrent-sign-up guarantee in auth.e2e-spec.ts rests on this constraint existing.
    const { rows } = await pg.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'user'`,
    );

    const hasUniqueEmail = rows.some(
      (r) => r.indexdef.includes('UNIQUE') && /\(email\)/.test(r.indexdef),
    );
    expect(hasUniqueEmail).toBe(true);
  });

  it('exercise_load_type_check exists and names all six load-type literals', async () => {
    // A CHECK that exists but lists five values would otherwise pass silently — asserting the
    // constraint's own definition, not just its presence in pg_constraint, is what has teeth.
    const { rows } = await pg.query<{ definition: string }>(
      `SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname = $1`,
      ['exercise_load_type_check'],
    );

    expect(rows.length).toBe(1);
    const definition = rows[0].definition;
    for (const literal of [
      'external_weight',
      'bodyweight',
      'bodyweight_plus_added',
      'assisted',
      'time_based',
      'distance_based',
    ]) {
      expect(definition).toContain(literal);
    }
  });

  it('rejects an exercise row with an out-of-vocabulary load_type at the database level', async () => {
    // Proves the constraint has teeth, not merely exists — a direct pg insert bypasses
    // sync.service.ts's application-level validator entirely, which is exactly the path the seed
    // script and any future direct-DB tooling take.
    const badId = `schema-parity-bogus-load-type-${Date.now()}`;
    await expect(
      pg.query(`INSERT INTO exercise (id, name, load_type, source) VALUES ($1, $2, $3, $4)`, [
        badId,
        'Schema Parity Bogus Load Type',
        'bogus',
        'test',
      ]),
    ).rejects.toThrow();

    const validId = `schema-parity-valid-load-type-${Date.now()}`;
    await pg.query(`INSERT INTO exercise (id, name, load_type, source) VALUES ($1, $2, $3, $4)`, [
      validId,
      'Schema Parity Valid Load Type',
      'external_weight',
      'test',
    ]);
    await pg.query(`DELETE FROM exercise WHERE id = $1`, [validId]);
  });

  it('rejects a routine row with status outside draft/ready at the database level, and accepts ready', async () => {
    // Proves routine_status_check has teeth, not merely exists — mirrors the exercise_load_type_check
    // case above. A direct pg insert bypasses sync.service.ts's validator entirely, which is exactly
    // the path the seed script and any future direct-DB tooling take.
    const { rows: users } = await pg.query<{ id: string }>(`SELECT id FROM "user" LIMIT 1`);
    if (users.length === 0) {
      throw new Error('schema-parity: no user row exists to attach a test routine to — seed the database first');
    }
    const userId = users[0].id;

    const badId = `schema-parity-bogus-status-${Date.now()}`;
    await expect(
      pg.query(`INSERT INTO routine (id, user_id, name, status, source) VALUES ($1, $2, $3, $4, $5)`, [
        badId,
        userId,
        'Schema Parity Bogus Status',
        'active',
        'test',
      ]),
    ).rejects.toThrow();

    const validId = `schema-parity-valid-status-${Date.now()}`;
    await pg.query(`INSERT INTO routine (id, user_id, name, status, source) VALUES ($1, $2, $3, $4, $5)`, [
      validId,
      userId,
      'Schema Parity Valid Status',
      'ready',
      'test',
    ]);
    await pg.query(`DELETE FROM routine WHERE id = $1`, [validId]);
  });

  it('user_preference has a single-column primary key, and a second row for the same user_id is rejected', async () => {
    const { rows: pkRows } = await pg.query<{ column_name: string }>(
      `SELECT kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
       WHERE tc.table_schema = 'public' AND tc.table_name = 'user_preference' AND tc.constraint_type = 'PRIMARY KEY'`,
    );
    expect(pkRows.length).toBe(1);
    expect(pkRows[0].column_name).toBe('id');

    const { rows: users } = await pg.query<{ id: string }>(`SELECT id FROM "user" LIMIT 1`);
    if (users.length === 0) {
      throw new Error('schema-parity: no user row exists to attach a test user_preference to — seed the database first');
    }
    const userId = users[0].id;

    const { rows: existing } = await pg.query(`SELECT id FROM user_preference WHERE user_id = $1`, [userId]);
    if (existing.length > 0) {
      // A real preference row already exists for this user (e.g. the corpus seed) — the uniqueness
      // assertion below still holds against it, no need to insert a first row ourselves.
      const dupeId = `schema-parity-dupe-pref-${Date.now()}`;
      await expect(
        pg.query(`INSERT INTO user_preference (id, user_id, weight_unit) VALUES ($1, $2, $3)`, [
          dupeId,
          userId,
          'kg',
        ]),
      ).rejects.toThrow();
      return;
    }

    const firstId = `schema-parity-pref-${Date.now()}`;
    await pg.query(`INSERT INTO user_preference (id, user_id, weight_unit) VALUES ($1, $2, $3)`, [
      firstId,
      userId,
      'kg',
    ]);
    const secondId = `schema-parity-pref-dupe-${Date.now()}`;
    await expect(
      pg.query(`INSERT INTO user_preference (id, user_id, weight_unit) VALUES ($1, $2, $3)`, [
        secondId,
        userId,
        'kg',
      ]),
    ).rejects.toThrow();
    await pg.query(`DELETE FROM user_preference WHERE id = $1`, [firstId]);
  });
});
