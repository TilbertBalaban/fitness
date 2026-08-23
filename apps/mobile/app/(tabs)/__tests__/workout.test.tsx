// getPowerSync's real module chain reaches @powersync/react-native -> @powersync/shared-internals,
// whose ESM dist Jest cannot parse (WINDOWS #22/#33) — mocked before importing the screen module,
// matching home-screen.test.ts's established rationale exactly.
jest.mock('../../../lib/db/powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../../../lib/db/programs/next-up-query', () => ({ loadNextUp: jest.fn() }));
jest.mock('../../../lib/auth-client', () => ({ authClient: { useSession: () => ({ data: null }) } }));

import type { ReactElement, ReactNode } from 'react';
import { Pressable, Text } from 'react-native';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { NumericKeypadView } from '../../../components/NumericKeypad';
import { SetRowView } from '../../../components/SetRow';
import { ExerciseStripView } from '../../../components/ExerciseStrip';
import { ExercisePagerView } from '../../../components/ExercisePager';
import { ExercisePageView } from '../../../components/ExercisePage';
import {
  WorkoutScreenView,
  buildSetRows,
  defaultDraftValues,
  deriveWorkoutScreenState,
  readWorkoutScreenData,
  stepAmountFor,
  type WorkoutScreenViewProps,
} from '../workout';
import type { LoggedSetRow, SessionExerciseRow } from '../../../lib/db/session-query';

type AnyElement = ReactElement<Record<string, unknown>>;

function findByType(node: ReactNode, type: unknown, found: AnyElement[] = []): AnyElement[] {
  if (node === null || node === undefined || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
    return found;
  }
  if (Array.isArray(node)) {
    for (const child of node) findByType(child, type, found);
    return found;
  }
  const element = node as AnyElement;
  if (element.type === type) found.push(element);
  const children = element.props?.children as ReactNode;
  if (children !== undefined) findByType(children, type, found);
  return found;
}

function flatText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flatText).join('');
  const element = node as ReactElement<{ children?: ReactNode }>;
  return element.props?.children !== undefined ? flatText(element.props.children) : '';
}

const COLORS = { accent: 'rgb(37, 99, 235)', foregroundMuted: 'rgb(113, 113, 122)', surface: 'rgb(244, 244, 245)' };

const EXERCISE: SessionExerciseRow = {
  id: 'se-1',
  sessionId: 's-1',
  exerciseId: 'ex-1',
  exerciseName: 'Bench Press',
  orderIndex: 0,
  supersetGroupId: null,
  targetSets: 3,
  targetRepMin: 8,
  targetRepMax: 12,
  targetRir: 2,
  targetRestSeconds: 90,
};

describe('deriveWorkoutScreenState', () => {
  it('is error when the load failed, ahead of everything else', () => {
    expect(deriveWorkoutScreenState({ failed: true, session: null, nextUp: null })).toBe('error');
  });

  it('is loading before either the session or the next-up read has landed', () => {
    expect(deriveWorkoutScreenState({ failed: false, session: null, nextUp: null })).toBe('loading');
  });

  it('is ready once a live session has resolved', () => {
    expect(
      deriveWorkoutScreenState({
        failed: false,
        session: { session: { id: 's-1', routineDayId: null, status: 'in_progress', startedAt: 't' }, exercises: [], setsByExerciseId: {} },
        nextUp: null,
      }),
    ).toBe('ready');
  });

  it('is no-session once loadLiveSession confirmed there is none and nextUp resolved', () => {
    expect(deriveWorkoutScreenState({ failed: false, session: null, nextUp: { kind: 'no-active-program' } })).toBe('no-session');
  });
});

describe('defaultDraftValues', () => {
  it('prefills reps from targetRepMax and rir from the snapshot, weight blank', () => {
    expect(defaultDraftValues(EXERCISE)).toEqual({ weight: null, reps: '12', rir: '2' });
  });

  it('falls back to targetRepMin when targetRepMax is null', () => {
    expect(defaultDraftValues({ ...EXERCISE, targetRepMax: null })).toEqual({ weight: null, reps: '8', rir: '2' });
  });

  it('renders a one-off (EMPTY_PRESCRIPTION) exercise as nulls, never a guessed number', () => {
    expect(defaultDraftValues({ ...EXERCISE, targetRepMin: null, targetRepMax: null, targetRir: null })).toEqual({
      weight: null,
      reps: null,
      rir: null,
    });
  });
});

