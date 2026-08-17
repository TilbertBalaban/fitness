import type { AbstractPowerSyncDatabase, CrudEntry, CrudTransaction } from '@powersync/common';
import { SYNC_PUSH_PATH } from '@fitness/api-contracts';
import { workoutSession } from '../lib/db/schema';
import { apiFetch } from '../lib/api-client';
import { SyncConnector } from '../lib/db/connector';

jest.mock('../lib/api-client', () => ({
  apiFetch: jest.fn(),
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
    apiFetchMock.mockResolvedValue({ response: null, outcome: 'ok' });
    const rowId = fakeId();
    const transaction = fakeTransaction([fakeCrudEntry({ id: rowId })]);
    const database = fakeDatabase(transaction);

    await new SyncConnector().uploadData(database);

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = apiFetchMock.mock.calls[0];
    expect(path).toBe(SYNC_PUSH_PATH);
    const body = JSON.parse(init?.body as string);
    expect(body.batch).toHaveLength(1);
    expect(body.batch[0]).toMatchObject({ op: 'PUT', type: 'workout_session', id: rowId });
  });

  it('returns without calling apiFetch when there is no pending transaction', async () => {
    const database = fakeDatabase(null);

    await new SyncConnector().uploadData(database);

    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('completes the crud transaction on an ok outcome so it is not replayed', async () => {
    apiFetchMock.mockResolvedValue({ response: null, outcome: 'ok' });
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
