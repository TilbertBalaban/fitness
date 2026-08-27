import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { WorkoutScreenView, useWorkoutScreen } from './(tabs)/workout';
import { startBackfilledSession } from './(tabs)/history';
import { EditingWorkoutRoute } from '../components/EditingWorkoutScreen';
import { SyncConnector } from '../lib/db/connector';
import { loadEquipmentProfile, setActiveEquipmentProfile } from '../lib/db/equipment-profiles';
import { addSessionExercise, logSet, setSessionDate, startSession } from '../lib/db/log-set';
import { loadSessionPersonalRecords } from '../lib/db/personal-record';
import { completeSession, discardSession, pauseSession, resumeSession } from '../lib/db/session-lifecycle';
import { deleteSession, duplicateSession, renameSession } from '../lib/db/history-mutations';
import { loadHistoryPage } from '../lib/db/history-query';
import { previousSetReference } from '../lib/db/session-query';
import { loadNextUp } from '../lib/db/programs/next-up-query';
import { resolveNextUp } from '../lib/programs/next-up';
import {
  connectPowerSync,
  disconnectPowerSync,
  getPowerSync,
  getUploadQueueStats,
  type WriteDb,
} from '../lib/db/powersync';
import {
  DURABILITY_HARNESS_GLOBAL,
  closeTestPowerSync,
  connectTestPowerSync,
  disconnectTestPowerSync,
  openTestPowerSync,
  pendingCrudCount,
  readAllLoggedSetsRaw,
  readCatalogTableCounts,
  readCatalogVersionRaw,
  readCycleTargetRaw,
  readLoggedSets,
  readLoggedSetsRaw,
  readRawColumns,
  readRoutineExerciseCycleTargetsRaw,
  readEquipmentProfileRaw,
  readRoutineExerciseRaw,
  readSessionExercisesRaw,
  readWorkoutSessionRaw,
  reopenTestPowerSync,
  seedEquipmentProfile,
  seedPriorHeaviestSet,
  seedProgrammedSession,
  seedProgrammedSessionWithCycle,
  writeCatalogVersionSentinel,
  type SeededProgrammedSession,
  type SeededProgrammedSessionWithCycle,
  type SeedEquipmentProfileResult,
  type SeedPriorHeaviestSetInput,
  type TestWriteDb,
} from '../lib/db/test-support';
import { loadCatalogSnapshot } from '../lib/catalog/load-snapshot';
import { SessionModeProvider } from '../lib/session/session-mode';
import { useThemeColors } from '../lib/theme-colors';

// Any non-empty string works: workout_session.user_id is stamped server-side on sync push only
// (see session-query.ts's loadLiveSession comment), so nothing this harness reads or writes ever
// compares against this value — it exists purely to satisfy readWorkoutScreenData's signed-in
// early-out.
const WORKOUT_HARNESS_USER_ID = 'harness-user';

function WorkoutHarnessScreen({ db, userId }: { db: WriteDb; userId: string }) {
  const colors = useThemeColors();
  const vm = useWorkoutScreen({ userId, db });

  return (
    <SessionModeProvider mode="live">
      <WorkoutScreenView {...vm} colors={colors} />
    </SessionModeProvider>
  );
}

// 05-10's editing-mode e2e case (session-edit.spec.ts): mounts EditingWorkoutRoute — the exact
// component workout.tsx renders when a sessionId route param resolves to `editing` — against a
// named session in the currently open() database, rather than the harness re-implementing any
// piece of the editing screen's own wiring.
function EditingWorkoutHarnessScreen({ db, userId, sessionId }: { db: WriteDb; userId: string; sessionId: string }) {
  const colors = useThemeColors();
  return <EditingWorkoutRoute sessionId={sessionId} userId={userId} colors={colors} db={db} />;
}

