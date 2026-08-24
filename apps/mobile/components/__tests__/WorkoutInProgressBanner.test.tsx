import { formatBannerDuration, WorkoutInProgressBannerView } from '../WorkoutInProgressBanner';

const NOW = new Date('2026-08-24T12:00:00.000Z').getTime();

function findText(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) findText(child, out);
    return out;
  }
  const element = node as { props?: { children?: unknown } };
  if (element.props?.children !== undefined) findText(element.props.children, out);
  return out;
}

describe('formatBannerDuration', () => {
  it('renders whole minutes only', () => {
    expect(formatBannerDuration(47 * 60 + 30)).toBe('47 min');
  });

  it('floors rather than rounds up', () => {
    expect(formatBannerDuration(59)).toBe('0 min');
  });

  it('never goes negative', () => {
    expect(formatBannerDuration(-10)).toBe('0 min');
  });
});

describe('WorkoutInProgressBannerView (D-28)', () => {
  it('renders nothing for a null session — no empty-state variant', () => {
    const result = WorkoutInProgressBannerView({ session: null, onResume: jest.fn(), onDiscard: jest.fn() });
    expect(result).toBeNull();
  });

  it('renders the in-progress heading with the elapsed duration inline', () => {
    const result = WorkoutInProgressBannerView({
      session: { id: 's-1', startedAtMs: NOW - 47 * 60 * 1000, accumulatedPausedSeconds: 0, pausedAtMs: null },
      nowMs: NOW,
      onResume: jest.fn(),
      onDiscard: jest.fn(),
    });

    const text = findText(result).join(' ');
    expect(text).toContain('Workout in Progress');
    expect(text).toContain('47 min');
  });

  it('renders the paused-variant heading instead, same layout', () => {
    const result = WorkoutInProgressBannerView({
      session: { id: 's-1', startedAtMs: NOW - 47 * 60 * 1000, accumulatedPausedSeconds: 0, pausedAtMs: NOW - 60 * 1000 },
      nowMs: NOW,
      onResume: jest.fn(),
      onDiscard: jest.fn(),
    });

    expect(findText(result).join(' ')).toContain('Workout Paused');
  });

  it('calls onResume when Resume Workout is pressed', () => {
    const onResume = jest.fn();
    const result = WorkoutInProgressBannerView({
      session: { id: 's-1', startedAtMs: NOW, accumulatedPausedSeconds: 0, pausedAtMs: null },
      onResume,
      onDiscard: jest.fn(),
    }) as { props: { children: unknown[] } };

    const actionsRow = (result.props.children as unknown[])[1] as { props: { children: unknown[] } };
    const [resumeButton] = actionsRow.props.children as { props: { onPress: () => void } }[];
    resumeButton.props.onPress();

    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('Discard is a request handler, not a write — pressing it calls onDiscard with no arguments', () => {
    const onDiscard = jest.fn();
    const result = WorkoutInProgressBannerView({
      session: { id: 's-1', startedAtMs: NOW, accumulatedPausedSeconds: 0, pausedAtMs: null },
      onResume: jest.fn(),
      onDiscard,
    }) as { props: { children: unknown[] } };

    const actionsRow = (result.props.children as unknown[])[1] as { props: { children: unknown[] } };
    const [, discardButton] = actionsRow.props.children as { props: { onPress: () => void } }[];
    discardButton.props.onPress();

    expect(onDiscard).toHaveBeenCalledWith();
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });
});
