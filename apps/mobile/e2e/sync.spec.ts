import { execFileSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import { DURABILITY_HARNESS_GLOBAL } from '../lib/db/durability-harness-key';

// Same shared throwaway password apps/api's own e2e suites already use
// (apps/api/test/sync-push.e2e-spec.ts's PASSWORD constant) — never a real credential, never
// read from the repository.
const PASSWORD = 'correct-horse-battery-staple';
// Matches auth-storage.ts's own fallback default so a plain `pnpm --filter mobile test:e2e --
// --project=sync` run (no env override) targets the same place the app itself would.
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
// Matches .env.example's documented convention — not a personal credential. Overridden by an
// inline DATABASE_URL env var for any real local run.
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:dev@localhost:5432/fitness';
// session_exercise.exercise_id is a real FK against the seeded exercise catalog (session.ts) —
// unlike durability.spec.ts/schema-redefinition.spec.ts, this file's writes actually reach the
// server, so an arbitrary string here would be rejected invalid_field (poison-pill's FK case) and
// never drain. A permanently-seeded catalog row, not a throwaway one this file inserts/cleans up.
const SEED_EXERCISE_ID = 'seed-ex-back-squat';

interface DurabilityHarness {
  useProductionDb(): Promise<void>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  connectCurrent(): Promise<void>;
  disconnectCurrent(): Promise<void>;
  openVariant(variant: 'v1' | 'v2'): Promise<void>;
  reopenVariant(variant: 'v1' | 'v2'): Promise<boolean>;
  close(): Promise<void>;
  startSession(input: Record<string, never>): Promise<string>;
  addSessionExercise(input: {
    sessionId: string;
    exerciseId: string;
    orderIndex: number;
  }): Promise<string>;
  logSet(input: {
    sessionExerciseId: string;
    weight: { value: string | null; unit: 'kg' | 'lb' };
    reps: number;
  }): Promise<string>;
  readSets(sessionExerciseId: string): Promise<Array<Record<string, unknown>>>;
  readSetsRaw(sessionExerciseId: string): Promise<Array<Record<string, unknown>>>;
  crudCount(): Promise<number>;
}

// page.evaluate serializes the passed function's source text alone and re-evaluates it inside the
// page — every callback below re-declares this cast inline rather than sharing a helper (same
// constraint durability.spec.ts and schema-redefinition.spec.ts already document).
type HarnessWindow = Record<string, DurabilityHarness>;

// Uniqueness only, not a security-sensitive identifier — matches the Math.random-based generation
// already used elsewhere in this file's family (test-support.ts's dbFilename, id.ts, WINDOWS #18).
function freshEmail(tag: string): string {
  return `e2e-sync-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

// The one non-page-driven step in this file: creating the throwaway account over real HTTP,
// exactly as apps/api's own e2e suites do. Sign-IN, below, always drives the real screen — this
// function only ever calls sign-up, never sign-in, and never fabricates a session.
//
// Better Auth's origin check rejects a credentialed POST with no Origin header at all ("Missing or
// null Origin") — a plain Node fetch() does not send one the way a browser's fetch does, so this
// must be set explicitly to the same origin the real browser client runs from (auth.ts's
// WEB_ORIGINS default, matching this config's own baseURL).
async function createAccount(tag: string): Promise<string> {
  const email = freshEmail(tag);
  const res = await fetch(`${API_BASE_URL}/v1/auth/sign-up/email`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: process.env.EXPO_PUBLIC_WEB_APP_ORIGIN ?? 'http://localhost:8081',
    },
    body: JSON.stringify({ email, password: PASSWORD, name: `Sync E2E ${tag}` }),
  });
  if (!res.ok) {
    throw new Error(`sign-up failed for ${email}: ${res.status} ${await res.text()}`);
  }
  return email;
}

async function signInViaScreen(page: Page, email: string): Promise<void> {
  await page.goto('/sign-in');
  await page.getByLabel('Email', { exact: true }).fill(email);
  // exact: true — TextField's "Show password" toggle also carries "Password" in its accessible
  // name ("Show Password"/"Hide Password"), and getByLabel's default fuzzy match resolves both.
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  // Session-cookie presence, not a UI landmark — the sign-in screen belongs to the (auth) group
  // and __durability sits outside the Stack.Protected tree entirely, so there's no shared
  // post-sign-in element to wait on. The cookie is what fetchCredentials() will actually need.
  await expect(async () => {
    const cookies = await page.context().cookies();
    expect(cookies.some((cookie) => cookie.name === 'better-auth.session_token')).toBe(true);
  }).toPass({ timeout: 15_000 });
}

async function openHarnessOnProductionDb(page: Page): Promise<void> {
  await page.goto('/__durability');
  await page.waitForSelector('[data-testid="durability-harness-ready"]');
  await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].useProductionDb(),
    DURABILITY_HARNESS_GLOBAL,
  );
}

async function harnessConnect(page: Page): Promise<void> {
  await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].connect(),
    DURABILITY_HARNESS_GLOBAL,
  );
}

async function crudCount(page: Page): Promise<number> {
  return page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].crudCount(),
    DURABILITY_HARNESS_GLOBAL,
  );
}

async function startExercise(page: Page, exerciseId: string): Promise<string> {
  return page.evaluate(
    async ({ globalKey, exerciseId }) => {
      const harness = (window as unknown as HarnessWindow)[globalKey];
      const sessionId = await harness.startSession({});
      return harness.addSessionExercise({ sessionId, exerciseId, orderIndex: 0 });
    },
    { globalKey: DURABILITY_HARNESS_GLOBAL, exerciseId },
  );
}

async function logSet(
  page: Page,
  sessionExerciseId: string,
  weight: { value: string | null; unit: 'kg' | 'lb' },
  reps: number,
): Promise<string> {
  return page.evaluate(
    ({ globalKey, sessionExerciseId, weight, reps }) =>
      (window as unknown as HarnessWindow)[globalKey].logSet({ sessionExerciseId, weight, reps }),
    { globalKey: DURABILITY_HARNESS_GLOBAL, sessionExerciseId, weight, reps },
  );
}

async function readSets(page: Page, sessionExerciseId: string): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(
    ({ globalKey, sessionExerciseId }) =>
      (window as unknown as HarnessWindow)[globalKey].readSets(sessionExerciseId),
    { globalKey: DURABILITY_HARNESS_GLOBAL, sessionExerciseId },
  );
}

// -tA (tuples-only, unaligned) is what makes a SQL NULL print as an empty string rather than the
// literal word "NULL" — the one property the null-weight case's assertion depends on to
// distinguish NULL from the string "0.000".
function pgQueryOne(sql: string): string {
  const output = execFileSync('psql', [DATABASE_URL, '-tAc', sql], { encoding: 'utf8' });
  return output.split('\n')[0]?.trim() ?? '';
}

function findPowerSyncContainerName(): string {
  const output = execFileSync(
    'docker',
    ['ps', '--filter', 'name=powersync', '--format', '{{.Names}}'],
    { encoding: 'utf8' },
  ).trim();
  const [name] = output.split('\n').filter(Boolean);
  if (!name) {
    throw new Error('No running PowerSync Service container found (docker ps --filter name=powersync)');
  }
  return name;
}

async function waitForPowerSyncLiveness(timeoutMs = 30_000): Promise<void> {
  const powerSyncUrl = process.env.POWERSYNC_URL ?? 'http://localhost:8080';
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${powerSyncUrl}/probes/liveness`);
      if (res.ok) return;
    } catch {
      // Not up yet — the container was just restarted.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`PowerSync Service did not become live again within ${timeoutMs}ms`);
}