describe('stepAmountFor', () => {
  it('is 1 for reps and rir regardless of weight unit', () => {
    expect(stepAmountFor('reps', 'kg')).toBe(1);
    expect(stepAmountFor('rir', 'lb')).toBe(1);
  });

  it('is unit-dependent for weight', () => {
    expect(stepAmountFor('weight', 'kg')).toBe(2.5);
    expect(stepAmountFor('weight', 'lb')).toBe(0.5);
  });
});

const LOGGED_ROW: LoggedSetRow = {
  id: 'ls-1',
  sessionExerciseId: 'se-1',
  setIndex: 1,
  setType: 'normal',
  weightKg: '100.000',
  reps: 10,
  rir: 2,
  completed: true,
  loggedAt: '2026-08-20T10:00:00.000Z',
};

const WARMUP_ROW: LoggedSetRow = {
  id: 'ls-warmup',
  sessionExerciseId: 'se-1',
  setIndex: 5,
  setType: 'warmup',
  weightKg: '40.000',
  reps: 10,
  rir: null,
  completed: true,
  loggedAt: '2026-08-20T09:55:00.000Z',
};

describe('buildSetRows', () => {
  it('renders one row plus a trailing draft when the exercise has zero logged sets', () => {
    const rows = buildSetRows([], {}, { weight: null, reps: '12', rir: '2' }, 'kg', null);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ setId: null, setIndex: 1, values: { weight: null, reps: '12', rir: '2' }, completed: false });
  });

  it('renders every existing row plus one trailing draft, in set_index order', () => {
    const rows = buildSetRows([LOGGED_ROW], {}, { weight: null, reps: '12', rir: '2' }, 'kg', null);
    expect(rows.map((row) => row.setIndex)).toEqual([1, 2]);
    expect(rows[0].setId).toBe('ls-1');
    expect(rows[0].completed).toBe(true);
    expect(rows[0].values).toEqual({ weight: '100.00', reps: '10', rir: '2' });
    expect(rows[1].setId).toBeNull();
  });

  it('a row override patches only the fields it names, never the others', () => {
    const rows = buildSetRows([LOGGED_ROW], { 'ls-1': { rir: 0 } }, { weight: null, reps: null, rir: null }, 'kg', null);
    expect(rows[0].values).toEqual({ weight: '100.00', reps: '10', rir: '0' });
  });

  it('an active, touched field overrides its own row’s displayed value only', () => {
    const rows = buildSetRows(
      [LOGGED_ROW],
      {},
      { weight: null, reps: null, rir: null },
      'kg',
      { setId: 'ls-1', field: 'reps', value: '99', touched: true },
    );
    expect(rows[0].values).toEqual({ weight: '100.00', reps: '99', rir: '2' });
  });

  it('an active but untouched field does not override the displayed value', () => {
    const rows = buildSetRows(
      [LOGGED_ROW],
      {},
      { weight: null, reps: null, rir: null },
      'kg',
      { setId: 'ls-1', field: 'reps', value: '99', touched: false },
    );
    expect(rows[0].values.reps).toBe('10');
  });

  it('converts weight for display through the given unit', () => {
    const rows = buildSetRows([LOGGED_ROW], {}, { weight: null, reps: null, rir: null }, 'lb', null);
    expect(rows[0].values.weight).toBe('220.5');
  });

  it('sorts a warm-up row ahead of working rows regardless of its own higher set_index', () => {
    const rows = buildSetRows([LOGGED_ROW, WARMUP_ROW], {}, { weight: null, reps: null, rir: null }, 'kg', null);
    expect(rows.map((row) => row.setId)).toEqual(['ls-warmup', 'ls-1', null]);
  });
});

function baseViewProps(overrides: Partial<WorkoutScreenViewProps> = {}): WorkoutScreenViewProps {
  return {
    screenState: 'ready',
    colors: COLORS,
    exercises: [{ id: 'se-1', name: 'Bench Press', completedWorkingSets: 0, targetSets: 3 }],
    currentExerciseId: 'se-1',
    currentIndex: 0,
    pagerWidth: 375,
    rowsByExercise: { 'se-1': buildSetRows([], {}, { weight: null, reps: '12', rir: '2' }, 'kg', null) },
    activeField: null,
    starting: false,
    canStartWorkout: false,
    nextUpHeading: null,
    weightUnit: 'kg',
    onStartWorkout: jest.fn(),
    onSelectExercise: jest.fn(),
    onIndexChange: jest.fn(),
    onAddExercise: jest.fn(),
    onFieldPress: jest.fn(),
    onKeypadPress: jest.fn(),
    onSubmitField: jest.fn(),
    onCheckmarkPress: jest.fn(),
    ...overrides,
  };
}

