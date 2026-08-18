import type { ReactElement, ReactNode } from 'react';
import { DetailSection } from '../DetailSection';
import { MuscleTargetList } from '../MuscleTargetList';
import type { MuscleTarget } from '../../lib/catalog/exercise-detail';

// Neither DetailSection nor MuscleTargetList calls a hook, so each is a plain
// `(props) => ReactElement | null` function — invoking it directly (no renderer) is a faithful
// exercise of its real body. @testing-library/react-native and react-test-renderer are both
// absent from this worktree's lockfile (installing either is out of scope per the
// package-legitimacy gate — see the plan's own contingency for this exact situation).
function collectText(node: ReactNode): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectText);
  if (typeof node === 'object') {
    const element = node as ReactElement<{ children?: ReactNode }>;
    return element.props?.children !== undefined ? collectText(element.props.children) : [];
  }
  return [];
}

function target(overrides: Partial<MuscleTarget>): MuscleTarget {
  return { muscleGroupId: 'chest', name: 'Chest', bodyRegion: 'chest', weightFactor: '1.00', ...overrides };
}

function flatText(node: ReactNode): string {
  return collectText(node).join('').replace(/\s+/g, ' ').trim();
}

describe('DetailSection', () => {
  it('renders nothing at all — not a heading, not a wrapper — for an empty body', () => {
    expect(DetailSection({ heading: 'Cues', children: null })).toBeNull();
    expect(DetailSection({ heading: 'Cues', children: undefined })).toBeNull();
    expect(DetailSection({ heading: 'Cues', children: '' })).toBeNull();
  });

  it('renders its heading and body when a body is present', () => {
    const result = DetailSection({ heading: 'Cues', children: 'Keep your back straight throughout.' });
    expect(result).not.toBeNull();
    const text = collectText(result);
    expect(text).toContain('Cues');
    expect(text).toContain('Keep your back straight throughout.');
  });
});

describe('MuscleTargetList', () => {
  it('renders the primary line and omits the secondary sub-line for one primary, zero secondary targets', () => {
    const result = MuscleTargetList({ primaryMuscles: [target({ name: 'Triceps' })], secondaryMuscles: [] });
    const text = flatText(result);
    expect(text).toContain('Primary muscle');
    expect(text).toContain('Triceps');
    expect(text).not.toContain('Secondary');
  });

  it('pluralizes correctly for one versus several targets', () => {
    const singular = MuscleTargetList({ primaryMuscles: [target({ name: 'Triceps' })], secondaryMuscles: [] });
    const singularText = flatText(singular);
    expect(singularText).toContain('Primary muscle:');
    expect(singularText).not.toContain('Primary muscles:');

    const plural = MuscleTargetList({
      primaryMuscles: [target({ name: 'Triceps' }), target({ name: 'Chest' })],
      secondaryMuscles: [target({ name: 'Front Delts' }), target({ name: 'Abs' })],
    });
    const pluralText = flatText(plural);
    expect(pluralText).toContain('Primary muscles:');
    expect(pluralText).toContain('Secondary muscles:');
  });

  it('never renders weight_factor as a number to the user', () => {
    const result = MuscleTargetList({
      primaryMuscles: [target({ name: 'Triceps', weightFactor: '0.73' })],
      secondaryMuscles: [],
    });
    expect(flatText(result)).not.toContain('0.73');
  });
});