// Roadmap criterion 1 (this file's headline claim), criterion 4's drain half, the browser half of
// WINDOWS #26 / 02-08's open checkpoint, and PLAT-08's null case through the real client — all
// against the live self-hosted PowerSync Service, the real API, and real Postgres. Nothing here
// stubs, mocks, or intercepts SyncConnector, apiFetch, or session-guard.ts (T-02-45..T-02-48).
test.describe('offline writes sync themselves, and two clients converge', () => {
  test('offline write, automatic drain: no user action between reconnect and the queue reaching Postgres', async ({
    page,
  }) => {
    const email = await createAccount('offline-drain');
    await signInViaScreen(page, email);
    await openHarnessOnProductionDb(page);
    await harnessConnect(page);

    await expect.poll(() => crudCount(page), { timeout: 15_000 }).toBe(0);

    await page.context().setOffline(true);

    const sessionExerciseId = await startExercise(page, SEED_EXERCISE_ID);
    const firstId = await logSet(page, sessionExerciseId, { value: '80', unit: 'kg' }, 8);
    const secondId = await logSet(page, sessionExerciseId, { value: '85', unit: 'kg' }, 6);

    const depthOffline = await crudCount(page);
    expect(depthOffline).toBeGreaterThan(0);

    const countBeforeReconnect = pgQueryOne(
      `SELECT count(*) FROM logged_set WHERE id = '${firstId}' OR id = '${secondId}'`,
    );
    expect(countBeforeReconnect).toBe('0');

    await page.context().setOffline(false);
    // drain-region:start
    await expect.poll(() => crudCount(page), { timeout: 30_000, intervals: [500] }).toBe(0);
    await expect
      .poll(
        () => pgQueryOne(`SELECT count(*) FROM logged_set WHERE id = '${firstId}' OR id = '${secondId}'`),
        { timeout: 30_000, intervals: [500] },
      )
      .toBe('2');
    // drain-region:end
  });

  test('null weight, full client path: a set logged with no weight while offline reaches Postgres as SQL NULL', async ({
    page,
  }) => {
    const email = await createAccount('null-weight');
    await signInViaScreen(page, email);
    await openHarnessOnProductionDb(page);
    await harnessConnect(page);
    await expect.poll(() => crudCount(page), { timeout: 15_000 }).toBe(0);

    await page.context().setOffline(true);
    const sessionExerciseId = await startExercise(page, SEED_EXERCISE_ID);
    const bodyweightSetId = await logSet(page, sessionExerciseId, { value: null, unit: 'kg' }, 15);
    const weightedSetId = await logSet(page, sessionExerciseId, { value: '20', unit: 'kg' }, 15);
    await page.context().setOffline(false);

    await expect.poll(() => crudCount(page), { timeout: 30_000, intervals: [500] }).toBe(0);
    await expect
      .poll(
        () =>
          pgQueryOne(
            `SELECT count(*) FROM logged_set WHERE id = '${bodyweightSetId}' OR id = '${weightedSetId}'`,
          ),
        { timeout: 30_000, intervals: [500] },
      )
      .toBe('2');

    const bodyweightWeight = pgQueryOne(`SELECT weight_kg FROM logged_set WHERE id = '${bodyweightSetId}'`);
    expect(bodyweightWeight).toBe(''); // psql -tA prints SQL NULL as an empty string
    expect(bodyweightWeight).not.toBe('0.000');

    const weightedWeight = pgQueryOne(`SELECT weight_kg FROM logged_set WHERE id = '${weightedSetId}'`);
    expect(weightedWeight).toBe('20.000');
  });

  test('post-redefinition drain: a crud queue that survived a client schema redefinition still pushes and drains', async ({
    page,
  }) => {
    const email = await createAccount('post-redef-drain');
    await signInViaScreen(page, email);

    await page.goto('/__durability');
    await page.waitForSelector('[data-testid="durability-harness-ready"]');
    await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].openVariant('v1'),
      DURABILITY_HARNESS_GLOBAL,
    );

    const sessionExerciseId = await startExercise(page, SEED_EXERCISE_ID);
    await page.evaluate(
      async ({ globalKey, sessionExerciseId }) => {
        const harness = (window as unknown as HarnessWindow)[globalKey];
        await harness.logSet({ sessionExerciseId, weight: { value: '70', unit: 'kg' }, reps: 5 });
        await harness.logSet({ sessionExerciseId, weight: { value: '75', unit: 'kg' }, reps: 5 });
      },
      { globalKey: DURABILITY_HARNESS_GLOBAL, sessionExerciseId },
    );

    await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].close(),
      DURABILITY_HARNESS_GLOBAL,
    );
    await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].reopenVariant('v2'),
      DURABILITY_HARNESS_GLOBAL,
    );

    const depthBeforeConnect = await crudCount(page);
    expect(depthBeforeConnect).toBeGreaterThan(0);

    await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].connectCurrent(),
      DURABILITY_HARNESS_GLOBAL,
    );

    await expect.poll(() => crudCount(page), { timeout: 30_000, intervals: [500] }).toBe(0);

    const pgCount = pgQueryOne(
      `SELECT count(*) FROM logged_set WHERE session_exercise_id = '${sessionExerciseId}'`,
    );
    expect(pgCount).toBe('2');

    await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].disconnectCurrent(),
      DURABILITY_HARNESS_GLOBAL,
    );
  });

  test('two clients converge: sets logged offline in two browser contexts both reach the other after reconnect', async ({
    browser,
  }) => {
    const email = await createAccount('converge');

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    try {
      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();

      await signInViaScreen(pageA, email);
      await signInViaScreen(pageB, email);

      await openHarnessOnProductionDb(pageA);
      await openHarnessOnProductionDb(pageB);
      await harnessConnect(pageA);
      await harnessConnect(pageB);

      await expect.poll(() => crudCount(pageA), { timeout: 15_000 }).toBe(0);
      await expect.poll(() => crudCount(pageB), { timeout: 15_000 }).toBe(0);

      await contextA.setOffline(true);
      await contextB.setOffline(true);

      const exerciseA = await startExercise(pageA, SEED_EXERCISE_ID);
      const exerciseB = await startExercise(pageB, SEED_EXERCISE_ID);

      const idA = await logSet(pageA, exerciseA, { value: '30', unit: 'kg' }, 12);
      const idB = await logSet(pageB, exerciseB, { value: '35', unit: 'kg' }, 10);

      await contextA.setOffline(false);
      await contextB.setOffline(false);

      await expect.poll(() => crudCount(pageA), { timeout: 30_000, intervals: [500] }).toBe(0);
      await expect.poll(() => crudCount(pageB), { timeout: 30_000, intervals: [500] }).toBe(0);

      const pushedCount = pgQueryOne(`SELECT count(*) FROM logged_set WHERE id = '${idA}' OR id = '${idB}'`);
      expect(pushedCount).toBe('2');

      // Pull: each context eventually reads the OTHER context's set through its OWN local
      // database, not only through Postgres — this is what proves convergence rather than push.
      await expect.poll(() => readSets(pageA, exerciseB), { timeout: 30_000, intervals: [1000] }).not.toEqual([]);
      await expect.poll(() => readSets(pageB, exerciseA), { timeout: 30_000, intervals: [1000] }).not.toEqual([]);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test('service down stays usable: a local write still succeeds and queues while the PowerSync Service is unreachable', async ({
    page,
  }) => {
    const email = await createAccount('service-down');
    await signInViaScreen(page, email);
    await openHarnessOnProductionDb(page);
    await harnessConnect(page);
    await expect.poll(() => crudCount(page), { timeout: 15_000 }).toBe(0);

    const containerName = findPowerSyncContainerName();
    execFileSync('docker', ['stop', containerName]);

    try {
      const sessionExerciseId = await startExercise(page, SEED_EXERCISE_ID);
      await logSet(page, sessionExerciseId, { value: '40', unit: 'kg' }, 10);

      const depth = await crudCount(page);
      expect(depth).toBeGreaterThan(0);
    } finally {
      execFileSync('docker', ['start', containerName]);
      await waitForPowerSyncLiveness();
    }
  });
});
