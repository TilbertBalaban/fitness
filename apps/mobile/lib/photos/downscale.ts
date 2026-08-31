import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { PHOTO_JPEG_QUALITY, PHOTO_MAX_LONG_EDGE, resolveDownscaledDimensions } from './constants';
import type { CapturedPhoto } from './capture';

export interface DownscaledPhoto {
  bytes: Uint8Array;
  // A real file:// URI to the already-downscaled/re-encoded output — PhotoCaptureConfirmSheet's
  // preview reads this directly rather than re-deriving one from bytes, matching the web sibling's
  // own object-URL-from-the-same-encode shape.
  uri: string;
  width: number;
  height: number;
}

// The current contextual manipulator API (RESEARCH Standard Stack) — never the deprecated
// manipulateAsync free function. A first render reads the original dimensions (no transform
// applied), resolveDownscaledDimensions decides the bound-respecting target size, and a second
// manipulate/resize/render/save pass produces the actual re-encoded JPEG — compress is D-17's
// bound, never the picker's own quality option (that only controls capture, not this step).
export async function downscalePhoto(captured: CapturedPhoto): Promise<DownscaledPhoto> {
  const original = await ImageManipulator.manipulate(captured.uri).renderAsync();
  const { width, height } = resolveDownscaledDimensions(original.width, original.height, PHOTO_MAX_LONG_EDGE);

  const resized = await ImageManipulator.manipulate(captured.uri).resize({ width, height }).renderAsync();
  const saved = await resized.saveAsync({ format: SaveFormat.JPEG, compress: PHOTO_JPEG_QUALITY });

  const bytes = await new File(saved.uri).bytes();
  return { bytes, uri: saved.uri, width: saved.width, height: saved.height };
}
