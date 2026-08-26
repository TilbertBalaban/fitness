import { expect, test, type Page } from '@playwright/test';
import { DURABILITY_HARNESS_GLOBAL } from '../lib/db/durability-harness-key';

interface SeededProgrammedExercise {
  exerciseId: string;
  routineExerciseId: string;
  orderIndex: number;
}

interface SeededProgrammedSession {
  sessionId: string;
  routineId: string;
  routineDayId: string;
  exercises: SeededProgrammedExercise[];
}

interface SessionExerciseRawRow {
  id: string;
  exercise_id: string;
  notes: string | null;
  [key: string]: unknown;
}

interface LoggedSetRawRow {
  id: string;
  set_index: number;
  notes: string | null;
  [key: string]: unknown;
}

interface WorkoutSessionRawRow {
  id: string;
  notes: string | null;
  [key: string]: unknown;
}

interface WorkoutHarness {
  openWithFilename(dbFilename: string): Promise<void>;
  seedWorkoutSession(): Promise<SeededProgrammedSession>;
  readSessionExercisesRaw(sessionId: string): Promise<SessionExerciseRawRow[]>;
  readSetsRaw(sessionExerciseId: string): Promise<LoggedSetRawRow[]>;
  readSessionRaw(sessionId: string): Promise<WorkoutSessionRawRow | null>;
}

// page.evaluate serializes the passed function's source text alone and re-evaluates it inside the
// page — it does not carry outer closures, which is why every callback below re-declares this cast
// inline rather than calling a shared helper (same constraint workout-screen.spec.ts documents).
type HarnessWindow = Record<string, WorkoutHarness>;

// Real @powersync/web database, real browser, the real WorkoutScreenView rendered by
// __durability.web.tsx — no case here calls the notes mutation directly; every write is reached
// by a DOM interaction through the same production path a real gym session uses (D-01), proving
// LOG-16's three independent note columns end to end.
async function openAndSeed(page: Page, dbFilename: string): Promise<{ seeded: SeededProgrammedSession; sessionExerciseId: string }> {
  await page.goto('/__durability');
  // The testID renders on first paint regardless of readiness ('loading' vs 'ready' is only the
  // text content) — waitForSelector alone can resolve before DurabilityHarnessScreen's effect has
  // actually assigned window[DURABILITY_HARNESS_GLOBAL], a race other specs in this suite hit
  // intermittently too. Waiting for the 'ready' text specifically closes that gap.
  await expect(page.getByTestId('durability-harness-ready')).toHaveText('ready');

  await page.evaluate(
    ({ globalKey, dbFilename }) => (window as unknown as HarnessWindow)[globalKey].openWithFilename(dbFilename),
    { globalKey: DURABILITY_HARNESS_GLOBAL, dbFilename },
  );

  const seeded = await page.evaluate(
    (globalKey) => (window as unknown as HarnessWindow)[globalKey].seedWorkoutSession(),
    DURABILITY_HARNESS_GLOBAL,
  );

  const sessionExercises = await page.evaluate(
    ({ globalKey, sessionId }) => (window as unknown as HarnessWindow)[globalKey].readSessionExercisesRaw(sessionId),
    { globalKey: DURABILITY_HARNESS_GLOBAL, sessionId: seeded.sessionId },
  );
  const firstExercise = seeded.exercises[0];
  const sessionExerciseId = sessionExercises.find((row) => row.exercise_id === firstExercise.exerciseId)?.id;
  if (!sessionExerciseId) throw new Error('seeded first exercise has no matching session_exercise row');

  return { seeded, sessionExerciseId };
}

// ExercisePagerView (react-native-tab-view, lazy=false) can have both of seedWorkoutSession's two
// exercise pages present in the accessibility tree at once before the pager settles to the active
// index alone — every one of this file's own selectors that a per-exercise control could match
// twice is scoped with .first(), which DOM order (routes render in the seeded exercises[0..1]
// order) resolves to the SAME first exercise openAndSeed already resolved sessionExerciseId for.

