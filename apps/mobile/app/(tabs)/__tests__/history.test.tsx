import {
  deriveHistoryScreenState,
  HistoryScreenView,
  readHistoryTrend,
  type HistoryScreenViewProps,
} from '../history';
import { HistoryTrendCard } from '@/components/HistoryTrendCard';
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
    overlay: null,
    addPastStep: null,
    addPastLocalDate: '2026-08-18',
    onRowPress: jest.fn(),
    onOverflowPress: jest.fn(),
    onEndReached: jest.fn(),
    onAddPastWorkout: jest.fn(),
    onRecords: jest.fn(),
    onMuscleMap: jest.fn(),
    onPendingDateChange: jest.fn(),
    onConfirmAddPastDate: jest.fn(),
    onCancelAddPast: jest.fn(),
    onConfirmAddPastExercises: jest.fn(),
    onSheetSelect: jest.fn(),
    onCancelOverlay: jest.fn(),
    onConfirmRename: jest.fn(),
    onConfirmDelete: jest.fn(),
    trend: null,
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

  // A lifter with no sessions holds no records either, but the empty Records screen is the honest
  // answer and hiding the path is what would make the feature undiscoverable (09-UI-SPEC S3).
  it('also offers the Records link, wired to onRecords', () => {
    const onRecords = jest.fn();
    const element = HistoryScreenView(baseProps({ state: 'empty', onRecords }));
    const recordsLink = element.props.children[3];

    expect(recordsLink.props.accessibilityLabel).toBe('Records');
    recordsLink.props.onPress();
    expect(onRecords).toHaveBeenCalledTimes(1);
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

const SAMPLE_ROW: HistoryPage['rows'][number] = {
  id: 's1',
  name: 'Leg Day',
  localDate: '2026-01-05',
  startedAt: '2026-01-05T10:00:00.000Z',
  endedAt: '2026-01-05T11:00:00.000Z',
  accumulatedPausedSeconds: 0,
  exerciseCount: 4,
  completedSetCount: 12,
};

describe('HistoryScreenView — ready state', () => {
  it('renders a top-level Add a Past Workout action wired to onAddPastWorkout', () => {
    const onAddPastWorkout = jest.fn();
    const element = HistoryScreenView(baseProps({ state: 'ready', rows: [SAMPLE_ROW], onAddPastWorkout }));
    const [header] = element.props.children;
    // The header row is space-between: Records leads, Add a Past Workout stays in the trailing slot.
    const [, addAffordance] = header.props.children;

    expect(addAffordance.props.accessibilityLabel).toBe('Add a Past Workout');
    addAffordance.props.onPress();
    expect(onAddPastWorkout).toHaveBeenCalledTimes(1);
  });

  it('renders the Records link in the header’s leading group, wired to onRecords', () => {
    const onRecords = jest.fn();
    const element = HistoryScreenView(baseProps({ state: 'ready', rows: [SAMPLE_ROW], onRecords }));
    const [header] = element.props.children;
    const [leadingGroup] = header.props.children;
    const [recordsLink] = leadingGroup.props.children;

    expect(recordsLink.props.accessibilityLabel).toBe('Records');
    recordsLink.props.onPress();
    expect(onRecords).toHaveBeenCalledTimes(1);
  });

  it('renders the Muscle Map link in the header’s leading group, alongside Records, wired to onMuscleMap', () => {
    const onMuscleMap = jest.fn();
    const element = HistoryScreenView(baseProps({ state: 'ready', rows: [SAMPLE_ROW], onMuscleMap }));
    const [header] = element.props.children;
    const [leadingGroup] = header.props.children;
    const [, muscleMapLink] = leadingGroup.props.children;

    expect(muscleMapLink.props.accessibilityLabel).toBe('Muscle Map');
    muscleMapLink.props.onPress();
    expect(onMuscleMap).toHaveBeenCalledTimes(1);
  });

  it('renders a FlashList with the page rows and no overlay by default', () => {
    const element = HistoryScreenView(baseProps({ state: 'ready', rows: [SAMPLE_ROW] }));
    const [, flashList, sheetOverlay, renameOverlay, deleteOverlay] = element.props.children;

    expect(flashList.props.data).toEqual([SAMPLE_ROW]);
    expect(sheetOverlay).toBeNull();
    expect(renameOverlay).toBeNull();
    expect(deleteOverlay).toBeNull();
  });

  it('opens the action sheet in a transparent Modal when overlay.kind is "sheet"', () => {
    const element = HistoryScreenView(
      baseProps({ state: 'ready', rows: [SAMPLE_ROW], overlay: { kind: 'sheet', sessionId: 's1' } }),
    );
    const [, , sheetModal] = element.props.children;

    expect(sheetModal.props.transparent).toBe(true);
    expect(sheetModal.props.children.props.sessionLabel).toBe('Leg Day');
  });

  it('opens the rename dialog with the row’s current name as the initial value', () => {
    const element = HistoryScreenView(
      baseProps({ state: 'ready', rows: [SAMPLE_ROW], overlay: { kind: 'rename', sessionId: 's1' } }),
    );
    const [, , , renameModal] = element.props.children;

    expect(renameModal.props.children.props.initialValue).toBe('Leg Day');
  });

  it('opens the delete confirmation dialog', () => {
    const onConfirmDelete = jest.fn();
    const element = HistoryScreenView(
      baseProps({ state: 'ready', rows: [SAMPLE_ROW], overlay: { kind: 'delete', sessionId: 's1' }, onConfirmDelete }),
    );
    const [, , , , deleteModal] = element.props.children;

    deleteModal.props.children.props.onConfirm();
    expect(onConfirmDelete).toHaveBeenCalledTimes(1);
  });

  it('opens the add-a-past-workout date step with SessionDateField wired to the pending date', () => {
    const onConfirmAddPastDate = jest.fn();
    const element = HistoryScreenView(
      baseProps({ state: 'ready', rows: [SAMPLE_ROW], addPastStep: 'date', addPastLocalDate: '2026-08-10' }),
    );
    const [, , , , , addPastModals] = element.props.children;
    const [dateModal] = addPastModals.props.children;

    expect(dateModal).not.toBeNull();
  });

  it('opens the ExercisePickerModal for the exercises step', () => {
    const element = HistoryScreenView(baseProps({ state: 'ready', rows: [SAMPLE_ROW], addPastStep: 'exercises' }));
    const [, , , , , addPastModals] = element.props.children;
    const [, exercisesModal] = addPastModals.props.children;

    expect(exercisesModal).not.toBeNull();
  });
});

describe('readHistoryTrend', () => {
  const INPUT = { userId: 'user-1', todayLocalDate: '2026-08-29' };

  it('returns the sessions and the weight unit on a successful read', async () => {
    const data = { sessions: [{ sessionId: 's1', localDate: '2026-08-29', sets: [] }], weightUnit: 'lb' as const };

    await expect(readHistoryTrend(INPUT, async () => data)).resolves.toEqual({ data });
  });

  // The trend is a SECONDARY read: a rejection must resolve to a distinct failed branch rather
  // than propagate, because the session list the tab exists for has to keep rendering.
  it('reports a rejection as a failed read instead of throwing', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      readHistoryTrend(INPUT, async () => {
        throw new Error('boom');
      }),
    ).resolves.toEqual({ failed: true });
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });
});

