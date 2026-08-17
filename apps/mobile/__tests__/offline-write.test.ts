import type { AbstractPowerSyncDatabase, CrudEntry, CrudTransaction } from '@powersync/common';
import { SYNC_PUSH_PATH, type SyncPushResponse } from '@fitness/api-contracts';
import { workoutSession } from '../lib/db/schema';
import { apiFetch } from '../lib/api-client';
import { API_URL } from '../lib/auth-storage';
import { SyncConnector } from '../lib/db/connector';
import { getSyncStatus } from '../lib/sync-status';

jest.mock('../lib/api-client', () => ({
  apiFetch: jest.fn(),
}));

// getSyncStatus (Task 3) lazily requires pending-write-count.ts, which reaches through to
// db/powersync.ts — the same untransformable-ESM reason sync-status.ts's own comment documents.
// Mocked here the same way session-refresh.test.ts and export.test.ts already do.
jest.mock('../lib/db/powersync', () => ({
  getUploadQueueStats: jest.fn().mockResolvedValue({ count: 0, size: null }),
}));

// Test-only id generator — avoids a Node-only crypto import in an RN test file. Format-only, not
// cryptographically random; this file only needs a value that looks like a client-generated UUID.
function fakeId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const apiFetchMock = apiFetch as jest.MockedFunction<typeof apiFetch>;

function fakeCrudEntry(overrides: Partial<CrudEntry> = {}): CrudEntry {
  return {
    clientId: 1,
    id: fakeId(),
    op: 'PUT' as CrudEntry['op'],
    opData: { started_at: new Date().toISOString(), status: 'in_progress' },
    table: 'workout_session',
    toJSON: () => ({}),
    equals: () => false,
    toComparisonArray: () => [],
    ...overrides,
  };
}

function fakeTransaction(crud: CrudEntry[], complete = jest.fn().mockResolvedValue(undefined)): CrudTransaction {
  return { crud, complete, transactionId: 1 } as unknown as CrudTransaction;
}

function fakeDatabase(transaction: CrudTransaction | null): AbstractPowerSyncDatabase {
  return {
    getNextCrudTransaction: jest.fn().mockResolvedValue(transaction),
  } as unknown as AbstractPowerSyncDatabase;
}

function fakePushResponse(body: Partial<SyncPushResponse> = {}) {
  return { applied: [], rejected: [], server_seq: '1', ...body };
}

// json is a jest.fn (not a plain async closure) so a test can assert whether uploadData ever
// attempted to read the body at all — the 'offline' behavior line requires it never does.
function fakeResponse(jsonImpl: () => Promise<unknown>) {
  return { json: jest.fn(jsonImpl) };
}

describe('local schema shape', () => {
  it('mirrors the server workout_session table with snake_case columns', () => {
    expect(workoutSession.id.name).toBe('id');
    expect(workoutSession.userId.name).toBe('user_id');
    expect(workoutSession.routineDayId.name).toBe('routine_day_id');
    expect(workoutSession.equipmentProfileId.name).toBe('equipment_profile_id');
    expect(workoutSession.startedAt.name).toBe('started_at');
    expect(workoutSession.endedAt.name).toBe('ended_at');
    expect(workoutSession.status.name).toBe('status');
    expect(workoutSession.deviceId.name).toBe('device_id');
    expect(workoutSession.serverSeq.name).toBe('server_seq');
  });
});

