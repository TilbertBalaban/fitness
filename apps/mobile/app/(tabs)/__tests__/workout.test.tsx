// getPowerSync's real module chain reaches @powersync/react-native -> @powersync/shared-internals,
// whose ESM dist Jest cannot parse (WINDOWS #22/#33) — mocked before importing the screen module,
// matching home-screen.test.ts's established rationale exactly.
jest.mock('../../../lib/db/powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../../../lib/db/programs/next-up-query', () => ({ loadNextUp: jest.fn() }));
jest.mock('../../../lib/auth-client', () => ({ authClient: { useSession: () => ({ data: null }) } }));
// workout.tsx composes the unmodified ExercisePickerModal for the one-off flow (Task 1); its own
// top-level imports reach the exercises screen/authClient the same way ExercisePickerModal.test.tsx
// already documents — mocked before the screen import for the same reason.
jest.mock('../../exercises', () => ({ loadCatalogRows: jest.fn() }));

import type { ReactElement, ReactNode } from 'react';
import { Pressable, Text } from 'react-native';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { NumericKeypadView } from '../../../components/NumericKeypad';
import { SetRowView } from '../../../components/SetRow';
import { ExerciseStripView } from '../../../components/ExerciseStrip';
import { ExercisePagerView } from '../../../components/ExercisePager';
import { ExercisePageView } from '../../../components/ExercisePage';
import { ExercisePickerModal } from '../../../components/ExercisePickerModal';
import { DiscardWorkoutDialog } from '../../../components/WorkoutInProgressBanner';
import { SwitchGymSheet } from '../../../components/SwitchGymSheet';
import {
  WorkoutScreenView,
  buildSetRows,
  defaultDraftValues,
  deriveWorkoutScreenState,
  readWorkoutScreenData,
  stepAmountFor,
  type ExercisePageData,
  type WorkoutScreenViewProps,
} from '../workout';
import type { LoggedSetRow, SessionExerciseRow } from '../../../lib/db/session-query';
import type { WriteDb } from '../../../lib/db/powersync';

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
  routineExerciseId: null,
  notes: null,
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
        session: { session: { id: 's-1', routineDayId: null, cycleId: null, equipmentProfileId: null, status: 'in_progress', startedAt: 't', pausedAt: null, accumulatedPausedSeconds: 0, restTargetAt: null, timezone: 'UTC', localDate: '2026-08-20', notes: null }, exercises: [], setsByExerciseId: {} },
        nextUp: null,
      }),
    ).toBe('ready');
  });

  it('is no-program when nothing is active', () => {
    expect(deriveWorkoutScreenState({ failed: false, session: null, nextUp: { kind: 'no-active-program' } })).toBe('no-program');
  });

  it('is no-program when the program has no days', () => {
    expect(deriveWorkoutScreenState({ failed: false, session: null, nextUp: { kind: 'no-days' } })).toBe('no-program');
  });

  it('is workout-available for a programmed workout day', () => {
    const nextUp = { kind: 'workout' as const, cycle: null, day: { id: 'd1', orderIndex: 0, name: 'Push', isRestDay: false, slots: [] } };
    expect(deriveWorkoutScreenState({ failed: false, session: null, nextUp })).toBe('workout-available');
  });

  it('is time-off on a scheduled off day', () => {
    const nextUp = { kind: 'time-off' as const, cycle: { id: 'c1', name: 'Off', kind: 'time_off' as const, orderIndex: 0, durationDays: 7 }, daysRemaining: 3 };
    expect(deriveWorkoutScreenState({ failed: false, session: null, nextUp })).toBe('time-off');
  });

  it('is program-complete once every cycle has been trained', () => {
    const nextUp = { kind: 'program-complete' as const, lastCycle: null };
    expect(deriveWorkoutScreenState({ failed: false, session: null, nextUp })).toBe('program-complete');
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
  notes: null,
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
  notes: null,
};

describe('buildSetRows', () => {
  it('renders one row plus a trailing draft when the exercise has zero logged sets', () => {
    const rows = buildSetRows([], {}, { weight: null, reps: '12', rir: '2' }, 'kg', null);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      setId: null,
      setIndex: 1,
      values: { weight: null, reps: '12', rir: '2' },
      reference: { weight: null, reps: null },
      completed: false,
      noteText: null,
      parentSetId: null,
      side: null,
      displaySetIndex: 1,
    });
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

  // WR-01: a warm-up regenerated after working sets already exist gets logSet-assigned indices
  // above the working sets' (log-set.ts's max(set_index) + 1), even though orderForDisplay still
  // buckets it first for rendering — so the draft row's own index must track the highest raw
  // set_index present, not existingSets.length, or its previousSetReference lookup keys against
  // the wrong historical set for this position.
  it('computes the trailing draft set_index from the highest raw set_index present, not a row count, after a gapped warm-up regeneration', () => {
    const workingA = { ...LOGGED_ROW, id: 'ls-working-a', setIndex: 4, setType: 'normal' };
    const workingB = { ...LOGGED_ROW, id: 'ls-working-b', setIndex: 5, setType: 'normal' };
    const regeneratedWarmup = { ...WARMUP_ROW, id: 'ls-warmup-regen', setIndex: 6, setType: 'warmup' };

    const rows = buildSetRows(
      [workingA, workingB, regeneratedWarmup],
      {},
      { weight: null, reps: null, rir: null },
      'kg',
      null,
    );

    expect(rows).toHaveLength(4);
    const draftRow = rows[rows.length - 1];
    expect(draftRow.setId).toBeNull();
    expect(draftRow.setIndex).toBe(7);
  });

  it('attaches the matching reference for an existing row and for the trailing draft, by set_index', () => {
    const referenceMap = {
      'se-1:1': { weightKg: '95.000', reps: 8, sessionId: 's-prior', loggedAt: 't' },
      'se-1:2': { weightKg: '97.500', reps: 9, sessionId: 's-prior', loggedAt: 't' },
    };
    const rows = buildSetRows([LOGGED_ROW], {}, { weight: null, reps: null, rir: null }, 'kg', null, {
      sessionExerciseId: 'se-1',
      referenceMap,
    });
    expect(rows[0].reference).toEqual({ weight: '95.00', reps: '8' });
    expect(rows[1].reference).toEqual({ weight: '97.50', reps: '9' });
  });

  it('defaults to no reference on every row when no reference context is passed', () => {
    const rows = buildSetRows([LOGGED_ROW], {}, { weight: null, reps: null, rir: null }, 'kg', null);
    expect(rows[0].reference).toEqual({ weight: null, reps: null });
    expect(rows[1].reference).toEqual({ weight: null, reps: null });
  });
});

const PAGE_DATA: ExercisePageData = {
  sessionExerciseId: 'se-1',
  exerciseId: 'ex-1',
  sessionId: 's-1',
  userId: 'user-1',
  targets: { targetSets: 3, targetRepMin: 8, targetRepMax: 12, targetRir: 2, targetRestSeconds: 90 },
  routineExerciseId: 're-1',
  cycleId: null,
  hasNote: false,
  noteText: null,
};

function baseViewProps(overrides: Partial<WorkoutScreenViewProps> = {}): WorkoutScreenViewProps {
  return {
    screenState: 'ready',
    colors: COLORS,
    // Unused by this suite's assertions — WorkoutScreenView threads it straight through to
    // ExercisePage/TargetsSheet, neither of which this file exercises (it renders ExercisePageView
    // directly). A real handle would need the mocked getPowerSync() chain; an opaque stand-in
    // satisfies the type without importing @powersync internals into a jsdom test (WINDOWS #22).
    db: {} as WriteDb,
    userId: 'user-1',
    activeGymId: 'gym-1',
    exercises: [{ id: 'se-1', name: 'Bench Press', completedWorkingSets: 0, targetSets: 3 }],
    currentExerciseId: 'se-1',
    currentIndex: 0,
    pagerWidth: 375,
    rowsByExercise: { 'se-1': buildSetRows([], {}, { weight: null, reps: '12', rir: '2' }, 'kg', null) },
    pageDataByExercise: { 'se-1': PAGE_DATA },
    activeField: null,
    bandState: { kind: 'collapsed' },
    onBandNeighbourPress: jest.fn(),
    onBandRecoveryPress: jest.fn(),
    equipmentTypeByExerciseId: new Map(),
    resolvedInventory: null,
    equipmentProfileId: null,
    starting: false,
    nextUp: null,
    weightUnit: 'kg',
    headerTimer: null,
    paused: false,
    showNotificationPrompt: false,
    showBackgroundAlertsOffNote: false,
    showOneOffPicker: false,
    showAddExercisePicker: false,
    showSessionMenu: false,
    showDiscardConfirm: false,
    showSwitchGymSheet: false,
    hasSessionNote: false,
    sessionNoteText: null,
    showSessionNoteSheet: false,
    onStartWorkout: jest.fn(),
    onStartOneOff: jest.fn(),
    onGoToPrograms: jest.fn(),
    onAddOneOffExercises: jest.fn(),
    onCancelOneOffPicker: jest.fn(),
    onSelectExercise: jest.fn(),
    onIndexChange: jest.fn(),
    onAddExercise: jest.fn(),
    onConfirmAddExercise: jest.fn(),
    onCancelAddExercisePicker: jest.fn(),
    onExerciseChanged: jest.fn(),
    onFieldPress: jest.fn(),
    onReferenceTap: jest.fn(),
    onKeypadPress: jest.fn(),
    onSubmitField: jest.fn(),
    onCheckmarkPress: jest.fn(),
    onOpenRestTimer: jest.fn(),
    onAllowNotifications: jest.fn(),
    onDismissNotificationPrompt: jest.fn(),
    onTurnOnNotifications: jest.fn(),
    onDismissBackgroundAlertsOffNote: jest.fn(),
    onToggleSessionMenu: jest.fn(),
    onPauseResume: jest.fn(),
    onRequestDiscard: jest.fn(),
    onConfirmDiscard: jest.fn(),
    onCancelDiscard: jest.fn(),
    onOpenSwitchGym: jest.fn(),
    onSelectGym: jest.fn(),
    onManageGyms: jest.fn(),
    onCancelSwitchGym: jest.fn(),
    onOpenSessionNote: jest.fn(),
    onSessionNoteSaved: jest.fn(),
    onCancelSessionNote: jest.fn(),
    onFinishWorkout: jest.fn(),
    ...overrides,
  };
}

const WORKOUT_NEXT_UP = {
  kind: 'workout' as const,
  cycle: null,
  day: { id: 'd1', orderIndex: 0, name: 'Push', isRestDay: false, slots: [] },
};

const TIME_OFF_NEXT_UP = {
  kind: 'time-off' as const,
  cycle: { id: 'c1', name: 'Off', kind: 'time_off' as const, orderIndex: 0, durationDays: 7 },
  daysRemaining: 3,
};

const PROGRAM_COMPLETE_NEXT_UP = { kind: 'program-complete' as const, lastCycle: null };
const NO_ACTIVE_PROGRAM_NEXT_UP = { kind: 'no-active-program' as const };

// ExercisePagerView renders its pages through react-native-tab-view's TabView, which our
// no-renderer walker never invokes (TabView's scenes come from calling renderScene, not from a
// props.children tree) — so reaching what a given exercise's page actually renders means calling
// the pager's own renderExercise prop by hand, exactly the "opaque nested component" pattern the
// tracer task established for SetRowView/NumericKeypadView/PrimaryButton.
//
// renderExercise now returns a stateful <ExercisePage> element (05-06's wiring), not
// <ExercisePageView> directly — per this codebase's own convention (TargetsSheet.test.tsx et al.),
// a stateful wrapper is never direct-invoked (it calls useState/useThemeColors/useRouter). What
// this helper actually needs to prove — the SetRowView interaction chain — lives entirely in the
// pass-through props ExercisePage forwards unmodified to its own internal ExercisePageView call
// (rows/activeField/exerciseName/onFieldPress/onReferenceTap/onCheckmarkPress), so those are read
// straight off the raw <ExercisePage> element and fed into ExercisePageView here, with the same
// COLORS fixture every other hook-free view in this file already uses standing in for the
// useThemeColors() resolution ExercisePage would have supplied.
function renderCurrentExercisePage(result: ReactNode, exercise: { id: string; name: string; completedWorkingSets: number; targetSets: number }) {
  const [pager] = findByType(result, ExercisePagerView);
  const pageElement = (pager.props.renderExercise as (ex: typeof exercise) => AnyElement)(exercise);
  const { exerciseName, rows, activeField, onFieldPress, onReferenceTap, onCheckmarkPress } = pageElement.props as unknown as Parameters<
    typeof ExercisePageView
  >[0];
  return ExercisePageView({ exerciseName, rows, activeField, onFieldPress, onReferenceTap, onCheckmarkPress, colors: COLORS, actionBarSlot: undefined });
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

  it('workout-available renders PrimaryButton wired to onStartWorkout', () => {
    const onStartWorkout = jest.fn();
    const result = WorkoutScreenView(
      baseViewProps({ screenState: 'workout-available', nextUp: WORKOUT_NEXT_UP, onStartWorkout }),
    );
    const [button] = findByType(result, PrimaryButton);

    expect(button).toBeDefined();
    expect(button.props.label).toBe('Start Workout');
    (button.props.onPress as () => void)();
    expect(onStartWorkout).toHaveBeenCalledTimes(1);
  });

  it('no-program renders the exact copywriting-contract heading and body, and no PrimaryButton', () => {
    const result = WorkoutScreenView(baseViewProps({ screenState: 'no-program', nextUp: NO_ACTIVE_PROGRAM_NEXT_UP }));
    expect(findByType(result, PrimaryButton)).toHaveLength(0);
    const text = flatText(result);
    expect(text).toContain('No active program');
    expect(text).toContain('Build or activate a program, or start a one-off workout.');
  });

  it('no-program renders a Browse Programs link wired to onGoToPrograms', () => {
    const onGoToPrograms = jest.fn();
    const result = WorkoutScreenView(baseViewProps({ screenState: 'no-program', nextUp: NO_ACTIVE_PROGRAM_NEXT_UP, onGoToPrograms }));
    const [link] = findByType(result, Pressable).filter((el) => el.props.accessibilityLabel === 'Browse Programs');
    (link.props.onPress as () => void)();
    expect(onGoToPrograms).toHaveBeenCalledTimes(1);
  });

  it('renders its own line for time-off rather than falling through to No active program', () => {
    const result = WorkoutScreenView(baseViewProps({ screenState: 'time-off', nextUp: TIME_OFF_NEXT_UP }));
    const text = flatText(result);
    expect(text).toContain("You're on scheduled time off.");
    expect(text).not.toContain('No active program');
  });

  it('renders its own line for program-complete rather than falling through to No active program', () => {
    const result = WorkoutScreenView(baseViewProps({ screenState: 'program-complete', nextUp: PROGRAM_COMPLETE_NEXT_UP }));
    const text = flatText(result);
    expect(text).toContain('Block complete');
    expect(text).not.toContain('No active program');
  });

  it.each(['no-program', 'time-off', 'program-complete', 'workout-available'] as const)(
    'the one-off start action is present in the %s no-session state',
    (screenState) => {
      const onStartOneOff = jest.fn();
      const result = WorkoutScreenView(
        baseViewProps({
          screenState,
          nextUp:
            screenState === 'time-off' ? TIME_OFF_NEXT_UP : screenState === 'program-complete' ? PROGRAM_COMPLETE_NEXT_UP : screenState === 'workout-available' ? WORKOUT_NEXT_UP : NO_ACTIVE_PROGRAM_NEXT_UP,
          onStartOneOff,
        }),
      );
      const [link] = findByType(result, Pressable).filter((el) => el.props.accessibilityLabel === 'Start a one-off workout');
      expect(link).toBeDefined();
      (link.props.onPress as () => void)();
      expect(onStartOneOff).toHaveBeenCalledTimes(1);
    },
  );

  it('renders the ExercisePickerModal in place of everything else when showOneOffPicker is true', () => {
    const onAddOneOffExercises = jest.fn();
    const onCancelOneOffPicker = jest.fn();
    const result = WorkoutScreenView(
      baseViewProps({ screenState: 'error', showOneOffPicker: true, onAddOneOffExercises, onCancelOneOffPicker }),
    ) as ReactElement<{ onAdd: (rows: unknown[]) => void; onCancel: () => void }>;

    expect(result.type).toBe(ExercisePickerModal);
    result.props.onAdd([]);
    expect(onAddOneOffExercises).toHaveBeenCalledWith([]);
    result.props.onCancel();
    expect(onCancelOneOffPicker).toHaveBeenCalledTimes(1);
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

  it('a SetRowView reference tap resolves that row’s exerciseId, setId and field through onReferenceTap', () => {
    const exercise = { id: 'se-1', name: 'Bench Press', completedWorkingSets: 1, targetSets: 1 };
    const rows = buildSetRows([LOGGED_ROW], {}, { weight: null, reps: '12', rir: '2' }, 'kg', null, {
      sessionExerciseId: 'se-1',
      referenceMap: { 'se-1:1': { weightKg: '95.000', reps: 8, sessionId: 's-prior', loggedAt: 't' } },
    });
    const onReferenceTap = jest.fn();
    const result = WorkoutScreenView(baseViewProps({ exercises: [exercise], rowsByExercise: { 'se-1': rows }, onReferenceTap }));

    const page = renderCurrentExercisePage(result, exercise);
    const [existingRow] = findByType(page, SetRowView);
    (existingRow.props.onReferenceTap as (field: 'weight' | 'reps') => void)('weight');

    expect(onReferenceTap).toHaveBeenCalledWith('se-1', 'ls-1', 'weight');
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

  it('threads the already-resolved band state and callbacks to the keypad only for the weight field', () => {
    const onBandNeighbourPress = jest.fn();
    const onBandRecoveryPress = jest.fn();
    const bandState = { kind: 'pair', weightKg: '20.000' } as const;

    const weightField = WorkoutScreenView(
      baseViewProps({
        activeField: { exerciseId: 'se-1', setId: null, field: 'weight', value: null, touched: false },
        bandState,
        onBandNeighbourPress,
        onBandRecoveryPress,
      }),
    );
    const [weightKeypad] = findByType(weightField, NumericKeypadView);
    expect(weightKeypad.props.band).toEqual({
      state: bandState,
      unit: 'kg',
      onNeighbourPress: onBandNeighbourPress,
      onRecoveryPress: onBandRecoveryPress,
    });

    const repsField = WorkoutScreenView(
      baseViewProps({
        activeField: { exerciseId: 'se-1', setId: null, field: 'reps', value: null, touched: false },
        bandState,
      }),
    );
    const [repsKeypad] = findByType(repsField, NumericKeypadView);
    expect(repsKeypad.props.band).toBeUndefined();
  });

  const HEADER_TIMER = { sessionId: 's-1', startedAtMs: 0, accumulatedPausedSeconds: 0, pausedAtMs: null, restTargetAtMs: null };

  it('renders a Finish Workout primary CTA wired to onFinishWorkout in the live session', () => {
    const onFinishWorkout = jest.fn();
    const result = WorkoutScreenView(baseViewProps({ headerTimer: HEADER_TIMER, onFinishWorkout }));
    const [button] = findByType(result, PrimaryButton).filter((el) => el.props.label === 'Finish Workout');
    expect(button).toBeDefined();
    (button.props.onPress as () => void)();
    expect(onFinishWorkout).toHaveBeenCalledTimes(1);
  });

  it('the session menu is closed by default and opens on toggle, showing Pause when not paused', () => {
    const onToggleSessionMenu = jest.fn();
    const closed = WorkoutScreenView(baseViewProps({ headerTimer: HEADER_TIMER, showSessionMenu: false, onToggleSessionMenu }));
    expect(flatText(closed)).not.toContain('Discard');

    const open = WorkoutScreenView(baseViewProps({ headerTimer: HEADER_TIMER, showSessionMenu: true, paused: false }));
    const text = flatText(open);
    expect(text).toContain('Pause');
    expect(text).not.toContain('Resume');
    expect(text).toContain('Discard');
  });

  it('the session menu shows Resume once the session is paused', () => {
    const open = WorkoutScreenView(baseViewProps({ headerTimer: HEADER_TIMER, showSessionMenu: true, paused: true }));
    expect(flatText(open)).toContain('Resume');
  });

  it('the session menu Discard row opens the discard confirmation, never writes directly', () => {
    const onRequestDiscard = jest.fn();
    const result = WorkoutScreenView(baseViewProps({ headerTimer: HEADER_TIMER, showSessionMenu: true, onRequestDiscard }));
    const [discardButton] = findByType(result, Pressable).filter((el) => el.props.accessibilityLabel === 'Discard');
    (discardButton.props.onPress as () => void)();
    expect(onRequestDiscard).toHaveBeenCalledTimes(1);
  });

  it('the menu carries Switch Gym between Session Note and Discard, and Discard is still the last row', () => {
    const result = WorkoutScreenView(baseViewProps({ headerTimer: HEADER_TIMER, showSessionMenu: true }));
    const rows = findByType(result, Pressable).filter((el) =>
      ['Session Note', 'Switch Gym', 'Discard'].includes(el.props.accessibilityLabel as string),
    );
    expect(rows.map((row) => row.props.accessibilityLabel)).toEqual(['Session Note', 'Switch Gym', 'Discard']);
  });

  it('selecting Switch Gym from the menu opens the sheet with no confirmation step', () => {
    const onOpenSwitchGym = jest.fn();
    const result = WorkoutScreenView(baseViewProps({ headerTimer: HEADER_TIMER, showSessionMenu: true, onOpenSwitchGym }));
    const [switchGymButton] = findByType(result, Pressable).filter((el) => el.props.accessibilityLabel === 'Switch Gym');
    (switchGymButton.props.onPress as () => void)();
    expect(onOpenSwitchGym).toHaveBeenCalledTimes(1);
  });

  it('renders the Switch Gym sheet only when showSwitchGymSheet is true, wired to the session gym', () => {
    const withoutSheet = WorkoutScreenView(baseViewProps({ headerTimer: HEADER_TIMER, showSwitchGymSheet: false }));
    const withSheet = WorkoutScreenView(
      baseViewProps({ headerTimer: HEADER_TIMER, showSwitchGymSheet: true, userId: 'user-1', activeGymId: 'gym-1' }),
    );
    expect(findByType(withoutSheet, SwitchGymSheet)).toHaveLength(0);
    const [sheet] = findByType(withSheet, SwitchGymSheet);
    expect(sheet.props.userId).toBe('user-1');
    expect(sheet.props.activeGymId).toBe('gym-1');
  });

  it('renders the Discard Workout confirmation dialog only when showDiscardConfirm is true', () => {
    const withoutConfirm = WorkoutScreenView(baseViewProps({ headerTimer: HEADER_TIMER, showDiscardConfirm: false }));
    const withConfirm = WorkoutScreenView(baseViewProps({ headerTimer: HEADER_TIMER, showDiscardConfirm: true }));
    expect(findByType(withoutConfirm, DiscardWorkoutDialog)).toHaveLength(0);
    expect(findByType(withConfirm, DiscardWorkoutDialog)).toHaveLength(1);
  });

  it('the discard dialog wires onConfirm/onCancel through to onConfirmDiscard/onCancelDiscard', () => {
    const onConfirmDiscard = jest.fn();
    const onCancelDiscard = jest.fn();
    const result = WorkoutScreenView(
      baseViewProps({ headerTimer: HEADER_TIMER, showDiscardConfirm: true, onConfirmDiscard, onCancelDiscard }),
    );
    const [dialog] = findByType(result, DiscardWorkoutDialog);
    (dialog.props.onConfirm as () => void)();
    (dialog.props.onCancel as () => void)();
    expect(onConfirmDiscard).toHaveBeenCalledTimes(1);
    expect(onCancelDiscard).toHaveBeenCalledTimes(1);
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
    const session = { session: { id: 's-1', routineDayId: null, status: 'in_progress', startedAt: 't', pausedAt: null, accumulatedPausedSeconds: 0, restTargetAt: null, timezone: 'UTC', localDate: '2026-08-20' }, exercises: [], setsByExerciseId: {} };
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
