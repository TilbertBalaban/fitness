jest.mock('../lib/db/powersync', () => ({
  getUploadQueueStats: jest.fn(),
}));
jest.mock('../lib/api-client', () => ({
  apiFetch: jest.fn(),
}));

import { getUploadQueueStats } from '../lib/db/powersync';
import { apiFetch } from '../lib/api-client';
import { pendingWriteCount } from '../lib/pending-write-count';
import { getSyncStatus, recordPushOutcome } from '../lib/sync-status';
import { signOut } from '../lib/sign-out';

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
