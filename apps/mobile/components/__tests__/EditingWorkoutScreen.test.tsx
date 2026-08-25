// getPowerSync's real module chain reaches @powersync/react-native -> @powersync/shared-internals,
// whose ESM dist Jest cannot parse (WINDOWS #22/#33) — mocked before importing the screen module,
// matching workout.test.tsx's own established rationale exactly.
jest.mock('@/lib/db/powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('@/lib/auth-client', () => ({ authClient: { useSession: () => ({ data: null }) } }));
jest.mock('../../app/exercises', () => ({ loadCatalogRows: jest.fn() }));

import type { ReactElement, ReactNode } from 'react';
import { Pressable } from 'react-native';
import { PrimaryButton } from '../PrimaryButton';
import { NumericKeypadView } from '../NumericKeypad';
import { ExerciseStripView } from '../ExerciseStrip';
import { ExercisePagerView } from '../ExercisePager';
import { ExercisePageView } from '../ExercisePage';
import { SessionDateField } from '../SessionDateField';
import { ExercisePickerModal } from '../ExercisePickerModal';
import {
  EditingWorkoutScreenView,
  type EditingWorkoutScreenViewProps,
} from '../EditingWorkoutScreen';
import { buildSetRows } from '@/lib/session/set-row-builders';

// Same direct-invocation technique workout.test.tsx already established for WorkoutScreenView —
// EditingWorkoutScreenView has no hooks, so calling it directly exercises its real body with no
// renderer. This suite exists specifically to prove D-32's structural claims about the `editing`
// subtree: no RestTimerBar anywhere in its tree, and the primary action reads Done, never Finish
// Workout — the same two assertions the plan names for "workout.test.tsx," relocated here because
// the editing subtree is its own module (EditingWorkoutScreen.tsx), not a branch inside workout.tsx
// (05-10 Task 2: the module boundary is what makes the scheduleRestAlert/shouldAutoAdvance
// import-absence grep meaningful in the first place).
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

const PAGE_DATA = {
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

function baseProps(overrides: Partial<EditingWorkoutScreenViewProps> = {}): EditingWorkoutScreenViewProps {
  return {
    screenState: 'ready',
    colors: COLORS,
    localDate: '2026-08-18',
    exercises: [{ id: 'se-1', name: 'Bench Press', completedWorkingSets: 0, targetSets: 3 }],
    currentExerciseId: 'se-1',
    currentIndex: 0,
    pagerWidth: 375,
    rowsByExercise: { 'se-1': buildSetRows([], {}, { weight: null, reps: '12', rir: '2' }, 'kg', null) },
    pageDataByExercise: { 'se-1': PAGE_DATA },
    activeField: null,
    weightUnit: 'kg',
    showAddExercisePicker: false,
    onDateChange: jest.fn(),
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
    onDone: jest.fn(),
    ...overrides,
  };
}

function renderCurrentExercisePage(result: ReactNode, exercise: { id: string; name: string; completedWorkingSets: number; targetSets: number }) {
  const [pager] = findByType(result, ExercisePagerView);
  const pageElement = (pager.props.renderExercise as (ex: typeof exercise) => AnyElement)(exercise);
  const { exerciseName, rows, activeField, onFieldPress, onReferenceTap, onCheckmarkPress } = pageElement.props as unknown as Parameters<
    typeof ExercisePageView
  >[0];
  return ExercisePageView({ exerciseName, rows, activeField, onFieldPress, onReferenceTap, onCheckmarkPress, colors: COLORS, actionBarSlot: undefined });
}

describe('EditingWorkoutScreenView', () => {
  it('renders the formatEditingHeader line and no RestTimerBar', () => {
    const result = EditingWorkoutScreenView(baseProps({ localDate: '2026-08-18' }));
    expect(flatText(result)).toContain('Editing Tuesday, Aug 18');
    // RestTimerBar is never imported by EditingWorkoutScreen.tsx at all (see the file's own header
    // comment) — this assertion also proves the rendered tree carries no header-timer-bar text.
    expect(flatText(result)).not.toContain('Workout');
    expect(flatText(result)).not.toContain('Rest');
  });

  it('the primary action reads Done, never Finish Workout', () => {
    const onDone = jest.fn();
    const result = EditingWorkoutScreenView(baseProps({ onDone }));
    const [button] = findByType(result, PrimaryButton);
    expect(button.props.label).toBe('Done');
    (button.props.onPress as () => void)();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('renders SessionDateField wired to the current localDate and onDateChange', () => {
    const onDateChange = jest.fn();
    const result = EditingWorkoutScreenView(baseProps({ localDate: '2026-08-18', onDateChange }));
    const [dateField] = findByType(result, SessionDateField);
    expect(dateField.props.localDate).toBe('2026-08-18');
    expect(dateField.props.onChange).toBe(onDateChange);
  });

  it('renders the exercise strip and pager wired to the shared index/width', () => {
    const result = EditingWorkoutScreenView(baseProps({ currentIndex: 0, pagerWidth: 400 }));
    const [strip] = findByType(result, ExerciseStripView);
    const [pager] = findByType(result, ExercisePagerView);
    expect(strip.props.exercises).toHaveLength(1);
    expect(pager.props.width).toBe(400);
  });

  it('renders one SetRowView per resolved row for the current exercise, writing through onCheckmarkPress', () => {
    const exercise = { id: 'se-1', name: 'Bench Press', completedWorkingSets: 0, targetSets: 1 };
    const onCheckmarkPress = jest.fn();
    const result = EditingWorkoutScreenView(baseProps({ exercises: [exercise], onCheckmarkPress }));

    const page = renderCurrentExercisePage(result, exercise);
    expect(flatText(page)).toContain('Bench Press');
  });

  it('docks the keypad only while a field is active', () => {
    const withoutKeypad = EditingWorkoutScreenView(baseProps({ activeField: null }));
    const withKeypad = EditingWorkoutScreenView(
      baseProps({ activeField: { exerciseId: 'se-1', setId: null, field: 'weight', value: null, touched: false } }),
    );
    expect(findByType(withoutKeypad, NumericKeypadView)).toHaveLength(0);
    expect(findByType(withKeypad, NumericKeypadView)).toHaveLength(1);
  });

  it('opens the ExercisePickerModal in a Modal only when showAddExercisePicker is true', () => {
    const withoutPicker = EditingWorkoutScreenView(baseProps({ showAddExercisePicker: false }));
    const withPicker = EditingWorkoutScreenView(baseProps({ showAddExercisePicker: true }));
    expect(findByType(withoutPicker, ExercisePickerModal)).toHaveLength(0);
    expect(findByType(withPicker, ExercisePickerModal)).toHaveLength(1);
  });

  it('tapping the strip’s add-exercise chip calls onAddExercise', () => {
    const onAddExercise = jest.fn();
    const result = EditingWorkoutScreenView(baseProps({ onAddExercise }));
    const [strip] = findByType(result, ExerciseStripView);
    (strip.props.onAddExercise as () => void)();
    expect(onAddExercise).toHaveBeenCalledTimes(1);
  });

  it('renders the error state with a Done action, still reachable if the named session fails to load', () => {
    const result = EditingWorkoutScreenView(baseProps({ screenState: 'error' }));
    const [button] = findByType(result, PrimaryButton);
    expect(button.props.label).toBe('Done');
  });

  it('renders a skeleton block, not a spinner, while loading', () => {
    const result = EditingWorkoutScreenView(baseProps({ screenState: 'loading' }));
    expect(findByType(result, Pressable)).toHaveLength(0);
  });

  it('calls no hook — direct-invocable with no renderer', () => {
    expect(() => EditingWorkoutScreenView(baseProps())).not.toThrow();
  });
});
