import { PHOTO_JPEG_QUALITY, PHOTO_MAX_LONG_EDGE, resolveDownscaledDimensions } from './constants';
import type { CapturedPhoto } from './capture.web';

export interface DownscaledPhoto {
  bytes: Uint8Array;
  // An object URL over the SAME encoded blob the bytes came from — PhotoCaptureConfirmSheet's
  // preview reads this directly. The caller owns revoking it (matching getPhotoUri's own
  // documented contract), since this module has no lifecycle hook to revoke it itself.
  uri: string;
  width: number;
  height: number;
}

async function decodeImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('failed to decode captured image'));
    });
    image.src = url;
    await loaded;
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// The web sibling of downscale.ts — an offscreen <canvas> draw + toBlob re-encode, no
// expo-image-manipulator (that module has no meaningful web target, RESEARCH Standard Stack).
// Shares resolveDownscaledDimensions with the native sibling so both platforms bound to the exact
// same target size from the same arithmetic.
export async function downscalePhoto(captured: CapturedPhoto): Promise<DownscaledPhoto> {
  const image = await decodeImage(captured.blob);
  const { width, height } = resolveDownscaledDimensions(image.naturalWidth, image.naturalHeight, PHOTO_MAX_LONG_EDGE);

  const canvas = window.document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas 2d context unavailable');
  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', PHOTO_JPEG_QUALITY));
  if (!blob) throw new Error('canvas failed to encode the downscaled JPEG');

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const uri = URL.createObjectURL(blob);
  return { bytes, uri, width, height };
}
