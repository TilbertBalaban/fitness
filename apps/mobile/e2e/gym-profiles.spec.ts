import { expect, test, type Page } from '@playwright/test';
import { toCanonicalKg } from '@fitness/api-contracts';
import { DURABILITY_HARNESS_GLOBAL } from '../lib/db/durability-harness-key';

interface SeedEquipmentProfileResult {
  profileId: string;
}

interface RawEquipmentProfile {
  id: string;
  name: string;
  is_default: number;
  barbell_weight_kg: string | null;
  available_plates: string | null;
  dumbbell_increments_kg: string | null;
  machine_availability: string | null;
  native_unit: string;
  archived_at: string | null;
  [key: string]: unknown;
}

interface GymHarness {
  openWithFilename(dbFilename: string): Promise<void>;
  seedEquipmentProfile(): Promise<SeedEquipmentProfileResult>;
  openGymProfileEditor(profileId?: string): Promise<void>;
  openGymProfilesScreen(): Promise<void>;
  readEquipmentProfileRaw(id: string): Promise<RawEquipmentProfile | null>;
}

// page.evaluate serializes the passed function's source text alone and re-evaluates it inside the
// page — it carries no outer closures, the same constraint every other e2e spec in this suite
// documents, which is why each callback below re-declares this cast inline.
type HarnessWindow = Record<string, GymHarness>;

async function openHarness(page: Page, dbFilename: string): Promise<void> {
  await page.goto('/__durability');
  await expect(page.getByTestId('durability-harness-ready')).toHaveText('ready');

  await page.evaluate(
    ({ globalKey, dbFilename }) => (window as unknown as HarnessWindow)[globalKey].openWithFilename(dbFilename),
    { globalKey: DURABILITY_HARNESS_GLOBAL, dbFilename },
  );
}

// Seeds the D-19 default "My Gym" and points the active-gym preference at it BEFORE the spec's own
// gym exists — without this, resolveLiveEquipmentProfileId's own fallback (first non-archived gym
// by name) would treat a lone freshly-created gym as trivially "already active", and the Set
// Active assertion below would prove nothing (E1: Set Active is a real no-op on a lone gym).
async function seedDefaultGym(page: Page): Promise<void> {
  await page.evaluate((globalKey) => (window as unknown as HarnessWindow)[globalKey].seedEquipmentProfile(), DURABILITY_HARNESS_GLOBAL);
}

async function openNewGymEditor(page: Page): Promise<void> {
  await page.evaluate((globalKey) => (window as unknown as HarnessWindow)[globalKey].openGymProfileEditor(), DURABILITY_HARNESS_GLOBAL);
}

async function openExistingGymEditor(page: Page, profileId: string): Promise<void> {
  await page.evaluate(
    ({ globalKey, profileId }) => (window as unknown as HarnessWindow)[globalKey].openGymProfileEditor(profileId),
    { globalKey: DURABILITY_HARNESS_GLOBAL, profileId },
  );
}

async function openGymList(page: Page): Promise<void> {
  await page.evaluate((globalKey) => (window as unknown as HarnessWindow)[globalKey].openGymProfilesScreen(), DURABILITY_HARNESS_GLOBAL);
}

async function readProfileRaw(page: Page, id: string): Promise<RawEquipmentProfile | null> {
  return page.evaluate(
    ({ globalKey, id }) => (window as unknown as HarnessWindow)[globalKey].readEquipmentProfileRaw(id),
    { globalKey: DURABILITY_HARNESS_GLOBAL, id },
  );
}

// NewGymScreen/EditGymScreen never navigate on save inside this harness (see NewGymScreenProps
// .onSaved's own doc comment in gym-profiles/new.tsx) — the saved row's id is surfaced instead as
// a plain rendered value, __durability.web.tsx's own gym-editor-last-saved-id testID, which this
// waits on rather than polling a raw table this harness has no by-name lookup for.
async function waitForSavedGymId(page: Page): Promise<string> {
  const marker = page.getByTestId('gym-editor-last-saved-id');
  await expect(marker).not.toHaveText('');
  return (await marker.textContent()) ?? '';
}

async function fillLb(page: Page, label: string, value: string): Promise<void> {
  await page.getByLabel(label, { exact: true }).fill(value);
}