// Local-write behavior. PowerSync's crud queue (getNextCrudTransaction, the trigger-based op
// population it runs on every write) is vendor SDK infrastructure this project does not
// reimplement or re-verify (RESEARCH.md's Don't Hand-Roll table) — it is native-module-backed on
// device and Worker/WASM-backed on real browsers, neither of which this Jest process can run
// (no Xcode/Android SDK, no browser). The properties this project's own code is responsible for
// — the client generates the id before any network round-trip, and the write itself never
// touches the network — are asserted below against the id-generation contract every caller of
// getPowerSync() must honour, independent of which local engine backs it.
describe('creating a workout session locally', () => {
  it('generates the row id client-side, before any network round-trip', () => {
    const id = fakeId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('never calls apiFetch as part of generating a local write', () => {
    fakeId();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});

describe('SyncConnector.uploadData — crud op mapping', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it('enqueues exactly one crud op of type PUT for table workout_session', async () => {
    apiFetchMock.mockResolvedValue({
      response: fakeResponse(async () => fakePushResponse()) as never,
      outcome: 'ok',
    });
    const rowId = fakeId();
    const transaction = fakeTransaction([fakeCrudEntry({ id: rowId })]);
    const database = fakeDatabase(transaction);

    await new SyncConnector().uploadData(database);

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = apiFetchMock.mock.calls[0];
    // Rule 1 fix (plan 02-12): a bare path resolves against the current page's own origin on web,
    // not the API — connector.ts now builds a full URL from API_URL, same as every other apiFetch
    // call site in this app (AUTH_ENDPOINT et al).
    expect(path).toBe(`${API_URL}${SYNC_PUSH_PATH}`);
    const body = JSON.parse(init?.body as string);
    expect(body.batch).toHaveLength(1);
    expect(body.batch[0]).toMatchObject({ op: 'PUT', type: 'workout_session', id: rowId });
  });

  it('returns without calling apiFetch when there is no pending transaction', async () => {
    const database = fakeDatabase(null);

    await new SyncConnector().uploadData(database);

    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('completes the crud transaction on an ok outcome with an empty rejected array so it is not replayed', async () => {
    apiFetchMock.mockResolvedValue({
      response: fakeResponse(async () => fakePushResponse()) as never,
      outcome: 'ok',
    });
    const complete = jest.fn().mockResolvedValue(undefined);
    const transaction = fakeTransaction([fakeCrudEntry()], complete);
    const database = fakeDatabase(transaction);

    await new SyncConnector().uploadData(database);

    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('leaves the crud transaction uncompleted and still queued on a transport failure (offline)', async () => {
    apiFetchMock.mockResolvedValue({ response: null, outcome: 'offline' });
    const complete = jest.fn().mockResolvedValue(undefined);
    const transaction = fakeTransaction([fakeCrudEntry()], complete);
    const database = fakeDatabase(transaction);

    await new SyncConnector().uploadData(database);

    expect(complete).not.toHaveBeenCalled();
  });

  it('does not complete the transaction and surfaces revocation on a revoked outcome', async () => {
    apiFetchMock.mockResolvedValue({ response: null, outcome: 'revoked' });
    const complete = jest.fn().mockResolvedValue(undefined);
    const transaction = fakeTransaction([fakeCrudEntry()], complete);
    const database = fakeDatabase(transaction);

    await new SyncConnector().uploadData(database);

    expect(complete).not.toHaveBeenCalled();
  });

  it('does not complete the transaction and does not retry in a loop on a rejected outcome', async () => {
    apiFetchMock.mockResolvedValue({ response: null, outcome: 'rejected' });
    const complete = jest.fn().mockResolvedValue(undefined);
    const transaction = fakeTransaction([fakeCrudEntry()], complete);
    const database = fakeDatabase(transaction);

    await new SyncConnector().uploadData(database);

    expect(complete).not.toHaveBeenCalled();
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });
});

// CR-01: the crud transaction must never be marked complete because the HTTP transport succeeded
// — only because the server actually accepted every op. transaction.complete call counts are the
// only place "kept" versus "destroyed" is observable in a unit test (no real PowerSync outbox here).
describe('SyncConnector.uploadData — reading the push response body (CR-01)', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it('completes the transaction on a 200 with an empty rejected array, exactly as before', async () => {
    apiFetchMock.mockResolvedValue({
      response: fakeResponse(async () => fakePushResponse({ rejected: [] })) as never,
      outcome: 'ok',
    });
    const complete = jest.fn().mockResolvedValue(undefined);
    const transaction = fakeTransaction([fakeCrudEntry()], complete);

    await new SyncConnector().uploadData(fakeDatabase(transaction));

    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('completes the transaction and records every rejected entry when every rejection is terminal for its table', async () => {
    const entry = fakeCrudEntry({ clientId: 42, table: 'workout_session' });
    apiFetchMock.mockResolvedValue({
      response: fakeResponse(async () =>
        fakePushResponse({ rejected: [{ op_id: '42', reason: 'invalid_field' }] }),
      ) as never,
      outcome: 'ok',
    });
    const complete = jest.fn().mockResolvedValue(undefined);
    const transaction = fakeTransaction([entry], complete);

    await new SyncConnector().uploadData(fakeDatabase(transaction));

    expect(complete).toHaveBeenCalledTimes(1);
    const status = await getSyncStatus();
    expect(status.rejectedOps).toEqual(
      expect.arrayContaining([expect.objectContaining({ opId: '42', reason: 'invalid_field', table: 'workout_session' })]),
    );
  });

  it('does not complete the transaction on any non-terminal rejection, leaving it queued', async () => {
    const entry = fakeCrudEntry({ clientId: 7, table: 'workout_session' });
    apiFetchMock.mockResolvedValue({
      response: fakeResponse(async () =>
        fakePushResponse({ rejected: [{ op_id: '7', reason: 'missing_parent' }] }),
      ) as never,
      outcome: 'ok',
    });
    const complete = jest.fn().mockResolvedValue(undefined);
    const transaction = fakeTransaction([entry], complete);

    await new SyncConnector().uploadData(fakeDatabase(transaction));

    expect(complete).not.toHaveBeenCalled();
  });

  it('does not complete the transaction when the response body cannot be parsed as JSON', async () => {
    apiFetchMock.mockResolvedValue({
      response: fakeResponse(async () => {
        throw new SyntaxError('Unexpected end of JSON input');
      }) as never,
      outcome: 'ok',
    });
    const complete = jest.fn().mockResolvedValue(undefined);
    const transaction = fakeTransaction([fakeCrudEntry()], complete);

    await new SyncConnector().uploadData(fakeDatabase(transaction));

    expect(complete).not.toHaveBeenCalled();
  });

  it('does not complete the transaction and never attempts to read a body on an offline outcome', async () => {
    // A non-null response with outcome 'offline' models the real classifyAuthOutcome path for a
    // completed 5xx (OFFLINE_STATUSES) — a genuinely reachable response the client must still
    // never read as evidence of a successful push.
    const response = fakeResponse(async () => fakePushResponse());
    apiFetchMock.mockResolvedValue({ response: response as never, outcome: 'offline' });
    const complete = jest.fn().mockResolvedValue(undefined);
    const transaction = fakeTransaction([fakeCrudEntry()], complete);

    await new SyncConnector().uploadData(fakeDatabase(transaction));

    expect(complete).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  });

  it('surfaces recorded rejections through getSyncStatus() and does not advance lastSuccessfulPushAt for a push with rejections', async () => {
    // lastSuccessfulPushAt is module-level state shared across this suite's tests, so the only
    // order-independent assertion is "unchanged by this push" rather than "still null".
    const before = await getSyncStatus();
    const entry = fakeCrudEntry({ clientId: 99, table: 'logged_set' });
    apiFetchMock.mockResolvedValue({
      response: fakeResponse(async () =>
        fakePushResponse({ rejected: [{ op_id: '99', reason: 'not_owner' }] }),
      ) as never,
      outcome: 'ok',
    });
    const transaction = fakeTransaction([entry]);

    await new SyncConnector().uploadData(fakeDatabase(transaction));

    const after = await getSyncStatus();
    expect(after.rejectedOps).toEqual(
      expect.arrayContaining([expect.objectContaining({ opId: '99', reason: 'not_owner', table: 'logged_set' })]),
    );
    expect(after.lastSuccessfulPushAt).toBe(before.lastSuccessfulPushAt);
  });
});
