// The web sibling of photo-store.ts — one IndexedDB database, one object store, Blob values keyed
// by storage_key, no new npm dependency (D-16, RESEARCH Standard Stack). Never imports
// expo-file-system.
const DB_NAME = 'fitness-progress-photos';
const DB_VERSION = 1;
const STORE_NAME = 'photos';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('failed to open the photo store'));
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDatabase();
  try {
    const result = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const request = run(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('photo store request failed'));
    });
    return result as T;
  } finally {
    db.close();
  }
}

export async function putPhotoBytes(key: string, bytes: Uint8Array): Promise<void> {
  // TS's DOM lib types BlobPart as ArrayBufferView<ArrayBuffer> specifically, which a
  // SharedArrayBuffer-backed Uint8Array cannot satisfy structurally — bytes is always a real
  // ArrayBuffer-backed view in practice (downscale.web.ts's own blob.arrayBuffer() output).
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'image/jpeg' });
  await withStore<IDBValidKey>('readwrite', (store) => store.put(blob, key));
}

// The caller owns revoking this object URL — matching every other object-URL producer in this
// codebase (export-training-data.web.ts's own download link).
export async function getPhotoUri(key: string): Promise<string | null> {
  const blob = await withStore<Blob | undefined>('readonly', (store) => store.get(key));
  return blob ? URL.createObjectURL(blob) : null;
}

// The D-15/R27 predicate the whole placeholder behavior hangs on.
export async function hasPhotoBytes(key: string): Promise<boolean> {
  const blob = await withStore<Blob | undefined>('readonly', (store) => store.get(key));
  return blob !== undefined;
}

// IDBObjectStore.delete resolves even when the key is absent — the same "tolerate an already-gone
// blob" contract photo-store.ts's file-exists check gives the native sibling.
export async function deletePhotoBytes(key: string): Promise<void> {
  await withStore<undefined>('readwrite', (store) => store.delete(key));
}
