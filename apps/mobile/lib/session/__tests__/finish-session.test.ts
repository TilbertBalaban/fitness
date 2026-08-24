import { finishSession } from '../finish-session';
import { completeSession } from '../../db/session-lifecycle';
import { cancelRestAlert } from '../../rest-alert';

jest.mock('../../db/session-lifecycle', () => ({ completeSession: jest.fn() }));
jest.mock('../../rest-alert', () => ({ cancelRestAlert: jest.fn() }));
jest.mock('../../db/powersync', () => ({ getPowerSync: jest.fn() }));

const completeSessionMock = completeSession as jest.MockedFunction<typeof completeSession>;
const cancelRestAlertMock = cancelRestAlert as jest.MockedFunction<typeof cancelRestAlert>;

beforeEach(() => {
  completeSessionMock.mockReset().mockResolvedValue(undefined);
  cancelRestAlertMock.mockReset().mockResolvedValue(undefined);
});

describe('finishSession (D-32)', () => {
  it('completes the session, cancels any scheduled rest alert, and navigates home', async () => {
    const push = jest.fn();
    const db = {} as never;

    await finishSession('s-1', { push }, db);

    expect(completeSessionMock).toHaveBeenCalledWith('s-1', expect.any(Date), db);
    expect(cancelRestAlertMock).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/(tabs)');
  });

  it('completes and cancels before navigating', async () => {
    const order: string[] = [];
    completeSessionMock.mockImplementation(async () => {
      order.push('complete');
    });
    cancelRestAlertMock.mockImplementation(async () => {
      order.push('cancel');
    });
    const push = jest.fn(() => order.push('push'));

    await finishSession('s-1', { push }, {} as never);

    expect(order).toEqual(['complete', 'cancel', 'push']);
  });
});
