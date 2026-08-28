import type { ReactElement, ReactNode } from 'react';
import { Pressable, Text } from 'react-native';
import {
  countCompletedWorkingSets,
  exerciseChipFraction,
  exerciseChipState,
  exerciseChipTone,
  ExerciseStripView,
  type ExerciseStripViewProps,
} from '../ExerciseStrip';

// Same direct-invocation technique as CycleStrip.test.tsx/DayDeck.test.tsx — ExerciseStripView has
// no hooks, so calling it directly exercises its real body with no renderer.
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

const COLORS = { accent: 'rgb(37, 99, 235)', foregroundMuted: 'rgb(113, 113, 122)', surface: 'rgb(244, 244, 245)' };

function baseProps(overrides: Partial<ExerciseStripViewProps> = {}): ExerciseStripViewProps {
  return {
    exercises: [],
    currentExerciseId: null,
    colors: COLORS,
    onSelectExercise: jest.fn(),
    onAddExercise: jest.fn(),
    ...overrides,
  };
}

describe('exerciseChipState', () => {
  it('is current whenever the exercise is the paged one, regardless of completion', () => {
    expect(exerciseChipState(true, 0, 3)).toBe('current');
    expect(exerciseChipState(true, 3, 3)).toBe('current');
  });

  it('is completed when every working set is done and it is not the current exercise', () => {
    expect(exerciseChipState(false, 3, 3)).toBe('completed');
  });

  it('is in-progress for a partially or not-yet-started, non-current exercise', () => {
    expect(exerciseChipState(false, 0, 3)).toBe('in-progress');
    expect(exerciseChipState(false, 1, 3)).toBe('in-progress');
  });
});

describe('exerciseChipTone', () => {
  it('gives the current state the accent border on surface fill', () => {
    expect(exerciseChipTone('current')).toEqual({ borderStyle: 'solid', borderTone: 'accent', fill: 'surface' });
  });

  it('gives the completed state a muted border on secondary fill', () => {
    expect(exerciseChipTone('completed')).toEqual({ borderStyle: 'solid', borderTone: 'muted', fill: 'secondary' });
  });

  it('gives the in-progress state a muted border on surface fill', () => {
    expect(exerciseChipTone('in-progress')).toEqual({ borderStyle: 'solid', borderTone: 'muted', fill: 'surface' });
  });
});

describe('exerciseChipFraction', () => {
  it('renders N/M while incomplete', () => {
    expect(exerciseChipFraction(1, 3)).toEqual({ kind: 'fraction', text: '1/3' });
  });

  it('renders the checkmark sentinel instead of N/N once every set is done', () => {
    expect(exerciseChipFraction(3, 3)).toEqual({ kind: 'complete' });
  });

  it('never reports complete against a zero target', () => {
    expect(exerciseChipFraction(0, 0)).toEqual({ kind: 'fraction', text: '0/0' });
  });
});

describe('countCompletedWorkingSets', () => {
  it('counts only completed, non-warm-up sets', () => {
    const count = countCompletedWorkingSets([
      { setType: 'normal', completed: true, parentSetId: null },
      { setType: 'normal', completed: false, parentSetId: null },
      { setType: 'warmup', completed: true, parentSetId: null },
    ]);
    expect(count).toBe(1);
  });

  it('a completed warm-up row leaves the count unchanged versus the same rows without it', () => {
    const withoutWarmup = countCompletedWorkingSets([
      { setType: 'normal', completed: true, parentSetId: null },
      { setType: 'normal', completed: true, parentSetId: null },
    ]);
    const withCompletedWarmup = countCompletedWorkingSets([
      { setType: 'normal', completed: true, parentSetId: null },
      { setType: 'normal', completed: true, parentSetId: null },
      { setType: 'warmup', completed: true, parentSetId: null },
    ]);
    expect(withCompletedWarmup).toBe(withoutWarmup);
  });

  // D-10: a completed parent counts as 1; its completed children add volume but never increment
  // the set count — a drop set of a parent plus three children on a 4-set prescription must read
  // 1/4, not 4/4.
  it('counts a completed parent working set as 1 and its completed children as 0', () => {
    const parentId = 'parent-1';
    const count = countCompletedWorkingSets([
      { setType: 'normal', completed: true, parentSetId: null },
      { setType: 'drop', completed: true, parentSetId: parentId },
      { setType: 'drop', completed: true, parentSetId: parentId },
      { setType: 'drop', completed: true, parentSetId: parentId },
    ]);
    expect(count).toBe(1);
  });

  it('counts a completed drop/myorep/failure/amrap PARENT row (no parent of its own) as 1 — the exclusion is warm-up-only', () => {
    const count = countCompletedWorkingSets([
      { setType: 'drop', completed: true, parentSetId: null },
      { setType: 'myorep', completed: true, parentSetId: null },
      { setType: 'failure', completed: true, parentSetId: null },
      { setType: 'amrap', completed: true, parentSetId: null },
    ]);
    expect(count).toBe(4);
  });
});

