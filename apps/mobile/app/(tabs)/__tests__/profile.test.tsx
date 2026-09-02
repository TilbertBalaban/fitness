jest.mock('../../../lib/db/powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../../../lib/auth-client', () => ({ authClient: { useSession: () => ({ data: null, refetch: jest.fn() }) } }));
// AppearanceControl -> lib/theme.ts imports AsyncStorage's native module, unavailable under Jest
// (same rationale as lib/__tests__/theme.test.ts).
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn().mockResolvedValue(null), setItem: jest.fn().mockResolvedValue(undefined) },
}));
// GymRow calls useThemeColors, which reaches NativeWind's useColorScheme — a hook this Node test
// environment cannot drive. Mocking it makes GymRow a plain `(props) => ReactElement` function, so
// direct invocation (no renderer) is faithful, matching ExerciseListRow.test.tsx's established
// technique.
jest.mock('@/lib/theme-colors', () => ({
  useThemeColors: () => ({
    accent: 'rgb(37, 99, 235)',
    foregroundMuted: 'rgb(113, 113, 122)',
    surface: 'rgb(244, 244, 245)',
  }),
}));

import type { SyncStatus } from '@/lib/sync-status';

import { formatLastSync, GymRow, NotificationRow, ProgressionPreferenceRow, SyncStatusSection, ToggleRow } from '../profile';

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

describe('ProgressionPreferenceRow (D-07)', () => {
  interface OptionPressable {
    props: { accessibilityLabel: string; accessibilityState: { selected: boolean }; onPress: () => void };
  }

  // SelectField is a custom component element (not yet executed), unlike ToggleRow/GymRow's own
  // host-element output — invoking its own function is required to reach the option Pressables it
  // renders internally, mirroring the mocked-hook direct-invocation technique this file already
  // uses for GymRow.
  function renderOptions(value: 'widen_rep_range_first' | 'match_previous_weight', onChange = jest.fn()) {
    const result = ProgressionPreferenceRow({ value, onChange }) as { props: { children: unknown[] } };
    const [selectFieldElement] = result.props.children as [{ type: (props: unknown) => unknown; props: unknown }, unknown];
    const selectFieldOutput = selectFieldElement.type(selectFieldElement.props) as { props: { children: unknown[] } };
    const optionsView = selectFieldOutput.props.children.find(
      (child): child is { props: { children: OptionPressable[] } } =>
        Array.isArray((child as { props?: { children?: unknown } } | null)?.props?.children),
    );
    if (!optionsView) throw new Error('options row not found');
    return { pressables: optionsView.props.children, onChange };
  }

  it('renders with the persisted value selected', () => {
    const { pressables } = renderOptions('match_previous_weight');
    const selected = pressables.find((p) => p.props.accessibilityLabel === 'Match my last weight');
    const other = pressables.find((p) => p.props.accessibilityLabel === 'Add reps before weight');
    expect(selected?.props.accessibilityState.selected).toBe(true);
    expect(other?.props.accessibilityState.selected).toBe(false);
  });

  it('renders the default selection for an account with no preference row', () => {
    const { pressables } = renderOptions('widen_rep_range_first');
    const selected = pressables.find((p) => p.props.accessibilityLabel === 'Add reps before weight');
    expect(selected?.props.accessibilityState.selected).toBe(true);
  });

  it('choosing the other option calls onChange with that value', () => {
    const { pressables, onChange } = renderOptions('widen_rep_range_first');
    const other = pressables.find((p) => p.props.accessibilityLabel === 'Match my last weight');
    other?.props.onPress();
    expect(onChange).toHaveBeenCalledWith('match_previous_weight');
  });

  it('describes what the setting changes without citing a source or coach', () => {
    const result = ProgressionPreferenceRow({ value: 'widen_rep_range_first', onChange: jest.fn() });
    const text = findText(result);
    expect(text.join(' ')).toMatch(/reps before a heavier weight/i);
  });
});

