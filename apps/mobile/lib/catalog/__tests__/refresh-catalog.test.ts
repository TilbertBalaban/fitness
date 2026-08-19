import { refreshCatalog, type RefreshOutcome } from '../refresh-catalog';
import { apiFetch } from '../../api-client';
import { getPowerSync } from '../../db/powersync';
import * as loadSnapshotModule from '../load-snapshot';
import catalogSnapshotJson from '../../../assets/catalog/catalog-snapshot.json';
import catalogNormalizedJson from '../../../../api/src/seed/data/catalog-normalized.json';

jest.mock('../../api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../db/powersync', () => ({ getPowerSync: jest.fn() }));

const apiFetchMock = apiFetch as jest.MockedFunction<typeof apiFetch>;
const getPowerSyncMock = getPowerSync as jest.MockedFunction<typeof getPowerSync>;

function jsonResponse(body: unknown): Response {
  return { json: async () => body } as unknown as Response;
}

const VALID_EXERCISE = {
  id: 'ex-1',
  name: 'Bench Press',
  aliases: null,
  movement_pattern: 'horizontal_push',
  equipment_required: 'barbell',
  load_type: 'external_weight',
  unilateral: false,
  instructions_text: null,
  cue_text: null,
  image_urls: [],
  bodyweight_contribution_pct: null,
  variation_of_id: null,
  source: 'seed',
};

const NEWER_SNAPSHOT = {
  catalog_version: 'v2',
  generated_at: '2026-01-02T00:00:00.000Z',
  muscle_groups: [{ id: 'chest', name: 'Chest', body_region: 'chest' }],
  exercises: [VALID_EXERCISE],
  mappings: [{ exercise_id: 'ex-1', muscle_group_id: 'chest', role: 'primary', weight_factor: '1.00' }],
};

describe('refreshCatalog — control flow (applyCatalogSnapshot mocked)', () => {
  const readCatalogVersionSpy = jest.spyOn(loadSnapshotModule, 'readCatalogVersion');
  const applyCatalogSnapshotSpy = jest.spyOn(loadSnapshotModule, 'applyCatalogSnapshot');
  const FAKE_DB = {
    transaction: jest.fn(async (callback: (tx: unknown) => Promise<void>) => callback(FAKE_DB)),
  } as unknown as ReturnType<typeof getPowerSync>;

  beforeEach(() => {
    jest.clearAllMocks();
    getPowerSyncMock.mockReturnValue(FAKE_DB);
    applyCatalogSnapshotSpy.mockResolvedValue(undefined);
  });

  it('makes no download call and returns current when the version endpoint matches the locally-applied version', async () => {
    readCatalogVersionSpy.mockResolvedValue('v1');
    apiFetchMock.mockResolvedValue({ response: jsonResponse({ catalog_version: 'v1' }), outcome: 'ok' });

    const result = await refreshCatalog(FAKE_DB);

    expect(result satisfies RefreshOutcome).toEqual({ status: 'current' });
    expect(apiFetchMock).toHaveBeenCalledTimes(1); // version only, never download
    expect(applyCatalogSnapshotSpy).not.toHaveBeenCalled();
  });

  it('downloads, validates, applies, and reports updated with the new catalog_version when the version endpoint returns a newer version', async () => {
    readCatalogVersionSpy.mockResolvedValue('v1');
    apiFetchMock
      .mockResolvedValueOnce({ response: jsonResponse({ catalog_version: 'v2' }), outcome: 'ok' })
      .mockResolvedValueOnce({ response: jsonResponse(NEWER_SNAPSHOT), outcome: 'ok' });

    const result = await refreshCatalog(FAKE_DB);

    expect(result).toEqual({ status: 'updated', catalogVersion: 'v2' });
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    expect(applyCatalogSnapshotSpy).toHaveBeenCalledTimes(1);
    expect(applyCatalogSnapshotSpy).toHaveBeenCalledWith(expect.anything(), NEWER_SNAPSHOT);
  });

  it('resolves to an offline outcome without throwing when the network is unreachable, and writes nothing', async () => {
    readCatalogVersionSpy.mockResolvedValue('v1');
    apiFetchMock.mockResolvedValue({ response: null, outcome: 'offline' });

    const result = await refreshCatalog(FAKE_DB);

    expect(result).toEqual({ status: 'offline' });
    expect(applyCatalogSnapshotSpy).not.toHaveBeenCalled();
  });

  it('returns invalid and writes nothing when the download fails isCatalogSnapshot', async () => {
    readCatalogVersionSpy.mockResolvedValue('v1');
    apiFetchMock
      .mockResolvedValueOnce({ response: jsonResponse({ catalog_version: 'v2' }), outcome: 'ok' })
      .mockResolvedValueOnce({ response: jsonResponse({ not: 'a catalog snapshot' }), outcome: 'ok' });

    const result = await refreshCatalog(FAKE_DB);

    expect(result).toEqual({ status: 'invalid' });
    expect(applyCatalogSnapshotSpy).not.toHaveBeenCalled();
  });

  it('resolves to write-failed rather than rejecting when the local write throws', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    readCatalogVersionSpy.mockResolvedValue('v1');
    apiFetchMock
      .mockResolvedValueOnce({ response: jsonResponse({ catalog_version: 'v2' }), outcome: 'ok' })
      .mockResolvedValueOnce({ response: jsonResponse(NEWER_SNAPSHOT), outcome: 'ok' });
    applyCatalogSnapshotSpy.mockRejectedValue(new Error('cannot UPSERT a view'));

    const result = await refreshCatalog(FAKE_DB);

    expect(result satisfies RefreshOutcome).toEqual({ status: 'write-failed' });
    consoleErrorSpy.mockRestore();
  });

  afterAll(() => {
    readCatalogVersionSpy.mockRestore();
    applyCatalogSnapshotSpy.mockRestore();
  });
});

