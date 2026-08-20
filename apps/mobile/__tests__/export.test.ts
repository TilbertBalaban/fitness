jest.mock('../lib/db/powersync', () => ({
  getUploadQueueStats: jest.fn(),
  getPowerSync: jest.fn(),
}));
jest.mock('../lib/api-client', () => ({
  apiFetch: jest.fn(),
}));

import { getUploadQueueStats } from '../lib/db/powersync';
import { apiFetch } from '../lib/api-client';
import { pendingWriteCount } from '../lib/pending-write-count';
import { getSyncStatus, recordPushOutcome } from '../lib/sync-status';
import { signOut } from '../lib/sign-out';
import { loggedSet, sessionExercise, workoutSession } from '../lib/db/schema';
import { buildExportDocument, type ExportDb } from '../lib/export/export-training-data';

const getUploadQueueStatsMock = getUploadQueueStats as jest.MockedFunction<typeof getUploadQueueStats>;
const apiFetchMock = apiFetch as jest.MockedFunction<typeof apiFetch>;

beforeEach(() => {
  getUploadQueueStatsMock.mockReset();
  apiFetchMock.mockReset();
});

describe('pendingWriteCount', () => {
  it('returns 0 when the crud queue is empty', async () => {
    getUploadQueueStatsMock.mockResolvedValue({ count: 0, size: null });
    await expect(pendingWriteCount()).resolves.toBe(0);
  });

  it('returns the number of pending operations when the queue is non-empty', async () => {
    getUploadQueueStatsMock.mockResolvedValue({ count: 7, size: null });
    await expect(pendingWriteCount()).resolves.toBe(7);
  });

  it('resolves rather than throwing when the local database has not been opened yet', async () => {
    getUploadQueueStatsMock.mockRejectedValue(new Error('database not open'));
    await expect(pendingWriteCount()).resolves.toBe(0);
  });

  it('issues no network request', async () => {
    getUploadQueueStatsMock.mockResolvedValue({ count: 3, size: null });
    await pendingWriteCount();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});

describe('signOut and the real pending count', () => {
  beforeEach(() => {
    apiFetchMock.mockResolvedValue({ response: null, outcome: 'ok' });
  });

  it('asks for confirmation and clears nothing when the caller declines a non-zero count', async () => {
    const confirmDiscard = jest.fn().mockResolvedValue(false);

    await signOut({ confirmDiscard, getPendingCount: async () => 3 });

    expect(confirmDiscard).toHaveBeenCalledWith(3);
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('proceeds without asking when the count is zero, exactly as before', async () => {
    const confirmDiscard = jest.fn();

    await signOut({ confirmDiscard, getPendingCount: async () => 0 });

    expect(confirmDiscard).not.toHaveBeenCalled();
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it('still accepts an injected getPendingCount, so both branches can be driven directly', async () => {
    const getPendingCount = jest.fn().mockResolvedValue(5);
    const confirmDiscard = jest.fn().mockResolvedValue(true);

    await signOut({ confirmDiscard, getPendingCount });

    expect(getPendingCount).toHaveBeenCalledTimes(1);
    expect(confirmDiscard).toHaveBeenCalledWith(5);
  });

  it('reads the real pendingWriteCount when no count is injected, so the confirmation receives the crud queue\'s number rather than a caller\'s', async () => {
    getUploadQueueStatsMock.mockResolvedValue({ count: 9, size: null });
    const confirmDiscard = jest.fn().mockResolvedValue(false);

    await signOut({ confirmDiscard });

    expect(confirmDiscard).toHaveBeenCalledWith(9);
  });
});

describe('getSyncStatus', () => {
  it('reports the pending write count, whether the last push succeeded, and when it last succeeded', async () => {
    getUploadQueueStatsMock.mockResolvedValue({ count: 4, size: null });
    recordPushOutcome('ok');

    const status = await getSyncStatus();

    expect(status.pendingWrites).toBe(4);
    expect(status.lastPushOutcome).toBe('ok');
    expect(status.lastSuccessfulPushAt).toEqual(expect.any(String));
  });

  it('issues no network request', async () => {
    getUploadQueueStatsMock.mockResolvedValue({ count: 0, size: null });

    await getSyncStatus();

    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});

describe('recordPushOutcome', () => {
  it('updates the last-push fields from the connector\'s AuthOutcome, without introducing a second connectivity concept', async () => {
    getUploadQueueStatsMock.mockResolvedValue({ count: 0, size: null });

    recordPushOutcome('ok');
    const afterOk = await getSyncStatus();
    expect(afterOk.lastPushOutcome).toBe('ok');
    expect(afterOk.lastSuccessfulPushAt).toEqual(expect.any(String));

    // 'offline' updates the outcome but must not clear the last-successful timestamp — sync
    // status has no second, independent notion of "connected" to reconcile against it.
    recordPushOutcome('offline');
    const afterOffline = await getSyncStatus();
    expect(afterOffline.lastPushOutcome).toBe('offline');
    expect(afterOffline.lastSuccessfulPushAt).toBe(afterOk.lastSuccessfulPushAt);
  });
});

type Row = Record<string, unknown>;

function fakeExportDb(
  overrides: {
    sessions?: Row[];
    sessionExercises?: Row[];
    loggedSets?: Row[];
    rejectWith?: Error;
  } = {},
): ExportDb {
  return {
    select: () => ({
      from: (table: unknown) => {
        if (overrides.rejectWith) return Promise.reject(overrides.rejectWith);
        if (table === workoutSession) return Promise.resolve(overrides.sessions ?? []);
        if (table === sessionExercise) return Promise.resolve(overrides.sessionExercises ?? []);
        if (table === loggedSet) return Promise.resolve(overrides.loggedSets ?? []);
        return Promise.resolve([]);
      },
    }),
  } as unknown as ExportDb;
}

function fakeSession(overrides: Partial<Row> = {}): Row {
  return {
    id: 'session-1',
    routineDayId: null,
    equipmentProfileId: null,
    startedAt: '2026-08-01T10:00:00.000Z',
    endedAt: '2026-08-01T11:00:00.000Z',
    status: 'completed',
    deviceId: 'device-1',
    timezone: 'America/New_York',
    localDate: '2026-08-01',
    ...overrides,
  };
}

function fakeSessionExercise(overrides: Partial<Row> = {}): Row {
  return {
    id: 'exercise-1',
    sessionId: 'session-1',
    exerciseId: 'bench-press',
    orderIndex: 0,
    supersetGroupId: null,
    routineExerciseId: null,
    targetSets: 3,
    targetRepMin: 8,
    targetRepMax: 12,
    targetRir: 3,
    targetRestSeconds: 90,
    ...overrides,
  };
}

function fakeLoggedSet(overrides: Partial<Row> = {}): Row {
  return {
    id: 'set-1',
    sessionExerciseId: 'exercise-1',
    setIndex: 1,
    setType: 'normal',
    weightKg: '102.500',
    reps: 8,
    rir: 2,
    side: null,
    completed: true,
    parentSetId: null,
    restTakenSeconds: 88,
    loggedAt: '2026-08-01T10:05:00.000Z',
    ...overrides,
  };
}

describe('buildExportDocument', () => {
  beforeEach(() => {
    getUploadQueueStatsMock.mockResolvedValue({ count: 0, size: null });
  });

  it('returns a manifest and a sessions array', async () => {
    const doc = await buildExportDocument(fakeExportDb());
    expect(doc.manifest).toBeDefined();
    expect(Array.isArray(doc.sessions)).toBe(true);
  });

  it('carries the export timestamp, app version, session count, set count, and unsynced write count in the manifest', async () => {
    getUploadQueueStatsMock.mockResolvedValue({ count: 5, size: null });
    const db = fakeExportDb({
      sessions: [fakeSession()],
      sessionExercises: [fakeSessionExercise()],
      loggedSets: [fakeLoggedSet()],
    });

    const doc = await buildExportDocument(db);

    expect(doc.manifest.exported_at).toEqual(expect.any(String));
    expect(doc.manifest.app_version).toEqual(expect.any(String));
    expect(doc.manifest.session_count).toBe(1);
    expect(doc.manifest.set_count).toBe(1);
    expect(doc.manifest.unsynced_write_count).toBe(5);
    expect(doc.manifest.scope).toEqual(expect.any(String));
  });

  it('nests each session exercise under its session, and each logged set under its session exercise', async () => {
    const db = fakeExportDb({
      sessions: [fakeSession()],
      sessionExercises: [fakeSessionExercise()],
      loggedSets: [fakeLoggedSet()],
    });

    const doc = await buildExportDocument(db);

    expect(doc.sessions).toHaveLength(1);
    expect(doc.sessions[0].session_exercises).toHaveLength(1);
    expect(doc.sessions[0].session_exercises[0].sets).toHaveLength(1);
    expect(doc.sessions[0].session_exercises[0].sets[0].id).toBe('set-1');
  });

  it('orders sets under their session exercise by set_index', async () => {
    const db = fakeExportDb({
      sessions: [fakeSession()],
      sessionExercises: [fakeSessionExercise()],
      loggedSets: [
        fakeLoggedSet({ id: 'set-3', setIndex: 3 }),
        fakeLoggedSet({ id: 'set-1', setIndex: 1 }),
        fakeLoggedSet({ id: 'set-2', setIndex: 2 }),
      ],
    });

    const doc = await buildExportDocument(db);

    expect(doc.sessions[0].session_exercises[0].sets.map((s) => s.id)).toEqual(['set-1', 'set-2', 'set-3']);
  });

  it('emits the weight as the stored canonical decimal string, not a converted or rounded number', async () => {
    const db = fakeExportDb({
      sessions: [fakeSession()],
      sessionExercises: [fakeSessionExercise()],
      loggedSets: [fakeLoggedSet({ weightKg: '102.500' })],
    });

    const doc = await buildExportDocument(db);

    expect(doc.sessions[0].session_exercises[0].sets[0].weight_kg).toBe('102.500');
  });

  it('emits local_date and timezone as stored', async () => {
    const db = fakeExportDb({
      sessions: [fakeSession({ timezone: 'Australia/Sydney', localDate: '2026-08-02' })],
    });

    const doc = await buildExportDocument(db);

    expect(doc.sessions[0].timezone).toBe('Australia/Sydney');
    expect(doc.sessions[0].local_date).toBe('2026-08-02');
  });

  it('exports a session with no logged sets with an empty sets array rather than omitting it', async () => {
    const db = fakeExportDb({
      sessions: [fakeSession()],
      sessionExercises: [fakeSessionExercise()],
      loggedSets: [],
    });

    const doc = await buildExportDocument(db);

    expect(doc.sessions).toHaveLength(1);
    expect(doc.sessions[0].session_exercises[0].sets).toEqual([]);
  });

  it('returns a valid document with zero sessions for an empty database', async () => {
    const doc = await buildExportDocument(fakeExportDb());

    expect(doc.sessions).toEqual([]);
    expect(doc.manifest.session_count).toBe(0);
    expect(doc.manifest.set_count).toBe(0);
  });

  it('reads only the local database and issues no network request', async () => {
    const db = fakeExportDb({
      sessions: [fakeSession()],
      sessionExercises: [fakeSessionExercise()],
      loggedSets: [fakeLoggedSet()],
    });

    await buildExportDocument(db);

    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('round-trips through JSON serialization and parses back to an equal structure', async () => {
    const db = fakeExportDb({
      sessions: [fakeSession()],
      sessionExercises: [fakeSessionExercise()],
      loggedSets: [fakeLoggedSet()],
    });

    const doc = await buildExportDocument(db);
    const roundTripped = JSON.parse(JSON.stringify(doc));

    expect(roundTripped).toEqual(doc);
  });
});
