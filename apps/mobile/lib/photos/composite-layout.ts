// D-18's "exactly two photos, side by side" as named constants and a pure geometry function, never
// a magic number at a call site (R32). Dependency-free on purpose: composite.ts (react-native-
// view-shot snapshot) and composite.web.ts (<canvas> draw) both resolve output rectangles from this
// SAME arithmetic, so the two platforms' geometry can never silently diverge — and it is unit
// testable with no canvas and no native module.
export const MAX_COMPOSITE_PHOTOS = 2;

export const COMPOSITE_CELL_WIDTH = 720;
export const COMPOSITE_GAP = 16;
export const COMPOSITE_CAPTION_BAND_HEIGHT = 64;

export interface CompositeDimensions {
  width: number;
  height: number;
}

export interface CompositeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CompositeCanvas {
  width: number;
  height: number;
  before: CompositeRect;
  after: CompositeRect;
  captionBandHeight: number;
}

function scaledHeight(dimensions: CompositeDimensions, targetWidth: number): number {
  return Math.round(targetWidth * (dimensions.height / dimensions.width));
}

// Each photo is scaled to the SAME COMPOSITE_CELL_WIDTH, keeping its own aspect ratio (D-18: side
// by side, never cropped to force a match) — a portrait paired with a landscape produces two
// different heights, vertically centered against whichever photo ends up taller. The caption band
// is a fixed strip beneath both, so it always adds exactly COMPOSITE_CAPTION_BAND_HEIGHT to the
// output height regardless of the two photos' own dimensions.
export function resolveCompositeCanvas(before: CompositeDimensions, after: CompositeDimensions): CompositeCanvas {
  const beforeHeight = scaledHeight(before, COMPOSITE_CELL_WIDTH);
  const afterHeight = scaledHeight(after, COMPOSITE_CELL_WIDTH);
  const photoAreaHeight = Math.max(beforeHeight, afterHeight);

  return {
    width: COMPOSITE_CELL_WIDTH * 2 + COMPOSITE_GAP,
    height: photoAreaHeight + COMPOSITE_CAPTION_BAND_HEIGHT,
    before: {
      x: 0,
      y: Math.round((photoAreaHeight - beforeHeight) / 2),
      width: COMPOSITE_CELL_WIDTH,
      height: beforeHeight,
    },
    after: {
      x: COMPOSITE_CELL_WIDTH + COMPOSITE_GAP,
      y: Math.round((photoAreaHeight - afterHeight) / 2),
      width: COMPOSITE_CELL_WIDTH,
      height: afterHeight,
    },
    captionBandHeight: COMPOSITE_CAPTION_BAND_HEIGHT,
  };
}
