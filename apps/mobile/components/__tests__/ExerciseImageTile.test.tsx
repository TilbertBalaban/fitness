import type { ReactElement, ReactNode } from 'react';
import { Image, StyleSheet, Text, View, type ImageStyle } from 'react-native';
import {
  EXERCISE_IMAGE_LABEL_MIN_WIDTH,
  ExerciseImageTileView,
  resolveDisplaySource,
  resolveHeroImageWidth,
  resolveSourceKey,
  resolveTileBox,
  resolveTileImageStyle,
  resolveTileSource,
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

  it("gives the Image the exact style resolveTileImageStyle() returns, and resizeMode='cover' as a prop", () => {
    const result = ExerciseImageTileView({ source: SENTINEL_SOURCE, width: 56 });
    const [image] = findByType(result, Image);

    expect(StyleSheet.flatten(image.props.style)).toEqual(StyleSheet.flatten(resolveTileImageStyle()));
    expect(image.props.resizeMode).toBe('cover');
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

describe("resolveTileImageStyle — a source's intrinsic dimensions cannot win", () => {
  it.each([
    [750, 500],
    [850, 567],
    [800, 533],
  ])('overrides a %ix%i intrinsic source to 100%%/100%%, not %ix%i', (width, height) => {
    const flattened = StyleSheet.flatten([{ width, height } as ImageStyle, resolveTileImageStyle()]) as Record<
      string,
      unknown
    >;

    expect(flattened.width).toBe('100%');
    expect(flattened.height).toBe('100%');
  });

  it('flattens to position absolute with all four zero insets, plus percentage width and height', () => {
    const flattened = StyleSheet.flatten(resolveTileImageStyle()) as Record<string, unknown>;

    expect(flattened.position).toBe('absolute');
    expect(flattened.top).toBe(0);
    expect(flattened.left).toBe(0);
    expect(flattened.right).toBe(0);
    expect(flattened.bottom).toBe(0);
    expect(flattened.width).toBe('100%');
    expect(flattened.height).toBe('100%');
  });

  it('resolves width and height as strings, never numbers, so a source cannot re-pin the image to its own size', () => {
    const flattened = StyleSheet.flatten(resolveTileImageStyle()) as Record<string, unknown>;

    expect(typeof flattened.width).toBe('string');
    expect(typeof flattened.height).toBe('string');
  });
});

// WR-01 (03-REVIEW.md): ExerciseListRow renders inside a recycling FlashList, so one component
// instance serves many exercises without unmounting. The failure must therefore be remembered
// against the source that failed, not as a bare "something failed" flag. The stateful
// ExerciseImageTile cannot be rendered here (no renderer in this workspace, see the header note),
// so the decision is exercised through the pure function that carries it.
describe('resolveSourceKey', () => {
  it('gives separate uri sources separate keys', () => {
    expect(resolveSourceKey('https://cdn/a.png')).not.toBe(resolveSourceKey('https://cdn/b.png'));
  });

  it('gives separate numeric asset ids separate keys', () => {
    expect(resolveSourceKey(null, 1)).not.toBe(resolveSourceKey(null, 2));
  });

  it('is stable across separate but equal object sources', () => {
    const first = resolveSourceKey(null, { uri: 'https://cdn/a.png' });
    const second = resolveSourceKey(null, { uri: 'https://cdn/a.png' });

    expect(first).toBe(second);
  });

  it('is stable across re-derivation for the same uri, so a fresh {uri} wrapper each render cannot reset the failure', () => {
    expect(resolveSourceKey('https://cdn/a.png')).toBe(resolveSourceKey('https://cdn/a.png'));
  });

  it('does not collide a localSource uri with a bare uri carrying the same string', () => {
    expect(resolveSourceKey(null, { uri: 'https://cdn/a.png' })).not.toBe(resolveSourceKey('https://cdn/a.png'));
  });

  it('returns null when there is no source to identify', () => {
    expect(resolveSourceKey(null, null)).toBeNull();
    expect(resolveSourceKey(undefined, undefined)).toBeNull();
    expect(resolveSourceKey('', null)).toBeNull();
  });
});

describe('resolveTileSource', () => {
  it('prefers localSource over uri', () => {
    expect(resolveTileSource('https://cdn/a.png', SENTINEL_SOURCE)).toBe(SENTINEL_SOURCE);
  });

  it('falls back to a uri wrapper when there is no localSource', () => {
    expect(resolveTileSource('https://cdn/a.png', null)).toEqual({ uri: 'https://cdn/a.png' });
  });

  it('returns null when neither is supplied', () => {
    expect(resolveTileSource(null, null)).toBeNull();
  });
});

describe('resolveDisplaySource — failure is scoped to the source that failed (WR-01)', () => {
  it('suppresses the source that actually failed', () => {
    const failedKey = resolveSourceKey('https://cdn/a.png');

    expect(resolveDisplaySource('https://cdn/a.png', null, failedKey)).toBeNull();
  });

  it('does NOT suppress a different exercise recycled into the same slot', () => {
    const failedKey = resolveSourceKey('https://cdn/a.png');

    expect(resolveDisplaySource('https://cdn/b.png', null, failedKey)).toEqual({ uri: 'https://cdn/b.png' });
  });

  it('does NOT suppress a different numeric asset recycled into the same slot', () => {
    const failedKey = resolveSourceKey(null, 1);

    expect(resolveDisplaySource(null, 2, failedKey)).toBe(2);
  });

  it('does NOT suppress a vendored localSource after a remote uri failed in the same slot', () => {
    const failedKey = resolveSourceKey('https://cdn/a.png');

    expect(resolveDisplaySource('https://cdn/a.png', SENTINEL_SOURCE, failedKey)).toBe(SENTINEL_SOURCE);
  });

  it('still suppresses a failed localSource re-derived from an equal but not identical object', () => {
    const failedKey = resolveSourceKey(null, { uri: 'https://cdn/a.png' });

    expect(resolveDisplaySource(null, { uri: 'https://cdn/a.png' }, failedKey)).toBeNull();
  });

  it('shows the source when nothing has failed yet', () => {
    expect(resolveDisplaySource('https://cdn/a.png', null, null)).toEqual({ uri: 'https://cdn/a.png' });
  });

  it('treats an absent source as absent rather than failed, so a null key cannot match a null failedKey', () => {
    expect(resolveDisplaySource(null, null, null)).toBeNull();
    expect(resolveDisplaySource('https://cdn/a.png', null, resolveSourceKey(null, null))).toEqual({
      uri: 'https://cdn/a.png',
    });
  });
});
