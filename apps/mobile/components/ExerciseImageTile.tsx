import { useCallback, useState } from 'react';
import { Image, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';

export interface ExerciseImageTileProps {
  uri?: string | null;
  // Additive (03-07, WINDOWS #36): a bundler-emitted asset source from a static require() call --
  // e.g. from catalog-image-map.generated.ts -- for a vendored local image. Numeric on native
  // (a Metro asset module id), an object carrying {uri, width, height} on web. Takes precedence
  // over `uri` when both are provided, since the whole point of vendoring is to never need the
  // remote fetch a `uri` implies. `uri` is left fully intact so an existing or concurrent caller
  // (e.g. the list row) that only ever passes `uri` keeps working unchanged.
  localSource?: ImageSourcePropType | null;
  // Optional with a thumbnail-width default so this task's typecheck stays green before Task 2
  // updates the three call sites to pass their own width explicitly.
  width?: number;
}

// UI-SPEC E2/E3's 4:3 thumbnail contract.
export const EXERCISE_IMAGE_ASPECT_RATIO = 4 / 3;
// Shared row-thumbnail width -- both ExerciseListRow and SwapSuggestionList import this so their
// tiles cannot drift apart the way they silently did before (G-03-3).
export const EXERCISE_THUMBNAIL_WIDTH = 56;
// Below this width the tile is a thumbnail and renders no placeholder copy -- there is no room.
export const EXERCISE_IMAGE_LABEL_MIN_WIDTH = 120;
export const EXERCISE_HERO_MAX_WIDTH = 480;
// The floor every tile box is clamped to -- the structural guarantee the box can never collapse.
export const MIN_TILE_WIDTH = 24;

// Pure function: derives a finite, positive {width, height} box for any input, including zero,
// negative, NaN and Infinity. This is the fix for G-03-3 expressed as a function -- the old chain
// sized the container by a ratio style on a percentage-width box, which never resolved to a real
// pixel height, so the image inside asked for a percentage of nothing.
export function resolveTileBox(width: number): { width: number; height: number } {
  const safeWidth = Number.isFinite(width) && width > MIN_TILE_WIDTH ? Math.round(width) : MIN_TILE_WIDTH;
  return { width: safeWidth, height: Math.round(safeWidth / EXERCISE_IMAGE_ASPECT_RATIO) };
}

// Pure function: derives the detail hero's width from the reported window width, clamped between
// the label threshold and the hero cap. The hero is the one call site whose width is not a
// constant, so a collapsed or unbounded hero could only originate here.
export function resolveHeroImageWidth(windowWidth: number): number {
  const safeWindowWidth = Number.isFinite(windowWidth) ? windowWidth : 0;
  const candidate = safeWindowWidth - 48;
  return Math.min(Math.max(candidate, EXERCISE_IMAGE_LABEL_MIN_WIDTH), EXERCISE_HERO_MAX_WIDTH);
}

export interface ExerciseImageTileViewProps {
  source: ImageSourcePropType | null;
  width: number;
  onError?: () => void;
}

// The hook-free half of the tile -- the only half a test in this repo can direct-invoke and
// inspect a real <Image> element, since @testing-library/react-native and react-test-renderer are
// both absent from this worktree's lockfile. The single fallback tile for the empty, loading and
// error image states (UI-SPEC E2/E3).
export function ExerciseImageTileView({ source, width, onError }: ExerciseImageTileViewProps) {
  const box = resolveTileBox(width);
  const showLabel = width >= EXERCISE_IMAGE_LABEL_MIN_WIDTH;

  return (
    <View
      className="items-center justify-center rounded-md border border-foreground-muted bg-surface"
      style={{ ...box, overflow: 'hidden' }}
    >
      {showLabel ? <Text className="text-label font-normal text-foreground-muted">No image available</Text> : null}
      {source ? <Image source={source} onError={onError} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
    </View>
  );
}

// The stateful wrapper: resolves which source wins (localSource takes precedence over uri) and
// tracks load failure so a failed image degrades back to the placeholder tile.
export function ExerciseImageTile({ uri, localSource, width = EXERCISE_THUMBNAIL_WIDTH }: ExerciseImageTileProps) {
  const [failed, setFailed] = useState(false);
  const handleError = useCallback(() => setFailed(true), []);
  const source: ImageSourcePropType | null =
    localSource != null ? localSource : uri ? { uri } : null;

  return <ExerciseImageTileView source={failed ? null : source} width={width} onError={handleError} />;
}
