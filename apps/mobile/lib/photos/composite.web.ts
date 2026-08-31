import { forwardRef, type RefObject } from 'react';
import type { View } from 'react-native';
import { PHOTO_JPEG_QUALITY } from './constants';
import { resolveCompositeCanvas } from './composite-layout';

export interface CompositePhotoInput {
  uri: string;
  dateLabel: string;
}

export interface ShareCompositeInput {
  before: CompositePhotoInput;
  after: CompositePhotoInput;
  // Unused on web — the canvas draw below reads before/after directly, never the hidden RN view
  // composite.ts's own CompositeCaptureView renders for the native captureRef path. Kept in the
  // type so the screen's single call site never branches on platform (docs/platform-modules.md's
  // own convention).
  viewRef: RefObject<View | null>;
}

export interface CompositeCaptureViewProps {
  before: CompositePhotoInput;
  after: CompositePhotoInput;
}

// Web needs no rendered view to snapshot — shareComposite below draws straight from the source
// images onto an offscreen <canvas>. This export exists only so photo-composite.tsx's single call
// site never branches on platform; it renders nothing, and critically never duplicates the date
// caption text composite.ts's native sibling renders into the DOM for its own captureRef target.
export const CompositeCaptureView = forwardRef<View, CompositeCaptureViewProps>(() => null);

function loadImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('failed to decode composite source image'));
    image.src = uri;
  });
}

function drawCaption(context: CanvasRenderingContext2D, label: string, x: number, width: number, y: number) {
  context.fillStyle = '#111111';
  context.font = '28px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, x + width / 2, y);
}

// Mirrors export-training-data.web.ts's Blob + object-URL + <a download> + revoke idiom exactly.
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = filename;
  window.document.body.appendChild(link);
  link.click();
  window.document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function compositeFilename(now: Date): string {
  return `before-and-after-${now.toISOString().replace(/[:.]/g, '-')}.jpg`;
}

// Web half of the platform split (RESEARCH Pattern 3, Pitfall 2): draws both source images onto an
// offscreen <canvas> at the rectangles resolveCompositeCanvas returns, writes each caption with
// fillText, and exports through toBlob — expo-sharing cannot share a local file by uri on web at
// all, so this sibling never imports it.
export async function shareComposite({ before, after }: ShareCompositeInput): Promise<void> {
  const [beforeImage, afterImage] = await Promise.all([loadImage(before.uri), loadImage(after.uri)]);
  const layout = resolveCompositeCanvas(
    { width: beforeImage.naturalWidth, height: beforeImage.naturalHeight },
    { width: afterImage.naturalWidth, height: afterImage.naturalHeight },
  );

  const canvas = window.document.createElement('canvas');
  canvas.width = layout.width;
  canvas.height = layout.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas 2d context unavailable');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, layout.width, layout.height);
  context.drawImage(beforeImage, layout.before.x, layout.before.y, layout.before.width, layout.before.height);
  context.drawImage(afterImage, layout.after.x, layout.after.y, layout.after.width, layout.after.height);
  drawCaption(context, before.dateLabel, layout.before.x, layout.before.width, layout.height - layout.captionBandHeight / 2);
  drawCaption(context, after.dateLabel, layout.after.x, layout.after.width, layout.height - layout.captionBandHeight / 2);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', PHOTO_JPEG_QUALITY));
  if (!blob) throw new Error('canvas failed to encode the composite JPEG');

  downloadBlob(blob, compositeFilename(new Date()));
}