// Same weight->reps->rir walk workout-screen.spec.ts already established, so a real logged_set row
// exists for the long press to annotate — no direct logSet call.
//
// WINDOWS #136 (fixed): LOG-13's auto-advance used to fire the instant every EXISTING working set
// row was complete, rather than every PRESCRIBED one — after logging exactly one of the seeded
// 3-target working sets, that was trivially true (one row exists, it's complete), so the pager
// swiped to the second seeded exercise a full two sets early. shouldAutoAdvance now compares
// against session_exercise.target_sets, so this no longer fires here; the explicit re-select is
// kept as a harmless no-op (clicking the already-active chip) so a future regression here fails
// loudly on the next assertion instead of silently landing on the wrong exercise's draft.
async function logFirstWorkingSet(page: Page): Promise<void> {
  const weightField = page.getByRole('button', { name: 'Weight, set field' }).first();
  await expect(weightField).toBeVisible();
  await weightField.click();

  await page.getByRole('button', { name: '1', exact: true }).click();
  await page.getByRole('button', { name: '0', exact: true }).click();
  await page.getByRole('button', { name: '0', exact: true }).click();

  await page.getByRole('button', { name: 'Next field' }).click();
  await page.getByRole('button', { name: 'Next field' }).click();
  await page.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Mark set complete' }).first().click();

  const firstExerciseChip = page.getByRole('button', { name: 'Unknown exercise, 1/3' });
  await expect(firstExerciseChip).toBeVisible();
  await firstExerciseChip.click();
  await expect(page.getByRole('button', { name: 'Mark set incomplete' })).toBeVisible();
}

// SetRowView attaches the same onLongPress to every nested Pressable (05-UI-SPEC Amendment A.1),
// so a real down-wait-up cycle on any one of them reaches it — react-native-web's PressResponder
// schedules onLongPress via a real setTimeout past its DEFAULT_LONG_PRESS_DELAY_MS (450ms) once the
// pointer has been down that long, and suppresses the trailing onPress once it fires, exactly like
// native RN. 700ms of real wall-clock down time comfortably clears that delay.
async function longPressWeightField(page: Page): Promise<void> {
  const weightField = page.getByRole('button', { name: 'Weight, set field' }).first();
  await weightField.hover();
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
}

async function saveNoteText(page: Page, text: string): Promise<void> {
  // The note field's own accessible name ("Note") collides with the exercise action bar's "Note"
  // button and (with two exercise pages mounted) that button's own duplicate — scoping to the
  // textbox role is unambiguous regardless, since only the ONE ExercisePage instance whose sheet
  // this test opened ever mounts a NoteSheet at a time.
  await page.getByRole('textbox', { name: 'Note', exact: true }).fill(text);
  await page.getByRole('button', { name: 'Save Note' }).click();
  // NoteSheet's handleSave awaits the notes mutation before calling onSaved, which is what unmounts
  // the sheet — waiting for it to close is what proves the write has actually landed, not merely
  // been dispatched (the exact race 05-12 hit on TargetsSheet's own Save/write-back buttons).
  await expect(page.getByRole('button', { name: 'Save Note' })).toBeHidden();
}

async function openSessionNoteSheet(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Session menu' }).click();
  await page.getByRole('button', { name: 'Session Note', exact: true }).click();
}

async function openExerciseNoteSheet(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Note', exact: true }).first().click();
}

async function readSetNote(page: Page, sessionExerciseId: string): Promise<string | null> {
  const sets = await page.evaluate(
    ({ globalKey, sessionExerciseId }) => (window as unknown as HarnessWindow)[globalKey].readSetsRaw(sessionExerciseId),
    { globalKey: DURABILITY_HARNESS_GLOBAL, sessionExerciseId },
  );
  return sets.find((row) => row.set_index === 1)?.notes ?? null;
}

async function readExerciseNote(page: Page, sessionId: string, sessionExerciseId: string): Promise<string | null> {
  const exercises = await page.evaluate(
    ({ globalKey, sessionId }) => (window as unknown as HarnessWindow)[globalKey].readSessionExercisesRaw(sessionId),
    { globalKey: DURABILITY_HARNESS_GLOBAL, sessionId },
  );
  return exercises.find((row) => row.id === sessionExerciseId)?.notes ?? null;
}

async function readSessionNote(page: Page, sessionId: string): Promise<string | null> {
  const session = await page.evaluate(
    ({ globalKey, sessionId }) => (window as unknown as HarnessWindow)[globalKey].readSessionRaw(sessionId),
    { globalKey: DURABILITY_HARNESS_GLOBAL, sessionId },
  );
  return session?.notes ?? null;
}

