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
});

function baseViewProps(overrides: Partial<WorkoutScreenViewProps> = {}): WorkoutScreenViewProps {
  return {
    screenState: 'ready',
    colors: COLORS,
    exerciseName: 'Bench Press',
    rows: buildSetRows([], {}, { weight: null, reps: '12', rir: '2' }, 'kg', null),
    activeField: null,
    starting: false,
    canStartWorkout: false,
    nextUpHeading: null,
    weightUnit: 'kg',
    onStartWorkout: jest.fn(),
    onFieldPress: jest.fn(),
    onKeypadPress: jest.fn(),
    onSubmitField: jest.fn(),
    onCheckmarkPress: jest.fn(),
    ...overrides,
  };
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

  it('renders the exercise name and one SetRowView per resolved row, each carrying its own setId', () => {
    const rows = buildSetRows([LOGGED_ROW], {}, { weight: null, reps: '12', rir: '2' }, 'kg', null);
    const result = WorkoutScreenView(baseViewProps({ rows, exerciseName: 'Bench Press' }));

    expect(flatText(result)).toContain('Bench Press');
    const setRows = findByType(result, SetRowView);
    expect(setRows).toHaveLength(2);
    expect(setRows[0].props.completed).toBe(true);
    expect(setRows[1].props.completed).toBe(false);
  });

  it('a SetRowView field press resolves that row’s setId, field and current value through onFieldPress', () => {
    const rows = buildSetRows([LOGGED_ROW], {}, { weight: null, reps: '12', rir: '2' }, 'kg', null);
    const onFieldPress = jest.fn();
    const result = WorkoutScreenView(baseViewProps({ rows, onFieldPress }));
    const [existingRow] = findByType(result, SetRowView);

    (existingRow.props.onFieldPress as (field: string) => void)('rir');

    expect(onFieldPress).toHaveBeenCalledWith('ls-1', 'rir', '2');
  });

  it('docks the keypad only while a field is active', () => {
    const withoutKeypad = WorkoutScreenView(baseViewProps({ activeField: null }));
    const withKeypad = WorkoutScreenView(
      baseViewProps({ activeField: { setId: null, field: 'weight', value: null, touched: false } }),
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