describe('GymRow', () => {
  it('renders the Gym Profiles label', () => {
    const result = GymRow({ onPress: jest.fn() });
    expect(findText(result)).toContain('Gym Profiles');
  });

  it('trails the active gym name in muted Label when it resolves', () => {
    const result = GymRow({ gymName: 'Home Gym', onPress: jest.fn() });
    expect(findText(result)).toContain('Home Gym');
  });

  // The row must never render disabled or broken when the active gym cannot be resolved — the
  // trailing label is simply absent.
  it('renders with no trailing name when no active gym resolves', () => {
    const result = GymRow({ onPress: jest.fn() });
    const text = findText(result);
    expect(text).toContain('Gym Profiles');
    expect(text).not.toContain('undefined');
  });

  it('is announced as a button, never a switch, and renders no on/off pill', () => {
    const result = GymRow({ onPress: jest.fn() }) as { props: { accessibilityRole?: string } };
    expect(result.props.accessibilityRole).toBe('button');
    expect(findText(result)).not.toContain('On');
    expect(findText(result)).not.toContain('Off');
  });

  it('tapping the row calls onPress exactly once, still navigating with or without a resolved name', () => {
    const onPress = jest.fn();
    const result = GymRow({ onPress }) as { props: { onPress: () => void } };
    result.props.onPress();
    expect(onPress).toHaveBeenCalledTimes(1);

    const onPressWithName = jest.fn();
    const resultWithName = GymRow({ gymName: 'Home Gym', onPress: onPressWithName }) as {
      props: { onPress: () => void };
    };
    resultWithName.props.onPress();
    expect(onPressWithName).toHaveBeenCalledTimes(1);
  });
});

function syncStatus(overrides: Partial<SyncStatus> = {}): SyncStatus {
  return {
    pendingWrites: 0,
    lastPushOutcome: null,
    lastSuccessfulPushAt: null,
    rejectedOps: [],
    ...overrides,
  };
}

describe('SyncStatusSection', () => {
  it('reads as settled with zero pending, and renders no rejection line', () => {
    const text = findText(SyncStatusSection({ status: syncStatus() }));
    expect(text.join(' ')).toContain('All changes synced');
    expect(text.join(' ')).not.toContain('rejected');
  });

  it('names the count when changes are waiting to sync', () => {
    const text = findText(SyncStatusSection({ status: syncStatus({ pendingWrites: 3 }) }));
    expect(text.join(' ')).toContain('3 changes waiting to sync');
  });

  it('shows Never when the account has never completed a push', () => {
    const text = findText(SyncStatusSection({ status: syncStatus({ lastSuccessfulPushAt: null }) }));
    expect(text.join(' ')).toContain('Last synced Never');
  });

  it('dedupes rejected ops sharing a table and reason into one pair, with the full count', () => {
    const text = findText(
      SyncStatusSection({
        status: syncStatus({
          rejectedOps: [
            { opId: 'a', table: 'logged_set', reason: 'invalid_field', recordedAt: '2026-09-01T00:00:00.000Z' },
            { opId: 'b', table: 'logged_set', reason: 'invalid_field', recordedAt: '2026-09-01T00:01:00.000Z' },
          ],
        }),
      }),
    );
    const joined = text.join(' ');
    expect(joined).toContain('2 changes rejected');
    expect(joined.match(/logged_set: invalid_field/g)).toHaveLength(1);
  });
});

describe('formatLastSync', () => {
  const now = new Date('2026-09-02T12:00:00.000Z').getTime();

  it.each([
    [null, 'Never'],
    [new Date(now - 30_000).toISOString(), 'Just now'],
    [new Date(now - 5 * 60_000).toISOString(), '5m ago'],
    [new Date(now - 3 * 60 * 60_000).toISOString(), '3h ago'],
    [new Date(now - 2 * 24 * 60 * 60_000).toISOString(), '2d ago'],
  ])('formats %s as %s', (isoTimestamp, expected) => {
    expect(formatLastSync(isoTimestamp, now)).toBe(expected);
  });
});
