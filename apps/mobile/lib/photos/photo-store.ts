import { Directory, File, Paths } from 'expo-file-system';

// Native only — never imported from a .web.tsx sibling (RESEARCH Pitfall 1: expo-file-system's
// File/Directory/Paths compile cleanly for web and throw at runtime, since there is no app-private
// document-directory API on that target).
function fileFor(key: string): File {
  return new File(Paths.document, key);
}

// key is `{PHOTO_STORAGE_PREFIX}/{id}.jpg` (constants.ts) — a real subdirectory the document
// directory does not create on its own, unlike export-training-data.ts's flat single-file write.
function ensureParentDirectory(file: File): void {
  const parent = file.parentDirectory;
  if (!parent.exists) parent.create({ intermediates: true, idempotent: true });
}

export async function putPhotoBytes(key: string, bytes: Uint8Array): Promise<void> {
  const file = fileFor(key);
  ensureParentDirectory(file);
  file.write(bytes);
}

// A real file:// URI — the same URI shape every Image source in this app already accepts. null
// when this device does not hold the bytes (D-15/R27's predicate).
export async function getPhotoUri(key: string): Promise<string | null> {
  const file = fileFor(key);
  return file.exists ? file.uri : null;
}

// The D-15/R27 predicate the whole placeholder behavior hangs on.
export async function hasPhotoBytes(key: string): Promise<boolean> {
  return fileFor(key).exists;
}

// Tolerates an already-absent file without throwing — a device that never held the bytes must
// still be able to delete the row it can see (Task 4, deletePhoto).
export async function deletePhotoBytes(key: string): Promise<void> {
  const file = fileFor(key);
  if (file.exists) file.delete();
}
