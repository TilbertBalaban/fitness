import { expect, test } from '@playwright/test';
import { DURABILITY_HARNESS_GLOBAL } from '../lib/db/test-support';

interface CatalogTableCounts {
  muscleGroup: number;
  seededExercise: number;
  exerciseMuscleMapping: number;
  catalogMeta: number;
}

interface CatalogLoadResult {
  status: 'loaded' | 'current' | 'invalid';
  catalogVersion?: string;
}

interface DurabilityHarness {
  openCatalogDb(): Promise<void>;
  loadCatalog(): Promise<CatalogLoadResult>;
  readCatalogTableCounts(): Promise<CatalogTableCounts>;
  readCatalogVersionRaw(): Promise<string | null>;
  writeCatalogVersionSentinel(sentinel: string): Promise<void>;
  crudCount(): Promise<number>;
}

// page.evaluate serializes the passed function's source text alone and re-evaluates it inside the
// page — it does not carry outer closures. Every callback below re-declares this lookup inline
// rather than calling a shared helper, matching durability.spec.ts's own established pattern.
type HarnessWindow = Record<string, DurabilityHarness>;

const EXPECTED_COUNTS: CatalogTableCounts = {
  muscleGroup: 19,
  seededExercise: 870,
  exerciseMuscleMapping: 3134,
  catalogMeta: 1,
};

const EXPECTED_VERSION = 'fb701c18b7999d47';

// Real @powersync/web database, real browser — the first end-to-end observation of the catalog
// write path on the real engine (see .planning/debug/exercise-catalog-load-failure.md's own
// stated blind spot). One test, two phases: each phase replays ~4,000 statements across the
// Worker boundary, and a second page.goto would pay the fresh-load cost twice.
test('the production catalog loader accepts every statement it issues against a real @powersync/web engine, and re-applying the same snapshot changes no row count', async ({
  page,
}) => {
  test.setTimeout(4 * 60 * 1000);

  await page.goto('/__durability');
  await page.waitForSelector('[data-testid="durability-harness-ready"]');

  await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].openCatalogDb(),
    DURABILITY_HARNESS_GLOBAL,
  );

  const firstLoadStart = Date.now();
  const firstResult = await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].loadCatalog(),
    DURABILITY_HARNESS_GLOBAL,
  );
  const firstLoadMs = Date.now() - firstLoadStart;
  // eslint-disable-next-line no-console
  console.log(`catalog-load.spec.ts: first fresh catalog load took ${firstLoadMs}ms`);

  expect(firstResult.status).toBe('loaded');
  expect(firstResult.catalogVersion).toBe(EXPECTED_VERSION);

  const firstCounts = await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].readCatalogTableCounts(),
    DURABILITY_HARNESS_GLOBAL,
  );
  expect(firstCounts).toEqual(EXPECTED_COUNTS);

  const firstQueueCount = await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].crudCount(),
    DURABILITY_HARNESS_GLOBAL,
  );
  expect(firstQueueCount).toBe(0);

  // Phase two — defeat the version-equality short circuit with a sentinel, then re-apply the same
  // snapshot over an already-populated database. This is the only coverage anywhere of the update
  // branch, and the only place the artifact's 43 duplicate mapping ids meet a real UNIQUE
  // constraint against a populated table.
  await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].writeCatalogVersionSentinel('sentinel-superseded'),
    DURABILITY_HARNESS_GLOBAL,
  );

  const secondResult = await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].loadCatalog(),
    DURABILITY_HARNESS_GLOBAL,
  );
  expect(secondResult.status).toBe('loaded');
  expect(secondResult.catalogVersion).toBe(EXPECTED_VERSION);

  const secondCounts = await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].readCatalogTableCounts(),
    DURABILITY_HARNESS_GLOBAL,
  );
  expect(secondCounts).toEqual(firstCounts);

  const secondQueueCount = await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].crudCount(),
    DURABILITY_HARNESS_GLOBAL,
  );
  expect(secondQueueCount).toBe(0);
});