// A Playwright page drives this route through window[DURABILITY_HARNESS_GLOBAL] — see
// e2e/durability.spec.ts and e2e/workout-screen.spec.ts. Every write goes through the real
// lib/db/log-set.ts helpers; this route re-implements no insert.
export default function DurabilityHarnessScreen() {
  const [ready, setReady] = useState(false);
  const [workoutHarness, setWorkoutHarness] = useState<{ db: TestWriteDb } | null>(null);
  const [editingHarness, setEditingHarness] = useState<{ db: TestWriteDb; sessionId: string } | null>(null);

  useEffect(() => {
    // Direct comparison against the inlined literal, not the DURABILITY_HARNESS_ENABLED constant
    // — Metro's build-time env substitution turns this into `if (true) return;` when the flag is
    // unset, and the minifier removes everything below it from a production export (T-02-30).
    if (process.env.EXPO_PUBLIC_DURABILITY_HARNESS !== '1') return;

    let currentDb: TestWriteDb | null = null;
    let lastClosedDb: TestWriteDb | null = null;
    // Which crud-queue reader crudCount() should use — set only by useProductionDb(). test-support
    // .ts's rawDb and powersync.ts's production singleton are two distinct PowerSyncDatabase
    // instances; each has its own queue reader and neither can answer for the other.
    let usingProductionDb = false;

    function requireOpenDb(): TestWriteDb {
      if (!currentDb) {
        throw new Error('durability harness: open() must be called before this method');
      }
      return currentDb;
    }

    (window as unknown as Record<string, unknown>)[DURABILITY_HARNESS_GLOBAL] = {
      async open() {
        currentDb = openTestPowerSync();
        usingProductionDb = false;
      },
      // Same as open(), but against a caller-chosen filename rather than a random per-call one —
      // workout-screen.spec.ts's reload case needs the SAME underlying IndexedDB-backed database
      // to still be there after a real page reload wipes every module-level JS variable, which
      // only a fixed, caller-supplied filename makes possible.
      async openWithFilename(dbFilename: string) {
        currentDb = openTestPowerSync({ dbFilename });
        usingProductionDb = false;
      },
      async close() {
        await closeTestPowerSync();
        lastClosedDb = currentDb;
        currentDb = null;
        setWorkoutHarness(null);
        setEditingHarness(null);
      },
      // Routes every subsequent startSession/addSessionExercise/logSet/readSets call at the SAME
      // singleton connectPowerSync/disconnectPowerSync (and therefore _layout.tsx) operate on —
      // sync.spec.ts needs the real production database, not an isolated test-support.ts instance,
      // because the whole point is proving the real connector against real local writes.
      async useProductionDb() {
        currentDb = getPowerSync() as unknown as TestWriteDb;
        usingProductionDb = true;
      },
      // Delegates to the exact functions app/_layout.tsx wires to session state — no duplicated or
      // bypassed connect/disconnect wiring, no stubbed SyncConnector.
      async connect() {
        await connectPowerSync(new SyncConnector());
      },
      async disconnect() {
        await disconnectPowerSync();
      },
      // Returns whether the freshly reopened instance is a different JS object than the one
      // close() closed — the object-identity comparison happens here, inside the browser realm,
      // because Playwright's page.evaluate serializes non-primitive return values and cannot
      // carry object identity back across the CDP boundary.
      async reopen() {
        currentDb = reopenTestPowerSync();
        return currentDb !== lastClosedDb;
      },
      async startSession(input: Parameters<typeof startSession>[0]) {
        return startSession(input, requireOpenDb());
      },
      async addSessionExercise(input: Parameters<typeof addSessionExercise>[0]) {
        return addSessionExercise(input, requireOpenDb());
      },
      async logSet(input: Parameters<typeof logSet>[0]) {
        return logSet(input, requireOpenDb());
      },
      async readSets(sessionExerciseId: string) {
        return readLoggedSets(requireOpenDb(), sessionExerciseId);
      },
      // 05-07's pause/resume recovery case (e2e/durability.spec.ts): real session-lifecycle.ts
      // writes against the currently open() database, no stub.
      async pauseSession(input: { sessionId: string; now?: string }) {
        await pauseSession(input.sessionId, input.now ? new Date(input.now) : undefined, requireOpenDb());
      },
      async resumeSession(input: { sessionId: string; now?: string }) {
        await resumeSession(input.sessionId, input.now ? new Date(input.now) : undefined, requireOpenDb());
      },
      // 05-09's history e2e case: real session-lifecycle.ts writes, against the currently open()
      // database, no stub — completeSession/discardSession are what makes a seeded session show up
      // (or not) in loadHistoryPage's own status filter.
      async completeSession(input: { sessionId: string; now?: string }) {
        await completeSession(input.sessionId, input.now ? new Date(input.now) : undefined, requireOpenDb());
      },
      async discardSession(sessionId: string) {
        await discardSession(sessionId, requireOpenDb());
      },
      async readSessionRaw(sessionId: string) {
        return readWorkoutSessionRaw(sessionId);
      },
      async readSessionExercisesRaw(sessionId: string) {
        return readSessionExercisesRaw(sessionId);
      },
      // Delegates to the real history-query.ts/history-mutations.ts (05-09) against the currently
      // open() database — no stub, no duplicated query/mutation logic in the harness itself.
      async loadHistoryPage(input: Parameters<typeof loadHistoryPage>[0]) {
        return loadHistoryPage(input, requireOpenDb());
      },
      async renameSession(input: { sessionId: string; name: string | null }) {
        await renameSession(input.sessionId, input.name, requireOpenDb());
      },
      async duplicateSession(input: { sourceSessionId: string; now?: string }) {
        return duplicateSession(
          { sourceSessionId: input.sourceSessionId, now: input.now ? new Date(input.now) : undefined },
          requireOpenDb(),
        );
      },
      async deleteSession(sessionId: string) {
        await deleteSession(sessionId, requireOpenDb());
      },
      // Delegates to the real previousSetReference against the currently open() database — the
      // two-prior-sessions reload case (durability.spec.ts) proves the same tie-break the unit
      // tests already cover, but through the real browser database instead of a fake.
      async previousSetReference(input: Parameters<typeof previousSetReference>[0]) {
        return previousSetReference(input, requireOpenDb());
      },
      async crudCount() {
        if (usingProductionDb) {
          const stats = await getUploadQueueStats();
          return stats.count;
        }
        return pendingCrudCount();
      },
      // Same open() semantics, but selecting the schema variant plan 02-12's redefinition test
      // needs — 'v1' is the schema every other harness method above already exercises.
      async openVariant(variant: 'v1' | 'v2') {
        currentDb = openTestPowerSync({ variant });
        usingProductionDb = false;
      },
      async reopenVariant(variant: 'v1' | 'v2') {
        currentDb = reopenTestPowerSync({ variant });
        return currentDb !== lastClosedDb;
      },
      async readRawColumns(table: string) {
        return readRawColumns(table);
      },
      async readSetsRaw(sessionExerciseId: string) {
        return readLoggedSetsRaw(sessionExerciseId);
      },
      async readAllSetsRaw() {
        return readAllLoggedSetsRaw();
      },
      // Connects/disconnects whichever database openVariant/reopenVariant currently has open — the
      // real SyncConnector, but against the isolated test-support.ts instance rather than the
      // production singleton. This is what proves a crud queue that survived a schema redefinition
      // still drains (roadmap criterion 4's "still pushes" half).
      async connectCurrent() {
        await connectTestPowerSync(new SyncConnector());
      },
      async disconnectCurrent() {
        await disconnectTestPowerSync();
      },
      // Opens the same production AppSchema getPowerSync() builds — not TestAppSchema, which
      // carries no localOnly overrides and would make a zero-upload-queue assertion vacuous. Sets
      // usingProductionDb = false so crudCount() above routes to pendingCrudCount(), reading this
      // isolated instance's own queue rather than the production singleton's.
      async openCatalogDb() {
        currentDb = openTestPowerSync({ variant: 'app' });
        usingProductionDb = false;
      },
      // Calls the real, unmodified loadCatalogSnapshot and lets a rejection propagate — swallowing
      // it here would recreate the exact defect e2e/catalog-load.spec.ts exists to catch.
      async loadCatalog() {
        return loadCatalogSnapshot(requireOpenDb());
      },
      async readCatalogTableCounts() {
        return readCatalogTableCounts();
      },
      async readCatalogVersionRaw() {
        return readCatalogVersionRaw();
      },
      async writeCatalogVersionSentinel(sentinel: string) {
        await writeCatalogVersionSentinel(sentinel);
      },
      // Seeds a real program + starts a real session against the currently open() database, then
      // flips React state to mount WorkoutHarnessScreen for the first time — the harness never
      // renders the workout UI until there is a real session for it to load (workout-screen.spec.ts).
      async seedWorkoutSession(): Promise<SeededProgrammedSession> {
        const db = requireOpenDb();
        // Threading WORKOUT_HARNESS_USER_ID here is what makes D-19's seed-on-first-need fire for
        // every harness-started session, same as a real signed-in "Start Workout" tap — a prior
        // seedEquipmentProfile() call (plate-strip.spec.ts and friends) is picked up by this same
        // ensureDefaultEquipmentProfile idempotent lookup; a spec that never calls it gets the
        // auto-seeded default instead, exactly like a first-ever real session would.
        const seeded = await seedProgrammedSession(db, WORKOUT_HARNESS_USER_ID);
        setWorkoutHarness({ db });
        return seeded;
      },
      // Task 2's gym seam: seeds/points the active default gym profile for WORKOUT_HARNESS_USER_ID
      // via the real ensureDefaultEquipmentProfile — call before seedWorkoutSession() so the
      // started session's equipment_profile_id resolves to this same profile.
      async seedEquipmentProfile(): Promise<SeedEquipmentProfileResult> {
        const db = requireOpenDb();
        return seedEquipmentProfile(db, WORKOUT_HARNESS_USER_ID);
      },
      async readEquipmentProfile(id: string) {
        return loadEquipmentProfile(id, requireOpenDb());
      },
      async readEquipmentProfileRaw(id: string) {
        return readEquipmentProfileRaw(id);
      },
      // Later plans (06-03/06-04) exercise the multi-gym switch through this — writes the pointer
      // directly via the real setActiveEquipmentProfile, no stub.
      async setActiveGym(profileId: string) {
        await setActiveEquipmentProfile(WORKOUT_HARNESS_USER_ID, profileId, requireOpenDb());
      },
      // 05-12's D-15 write-back proof: same seed-then-mount shape as seedWorkoutSession, but
      // against seedProgrammedSessionWithCycle's program (one override row on the first routine
      // exercise, none on the second) — see test-support.ts's own doc comment.
      async seedWorkoutSessionWithCycle(): Promise<SeededProgrammedSessionWithCycle> {
        const db = requireOpenDb();
        const seeded = await seedProgrammedSessionWithCycle(db);
        setWorkoutHarness({ db });
        return seeded;
      },
      async readRoutineExercise(routineExerciseId: string) {
        return readRoutineExerciseRaw(routineExerciseId);
      },
      async readCycleTarget(cycleTargetId: string) {
        return readCycleTargetRaw(cycleTargetId);
      },
      async readCycleTargetsForRoutineExercise(routineExerciseId: string) {
        return readRoutineExerciseCycleTargetsRaw(routineExerciseId);
      },
      // A direct, minimal write of a completed prior session's single working set — see
      // seedPriorHeaviestSet's own doc comment (test-support.ts) for why this bypasses
      // startWorkoutFromProgram/logSet. Does not touch workoutHarness state; callers use this
      // before seedWorkoutSession, not instead of it.
      async seedPriorHeaviestSet(input: SeedPriorHeaviestSetInput) {
        await seedPriorHeaviestSet(requireOpenDb(), input);
      },
      // Reads the DURABLE ledger (personal-record.ts's own written rows), not the summary's pure
      // recompute — proving detectPrsForSession's write path actually fired, which the summary
      // screen's own "New PR" badge alone cannot (that badge is a fresh recompute, LOG-19).
      async readSessionPersonalRecords(sessionId: string) {
        return loadSessionPersonalRecords(sessionId, requireOpenDb());
      },
      // Mounts WorkoutHarnessScreen against whichever database open()/openWithFilename() currently
      // has open, WITHOUT seeding — the post-reload half of workout-screen.spec.ts's reload case,
      // which must find the already-completed row loadLiveSession resolves, not a second one.
      async openWorkoutScreen() {
        const db = requireOpenDb();
        setWorkoutHarness({ db });
      },
      // 05-10's editing-mode e2e case: real setSessionDate against the currently open() database —
      // the single deliberate exception to D-06 (Task 1), no stub.
      async setSessionDate(input: { sessionId: string; date: string; timezone: string }) {
        await setSessionDate(input.sessionId, new Date(input.date), input.timezone, requireOpenDb());
      },
      // Real startBackfilledSession (history.tsx's own data layer) against the currently open()
      // database — the third D-33 funnel entry point, no stub.
      async startBackfilledSession(input: { date: string; timezone: string; exerciseIds: string[] }) {
        return startBackfilledSession(
          { date: new Date(input.date), timezone: input.timezone, exerciseIds: input.exerciseIds },
          requireOpenDb(),
        );
      },
      // Mounts EditingWorkoutRoute — the real editing-mode component workout.tsx itself renders —
      // against a named session in the currently open() database, without seeding.
      async openEditWorkoutScreen(sessionId: string) {
        const db = requireOpenDb();
        setEditingHarness({ db, sessionId });
      },
      // resolveNextUp's own coherence check (Phase 4 D-20), read straight off the currently open()
      // database — proves rotation self-heals from local_date after a backfill with no cursor to
      // repair, the same two real functions workout.tsx's own read path composes.
      async resolveNextUpKind(userId: string) {
        const db = requireOpenDb();
        const data = await loadNextUp(userId, db);
        const next = resolveNextUp({ routine: data.routine, days: data.days, cycles: data.cycles, history: data.history, today: data.today });
        return next.kind;
      },
    };

    setReady(true);
  }, []);

  return (
    <View>
      <Text testID="durability-harness-ready">{ready ? 'ready' : 'loading'}</Text>
      {workoutHarness ? <WorkoutHarnessScreen db={workoutHarness.db} userId={WORKOUT_HARNESS_USER_ID} /> : null}
      {editingHarness ? (
        <EditingWorkoutHarnessScreen db={editingHarness.db} userId={WORKOUT_HARNESS_USER_ID} sessionId={editingHarness.sessionId} />
      ) : null}
    </View>
  );
}
