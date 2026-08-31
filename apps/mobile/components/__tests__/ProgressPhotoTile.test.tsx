import type { ReactNode } from 'react';
import { ProgressPhotoTileView, resolvePhotoTileSize } from '../ProgressPhotoTile';
import { ProgressPhotoPlaceholderView } from '../ProgressPhotoPlaceholder';

const COLORS = { accent: 'rgb(37, 99, 235)', foregroundMuted: 'rgb(113, 113, 122)', surface: 'rgb(244, 244, 245)' };

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

function collect(node: ReactNode, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (node === null || node === undefined || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) collect(child, out);
    return out;
  }
  const element = node as { props?: Record<string, unknown> };
  if (element.props) out.push(element.props);
  const children = element.props?.children as ReactNode;
  if (children !== undefined) collect(children, out);
  return out;
}

describe('ProgressPhotoTileView', () => {
  it('announces the photo with its date label and renders the image', () => {
    const tile = ProgressPhotoTileView({ photoUri: 'file:///a.jpg', dateLabel: 'Aug 20', size: 140, onPress: jest.fn() });

    expect(findText(tile)).toContain('Aug 20');
    const props = collect(tile);
    expect(props.some((p) => p.accessibilityLabel === 'Progress photo, Aug 20')).toBe(true);
  });
});

describe('resolvePhotoTileSize', () => {
  it('never returns below MIN_PHOTO_TILE_SIZE for a narrow window', () => {
    expect(resolvePhotoTileSize(50)).toBeGreaterThanOrEqual(120);
  });
});

describe('ProgressPhotoPlaceholderView — the two press modes (E11 tappability / non-selectability, R28)', () => {
  it('gallery context: an onPress prop makes it an ordinary enabled button', () => {
    const onPress = jest.fn();
    const placeholder = ProgressPhotoPlaceholderView({ dateLabel: 'Aug 20', size: 140, colors: COLORS, onPress });

    const props = collect(placeholder);
    const pressable = props[0];
    expect(pressable.accessibilityRole).toBe('button');
    expect(pressable.disabled).toBe(false);
    expect(pressable.accessibilityState).toBeUndefined();
    expect(pressable.onPress).toBe(onPress);
  });

  it('composite-picker context: no onPress makes it disabled with no press handler', () => {
    const placeholder = ProgressPhotoPlaceholderView({ dateLabel: 'Aug 20', size: 140, colors: COLORS });

    const props = collect(placeholder);
    const pressable = props[0];
    expect(pressable.disabled).toBe(true);
    expect(pressable.accessibilityState).toEqual({ disabled: true });
    expect(pressable.onPress).toBeUndefined();
  });

  it('renders the fixed copy and the same local_date caption a real tile carries', () => {
    const placeholder = ProgressPhotoPlaceholderView({ dateLabel: 'Aug 20', size: 140, colors: COLORS, onPress: jest.fn() });

    const text = findText(placeholder);
    expect(text).toContain('On your other device');
    expect(text).toContain('Aug 20');
  });

  it('sets no numberOfLines anywhere (R4)', () => {
    const placeholder = ProgressPhotoPlaceholderView({ dateLabel: 'Aug 20', size: 140, colors: COLORS, onPress: jest.fn() });

    const props = collect(placeholder);
    expect(props.some((p) => 'numberOfLines' in p)).toBe(false);
  });

  it('is sized identically to a real tile via the same resolvePhotoTileSize output', () => {
    const size = resolvePhotoTileSize(400);
    const placeholder = ProgressPhotoPlaceholderView({ dateLabel: 'Aug 20', size, colors: COLORS, onPress: jest.fn() });

    const props = collect(placeholder);
    expect(props[0].style).toEqual({ width: size, height: size });
  });
});
