export interface CapturedPhoto {
  blob: Blob;
}

// D-16: the web target takes no new dependency for capture — a bare file input, not
// expo-image-picker's own web wrapper (RESEARCH Pattern 2). A cancelled picker resolves null the
// same way the native sibling does on a denied permission or a cancelled launch.
export function capturePhoto(): Promise<CapturedPhoto | null> {
  return new Promise((resolve) => {
    const input = window.document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      resolve(file ? { blob: file } : null);
    };
    input.click();
  });
}
