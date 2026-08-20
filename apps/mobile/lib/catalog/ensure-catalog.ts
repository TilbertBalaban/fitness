import { loadCatalogSnapshot, type CatalogLoadResult } from './load-snapshot';
import type { WriteDb } from '../db/powersync';

export type CatalogLoader = (db: WriteDb) => Promise<CatalogLoadResult>;

let inFlight: Promise<CatalogLoadResult> | null = null;

// Keyed by nothing: getPowerSync() is a process singleton, so this module-level memo is always
// scoped to the one db instance the whole app ever has.
export function ensureCatalogLoaded(
  db: WriteDb,
  loader: CatalogLoader = loadCatalogSnapshot,
): Promise<CatalogLoadResult> {
  if (inFlight) return inFlight;
  const pending = Promise.resolve().then(() => loader(db));
  inFlight = pending.catch((error) => {
    inFlight = null;
    throw error;
  });
  return inFlight;
}

export function resetCatalogLoadState(): void {
  inFlight = null;
}
