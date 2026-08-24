// expo-notifications is mocked wholesale — this suite proves rest-alert.ts's own scheduling
// discipline (cancel-before-schedule, no-op cancel, memoized denial), not the native module.
// react-native's Linking is untouched: none of these cases exercise openAlertSettings, so the
// real (already-jest-preset-mocked) module is used as-is rather than re-wrapping it, which would
// force react-native's lazily-defined component getters to evaluate eagerly at mock time.
jest.mock('expo-notifications', () => {
  const PermissionStatus = { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' };
  return {
    setNotificationHandler: jest.fn(),
    setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
    scheduleNotificationAsync: jest.fn().mockResolvedValue('notification-id-1'),
    cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
    getPermissionsAsync: jest.fn().mockResolvedValue({ status: PermissionStatus.UNDETERMINED }),
    requestPermissionsAsync: jest.fn().mockResolvedValue({ status: PermissionStatus.GRANTED }),
    PermissionStatus,
    AndroidImportance: { HIGH: 4 },
    SchedulableTriggerInputTypes: { DATE: 'date' },
  };
});

type MockNotifications = {
  setNotificationHandler: jest.Mock;
  setNotificationChannelAsync: jest.Mock;
  scheduleNotificationAsync: jest.Mock;
  cancelScheduledNotificationAsync: jest.Mock;
  getPermissionsAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
};

// require(), not a dynamic import() — babel-jest's CJS output does not support native ESM
// dynamic import without --experimental-vm-modules, and jest.resetModules() makes a fresh
// require() re-evaluate rest-alert.ts's module-level state on every test.
function freshRestAlert(): typeof import('../rest-alert') {
  return require('../rest-alert');
}

describe('rest-alert (native)', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('cancels any outstanding alert before scheduling, so only one is ever pending', async () => {
    const Notifications = jest.requireMock('expo-notifications') as MockNotifications;
    const { scheduleRestAlert } = freshRestAlert();

    await scheduleRestAlert(Date.now() + 60_000);
    await scheduleRestAlert(Date.now() + 90_000);

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notification-id-1');
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
  });

  it('cancelRestAlert is a no-op when nothing is scheduled', async () => {
    const Notifications = jest.requireMock('expo-notifications') as MockNotifications;
    const { cancelRestAlert } = freshRestAlert();

    await cancelRestAlert();

    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });

  it('does not call requestPermissionsAsync again once the stored state is denied', async () => {
    const Notifications = jest.requireMock('expo-notifications') as MockNotifications;
    Notifications.requestPermissionsAsync.mockResolvedValue({ status: 'denied' });
    const { requestAlertPermission } = freshRestAlert();

    const first = await requestAlertPermission();
    const second = await requestAlertPermission();

    expect(first).toBe('denied');
    expect(second).toBe('denied');
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('getAlertPermission never calls requestPermissionsAsync — it is a read, not a prompt', async () => {
    const Notifications = jest.requireMock('expo-notifications') as MockNotifications;
    const { getAlertPermission } = freshRestAlert();

    const result = await getAlertPermission();

    expect(result).toBe('undetermined');
    expect(Notifications.getPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});
