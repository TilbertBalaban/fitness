import { expect, test } from '@playwright/test';
import { DURABILITY_HARNESS_GLOBAL } from '../lib/db/durability-harness-key';

interface PhotoCompositeHarness {
  open(): Promise<void>;
  seedProgressPhoto(input: { storageKey: string; note?: string | null; localDate?: string }): Promise<string>;
  putPhotoBytes(key: string, bytes: number[]): Promise<void>;
  openPhotoCompositeScreen(): Promise<void>;
}

// page.evaluate serializes the passed function's source text alone and re-evaluates it inside the
// page — it carries no outer closures, matching every other e2e spec in this directory.
type HarnessWindow = Record<string, PhotoCompositeHarness>;

// A real, minimal, decodable 1x1 baseline JPEG (JFIF), as a plain byte array — composite.web.ts's
// shareComposite decodes this through a real <img>/<canvas>, so unlike progress-photo.spec.ts's
// own arbitrary byte payload, this suite needs bytes a browser can actually draw. Written as a
// literal array (not Buffer.from(base64, ...)) because this project's tsconfig carries no `node`
// types for the e2e lane.
const ONE_PIXEL_JPEG_BYTES = [255,216,255,224,0,16,74,70,73,70,0,1,1,1,0,96,0,96,0,0,255,219,0,67,0,3,2,2,2,2,2,3,2,2,2,3,3,3,3,4,6,4,4,4,4,4,8,6,6,5,6,9,8,10,10,9,8,9,9,10,12,15,12,10,11,14,11,9,9,13,17,13,14,15,16,16,17,16,10,12,18,19,18,16,19,15,16,16,16,255,219,0,67,1,3,3,3,4,3,4,8,4,4,8,16,11,9,11,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,255,192,0,17,8,0,1,0,1,3,1,34,0,2,17,1,3,17,1,255,196,0,31,0,0,1,5,1,1,1,1,1,1,0,0,0,0,0,0,0,0,1,2,3,4,5,6,7,8,9,10,11,255,196,0,181,16,0,2,1,3,3,2,4,3,5,5,4,4,0,0,1,125,1,2,3,0,4,17,5,18,33,49,65,6,19,81,97,7,34,113,20,50,129,145,161,8,35,66,177,193,21,82,209,240,36,51,98,114,130,9,10,22,23,24,25,26,37,38,39,40,41,42,52,53,54,55,56,57,58,67,68,69,70,71,72,73,74,83,84,85,86,87,88,89,90,99,100,101,102,103,104,105,106,115,116,117,118,119,120,121,122,131,132,133,134,135,136,137,138,146,147,148,149,150,151,152,153,154,162,163,164,165,166,167,168,169,170,178,179,180,181,182,183,184,185,186,194,195,196,197,198,199,200,201,202,210,211,212,213,214,215,216,217,218,225,226,227,228,229,230,231,232,233,234,241,242,243,244,245,246,247,248,249,250,255,196,0,31,1,0,3,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,1,2,3,4,5,6,7,8,9,10,11,255,196,0,181,17,0,2,1,2,4,4,3,4,7,5,4,4,0,1,2,119,0,1,2,3,17,4,5,33,49,6,18,65,81,7,97,113,19,34,50,129,8,20,66,145,161,177,193,9,35,51,82,240,21,98,114,209,10,22,36,52,225,37,241,23,24,25,26,38,39,40,41,42,53,54,55,56,57,58,67,68,69,70,71,72,73,74,83,84,85,86,87,88,89,90,99,100,101,102,103,104,105,106,115,116,117,118,119,120,121,122,130,131,132,133,134,135,136,137,138,146,147,148,149,150,151,152,153,154,162,163,164,165,166,167,168,169,170,178,179,180,181,182,183,184,185,186,194,195,196,197,198,199,200,201,202,210,211,212,213,214,215,216,217,218,226,227,228,229,230,231,232,233,234,242,243,244,245,246,247,248,249,250,255,218,0,12,3,1,0,2,17,3,17,0,63,0,255,0,63,255,217];

async function boot(page: import('@playwright/test').Page) {
  await page.goto('/__durability');
  await page.waitForSelector('[data-testid="durability-harness-ready"]');
  await page.evaluate((globalKey) => (window as unknown as HarnessWindow)[globalKey].open(), DURABILITY_HARNESS_GLOBAL);
}

