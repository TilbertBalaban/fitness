import { CATALOG_DOWNLOAD_PATH, CATALOG_VERSION_PATH, isCatalogSnapshot, type CatalogSnapshot } from '@fitness/api-contracts';
import { apiFetch } from '../api-client';
import { API_URL } from '../auth-storage';
import { getPowerSync, type WriteDb } from '../db/powersync';
import { applyCatalogSnapshot, readCatalogVersion } from './load-snapshot';

export type RefreshOutcome =
  | { status: 'current' }
  | { status: 'updated'; catalogVersion: string }
  | { status: 'offline' }
  | { status: 'invalid' }
  | { status: 'write-failed' };

interface CatalogVersionPayload {
  catalog_version: string;
}

// @fitness/api-contracts exports bare paths (no origin) — every apiFetch call site in this app
// builds a full URL from API_URL first (connector.ts's own comment names the exact bug a bare
// path produces: it resolves against the current page's own origin on web, not the API).
const VERSION_URL = `${API_URL}${CATALOG_VERSION_PATH}`;
const DOWNLOAD_URL = `${API_URL}${CATALOG_DOWNLOAD_PATH}`;

// Background catalog refresh — never called from app/_layout.tsx by this plan (deliberately: that
// file is not in 03-05's file scope, and the wiring belongs with whichever screen's mount has
// somewhere to show a failure; 03-06 wires it from the exercises screen). Resolves to an outcome
// for every failure mode because the whole body is wrapped in try/catch — not only the
// transaction — so a fire-and-forget `void refreshCatalog(db)` caller is safe, matching D-02's
// never-block-cold-start discipline and D-09's transport-failure-vs-revocation split already
// established in session-guard.ts/connector.ts.
export async function refreshCatalog(db: WriteDb = getPowerSync()): Promise<RefreshOutcome> {
  try {
    const localVersion = await readCatalogVersion(db);

    const { response: versionResponse, outcome: versionOutcome } = await apiFetch(VERSION_URL);
    if (versionOutcome !== 'ok' || !versionResponse) {
      return { status: 'offline' };
    }

    let remoteVersion: string;
    try {
      const payload = (await versionResponse.json()) as CatalogVersionPayload;
      remoteVersion = payload.catalog_version;
    } catch {
      return { status: 'offline' };
    }

    if (remoteVersion === localVersion) {
      return { status: 'current' };
    }

    const { response: downloadResponse, outcome: downloadOutcome } = await apiFetch(DOWNLOAD_URL);
    if (downloadOutcome !== 'ok' || !downloadResponse) {
      return { status: 'offline' };
    }

    let payload: unknown;
    try {
      payload = await downloadResponse.json();
    } catch {
      return { status: 'offline' };
    }

    if (!isCatalogSnapshot(payload)) {
      return { status: 'invalid' };
    }
    const snapshot: CatalogSnapshot = payload;

    // Same write path loadCatalogSnapshot uses for the bundled first-install asset (03-05 Task 3's
    // own instruction) — the apply is scoped to seededExercise only, so `exercise` (a user's own
    // custom rows) is never in reach; this is a structural guarantee from table separation
    // (WINDOWS #32), not a WHERE is_custom=false filter that a future edit could accidentally drop.
    await db.transaction(async (tx) => {
      await applyCatalogSnapshot(tx, snapshot);
    });

    return { status: 'updated', catalogVersion: snapshot.catalog_version };
  } catch (error) {
    console.error('background catalog refresh failed', error);
    return { status: 'write-failed' };
  }
}
