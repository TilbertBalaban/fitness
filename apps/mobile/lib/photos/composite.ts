import { createElement, forwardRef, type RefObject } from 'react';
import { Image, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { PHOTO_JPEG_QUALITY } from './constants';
import { COMPOSITE_CELL_WIDTH, COMPOSITE_GAP } from './composite-layout';

export interface CompositePhotoInput {
  uri: string;
  dateLabel: string;
}

export interface ShareCompositeInput {
  before: CompositePhotoInput;
  after: CompositePhotoInput;
  // The off-screen CompositeCaptureView apps/mobile/app/photo-composite.tsx renders once both
  // photos are chosen — react-native-view-shot needs a real, laid-out native view with a native
  // handle to snapshot.
  viewRef: RefObject<View | null>;
}

export interface CompositeCaptureViewProps {
  before: CompositePhotoInput;
  after: CompositePhotoInput;
}

// Native half of the platform split (RESEARCH Pattern 3): the hidden composed view captureRef
// snapshots. Rendered off-screen — never display:none, since react-native-view-shot needs a real
// laid-out native view with a native handle, not one Yoga has skipped entirely. Written with
// createElement (not JSX) because this module is a plain .ts file — composite.ts/composite.web.ts
// is the platform-split pair the plan names, and a .tsx extension would break that pairing.
export const CompositeCaptureView = forwardRef<View, CompositeCaptureViewProps>(function CompositeCaptureView(
  { before, after },
  ref,
) {
  return createElement(
    View,
    { ref, collapsable: false, style: { position: 'absolute', top: -100000, left: 0 } },
    createElement(
      View,
      { style: { flexDirection: 'row', gap: COMPOSITE_GAP } },
      createElement(Image, {
        source: { uri: before.uri },
        style: { width: COMPOSITE_CELL_WIDTH, height: COMPOSITE_CELL_WIDTH },
        resizeMode: 'cover',
      }),
      createElement(Image, {
        source: { uri: after.uri },
        style: { width: COMPOSITE_CELL_WIDTH, height: COMPOSITE_CELL_WIDTH },
        resizeMode: 'cover',
      }),
    ),
    createElement(
      View,
      { style: { flexDirection: 'row', gap: COMPOSITE_GAP } },
      createElement(Text, { style: { width: COMPOSITE_CELL_WIDTH, textAlign: 'center' } }, before.dateLabel),
      createElement(Text, { style: { width: COMPOSITE_CELL_WIDTH, textAlign: 'center' } }, after.dateLabel),
    ),
  );
});

// Native half of the platform split (RESEARCH Pattern 3, Pitfall 2): captureRef snapshots the
// screen's own hidden composed view, then hands the resulting file uri straight to the OS share
// sheet. Never imports anything from composite.web.ts's canvas/Blob path.
export async function shareComposite({ viewRef }: ShareCompositeInput): Promise<void> {
  const view = viewRef.current;
  if (!view) throw new Error('composite capture view is not ready to snapshot');

  const uri = await captureRef(view, { format: 'jpg', quality: PHOTO_JPEG_QUALITY });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'image/jpeg' });
  }
}
