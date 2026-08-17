import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { addSessionExercise, logSet, startSession } from '../lib/db/log-set';
import {
  DURABILITY_HARNESS_GLOBAL,
  closeTestPowerSync,
  openTestPowerSync,
  pendingCrudCount,
  readLoggedSets,
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

    function requireOpenDb(): TestWriteDb {
      if (!currentDb) {
        throw new Error('durability harness: open() must be called before this method');
      }
      return currentDb;
    }

    (window as unknown as Record<string, unknown>)[DURABILITY_HARNESS_GLOBAL] = {
      async open() {
        currentDb = openTestPowerSync();
      },
      async close() {
        await closeTestPowerSync();
        lastClosedDb = currentDb;
        currentDb = null;
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
        return pendingCrudCount();
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
