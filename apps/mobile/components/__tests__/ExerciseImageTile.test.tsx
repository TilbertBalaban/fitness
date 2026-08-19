import type { ReactElement, ReactNode } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import {
  EXERCISE_IMAGE_LABEL_MIN_WIDTH,
  ExerciseImageTileView,
  resolveHeroImageWidth,
  resolveTileBox,
} from '../ExerciseImageTile';

// ExerciseImageTileView has no hooks, so it is a plain `(props) => ReactElement` function --
// invoking it directly (no renderer) is a faithful exercise of its real body, matching the
// direct-invocation technique already established for DetailSection/MuscleTargetList/
// SwapSuggestionList (03-07/03-09/03-10). @testing-library/react-native and react-test-renderer
// are both absent from this worktree's lockfile (installing either is out of scope per the
// package-legitimacy gate).
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

function flatText(node: ReactNode): string {
  return collectText(node).join('').replace(/\s+/g, ' ').trim();
}

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

const SENTINEL_SOURCE = 1;

describe('resolveTileBox', () => {
  it('returns the 4:3 contract box for a normal width', () => {
    expect(resolveTileBox(56)).toEqual({ width: 56, height: 42 });
  });

  it.each([0, -10, NaN, Infinity])('returns a finite positive box for width=%p', (width) => {
    const box = resolveTileBox(width);
    expect(Number.isFinite(box.width)).toBe(true);
    expect(Number.isFinite(box.height)).toBe(true);
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
  });
});

describe('resolveHeroImageWidth', () => {
  it('subtracts the detail screen padding for a normal phone viewport', () => {
    expect(resolveHeroImageWidth(390)).toBe(342);
  });

  it('clamps to the hero max width rather than the raw padded value', () => {
    expect(resolveHeroImageWidth(1920)).not.toBe(1872);
    expect(resolveHeroImageWidth(1920)).toBeLessThanOrEqual(480);
  });

  it.each([0, NaN])('returns at least the label-threshold width for windowWidth=%p', (windowWidth) => {
    expect(resolveHeroImageWidth(windowWidth)).toBeGreaterThanOrEqual(EXERCISE_IMAGE_LABEL_MIN_WIDTH);
  });
});

describe('ExerciseImageTileView', () => {
  it('produces exactly one Image element whose source is the passed asset', () => {
    const result = ExerciseImageTileView({ source: SENTINEL_SOURCE, width: 56 });
    const images = findByType(result, Image);

    expect(images).toHaveLength(1);
    expect(images[0].props.source).toBe(SENTINEL_SOURCE);
  });

  it("fills the box by absolute inset, not by percentage", () => {
    const result = ExerciseImageTileView({ source: SENTINEL_SOURCE, width: 56 });
    const [image] = findByType(result, Image);
    const flattened = StyleSheet.flatten(image.props.style) as Record<string, unknown>;

    expect(flattened.position).toBe('absolute');
    expect(flattened.top).toBe(0);
    expect(flattened.left).toBe(0);
    expect(flattened.right).toBe(0);
    expect(flattened.bottom).toBe(0);
  });

  it('gives the container a numeric, finite, positive width and height', () => {
    const result = ExerciseImageTileView({ source: SENTINEL_SOURCE, width: 56 });
    const [container] = findByType(result, View);
    const flattened = StyleSheet.flatten(container.props.style) as Record<string, unknown>;

    expect(typeof flattened.width).toBe('number');
    expect(typeof flattened.height).toBe('number');
    expect(Number.isFinite(flattened.width as number)).toBe(true);
    expect(Number.isFinite(flattened.height as number)).toBe(true);
    expect(flattened.width as number).toBeGreaterThan(0);
    expect(flattened.height as number).toBeGreaterThan(0);
  });

  it('renders the placeholder label AND the image together when width is at least the label threshold', () => {
    const result = ExerciseImageTileView({ source: SENTINEL_SOURCE, width: 200 });

    expect(flatText(result)).toContain('No image available');
    expect(findByType(result, Image)).toHaveLength(1);
  });

  it('renders the placeholder label and zero Image elements when source is null and width is wide', () => {
    const result = ExerciseImageTileView({ source: null, width: 200 });

    expect(flatText(result)).toContain('No image available');
    expect(findByType(result, Image)).toHaveLength(0);
  });

  it('renders neither label nor Image for a null source at thumbnail width, but keeps a positive box and the border class', () => {
    const result = ExerciseImageTileView({ source: null, width: 56 });

    expect(flatText(result)).toBe('');
    expect(findByType(result, Image)).toHaveLength(0);

    const [container] = findByType(result, View);
    const flattened = StyleSheet.flatten(container.props.style) as Record<string, unknown>;
    expect((flattened.width as number) > 0).toBe(true);
    expect((flattened.height as number) > 0).toBe(true);
    expect(container.props.className as string).toContain('border');
  });

  it('delineates an empty tile with a border utility and the muted-foreground border colour token', () => {
    const result = ExerciseImageTileView({ source: null, width: 200 });
    const [container] = findByType(result, View);

    expect(container.props.className as string).toContain('border');
    expect(container.props.className as string).toContain('border-foreground-muted');
  });
});
