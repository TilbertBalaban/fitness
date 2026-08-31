import { expect, test } from '@playwright/test';
import { DURABILITY_HARNESS_GLOBAL } from '../lib/db/durability-harness-key';

interface RawProgressPhoto {
  id: string;
  user_id: string;
  taken_at: string;
  timezone: string;
  local_date: string;
  storage_key: string;
  note: string | null;
}

interface ProgressPhotoHarness {
  open(): Promise<void>;
  seedProgressPhoto(input: { storageKey: string; note?: string | null; localDate?: string }): Promise<string>;
  readProgressPhotos(): Promise<RawProgressPhoto[]>;
  putPhotoBytes(key: string, bytes: number[]): Promise<void>;
  hasPhotoBytes(key: string): Promise<boolean>;
  savePhotoFromBytes(input: { bytes: number[]; note?: string | null }): Promise<string>;
}

// page.evaluate serializes the passed function's source text alone and re-evaluates it inside the
// page — it carries no outer closures, matching every other e2e spec in this directory.
type HarnessWindow = Record<string, ProgressPhotoHarness>;

// A tiny, deterministic byte payload — this suite proves the storage plumbing, not JPEG validity.
const PHOTO_BYTES_A = [1, 2, 3, 4, 5];
const PHOTO_BYTES_B = [9, 8, 7, 6, 5, 4];

async function boot(page: import('@playwright/test').Page) {
  await page.goto('/__durability');
  await page.waitForSelector('[data-testid="durability-harness-ready"]');
  await page.evaluate((globalKey) => (window as unknown as HarnessWindow)[globalKey].open(), DURABILITY_HARNESS_GLOBAL);
}

// Real @powersync/web database, real browser, real IndexedDB-backed photo-store.web.ts — the
// whole putPhotoBytes/hasPhotoBytes/savePhoto chain runs unmocked here (12-03, D-15/D-16/D-17).
test.describe('progress photos — capture-store-read round trip (BODY-04)', () => {
  test('bytes written for a key are readable back for that key', async ({ page }) => {
    await boot(page);

    const key = 'progress-photo/round-trip.jpg';
    await page.evaluate(
      ({ globalKey, key, bytes }) => (window as unknown as HarnessWindow)[globalKey].putPhotoBytes(key, bytes),
      { globalKey: DURABILITY_HARNESS_GLOBAL, key, bytes: PHOTO_BYTES_A },
    );

    const present = await page.evaluate(
      ({ globalKey, key }) => (window as unknown as HarnessWindow)[globalKey].hasPhotoBytes(key),
      { globalKey: DURABILITY_HARNESS_GLOBAL, key },
    );
    expect(present).toBe(true);
  });

  test('savePhoto produces exactly one progress_photo row whose storage_key matches its stored bytes', async ({ page }) => {
    await boot(page);

    const id = await page.evaluate(
      ({ globalKey, bytes }) => (window as unknown as HarnessWindow)[globalKey].savePhotoFromBytes({ bytes, note: 'after week 1' }),
      { globalKey: DURABILITY_HARNESS_GLOBAL, bytes: PHOTO_BYTES_A },
    );

    const rows = await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].readProgressPhotos(),
      DURABILITY_HARNESS_GLOBAL,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(id);
    expect(rows[0].note).toBe('after week 1');

    const present = await page.evaluate(
      ({ globalKey, key }) => (window as unknown as HarnessWindow)[globalKey].hasPhotoBytes(key),
      { globalKey: DURABILITY_HARNESS_GLOBAL, key: rows[0].storage_key },
    );
    expect(present).toBe(true);
  });

  test('two captures in the same session produce two rows with two distinct storage keys, both readable (idempotency edge)', async ({
    page,
  }) => {
    await boot(page);

    const firstId = await page.evaluate(
      ({ globalKey, bytes }) => (window as unknown as HarnessWindow)[globalKey].savePhotoFromBytes({ bytes }),
      { globalKey: DURABILITY_HARNESS_GLOBAL, bytes: PHOTO_BYTES_A },
    );
    const secondId = await page.evaluate(
      ({ globalKey, bytes }) => (window as unknown as HarnessWindow)[globalKey].savePhotoFromBytes({ bytes }),
      { globalKey: DURABILITY_HARNESS_GLOBAL, bytes: PHOTO_BYTES_B },
    );
    expect(firstId).not.toBe(secondId);

    const rows = await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].readProgressPhotos(),
      DURABILITY_HARNESS_GLOBAL,
    );
    expect(rows).toHaveLength(2);
    const keys = rows.map((row) => row.storage_key);
    expect(new Set(keys).size).toBe(2);

    for (const key of keys) {
      const present = await page.evaluate(
        ({ globalKey, key }) => (window as unknown as HarnessWindow)[globalKey].hasPhotoBytes(key),
        { globalKey: DURABILITY_HARNESS_GLOBAL, key },
      );
      expect(present).toBe(true);
    }
  });

  test('hasPhotoBytes returns false for a row seeded without bytes (the R27 device-absent precondition)', async ({ page }) => {
    await boot(page);

    await page.evaluate(
      (globalKey) =>
        (window as unknown as HarnessWindow)[globalKey].seedProgressPhoto({ storageKey: 'progress-photo/other-device.jpg' }),
      DURABILITY_HARNESS_GLOBAL,
    );

    const present = await page.evaluate(
      ({ globalKey, key }) => (window as unknown as HarnessWindow)[globalKey].hasPhotoBytes(key),
      { globalKey: DURABILITY_HARNESS_GLOBAL, key: 'progress-photo/other-device.jpg' },
    );
    expect(present).toBe(false);

    const rows = await page.evaluate(
      (globalKey) => (window as unknown as HarnessWindow)[globalKey].readProgressPhotos(),
      DURABILITY_HARNESS_GLOBAL,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].storage_key).toBe('progress-photo/other-device.jpg');
  });
});
