import { resolve } from 'node:path';
import { config } from 'dotenv';

// Loaded here rather than in main.ts because TypeScript hoists every `import` above ordinary
// statements — a dotenv call in the entrypoint would run after this module had already read
// process.env. This module is the first thing AppModule imports, so loading here covers every
// entrypoint (nest start, drizzle-kit, jest) without each having to remember to do it.
config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] });

import { Global, Module } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { schema } from './schema';

export const DRIZZLE = Symbol('DRIZZLE');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema });

export type Database = typeof db;

@Global()
@Module({
  providers: [{ provide: DRIZZLE, useValue: db }],
  exports: [DRIZZLE],
})
export class DrizzleModule {}
