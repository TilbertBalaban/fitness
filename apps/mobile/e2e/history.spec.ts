import { expect, test } from '@playwright/test';
import { DURABILITY_HARNESS_GLOBAL } from '../lib/db/durability-harness-key';

interface HistorySessionRow {
  id: string;
  name: string | null;
  localDate: string;
  startedAt: string;
  endedAt: string | null;
  accumulatedPausedSeconds: number;
  exerciseCount: number;
  completedSetCount: number;
}

interface HistoryPage {
  rows: HistorySessionRow[];
  nextCursor: { startedAt: string; id: string } | null;
}

interface RawWorkoutSession {
  id: string;
  name: string | null;
  started_at: string;
  paused_at: string | null;
  accumulated_paused_seconds: number;
  status: string;
}

interface RawSessionExercise {
  id: string;
  session_id: string;
}

interface HistoryHarness {
  openWithFilename(dbFilename: string): Promise<void>;
  startSession(input: { now?: Date }): Promise<string>;
  addSessionExercise(input: { sessionId: string; exerciseId: string; orderIndex: number }): Promise<string>;
  logSet(input: {
    sessionExerciseId: string;
    weight: { value: string | null; unit: 'kg' | 'lb' };
    reps: number;
    completed?: boolean;
  }): Promise<string>;
  completeSession(input: { sessionId: string; now?: string }): Promise<void>;
  discardSession(sessionId: string): Promise<void>;
  loadHistoryPage(input: { userId: string | null; limit: number; cursor?: { startedAt: string; id: string } | null }): Promise<HistoryPage>;
  renameSession(input: { sessionId: string; name: string | null }): Promise<void>;
  duplicateSession(input: { sourceSessionId: string; now?: string }): Promise<string>;
  deleteSession(sessionId: string): Promise<void>;
  readSessionRaw(sessionId: string): Promise<RawWorkoutSession | null>;
  readSessionExercisesRaw(sessionId: string): Promise<RawSessionExercise[]>;
  readAllSetsRaw(): Promise<{ session_exercise_id: string }[]>;
}

// page.evaluate serializes the passed function's source text alone and re-evaluates it inside the
// page — it carries no outer closures, matching every other e2e spec in this directory.
type HarnessWindow = Record<string, HistoryHarness>;

const HARNESS_USER_ID = 'history-harness-user';

