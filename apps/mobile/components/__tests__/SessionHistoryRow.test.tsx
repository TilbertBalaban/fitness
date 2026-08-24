import { SessionHistoryRowView, type SessionHistoryRowViewProps } from '../SessionHistoryRow';
import type { HistorySessionRow } from '@/lib/db/history-query';

jest.mock('@/lib/db/powersync', () => ({ getPowerSync: jest.fn() }));

const COLORS = { foregroundMuted: 'rgb(113, 113, 122)' };

function row(overrides: Partial<HistorySessionRow> = {}): HistorySessionRow {
  return {
    id: 's1',
    name: 'Leg Day',
    localDate: '2026-01-05',
    startedAt: '2026-01-05T10:00:00.000Z',
    endedAt: '2026-01-05T11:00:00.000Z',
    accumulatedPausedSeconds: 0,
    exerciseCount: 4,
    completedSetCount: 12,
    ...overrides,
  };
}

function render(overrides: Partial<HistorySessionRow> = {}) {
  const onPress = jest.fn();
  const onOverflowPress = jest.fn();
  const props: SessionHistoryRowViewProps = { row: row(overrides), colors: COLORS, onPress, onOverflowPress };
  const element = SessionHistoryRowView(props);
  return { element, onPress, onOverflowPress };
}

// Direct-invocation testing (no renderer in this workspace's lockfile), same convention
// ExerciseListRow/SessionActionSheet tests already use elsewhere in this codebase.
describe('SessionHistoryRowView', () => {
  it('renders a two-line anatomy: the label on top, the fact line beneath', () => {
    const { element } = render();
    const [pressableBody] = element.props.children;
    const [label, factLine] = pressableBody.props.children;

    expect(label.props.children).toBe('Leg Day');
    expect(factLine.props.children).toBe('4 exercises · 12 sets · 1:00:00');
  });

  it('renders the zero-count case honestly rather than hiding the row', () => {
    const { element } = render({ exerciseCount: 1, completedSetCount: 0 });
    const [pressableBody] = element.props.children;
    const [, factLine] = pressableBody.props.children;

    expect(factLine.props.children).toBe('1 exercises · 0 sets · 1:00:00');
  });

  it('falls back to the formatted date when the session has no name', () => {
    const { element } = render({ name: null });
    const [pressableBody] = element.props.children;
    const [label] = pressableBody.props.children;

    expect(label.props.children).toBe('Monday, Jan 5');
  });

  it('never sets numberOfLines on either line — R4 wrap-and-grow', () => {
    const { element } = render();
    const [pressableBody] = element.props.children;
    const [label, factLine] = pressableBody.props.children;

    expect(label.props.numberOfLines).toBeUndefined();
    expect(factLine.props.numberOfLines).toBeUndefined();
  });

  it('invokes onPress and onOverflowPress from their own 48x48 targets', () => {
    const { element, onPress, onOverflowPress } = render();
    const [pressableBody, overflowPressable] = element.props.children;

    pressableBody.props.onPress();
    expect(onPress).toHaveBeenCalledTimes(1);

    overflowPressable.props.onPress();
    expect(onOverflowPress).toHaveBeenCalledTimes(1);
    expect(overflowPressable.props.style).toMatchObject({ minWidth: 48, minHeight: 48 });
  });
});
