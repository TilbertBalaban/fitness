jest.mock('../../../lib/db/powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../../../lib/auth-client', () => ({ authClient: { useSession: () => ({ data: null, refetch: jest.fn() }) } }));
// AppearanceControl -> lib/theme.ts imports AsyncStorage's native module, unavailable under Jest
// (same rationale as lib/__tests__/theme.test.ts).
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn().mockResolvedValue(null), setItem: jest.fn().mockResolvedValue(undefined) },
}));

import { NotificationRow, ToggleRow } from '../profile';

function findText(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) findText(child, out);
    return out;
  }
  const element = node as { props?: { children?: unknown } };
  if (element.props?.children !== undefined) findText(element.props.children, out);
  return out;
}

describe('ToggleRow', () => {
  it('renders the label and On when value is true', () => {
    const result = ToggleRow({ label: 'Auto-advance', value: true, onToggle: jest.fn() });
    const text = findText(result);
    expect(text).toContain('Auto-advance');
    expect(text).toContain('On');
  });

  it('renders Off when value is false', () => {
    const result = ToggleRow({ label: 'Auto-advance', value: false, onToggle: jest.fn() });
    expect(findText(result)).toContain('Off');
  });

  it('calls onToggle when pressed', () => {
    const onToggle = jest.fn();
    const result = ToggleRow({ label: 'Auto-advance', value: true, onToggle }) as { props: { onPress: () => void } };
    result.props.onPress();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe('NotificationRow (D-22)', () => {
  it('shows Turn On when permission is denied', () => {
    const result = NotificationRow({ permission: 'denied', onTurnOn: jest.fn() });
    expect(findText(result)).toContain('Turn On');
  });

  it('shows Turn On when notifications are unsupported', () => {
    const result = NotificationRow({ permission: 'unsupported', onTurnOn: jest.fn() });
    expect(findText(result)).toContain('Turn On');
  });

  it('shows On, not a Turn On action, when permission is already granted', () => {
    const result = NotificationRow({ permission: 'granted', onTurnOn: jest.fn() });
    const text = findText(result);
    expect(text).toContain('On');
    expect(text).not.toContain('Turn On');
  });

  it('calling onTurnOn deep-links to settings — never a second permission request', () => {
    const onTurnOn = jest.fn();
    const result = NotificationRow({ permission: 'denied', onTurnOn }) as { props: { children: unknown[] } };
    const [, turnOnButton] = result.props.children as [unknown, { props: { onPress: () => void } }];
    turnOnButton.props.onPress();
    expect(onTurnOn).toHaveBeenCalledTimes(1);
  });
});
