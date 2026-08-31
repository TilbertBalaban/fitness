// D-17's "generous bound" as named constants, never a numeral at a call site (R32). Raising either
// value later is a one-line change, unlike the bytes a low bound discards at capture time, which
// are gone for good.
export const PHOTO_MAX_LONG_EDGE = 2048;
export const PHOTO_JPEG_QUALITY = 0.85;
export const PHOTO_STORAGE_PREFIX = 'progress-photo';

export function photoStorageKey(id: string): string {
  return `${PHOTO_STORAGE_PREFIX}/${id}.jpg`;
}

export interface PhotoDimensions {
  width: number;
  height: number;
}

// Pure and platform-free so both downscale.ts (native, expo-image-manipulator) and downscale.web.ts
// (canvas) resize to identical target dimensions from the same arithmetic — neither sibling embeds
// its own scaling logic. Returns the original dimensions unchanged when the long edge is already at
// or under the bound; otherwise the long edge becomes exactly maxLongEdge and the short edge scales
// proportionally, rounded to the nearest integer pixel.
export function resolveDownscaledDimensions(width: number, height: number, maxLongEdge: number): PhotoDimensions {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxLongEdge) return { width, height };

  const scale = maxLongEdge / longEdge;
  if (width >= height) {
    return { width: maxLongEdge, height: Math.round(height * scale) };
  }
  return { width: Math.round(width * scale), height: maxLongEdge };
}