// Real @powersync/web database, real browser — the whole point of this suite living here rather
// than under Jest is that loadHistoryPage/history-mutations.ts run their actual SQL against a real
// engine (WINDOWS.md #22: Jest/Node has no real Worker/WASM/IndexedDB).
test.describe('history — view, rename, duplicate, delete a past workout (LOG-20)', () => {
  test('the list shows only completed sessions, newest first, and hides a discarded one', async ({ page }) => {
    const dbFilename = `fitness-history-${Date.now()}.db`;

    await page.goto('/__durability');
    await page.waitForSelector('[data-testid="durability-harness-ready"]');
    await page.evaluate(
      ({ globalKey, dbFilename: name }) => (window as unknown as HarnessWindow)[globalKey].openWithFilename(name),
      { globalKey: DURABILITY_HARNESS_GLOBAL, dbFilename },
    );

    const seeded = await page.evaluate(async (globalKey) => {
      const harness = (window as unknown as HarnessWindow)[globalKey];

      async function seedCompleted(now: string) {
        const sessionId = await harness.startSession({ now: new Date(now) });
        const sessionExerciseId = await harness.addSessionExercise({
          sessionId,
          exerciseId: 'ex-history-1',
          orderIndex: 0,
        });
        await harness.logSet({ sessionExerciseId, weight: { value: '100', unit: 'kg' }, reps: 5, completed: true });
        await harness.completeSession({ sessionId, now });
        return sessionId;
      }

      const a = await seedCompleted('2026-08-01T10:00:00.000Z');
      const b = await seedCompleted('2026-08-10T10:00:00.000Z');
      const c = await seedCompleted('2026-08-20T10:00:00.000Z');

      const discardedId = await harness.startSession({ now: new Date('2026-08-15T10:00:00.000Z') });
      await harness.discardSession(discardedId);

      return { a, b, c, discardedId };
    }, DURABILITY_HARNESS_GLOBAL);

    const page1 = await page.evaluate(
      ({ globalKey, userId }) => (window as unknown as HarnessWindow)[globalKey].loadHistoryPage({ userId, limit: 25 }),
      { globalKey: DURABILITY_HARNESS_GLOBAL, userId: HARNESS_USER_ID },
    );

    expect(page1.rows).toHaveLength(3);
    expect(page1.rows.map((row) => row.id)).toEqual([seeded.c, seeded.b, seeded.a]);
    expect(page1.rows.map((row) => row.id)).not.toContain(seeded.discardedId);

    // Rename: writes only workout_session.name, and the next page read reflects it immediately.
    await page.evaluate(
      ({ globalKey, sessionId }) => (window as unknown as HarnessWindow)[globalKey].renameSession({ sessionId, name: 'Heavy Push Day' }),
      { globalKey: DURABILITY_HARNESS_GLOBAL, sessionId: seeded.a },
    );
    const afterRename = await page.evaluate(
      ({ globalKey, userId }) => (window as unknown as HarnessWindow)[globalKey].loadHistoryPage({ userId, limit: 25 }),
      { globalKey: DURABILITY_HARNESS_GLOBAL, userId: HARNESS_USER_ID },
    );
    expect(afterRename.rows.find((row) => row.id === seeded.a)?.name).toBe('Heavy Push Day');

    // Duplicate: startSession's funnel always creates the copy in_progress (D-33) — History's own
    // shown/hidden rule (Task 1) excludes in-progress sessions, so the copy does NOT appear as a
    // fourth History row; it lands on the Workout tab instead. Verified directly against the raw
    // session/session_exercise state rather than through loadHistoryPage.
    const duplicatedId = await page.evaluate(
      ({ globalKey, sourceSessionId }) => (window as unknown as HarnessWindow)[globalKey].duplicateSession({ sourceSessionId }),
      { globalKey: DURABILITY_HARNESS_GLOBAL, sourceSessionId: seeded.b },
    );
    const [duplicatedSessionRaw, duplicatedExercises, allSets, pageAfterDuplicate] = await page.evaluate(
      async ({ globalKey, duplicatedId: id, userId }) => {
        const harness = (window as unknown as HarnessWindow)[globalKey];
        return Promise.all([
          harness.readSessionRaw(id),
          harness.readSessionExercisesRaw(id),
          harness.readAllSetsRaw(),
          harness.loadHistoryPage({ userId, limit: 25 }),
        ]);
      },
      { globalKey: DURABILITY_HARNESS_GLOBAL, duplicatedId, userId: HARNESS_USER_ID },
    );

    expect(duplicatedSessionRaw?.status).toBe('in_progress');
    expect(duplicatedExercises).toHaveLength(1);
    const duplicatedSetCount = allSets.filter((row) =>
      duplicatedExercises.some((exercise) => exercise.id === row.session_exercise_id),
    ).length;
    expect(duplicatedSetCount).toBe(0);
    expect(pageAfterDuplicate.rows).toHaveLength(3);
    expect(pageAfterDuplicate.rows.map((row) => row.id)).not.toContain(duplicatedId);

    // Delete: the session and its session_exercise children are both gone afterward.
    await page.evaluate(
      ({ globalKey, sessionId }) => (window as unknown as HarnessWindow)[globalKey].deleteSession(sessionId),
      { globalKey: DURABILITY_HARNESS_GLOBAL, sessionId: seeded.c },
    );
    const [deletedSessionRaw, deletedExercises, pageAfterDelete] = await page.evaluate(
      async ({ globalKey, sessionId, userId }) => {
        const harness = (window as unknown as HarnessWindow)[globalKey];
        return Promise.all([
          harness.readSessionRaw(sessionId),
          harness.readSessionExercisesRaw(sessionId),
          harness.loadHistoryPage({ userId, limit: 25 }),
        ]);
      },
      { globalKey: DURABILITY_HARNESS_GLOBAL, sessionId: seeded.c, userId: HARNESS_USER_ID },
    );

    expect(deletedSessionRaw).toBeNull();
    expect(deletedExercises).toHaveLength(0);
    expect(pageAfterDelete.rows.map((row) => row.id)).not.toContain(seeded.c);
    expect(pageAfterDelete.rows).toHaveLength(2);
  });
});
