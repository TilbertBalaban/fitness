import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { expo } from '@better-auth/expo';
import { db } from '../db/drizzle.module';
import { schema } from '../db/schema';

const APP_SCHEME = 'fitness://';

// The web build is a browser client on a real origin, so it needs that origin trusted or Better
// Auth omits Access-Control-Allow-Credentials and every credentialed request fails CORS preflight.
// 8081 is the Expo web dev server; any other origin (a static export, a deployed domain) must be
// listed in WEB_ORIGINS. Native clients do not go through CORS — this is a web-only requirement,
// and forgetting it breaks exactly one of the three targets.
const WEB_ORIGINS = (process.env.WEB_ORIGINS ?? 'http://localhost:8081')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

export const AUTH_BASE_PATH = '/v1/auth';

// Better Auth hardcodes stricter per-path rules that override rateLimit.window/max: /sign-in and
// /sign-up get 3 requests per 10s per IP, /request-password-reset 3 per 60s. Only `customRules`,
// which it resolves last, can raise them. That default is the correct production setting, so it is
// left alone and only an explicit env override (used by the e2e suite, which drives many requests
// from one IP) loosens it. Unset in production => Better Auth's own defaults apply untouched.
const rateLimitOverride = process.env.AUTH_RATE_LIMIT_MAX
  ? {
      window: Number(process.env.AUTH_RATE_LIMIT_WINDOW ?? 60),
      max: Number(process.env.AUTH_RATE_LIMIT_MAX),
    }
  : undefined;

export const auth = betterAuth({
  baseURL: process.env.API_BASE_URL,
  basePath: AUTH_BASE_PATH,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: { enabled: true },
  plugins: [expo()],
  trustedOrigins: [APP_SCHEME, ...WEB_ORIGINS],
  session: {
    // Generous server-side floor so the server never independently expires a session the client is
    // still honouring under D-01. These are NOT the mechanism that implements D-01 — that branch is
    // client-side and arrives in plan 01-05 (01-RESEARCH.md Pitfall 2). Set here so the two halves
    // do not fight.
    expiresIn: 60 * 60 * 24 * 180,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    // Threat T-01-08. Enabled in every environment — a mitigation that is off outside production is
    // one nothing ever exercises.
    enabled: true,
    ...(rateLimitOverride
      ? { customRules: { '/sign-up/*': rateLimitOverride, '/sign-in/*': rateLimitOverride } }
      : {}),
  },
});