test('a gym created, edited, activated and archived entirely through the UI stores exactly what was entered, in canonical kilograms', async ({ page }) => {
  const dbFilename = `fitness-gym-profiles-${Date.now()}.db`;
  await openHarness(page, dbFilename);
  await seedDefaultGym(page);

  // --- Create ---
  await openNewGymEditor(page);

  await fillLb(page, 'Name', 'Home Gym');
  await page.getByRole('button', { name: 'lb', exact: true }).click();
  await fillLb(page, 'Bar weight (lb)', '45');

  await fillLb(page, 'Plate weight (lb)', '45');
  await page.getByRole('button', { name: 'Add Plate' }).click();
  await fillLb(page, 'Plate weight (lb)', '25');
  await page.getByRole('button', { name: 'Add Plate' }).click();

  // Steps the first (45lb) row's pair count from its default of 1 to 2 — one denomination's count,
  // the second (25lb) row is left untouched here and stepped later, during the edit pass.
  await page.getByRole('button', { name: 'Increase Pairs' }).first().click();

  await fillLb(page, 'Dumbbell weight (lb)', '20');
  await page.getByRole('button', { name: 'Add Weight' }).click();

  await page.getByRole('button', { name: 'Add Machine' }).click();
  await fillLb(page, 'Machine name', 'Leg Press');
  await fillLb(page, 'Stack min (lb)', '20');
  await fillLb(page, 'Stack max (lb)', '200');
  await fillLb(page, 'Increment (lb)', '10');

  await page.getByRole('button', { name: 'Save Gym' }).click();
  const gymId = await waitForSavedGymId(page);
  expect(gymId.length).toBeGreaterThan(0);

  const rawAfterCreate = await readProfileRaw(page, gymId);
  expect(rawAfterCreate).not.toBeNull();
  expect(rawAfterCreate!.name).toBe('Home Gym');
  expect(rawAfterCreate!.native_unit).toBe('lb');
  expect(rawAfterCreate!.archived_at).toBeNull();
  // Every stored value is canonical kilograms, not the lb figure typed into the form — the display
  // unit never leaks into the write path (D-03).
  expect(rawAfterCreate!.barbell_weight_kg).toBe(toCanonicalKg('45', 'lb'));
  expect(JSON.parse(rawAfterCreate!.available_plates!)).toEqual([
    { weightKg: toCanonicalKg('45', 'lb'), pairCount: 2 },
    { weightKg: toCanonicalKg('25', 'lb'), pairCount: 1 },
  ]);
  expect(JSON.parse(rawAfterCreate!.dumbbell_increments_kg!)).toEqual([{ weightKg: toCanonicalKg('20', 'lb') }]);

  const machinesAfterCreate = JSON.parse(rawAfterCreate!.machine_availability!) as Array<Record<string, unknown>>;
  expect(machinesAfterCreate).toHaveLength(1);
  expect(typeof machinesAfterCreate[0]!.id).toBe('string');
  expect((machinesAfterCreate[0]!.id as string).length).toBeGreaterThan(0);
  expect(machinesAfterCreate[0]).toMatchObject({
    name: 'Leg Press',
    equipmentType: 'machine',
    available: true,
    stackMinKg: toCanonicalKg('20', 'lb'),
    stackMaxKg: toCanonicalKg('200', 'lb'),
    stackIncrementKg: toCanonicalKg('10', 'lb'),
    baseResistanceKg: null,
  });

  // --- Edit: change one plate count, nothing else ---
  await openExistingGymEditor(page, gymId);
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Home Gym');

  // The 25lb row is second in the loaded (already-descending-sorted) plate list — the 45lb row
  // stepped during create is left alone this time.
  await page.getByRole('button', { name: 'Increase Pairs' }).nth(1).click();
  await page.getByRole('button', { name: 'Save Gym' }).click();
  await expect(page.getByTestId('gym-editor-last-saved-id')).toHaveText(gymId);

  const rawAfterEdit = await readProfileRaw(page, gymId);
  expect(rawAfterEdit).not.toBeNull();

  // Every column except the plate list is byte-identical to the create-time row — the edit moved
  // exactly one field.
  const { available_plates: platesAfterEdit, ...restAfterEdit } = rawAfterEdit!;
  const { available_plates: platesAfterCreate, ...restAfterCreate } = rawAfterCreate!;
  expect(restAfterEdit).toEqual(restAfterCreate);
  expect(platesAfterEdit).not.toBe(platesAfterCreate);

  expect(JSON.parse(platesAfterEdit!)).toEqual([
    { weightKg: toCanonicalKg('45', 'lb'), pairCount: 2 },
    { weightKg: toCanonicalKg('25', 'lb'), pairCount: 2 },
  ]);

  // --- Activate, through the list's row overflow ---
  await openGymList(page);

  const overflowButton = page.getByRole('button', { name: 'More actions for Home Gym' });
  await overflowButton.click();
  await expect(page.getByRole('button', { name: 'Set Active' })).toBeVisible();
  await page.getByRole('button', { name: 'Set Active' }).click();

  // Set Active only ever omits itself from an already-active row (actionsForGymRow) — its
  // disappearance here is direct proof the preference pointer moved to this gym, not just that the
  // write call resolved without throwing.
  await expect
    .poll(async () => {
      await overflowButton.click();
      const visible = await page.getByRole('button', { name: 'Set Active' }).isVisible().catch(() => false);
      await page.getByRole('button', { name: 'Cancel' }).click();
      return visible;
    })
    .toBe(false);

  // --- Archive ---
  await overflowButton.click();
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(page.getByText('Archive Gym', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Archive', exact: true }).click();

  await expect
    .poll(async () => {
      await overflowButton.click();
      const restoreVisible = await page.getByRole('button', { name: 'Restore' }).isVisible().catch(() => false);
      await page.getByRole('button', { name: 'Cancel' }).click();
      return restoreVisible;
    })
    .toBe(true);

  // Two "Archived" text nodes now exist — the collapsed section's own header and the archived
  // row's subtitle (formatGymRowSubtitle); the header renders first in document order.
  await expect(page.getByText('Archived', { exact: true }).first()).toBeVisible();

  const rawAfterArchive = await readProfileRaw(page, gymId);
  expect(rawAfterArchive?.archived_at).not.toBeNull();
  expect(typeof rawAfterArchive?.archived_at).toBe('string');
});
