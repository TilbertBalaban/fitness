jest.mock('../../db/powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../load-snapshot', () => ({ loadCatalogSnapshot: jest.fn() }));

import { ensureCatalogLoaded, resetCatalogLoadState } from '../ensure-catalog';
import { loadCatalogSnapshot, type CatalogLoadResult } from '../load-snapshot';
import type { WriteDb } from '../../db/powersync';

const loadCatalogSnapshotMock = loadCatalogSnapshot as jest.MockedFunction<typeof loadCatalogSnapshot>;
const fakeDb = {} as WriteDb;

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  resetCatalogLoadState();
  jest.clearAllMocks();
});

describe('ensureCatalogLoaded', () => {
  it('calls loader exactly once when invoked twice concurrently, and both callers resolve to the same value', async () => {
    const { promise, resolve } = deferred<CatalogLoadResult>();
    const loader = jest.fn(() => promise);

    const first = ensureCatalogLoaded(fakeDb, loader);
    const second = ensureCatalogLoaded(fakeDb, loader);
    resolve({ status: 'loaded', catalogVersion: 'v1' });

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(loader.mock.calls.length).toBe(1);
    expect(firstResult).toBe(secondResult);
  });

  it('calls loader exactly once when invoked twice sequentially after the first resolves', async () => {
    const loader = jest.fn(() => Promise.resolve<CatalogLoadResult>({ status: 'loaded', catalogVersion: 'v1' }));

    await ensureCatalogLoaded(fakeDb, loader);
    await ensureCatalogLoaded(fakeDb, loader);

    expect(loader.mock.calls.length).toBe(1);
  });

  it('rejects when loader rejects, and a subsequent call invokes loader again and can resolve successfully', async () => {
    const loader = jest
      .fn<Promise<CatalogLoadResult>, [WriteDb]>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ status: 'loaded', catalogVersion: 'v1' });

    await expect(ensureCatalogLoaded(fakeDb, loader)).rejects.toThrow('boom');
    await expect(ensureCatalogLoaded(fakeDb, loader)).resolves.toEqual({ status: 'loaded', catalogVersion: 'v1' });
    expect(loader.mock.calls.length).toBe(2);
  });

  it('rejects rather than throwing synchronously when loader throws synchronously', async () => {
    const loader = jest.fn(() => {
      throw new Error('sync boom');
    });

    await expect(ensureCatalogLoaded(fakeDb, loader)).rejects.toThrow('sync boom');
  });

  it('delegates to loadCatalogSnapshot, passing through the exact db it was given, with no loader argument', async () => {
    loadCatalogSnapshotMock.mockResolvedValueOnce({ status: 'current', catalogVersion: 'v1' });

    await ensureCatalogLoaded(fakeDb);

    expect(loadCatalogSnapshotMock).toHaveBeenCalledTimes(1);
    expect(loadCatalogSnapshotMock).toHaveBeenCalledWith(fakeDb);
  });

  it('returns an invalid result as a value rather than converting it into a rejection', async () => {
    const loader = jest.fn(() => Promise.resolve<CatalogLoadResult>({ status: 'invalid' }));

    await expect(ensureCatalogLoaded(fakeDb, loader)).resolves.toEqual({ status: 'invalid' });
  });

  it('resetCatalogLoadState clears the memo so a new call invokes the loader again', async () => {
    const loader = jest.fn(() => Promise.resolve<CatalogLoadResult>({ status: 'loaded', catalogVersion: 'v1' }));

    await ensureCatalogLoaded(fakeDb, loader);
    resetCatalogLoadState();
    await ensureCatalogLoaded(fakeDb, loader);

    expect(loader.mock.calls.length).toBe(2);
  });
});
