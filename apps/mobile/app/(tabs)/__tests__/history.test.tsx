import { deriveHistoryScreenState, HistoryScreenView, type HistoryScreenViewProps } from '../history';
import type { HistoryPage } from '@/lib/db/history-query';

jest.mock('@/lib/db/powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('@/lib/auth-client', () => ({ authClient: { useSession: () => ({ data: null }) } }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useFocusEffect: jest.fn(),
}));

const COLORS = { accent: 'rgb(37, 99, 235)', foregroundMuted: 'rgb(113, 113, 122)', surface: 'rgb(244, 244, 245)' };

function baseProps(overrides: Partial<HistoryScreenViewProps> = {}): HistoryScreenViewProps {
  return {
    state: 'ready',
    rows: [],
    colors: COLORS,
    onRowPress: jest.fn(),
    onOverflowPress: jest.fn(),
    onEndReached: jest.fn(),
    onAddPastWorkout: jest.fn(),
    ...overrides,
  };
}

describe('deriveHistoryScreenState', () => {
  const readyPage: HistoryPage = { rows: [{ id: 's1' } as HistoryPage['rows'][number]], nextCursor: null };
  const emptyPage: HistoryPage = { rows: [], nextCursor: null };

  it('returns a distinct value for each of failed, not-yet-loaded, loaded-and-empty, and loaded-with-rows', () => {
    const failed = deriveHistoryScreenState({ failed: true, page: null });
    const loading = deriveHistoryScreenState({ failed: false, page: null });
    const empty = deriveHistoryScreenState({ failed: false, page: emptyPage });
    const ready = deriveHistoryScreenState({ failed: false, page: readyPage });

    expect(new Set([failed, loading, empty, ready]).size).toBe(4);
    expect(failed).toBe('error');
    expect(loading).toBe('loading');
    expect(empty).toBe('empty');
    expect(ready).toBe('ready');
  });

  it('failed beats a landed page', () => {
    expect(deriveHistoryScreenState({ failed: true, page: readyPage })).toBe('error');
  });
});

describe('HistoryScreenView — empty state', () => {
  it('renders the exact copywriting-contract heading and body, with the add-a-past-workout affordance present', () => {
    const onAddPastWorkout = jest.fn();
    const element = HistoryScreenView(baseProps({ state: 'empty', onAddPastWorkout }));
    const [heading, body, addAffordance] = element.props.children;

    expect(heading.props.children).toBe('No workouts yet');
    expect(body.props.children).toBe('Log your first workout to see it here.');

    expect(addAffordance.props.accessibilityLabel).toBe('Add a Past Workout');
    addAffordance.props.onPress();
    expect(onAddPastWorkout).toHaveBeenCalledTimes(1);
  });
});

describe('HistoryScreenView — error state', () => {
  it('renders the shipped error pattern verbatim', () => {
    const element = HistoryScreenView(baseProps({ state: 'error' }));
    const [heading, body] = element.props.children;

    expect(heading.props.children).toBe("History couldn't load");
    expect(body.props.children).toBe('Restart the app to try again. Your programs and history are safe.');
  });
});

describe('HistoryScreenView — ready state', () => {
  it('renders a FlashList with the page rows and no separate empty/error chrome', () => {
    const rows: HistoryPage['rows'] = [
      {
        id: 's1',
        name: 'Leg Day',
        localDate: '2026-01-05',
        startedAt: '2026-01-05T10:00:00.000Z',
        endedAt: '2026-01-05T11:00:00.000Z',
        accumulatedPausedSeconds: 0,
        exerciseCount: 4,
        completedSetCount: 12,
      },
    ];
    const element = HistoryScreenView(baseProps({ state: 'ready', rows }));
    const flashList = element.props.children;

    expect(flashList.props.data).toBe(rows);
  });
});