// ExercisePagerView renders its pages through react-native-tab-view's TabView, which our
// no-renderer walker never invokes (TabView's scenes come from calling renderScene, not from a
// props.children tree) — so reaching what a given exercise's page actually renders means calling
// the pager's own renderExercise prop by hand, exactly the "opaque nested component" pattern the
// tracer task established for SetRowView/NumericKeypadView/PrimaryButton.
function renderCurrentExercisePage(result: ReactNode, exercise: { id: string; name: string; completedWorkingSets: number; targetSets: number }) {
  const [pager] = findByType(result, ExercisePagerView);
  const pageElement = (pager.props.renderExercise as (ex: typeof exercise) => AnyElement)(exercise);
  return ExercisePageView(pageElement.props as unknown as Parameters<typeof ExercisePageView>[0]);
}

describe('WorkoutScreenView', () => {
  it('renders the shipped error copy verbatim', () => {
    const result = WorkoutScreenView(baseViewProps({ screenState: 'error' }));
    expect(flatText(result)).toContain("Workout couldn't load");
    expect(flatText(result)).toContain('Restart the app to try again. Your programs and history are safe.');
  });

  it('renders a skeleton block, not a spinner, while loading', () => {
    const result = WorkoutScreenView(baseViewProps({ screenState: 'loading' }));
    expect(findByType(result, Text)).toHaveLength(0);
  });

  it('a startable no-session state renders PrimaryButton wired to onStartWorkout', () => {
    const onStartWorkout = jest.fn();
    const result = WorkoutScreenView(
      baseViewProps({ screenState: 'no-session', canStartWorkout: true, nextUpHeading: 'Push', onStartWorkout }),
    );
    const [button] = findByType(result, PrimaryButton);

    expect(button).toBeDefined();
    expect(button.props.label).toBe('Start Workout');
    (button.props.onPress as () => void)();
    expect(onStartWorkout).toHaveBeenCalledTimes(1);
  });

  it('a non-startable no-session state renders no PrimaryButton', () => {
    const result = WorkoutScreenView(baseViewProps({ screenState: 'no-session', canStartWorkout: false }));
    expect(findByType(result, PrimaryButton)).toHaveLength(0);
  });

  it('renders the exercise strip with one chip per session exercise', () => {
    const result = WorkoutScreenView(
      baseViewProps({
        exercises: [
          { id: 'se-1', name: 'Bench Press', completedWorkingSets: 0, targetSets: 3 },
          { id: 'se-2', name: 'Row', completedWorkingSets: 1, targetSets: 3 },
        ],
      }),
    );
    const [strip] = findByType(result, ExerciseStripView);

    expect(strip).toBeDefined();
    expect(strip.props.exercises).toHaveLength(2);
    expect(strip.props.currentExerciseId).toBe('se-1');
  });

  it('tapping a strip chip calls onSelectExercise with that exercise’s id', () => {
    const onSelectExercise = jest.fn();
    const result = WorkoutScreenView(baseViewProps({ onSelectExercise }));
    const [strip] = findByType(result, ExerciseStripView);

    (strip.props.onSelectExercise as (id: string) => void)('se-2');

    expect(onSelectExercise).toHaveBeenCalledWith('se-2');
  });

  it('renders the pager wired to the shared index and width', () => {
    const result = WorkoutScreenView(baseViewProps({ currentIndex: 1, pagerWidth: 400 }));
    const [pager] = findByType(result, ExercisePagerView);

    expect(pager.props.index).toBe(1);
    expect(pager.props.width).toBe(400);
  });

  it('swiping the pager calls onIndexChange', () => {
    const onIndexChange = jest.fn();
    const result = WorkoutScreenView(baseViewProps({ onIndexChange }));
    const [pager] = findByType(result, ExercisePagerView);

    (pager.props.onIndexChange as (index: number) => void)(1);

    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  it('renders the exercise name and one SetRowView per resolved row for the current exercise', () => {
    const exercise = { id: 'se-1', name: 'Bench Press', completedWorkingSets: 1, targetSets: 1 };
    const rows = buildSetRows([LOGGED_ROW], {}, { weight: null, reps: '12', rir: '2' }, 'kg', null);
    const result = WorkoutScreenView(baseViewProps({ exercises: [exercise], rowsByExercise: { 'se-1': rows } }));

    const page = renderCurrentExercisePage(result, exercise);
    expect(flatText(page)).toContain('Bench Press');
    const setRows = findByType(page, SetRowView);
    expect(setRows).toHaveLength(2);
    expect(setRows[0].props.completed).toBe(true);
    expect(setRows[1].props.completed).toBe(false);
  });

  it('a SetRowView field press resolves that row’s exerciseId, setId, field and current value through onFieldPress', () => {
    const exercise = { id: 'se-1', name: 'Bench Press', completedWorkingSets: 1, targetSets: 1 };
    const rows = buildSetRows([LOGGED_ROW], {}, { weight: null, reps: '12', rir: '2' }, 'kg', null);
    const onFieldPress = jest.fn();
    const result = WorkoutScreenView(baseViewProps({ exercises: [exercise], rowsByExercise: { 'se-1': rows }, onFieldPress }));

    const page = renderCurrentExercisePage(result, exercise);
    const [existingRow] = findByType(page, SetRowView);
    (existingRow.props.onFieldPress as (field: string) => void)('rir');

    expect(onFieldPress).toHaveBeenCalledWith('se-1', 'ls-1', 'rir', '2');
  });

  it('a checkmark press resolves that exercise’s id and the row’s setId through onCheckmarkPress', () => {
    const exercise = { id: 'se-1', name: 'Bench Press', completedWorkingSets: 1, targetSets: 1 };
    const rows = buildSetRows([LOGGED_ROW], {}, { weight: null, reps: '12', rir: '2' }, 'kg', null);
    const onCheckmarkPress = jest.fn();
    const result = WorkoutScreenView(baseViewProps({ exercises: [exercise], rowsByExercise: { 'se-1': rows }, onCheckmarkPress }));

    const page = renderCurrentExercisePage(result, exercise);
    const [existingRow] = findByType(page, SetRowView);
    (existingRow.props.onCheckmarkPress as () => void)();

    expect(onCheckmarkPress).toHaveBeenCalledWith('se-1', 'ls-1');
  });

  it('docks the keypad only while a field is active', () => {
    const withoutKeypad = WorkoutScreenView(baseViewProps({ activeField: null }));
    const withKeypad = WorkoutScreenView(
      baseViewProps({ activeField: { exerciseId: 'se-1', setId: null, field: 'weight', value: null, touched: false } }),
    );

    expect(findByType(withoutKeypad, NumericKeypadView)).toHaveLength(0);
    expect(findByType(withKeypad, NumericKeypadView)).toHaveLength(1);
  });

  it('calls no hook — direct-invocable with no renderer', () => {
    // If WorkoutScreenView called a hook, invoking it outside a component render (as every case
    // above does) would throw "Invalid hook call". Every prior assertion passing is itself the
    // proof; this case exists so that guarantee has one clearly-named test of its own.
    expect(() => WorkoutScreenView(baseViewProps())).not.toThrow();
  });
});

describe('readWorkoutScreenData', () => {
  it('resolves the weight unit only once a live session is found', async () => {
    const session = { session: { id: 's-1', routineDayId: null, status: 'in_progress', startedAt: 't' }, exercises: [], setsByExerciseId: {} };
    const loadUnit = jest.fn().mockResolvedValue('lb');
    const result = await readWorkoutScreenData('user-1', {
      loadSession: jest.fn().mockResolvedValue(session),
      loadUnit,
    });

    expect(loadUnit).toHaveBeenCalledWith('user-1');
    expect(result).toMatchObject({ session, weightUnit: 'lb' });
  });

  it('resolves nextUp instead when no session is found, without reading the weight unit', async () => {
    const loadUnit = jest.fn();
    const nextUpData = { routine: null, days: [], cycles: [], history: [], musclesByExerciseId: {}, today: '2026-01-01' };
    const result = await readWorkoutScreenData('user-1', {
      loadSession: jest.fn().mockResolvedValue(null),
      loadNextUpData: jest.fn().mockResolvedValue(nextUpData),
      loadUnit,
    });

    expect(loadUnit).not.toHaveBeenCalled();
    expect(result).toMatchObject({ session: null, nextUp: { kind: 'no-active-program' } });
  });

  it('reports a failure instead of throwing', async () => {
    const result = await readWorkoutScreenData('user-1', {
      loadSession: jest.fn().mockRejectedValue(new Error('database locked')),
    });

    expect(result).toEqual({ failed: true });
  });
});
