import type { ReactElement, ReactNode } from 'react';
import { Image, StyleSheet, type ImageStyle } from 'react-native';

jest.mock('@/lib/theme-colors', () => ({
  useThemeColors: () => ({
    accent: 'rgb(37, 99, 235)',
    foregroundMuted: 'rgb(113, 113, 122)',
    surface: 'rgb(244, 244, 245)',
  }),
}));

import { EXERCISE_THUMBNAIL_WIDTH, ExerciseImageTile, ExerciseImageTileView, resolveTileImageStyle } from '../ExerciseImageTile';
import { ExerciseListRow } from '../ExerciseListRow';

// ExerciseListRow calls useThemeColors, which reaches NativeWind's useColorScheme -- a hook this
// Node test environment cannot drive. Mocking @/lib/theme-colors above (before the component
// import) makes ExerciseListRow a plain `(props) => ReactElement` function, so direct invocation
// (no renderer) is faithful, matching the technique already established for
// SwapSuggestionList/ExerciseImageTile (03-07/03-09/03-13). @testing-library/react-native and
// react-test-renderer are both absent from this worktree's lockfile.
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

describe('ExerciseListRow', () => {
  it('renders exactly one ExerciseImageTile forwarding width, uri and localSource unchanged', () => {
    const result = ExerciseListRow({
      name: 'Bench Press',
      imageUri: 'https://cdn/a.png',
      localSource: 7,
      tags: ['Chest'],
      onPress: () => {},
    });
    const tiles = findByType(result, ExerciseImageTile);

    expect(tiles).toHaveLength(1);
    expect(tiles[0].props.width).toBe(EXERCISE_THUMBNAIL_WIDTH);
    expect(tiles[0].props.uri).toBe('https://cdn/a.png');
    expect(tiles[0].props.localSource).toBe(7);
  });

  it('renders exactly one ExerciseImageTile (the placeholder path) when both source channels are null', () => {
    const result = ExerciseListRow({
      name: 'Bench Press',
      imageUri: null,
      localSource: null,
      tags: ['Chest'],
      onPress: () => {},
    });
    const tiles = findByType(result, ExerciseImageTile);

    expect(tiles).toHaveLength(1);
    expect(tiles[0].props.uri).toBeNull();
    expect(tiles[0].props.localSource).toBeNull();
  });

  it("the row's tile is bounded: a 750x500 intrinsic source composed ahead of the tile's image style still resolves to 100%/100%", () => {
    const view = ExerciseImageTileView({ source: 7, width: EXERCISE_THUMBNAIL_WIDTH });
    const [image] = findByType(view, Image);
    const flattened = StyleSheet.flatten([{ width: 750, height: 500 } as ImageStyle, resolveTileImageStyle()]) as Record<
      string,
      unknown
    >;

    expect(StyleSheet.flatten(image.props.style)).toEqual(StyleSheet.flatten(resolveTileImageStyle()));
    expect(flattened.width).toBe('100%');
    expect(flattened.height).toBe('100%');
  });
});
