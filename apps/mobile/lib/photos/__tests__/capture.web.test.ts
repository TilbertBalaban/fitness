/**
 * @jest-environment jsdom
 */
import { capturePhoto } from '../capture.web';

function fakeFileInput() {
  const listeners: Record<string, Array<() => void>> = {};
  return {
    type: '',
    accept: '',
    files: undefined as FileList | undefined,
    onchange: null as (() => void) | null,
    addEventListener(event: string, handler: () => void) {
      listeners[event] = [...(listeners[event] ?? []), handler];
    },
    click: jest.fn(),
    // Test-only helpers, not part of the real HTMLInputElement surface.
    __fireCancel() {
      for (const handler of listeners.cancel ?? []) handler();
    },
    __fireChange(files: FileList | undefined) {
      this.files = files;
      this.onchange?.();
    },
  };
}

describe('capturePhoto (web)', () => {
  it('resolves the selected file wrapped as { blob } when the user picks one', async () => {
    const input = fakeFileInput();
    jest.spyOn(window.document, 'createElement').mockReturnValue(input as unknown as HTMLInputElement);

    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    const promise = capturePhoto();
    input.__fireChange([file] as unknown as FileList);

    await expect(promise).resolves.toEqual({ blob: file });
    (window.document.createElement as jest.Mock).mockRestore();
  });

  it('resolves null when the user cancels the browser file picker — the native contract (WR-02)', async () => {
    const input = fakeFileInput();
    jest.spyOn(window.document, 'createElement').mockReturnValue(input as unknown as HTMLInputElement);

    const promise = capturePhoto();
    input.__fireCancel();

    await expect(promise).resolves.toBeNull();
    (window.document.createElement as jest.Mock).mockRestore();
  });

  it('a cancel event after a file was already chosen does not re-resolve the settled promise', async () => {
    const input = fakeFileInput();
    jest.spyOn(window.document, 'createElement').mockReturnValue(input as unknown as HTMLInputElement);

    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    const promise = capturePhoto();
    input.__fireChange([file] as unknown as FileList);
    input.__fireCancel();

    await expect(promise).resolves.toEqual({ blob: file });
    (window.document.createElement as jest.Mock).mockRestore();
  });
});