const TREND_VIEW_DATA = {
  sessions: [{ sessionId: 's1', localDate: '2026-08-29', sets: [] }],
  weightUnit: 'kg' as const,
  todayLocalDate: '2026-08-29',
};

describe('HistoryScreenView — the trend card at the head of the list', () => {
  it('hangs the trend card above the first session row in the ready branch', () => {
    const element = HistoryScreenView(baseProps({ state: 'ready', rows: [SAMPLE_ROW], trend: TREND_VIEW_DATA }));
    const [, flashList] = element.props.children;
    const header = flashList.props.ListHeaderComponent;

    expect(header.type).toBe(HistoryTrendCard);
    expect(header.props.sessions).toBe(TREND_VIEW_DATA.sessions);
    expect(header.props.todayLocalDate).toBe('2026-08-29');
    expect(header.props.weightUnit).toBe('kg');
  });

  it('renders no list header at all when the trend read has not landed or failed', () => {
    const element = HistoryScreenView(baseProps({ state: 'ready', rows: [SAMPLE_ROW], trend: null }));
    const [, flashList] = element.props.children;

    expect(flashList.props.ListHeaderComponent).toBeNull();
  });

  // The tab's own shipped empty and error states own the screen alone — a card stacked on top of
  // "No workouts yet" would be a second, contradictory answer to the same question.
  it('leaves the empty and error branches untouched even with trend data in hand', () => {
    const empty = HistoryScreenView(baseProps({ state: 'empty', trend: TREND_VIEW_DATA }));
    const error = HistoryScreenView(baseProps({ state: 'error', trend: TREND_VIEW_DATA }));

    expect(empty.props.children[0].props.children).toBe('No workouts yet');
    expect(error.props.children[0].props.children).toBe("History couldn't load");
  });
});
