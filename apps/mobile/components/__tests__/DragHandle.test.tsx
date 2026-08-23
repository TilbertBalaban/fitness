import { DragHandleView } from '../DragHandle';
import { capturePointer, releasePointer } from '../DragHandle.web';

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

// WR-03: the web handle recorded the pointer id on pointerdown but never captured the pointer, so
// as soon as the cursor left the 48x48 grip — which one row of travel guarantees — pointermove and
// pointerup stopped arriving and the drop was silently discarded. The browser interaction itself is
// unobservable in this environment, so these assert the DOM contract the fix depends on rather than
// the rendered gesture.
describe('pointer capture (DragHandle.web)', () => {
  function fakeNode(captured = new Set<number>()) {
    return {
      captured,
      setPointerCapture: jest.fn((id: number) => captured.add(id)),
      releasePointerCapture: jest.fn((id: number) => captured.delete(id)),
      hasPointerCapture: jest.fn((id: number) => captured.has(id)),
    };
  }

  it('captures the pointer on the element that must keep receiving its events', () => {
    const node = fakeNode();

    capturePointer(node, 7);

    expect(node.setPointerCapture).toHaveBeenCalledWith(7);
    expect(node.captured.has(7)).toBe(true);
  });

  it('is a no-op when the ref has not attached yet, rather than throwing mid-gesture', () => {
    expect(() => capturePointer(null, 7)).not.toThrow();
    expect(() => releasePointer(null, 7)).not.toThrow();
    expect(() => capturePointer(undefined, 7)).not.toThrow();
  });

  it('is a no-op on an engine that implements no pointer capture at all', () => {
    expect(() => capturePointer({}, 7)).not.toThrow();
    expect(() => releasePointer({}, 7)).not.toThrow();
  });

  it('releases a capture it holds', () => {
    const node = fakeNode();
    capturePointer(node, 7);

    releasePointer(node, 7);

    expect(node.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(node.captured.has(7)).toBe(false);
  });

  it('does not release a pointer it never captured — the DOM call throws on an unknown id', () => {
    const node = fakeNode();

    releasePointer(node, 7);

    expect(node.releasePointerCapture).not.toHaveBeenCalled();
  });

  it('swallows a release the browser already revoked, so the cancel path still resets state', () => {
    const node = {
      releasePointerCapture: jest.fn(() => {
        throw new Error('NotFoundError');
      }),
    };

    expect(() => releasePointer(node, 7)).not.toThrow();
    expect(node.releasePointerCapture).toHaveBeenCalledWith(7);
  });

  it('releases only the pointer it is given when several are captured', () => {
    const node = fakeNode(new Set([1, 2]));

    releasePointer(node, 1);

    expect(node.captured.has(1)).toBe(false);
    expect(node.captured.has(2)).toBe(true);
  });
});