describe('refreshCatalog — a custom exercise row is byte-identical after a successful refresh (real applyCatalogSnapshot, not mocked)', () => {
  // A minimal in-memory table-keyed store, following the same fakeDb shape established by
  // load-snapshot.test.ts — table identity is what every query in load-snapshot.ts branches on.
  // Unlike the control-flow tests above, this one runs the REAL applyCatalogSnapshot end-to-end
  // through refreshCatalog, so it directly proves the must_haves truth rather than proving
  // refreshCatalog merely delegates to it.
  it('leaves a pre-existing custom exercise row untouched — applyCatalogSnapshot never references the `exercise` table at all', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const schema = jest.requireActual('../../db/schema') as typeof import('../../db/schema');
    const rows = new Map<unknown, Record<string, unknown>[]>([
      [schema.muscleGroup, []],
      [schema.seededExercise, []],
      [schema.exerciseMuscleMapping, []],
      [schema.catalogMeta, []],
      [
        schema.exercise,
        [{ id: 'custom-1', userId: 'user-1', name: 'My Custom Curl', isCustom: true, source: 'custom', loadType: 'external_weight' }],
      ],
    ]);
    // Raises a uniqueness failure when the id is already present — mirrors a real INSERT against
    // a populated view (load-snapshot.test.ts's fakeDb establishes the same shape).
    function insertRow(table: unknown, values: Record<string, unknown>) {
      const existing = rows.get(table) ?? [];
      if (existing.some((row) => row.id === values.id)) {
        throw new Error('UNIQUE constraint failed: id');
      }
      existing.push(values);
      rows.set(table, existing);
    }
    const UPSERT_AGAINST_VIEW_ERROR = 'cannot UPSERT a view';
    const fakeDb = {
      select: (fields: Record<string, unknown>) => ({
        from: (table: unknown) => {
          const tableRows = rows.get(table) ?? [];
          const project = (row: Record<string, unknown>) => {
            const projected: Record<string, unknown> = {};
            for (const key of Object.keys(fields)) projected[key] = row[key];
            return projected;
          };
          return {
            where: () => Promise.resolve(tableRows.map(project)),
            then: (resolve: (value: unknown[]) => unknown) => resolve(tableRows.map(project)),
          };
        },
      }),
      insert: (table: unknown) => ({
        // A thenable, not an eagerly-run insert — the production call no longer chains a conflict
        // method onto this. Calling onConflictDoUpdate/onConflictDoNothing instead never runs
        // insertRow at all, matching a real engine that rejects at prepare time before any row is
        // touched.
        values: (values: Record<string, unknown>) => ({
          then: (
            onFulfilled?: ((value: void) => unknown) | null,
            onRejected?: ((reason: unknown) => unknown) | null,
          ) =>
            new Promise<void>((resolve, reject) => {
              try {
                insertRow(table, values);
                resolve();
              } catch (err) {
                reject(err);
              }
            }).then(onFulfilled ?? undefined, onRejected ?? undefined),
          onConflictDoUpdate: () => Promise.reject(new Error(UPSERT_AGAINST_VIEW_ERROR)),
          onConflictDoNothing: () => Promise.reject(new Error(UPSERT_AGAINST_VIEW_ERROR)),
        }),
      }),
      // A real WHERE-clause condition is opaque to this fake, matching load-snapshot.test.ts's
      // fakeDb — this test never exercises the per-row update branch (only fresh inserts), so
      // condition-blindness is safe here.
      update: (table: unknown) => ({
        set: (setValues: Record<string, unknown>) => ({
          where: () => {
            const tableRows = rows.get(table) ?? [];
            rows.set(
              table,
              tableRows.map((row) => ({ ...row, ...setValues })),
            );
            return Promise.resolve();
          },
        }),
      }),
      transaction: async (callback: (tx: unknown) => Promise<void>) => {
        await callback(fakeDb);
      },
    };
    const before = JSON.parse(JSON.stringify(rows.get(schema.exercise)));

    getPowerSyncMock.mockReturnValue(fakeDb as unknown as ReturnType<typeof getPowerSync>);
    apiFetchMock
      .mockResolvedValueOnce({ response: jsonResponse({ catalog_version: 'v2' }), outcome: 'ok' })
      .mockResolvedValueOnce({ response: jsonResponse(NEWER_SNAPSHOT), outcome: 'ok' });

    const result = await refreshCatalog(fakeDb as unknown as ReturnType<typeof getPowerSync>);

    expect(result).toEqual({ status: 'updated', catalogVersion: 'v2' });
    expect(rows.get(schema.exercise)).toEqual(before);
    expect(rows.get(schema.seededExercise)).toHaveLength(1); // the real apply DID run
  });
});

describe('bundled snapshot version parity', () => {
  it("the bundled mobile snapshot's catalog_version equals the committed normalized artifact's — a forgotten sync:catalog-snapshot copy goes red here, not silent", () => {
    expect(catalogSnapshotJson.catalog_version).toBe(catalogNormalizedJson.catalog_version);
    expect(catalogSnapshotJson.exercises.length).toBe(catalogNormalizedJson.exercises.length);
  });
});