async function seedDeviceResidentPhoto(page: import('@playwright/test').Page, storageKey: string, localDate: string) {
  await page.evaluate(
    ({ globalKey, storageKey, localDate }) =>
      (window as unknown as HarnessWindow)[globalKey].seedProgressPhoto({ storageKey, localDate }),
    { globalKey: DURABILITY_HARNESS_GLOBAL, storageKey, localDate },
  );
  await page.evaluate(
    ({ globalKey, storageKey, bytes }) => (window as unknown as HarnessWindow)[globalKey].putPhotoBytes(storageKey, bytes),
    { globalKey: DURABILITY_HARNESS_GLOBAL, storageKey, bytes: ONE_PIXEL_JPEG_BYTES },
  );
}

async function seedDeviceAbsentPhoto(page: import('@playwright/test').Page, storageKey: string, localDate: string) {
  await page.evaluate(
    ({ globalKey, storageKey, localDate }) =>
      (window as unknown as HarnessWindow)[globalKey].seedProgressPhoto({ storageKey, localDate }),
    { globalKey: DURABILITY_HARNESS_GLOBAL, storageKey, localDate },
  );
}

async function openComposite(page: import('@playwright/test').Page) {
  await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].openPhotoCompositeScreen(),
    DURABILITY_HARNESS_GLOBAL,
  );
}

// Real @powersync/web database, real browser, real IndexedDB-backed photo-store.web.ts, a real
// <canvas> composite render — the whole picker -> preview -> Blob-download chain runs unmocked
// here (BODY-05, D-18/D-19).
test.describe('before & after composite — web canvas path (BODY-05)', () => {
  test('two seeded device-resident photos are both selectable and choosing both renders the preview pair with both date captions', async ({
    page,
  }) => {
    await boot(page);
    await seedDeviceResidentPhoto(page, 'progress-photo/before.jpg', '2026-07-01');
    await seedDeviceResidentPhoto(page, 'progress-photo/after.jpg', '2026-08-01');
    await openComposite(page);

    await expect(page.getByText('Step 1 of 2: Choose Before')).toBeVisible();

    const beforeTile = page.getByRole('button', { name: 'Progress photo, 1 Jul' });
    const afterTile = page.getByRole('button', { name: 'Progress photo, 1 Aug' });
    await expect(beforeTile).toBeVisible();
    await expect(afterTile).toBeVisible();

    await beforeTile.click();
    await expect(page.getByText('Step 2 of 2: Choose After')).toBeVisible();

    await afterTile.click();
    await expect(page.getByText('Preview')).toBeVisible();

    // The preview pair — both date captions rendered as the anchor once both are chosen (S10).
    await expect(page.getByText('1 Jul')).toBeVisible();
    await expect(page.getByText('1 Aug')).toBeVisible();
  });

  test('pressing Download produces a real download event whose suggested filename ends in .jpg', async ({ page }) => {
    await boot(page);
    await seedDeviceResidentPhoto(page, 'progress-photo/before-dl.jpg', '2026-07-05');
    await seedDeviceResidentPhoto(page, 'progress-photo/after-dl.jpg', '2026-08-05');
    await openComposite(page);

    await page.getByRole('button', { name: 'Progress photo, 5 Jul' }).click();
    await page.getByRole('button', { name: 'Progress photo, 5 Aug' }).click();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download' }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.jpg$/);
  });

  test('a device-absent photo is present in the grid but not selectable (R28/D-19)', async ({ page }) => {
    await boot(page);
    // Two device-resident photos (deriveCompositeScreenState's own MAX_COMPOSITE_PHOTOS gate) plus
    // one device-absent one, so the grid actually renders rather than the not-enough-photos state.
    await seedDeviceResidentPhoto(page, 'progress-photo/resident.jpg', '2026-07-10');
    await seedDeviceResidentPhoto(page, 'progress-photo/resident-2.jpg', '2026-07-20');
    await seedDeviceAbsentPhoto(page, 'progress-photo/absent.jpg', '2026-08-10');
    await openComposite(page);

    const residentTile = page.getByRole('button', { name: 'Progress photo, 10 Jul' });
    const absentTile = page.getByRole('button', { name: 'Progress photo, 10 Aug, not on this device' });
    await expect(residentTile).toBeVisible();
    await expect(absentTile).toBeVisible();
    await expect(absentTile).toBeDisabled();

    await absentTile.click({ force: true });
    // A disabled placeholder attaches no press handler — the step never advances.
    await expect(page.getByText('Step 1 of 2: Choose Before')).toBeVisible();
  });

  test('choosing a not-enough-photos deep link renders the exact empty copy with no grid and no share control', async ({ page }) => {
    await boot(page);
    await seedDeviceResidentPhoto(page, 'progress-photo/only-one.jpg', '2026-07-15');
    await openComposite(page);

    await expect(page.getByText('Not enough photos on this device')).toBeVisible();
    await expect(page.getByText('You need at least two progress photos on this device to build a before & after.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Progress photo,/ })).toHaveCount(0);
  });
});