test('a long press on a set row writes a set-level note', async ({ page }) => {
  const dbFilename = `fitness-session-notes-set-${Date.now()}.db`;
  const { sessionExerciseId } = await openAndSeed(page, dbFilename);
  await logFirstWorkingSet(page);

  await expect(page.getByLabel('Note exists')).toHaveCount(0);

  await longPressWeightField(page);
  await expect(page.getByText('Set Note', { exact: true })).toBeVisible();
  await saveNoteText(page, 'Left shoulder felt tight on the last rep');

  expect(await readSetNote(page, sessionExerciseId)).toBe('Left shoulder felt tight on the last rep');
  await expect(page.getByLabel('Note exists')).toBeVisible();
});

test('the Session Note menu row writes a session-level note', async ({ page }) => {
  const dbFilename = `fitness-session-notes-session-${Date.now()}.db`;
  const { seeded } = await openAndSeed(page, dbFilename);

  await openSessionNoteSheet(page);
  await expect(page.getByText('Session Note', { exact: true })).toBeVisible();
  await saveNoteText(page, 'Gym was busy tonight, cut rest short');

  expect(await readSessionNote(page, seeded.sessionId)).toBe('Gym was busy tonight, cut rest short');
});

test('the three levels are independent', async ({ page }) => {
  const dbFilename = `fitness-session-notes-independence-${Date.now()}.db`;
  const { seeded, sessionExerciseId } = await openAndSeed(page, dbFilename);
  await logFirstWorkingSet(page);

  await longPressWeightField(page);
  await saveNoteText(page, 'Set note A');

  await openSessionNoteSheet(page);
  await saveNoteText(page, 'Session note A');

  await openExerciseNoteSheet(page);
  await expect(page.getByText('Exercise Note', { exact: true })).toBeVisible();
  await saveNoteText(page, 'Exercise note A');

  expect(await readSetNote(page, sessionExerciseId)).toBe('Set note A');
  expect(await readExerciseNote(page, seeded.sessionId, sessionExerciseId)).toBe('Exercise note A');
  expect(await readSessionNote(page, seeded.sessionId)).toBe('Session note A');

  // LOG-16's adjacency edge, read literally: re-saving the set note with a different string leaves
  // the exercise and session columns exactly as they were.
  await longPressWeightField(page);
  await saveNoteText(page, 'Set note B');

  expect(await readSetNote(page, sessionExerciseId)).toBe('Set note B');
  expect(await readExerciseNote(page, seeded.sessionId, sessionExerciseId)).toBe('Exercise note A');
  expect(await readSessionNote(page, seeded.sessionId)).toBe('Session note A');

  // Ordering: a fresh session, saving the three notes in the REVERSE order (session, exercise,
  // set) yields the same three stored values — no ordering relationship between the levels, since
  // each write targets a different column and no read path merges them.
  const reverseDbFilename = `fitness-session-notes-independence-reverse-${Date.now()}.db`;
  const reverse = await openAndSeed(page, reverseDbFilename);
  await logFirstWorkingSet(page);

  await openSessionNoteSheet(page);
  await saveNoteText(page, 'Reverse session note');

  await openExerciseNoteSheet(page);
  await saveNoteText(page, 'Reverse exercise note');

  await longPressWeightField(page);
  await saveNoteText(page, 'Reverse set note');

  expect(await readSetNote(page, reverse.sessionExerciseId)).toBe('Reverse set note');
  expect(await readExerciseNote(page, reverse.seeded.sessionId, reverse.sessionExerciseId)).toBe('Reverse exercise note');
  expect(await readSessionNote(page, reverse.seeded.sessionId)).toBe('Reverse session note');
});

test('an empty note clears the column', async ({ page }) => {
  const dbFilename = `fitness-session-notes-clear-${Date.now()}.db`;
  const { sessionExerciseId } = await openAndSeed(page, dbFilename);
  await logFirstWorkingSet(page);

  await longPressWeightField(page);
  await saveNoteText(page, 'A note that will be cleared');
  expect(await readSetNote(page, sessionExerciseId)).toBe('A note that will be cleared');
  await expect(page.getByLabel('Note exists')).toBeVisible();

  await longPressWeightField(page);
  await expect(page.getByRole('textbox', { name: 'Note', exact: true })).toHaveValue('A note that will be cleared');
  await saveNoteText(page, '   ');

  expect(await readSetNote(page, sessionExerciseId)).toBeNull();
  await expect(page.getByLabel('Note exists')).toHaveCount(0);
});
