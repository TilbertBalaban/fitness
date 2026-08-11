import { resolve } from 'node:path';
import { config } from 'dotenv';
import { Client } from 'pg';

config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] });

// This gate exists because typecheck and build pass whether or not the database was ever migrated:
// the TypeScript types come from schema.ts, not from the live server. Without this, an unmigrated
// database is a false-positive green across the whole suite.
const REQUIRED_TABLES = ['user', 'session', 'account', 'verification'] as const;

// Snake-case, as emitted into schema.ts — the Drizzle property names are camelCase but the DB
// columns are not, and asserting the TS names would pass against a database that has none of them.
const REQUIRED_USER_COLUMNS = ['id', 'email', 'email_verified'] as const;

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
});
