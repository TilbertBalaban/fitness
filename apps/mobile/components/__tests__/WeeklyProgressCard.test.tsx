import type { ReactElement, ReactNode } from 'react';
import { Text } from 'react-native';
import type { WeeklyProgressResult } from '@fitness/analytics-engine';
import { PROGRESS_TRACK_HEIGHT, WeeklyProgressCardView } from '../WeeklyProgressCard';

type AnyElement = ReactElement<Record<string, unknown>>;

function findAll(node: ReactNode, matches: (element: AnyElement) => boolean, found: AnyElement[] = []): AnyElement[] {
  if (node === null || node === undefined || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
    return found;
  }
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, matches, found);
    return found;
  }
  const element = node as AnyElement;
  if (matches(element)) found.push(element);
  const children = element.props?.children as ReactNode;
  if (children !== undefined) findAll(children, matches, found);
  return found;
}

function findByType(node: ReactNode, type: unknown): AnyElement[] {
  return findAll(node, (element) => element.type === type);
}

function textContent(node: ReactNode): unknown[] {
  return findByType(node, Text).map((element) => element.props.children);
}

const isProgressTrack = (element: AnyElement) => element.props?.accessibilityRole === 'progressbar';
const isTextRole = (element: AnyElement) => element.props?.accessibilityRole === 'text';
const isGlyph = (element: AnyElement) => element.props?.name === 'checkmark';
// The fill is the only view carrying a percentage width; the track beneath it carries none.
const isFill = (element: AnyElement) => typeof (element.props?.style as { width?: unknown })?.width === 'string';

const COLORS = { accent: 'rgb(37, 99, 235)', foregroundMuted: 'rgb(113, 113, 122)', surface: 'rgb(244, 244, 245)' };

const POPULATED: WeeklyProgressResult = {
  hasActivity: true,
  tracks: [
    { id: 'sets', achieved: 14, target: 18 },
    { id: 'exercises', achieved: 5, target: 6 },
    { id: 'muscles', achieved: 4, target: 4 },
  ],
};

const NO_TARGETS: WeeklyProgressResult = {
  hasActivity: true,
  tracks: [
    { id: 'sets', achieved: 14, target: null },
    { id: 'exercises', achieved: 5, target: null },
    { id: 'muscles', achieved: 4, target: null },
  ],
};

const EMPTY: WeeklyProgressResult = { hasActivity: false, tracks: [] };

function render(progress: WeeklyProgressResult) {
  return WeeklyProgressCardView({ progress, colors: COLORS });
}

describe('WeeklyProgressCardView', () => {
  it('names the window as a rolling seven days, never as a calendar week', () => {
    const texts = textContent(render(POPULATED));

    expect(texts).toContain('Last 7 Days');
    expect(texts).toContain('Rolling window ending today.');
    for (const text of texts) {
      expect(String(text)).not.toMatch(/this week|monday|week starts/i);
    }
  });

  it('renders exactly three tracks, in the order the pure result already fixed', () => {
    const texts = textContent(render(POPULATED));

    expect(texts).toContain('Sets');
    expect(texts).toContain('Exercises');
    expect(texts).toContain('Muscles trained');
    expect(texts.indexOf('Sets')).toBeLessThan(texts.indexOf('Exercises'));
    expect(texts.indexOf('Exercises')).toBeLessThan(texts.indexOf('Muscles trained'));
  });

  it('reads a targeted track as achieved over target, above a bar of that ratio', () => {
    const result = render(POPULATED);

    expect(textContent(result)).toContain('14 / 18');
    const fills = findAll(result, isFill);
    expect(fills).toHaveLength(3);
    expect((fills[0].props.style as { width: string }).width).toBe(`${(14 / 18) * 100}%`);
    expect((fills[0].props.style as { height: number }).height).toBe(PROGRESS_TRACK_HEIGHT);
  });

  it('announces every targeted track with its label, its bounds and its current value', () => {
    const tracks = findAll(render(POPULATED), isProgressTrack);

    expect(tracks).toHaveLength(3);
    expect(tracks[0].props['aria-valuemin']).toBe(0);
    expect(tracks[0].props['aria-valuemax']).toBe(18);
    expect(tracks[0].props['aria-valuenow']).toBe(14);
    expect(tracks[0].props.accessibilityLabel).toBe('Sets: 14 of 18');
    expect(tracks[2].props.accessibilityLabel).toBe('Muscles trained: 4 of 4');
  });

  it('clamps the bar at full width while the numeral still reads the true figure', () => {
    const over: WeeklyProgressResult = { hasActivity: true, tracks: [{ id: 'sets', achieved: 22, target: 18 }] };
    const result = render(over);

    expect(textContent(result)).toContain('22 / 18');
    expect((findAll(result, isFill)[0].props.style as { width: string }).width).toBe('100%');
  });

  it('marks a met target with a muted glyph rather than a second hue', () => {
    const met: WeeklyProgressResult = { hasActivity: true, tracks: [{ id: 'sets', achieved: 18, target: 18 }] };
    const under: WeeklyProgressResult = { hasActivity: true, tracks: [{ id: 'sets', achieved: 17, target: 18 }] };

    const glyphs = findAll(render(met), isGlyph);
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0].props.color).toBe(COLORS.foregroundMuted);
    expect(findAll(render(under), isGlyph)).toHaveLength(0);
  });

  it('shows an untargeted track as the achieved figure alone — no bar, no denominator', () => {
    const result = render(NO_TARGETS);
    const texts = textContent(result);

    expect(texts).toContain('14');
    expect(texts).toContain('No target set.');
    expect(texts.some((text) => String(text).includes('/'))).toBe(false);
    expect(findAll(result, isFill)).toHaveLength(0);
    expect(findAll(result, isProgressTrack)).toHaveLength(0);
  });

  it('announces an untargeted track as text, so it is not a silent rectangle either', () => {
    const tracks = findAll(render(NO_TARGETS), isTextRole);

    expect(tracks).toHaveLength(3);
    expect(tracks[0].props.accessibilityLabel).toBe('Sets: 14, no target set');
    expect(tracks[2].props.accessibilityLabel).toBe('Muscles trained: 4, no target set');
  });

  it('renders one honest empty card with no tracks at all, never three zeroed ones', () => {
    const result = render(EMPTY);
    const texts = textContent(result);

    expect(texts).toContain('Nothing logged in the last 7 days');
    expect(texts).toContain('Log a workout and your progress appears here.');
    expect(texts).not.toContain('Sets');
    expect(findAll(result, isProgressTrack)).toHaveLength(0);
    expect(findAll(result, isTextRole)).toHaveLength(0);
    expect(findAll(result, isFill)).toHaveLength(0);
    for (const text of texts) expect(String(text)).not.toMatch(/\b0\b/);
  });

  it('is read-only — nothing on the card is a press target', () => {
    for (const progress of [POPULATED, NO_TARGETS, EMPTY]) {
      const result = render(progress);
      expect(findAll(result, (element) => element.props?.onPress !== undefined)).toHaveLength(0);
      expect(findAll(result, (element) => element.props?.accessibilityRole === 'button')).toHaveLength(0);
    }
  });

  it('lets the label row wrap, so the numeral drops beneath its label rather than truncating', () => {
    const rows = findAll(
      render(POPULATED),
      (element) => typeof element.props?.className === 'string' && element.props.className.includes('flex-wrap'),
    );

    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(findAll(render(POPULATED), (element) => element.props?.numberOfLines !== undefined)).toHaveLength(0);
  });
});
