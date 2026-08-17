import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { SyncConnector } from '../lib/db/connector';
import { addSessionExercise, logSet, startSession } from '../lib/db/log-set';
import {
  connectPowerSync,
  disconnectPowerSync,
  getPowerSync,
  getUploadQueueStats,
} from '../lib/db/powersync';
import {
  DURABILITY_HARNESS_GLOBAL,
  closeTestPowerSync,
  connectTestPowerSync,
  disconnectTestPowerSync,
  openTestPowerSync,
  pendingCrudCount,
  readAllLoggedSetsRaw,
  readLoggedSets,
  readLoggedSetsRaw,
  readRawColumns,
  reopenTestPowerSync,
  type TestWriteDb,
} from '../lib/db/test-support';

// A Playwright page drives this route through window[DURABILITY_HARNESS_GLOBAL] — see
// e2e/durability.spec.ts. Every write goes through the real lib/db/log-set.ts helpers; this route
// re-implements no insert.
export default function DurabilityHarnessScreen() {
  const [ready, setReady] = useState(false);

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
      async close() {
        await closeTestPowerSync();
        lastClosedDb = currentDb;
        currentDb = null;
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
    };

    setReady(true);
  }, []);

  return (
    <View>
      <Text testID="durability-harness-ready">{ready ? 'ready' : 'loading'}</Text>
    </View>
  );
}
