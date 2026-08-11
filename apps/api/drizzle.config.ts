import { resolve } from 'node:path';
import { config } from 'dotenv';
import type { Config } from 'drizzle-kit';

// The workspace keeps one .env at the repository root; the local path is the per-app override.
config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] });

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