describe('ExerciseStripView', () => {
  it('renders the current chip with the accent-border styling', () => {
    const result = ExerciseStripView(
      baseProps({
        exercises: [{ id: 'e1', name: 'Bench Press', completedWorkingSets: 1, targetSets: 3 }],
        currentExerciseId: 'e1',
      }),
    );
    const chip = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Bench Press, 1/3');

    expect(chip).toBeDefined();
    expect((chip?.props.className as string).includes('border-accent')).toBe(true);
  });

  it('renders a completed, non-current chip with the checkmark sentinel rather than N/N', () => {
    const result = ExerciseStripView(
      baseProps({
        exercises: [{ id: 'e1', name: 'Squat', completedWorkingSets: 3, targetSets: 3 }],
        currentExerciseId: 'e2',
      }),
    );
    const chip = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Squat, complete');

    expect(chip).toBeDefined();
    expect(findByType(result, Text).some((el) => el.props.children === '3/3')).toBe(false);
  });

  it('renders an in-progress, non-current chip with an N/M fraction', () => {
    const result = ExerciseStripView(
      baseProps({
        exercises: [{ id: 'e1', name: 'Row', completedWorkingSets: 1, targetSets: 4 }],
        currentExerciseId: 'e2',
      }),
    );
    const chip = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Row, 1/4');

    expect(chip).toBeDefined();
  });

  it('tapping a chip calls onSelectExercise with that exercise’s id', () => {
    const onSelectExercise = jest.fn();
    const result = ExerciseStripView(
      baseProps({
        exercises: [{ id: 'e1', name: 'Deadlift', completedWorkingSets: 0, targetSets: 1 }],
        onSelectExercise,
      }),
    );
    const chip = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Deadlift, 0/1');

    (chip?.props.onPress as () => void)();

    expect(onSelectExercise).toHaveBeenCalledWith('e1');
  });

  it('a single-exercise session still renders the trailing add chip', () => {
    const result = ExerciseStripView(
      baseProps({ exercises: [{ id: 'e1', name: 'Bench Press', completedWorkingSets: 0, targetSets: 3 }] }),
    );
    const addChip = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Add Exercise');

    expect(addChip).toBeDefined();
    expect(addChip?.props.style).toMatchObject({ minWidth: 48, minHeight: 48 });
  });

  it('an empty exercise list still renders the add chip, never an empty scroller with nothing to tap', () => {
    const result = ExerciseStripView(baseProps({ exercises: [] }));
    const addChip = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Add Exercise');

    expect(addChip).toBeDefined();
  });

  it('tapping the add chip calls onAddExercise', () => {
    const onAddExercise = jest.fn();
    const result = ExerciseStripView(baseProps({ onAddExercise }));
    const addChip = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Add Exercise');

    (addChip?.props.onPress as () => void)();

    expect(onAddExercise).toHaveBeenCalledTimes(1);
  });
});
