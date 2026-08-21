import { DragHandleView } from '../DragHandle';

const colors = { accent: 'rgb(37, 99, 235)', foregroundMuted: 'rgb(113, 113, 122)', surface: 'rgb(244, 244, 245)' };

// Direct-invocation technique (SwapSuggestionList.test.tsx precedent) — DragHandleView has no
// hooks, so calling it directly is a faithful exercise of its real body.
describe('DragHandleView', () => {
  it('renders a button-role control whose accessibilityLabel names the exercise it reorders', () => {
    const result = DragHandleView({ exerciseName: 'Barbell Squat', colors });

    expect(result.props.accessibilityRole).toBe('button');
    expect(result.props.accessibilityLabel).toBe('Reorder Barbell Squat');
  });

  it('has a hit target of at least 48x48', () => {
    const result = DragHandleView({ exerciseName: 'Barbell Squat', colors });
    const style = result.props.style as { minWidth: number; minHeight: number };

    expect(style.minWidth).toBeGreaterThanOrEqual(48);
    expect(style.minHeight).toBeGreaterThanOrEqual(48);
  });

  it('renders unconditionally — no prop hides it', () => {
    const result = DragHandleView({ exerciseName: 'Any Exercise', colors });

    expect(result).not.toBeNull();
    expect(result).not.toBeUndefined();
  });
});
