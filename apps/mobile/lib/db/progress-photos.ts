import { and, desc, eq } from 'drizzle-orm';
import { captureCalendarDay } from '../calendar-day';
import { deletePhotoBytes, putPhotoBytes } from '../photos/photo-store';
import { photoStorageKey } from '../photos/constants';
import { generateClientId } from './id';
import { getPowerSync, type WriteDb } from './powersync';
import { progressPhoto } from './schema';

export interface SavePhotoInput {
  userId: string;
  bytes: Uint8Array;
  note?: string | null;
}

export interface ProgressPhotoRow {
  id: string;
  takenAt: string;
  timezone: string;
  localDate: string;
  storageKey: string;
  note: string | null;
}

// Bytes-first, row-second — deliberate (D-15's own concurrency edge, 12-03's planner_assumptions
// #3): an interruption between the two writes leaves an unreferenced blob, which is invisible,
// rather than a row pointing at nothing, which would render as a placeholder the user just took
// this photo on THIS device and cannot explain. captureCalendarDay is called here, never accepted
// as an input, so every write gets the same day-attribution rule every other write in this
// codebase uses (D-04).
export async function savePhoto(input: SavePhotoInput, db: WriteDb = getPowerSync()): Promise<string> {
  const id = generateClientId();
  const key = photoStorageKey(id);
  const { timezone, localDate } = captureCalendarDay(new Date());

  await putPhotoBytes(key, input.bytes);

  await db.insert(progressPhoto).values({
    id,
    userId: input.userId,
    takenAt: new Date().toISOString(),
    timezone,
    localDate,
    storageKey: key,
    note: input.note ?? null,
  });

  return id;
}

// ONE batched read, most-recent-first (S8's own ordering) — never a second query per row.
export async function loadProgressPhotos(userId: string, db: WriteDb = getPowerSync()): Promise<ProgressPhotoRow[]> {
  return db
    .select({
      id: progressPhoto.id,
      takenAt: progressPhoto.takenAt,
      timezone: progressPhoto.timezone,
      localDate: progressPhoto.localDate,
      storageKey: progressPhoto.storageKey,
      note: progressPhoto.note,
    })
    .from(progressPhoto)
    .where(eq(progressPhoto.userId, userId))
    .orderBy(desc(progressPhoto.takenAt));
}

export interface GalleryCell {
  row: ProgressPhotoRow;
  present: boolean;
}

// Present and absent cells interleave in the rows' own date order — never grouped or reordered
// separately (S8 partial, design decision 11). The caller resolves presenceByKey with ONE batched
// hasPhotoBytes pass over the distinct storage keys, never once per cell here.
export function resolveGalleryCells(
  rows: ProgressPhotoRow[],
  presenceByKey: Map<string, boolean>,
): GalleryCell[] {
  return rows.map((row) => ({ row, present: presenceByKey.get(row.storageKey) ?? false }));
}

export type PhotoGalleryState = 'error' | 'loading' | 'empty' | 'ready';

export interface PhotoGalleryStateInput {
  failed: boolean;
  cells: GalleryCell[] | null;
}

// Mirrors deriveBodyMetricsScreenState/deriveHomeScreenState's shape exactly: error beats
// everything, null cells means the read has not landed yet (never reported as empty — that would
// tell the user their photos are gone while they are still being read), and a landed empty array
// is the real empty state.
export function derivePhotoGalleryState({ failed, cells }: PhotoGalleryStateInput): PhotoGalleryState {
  if (failed) return 'error';
  if (cells === null) return 'loading';
  if (cells.length === 0) return 'empty';
  return 'ready';
}

// The "Create Before & After" control's gate (S8 zero-one-many) — absent below two present
// cells, never merely disabled (this app's established "absent over disabled" bias for
// structurally-impossible actions).
export function canBuildComposite(cells: GalleryCell[]): boolean {
  return cells.filter((cell) => cell.present).length >= 2;
}

export interface DeletePhotoInput {
  userId: string;
  id: string;
}

// Reads the row's storage_key first — deletePhotoBytes needs it — then removes the row and the
// bytes. deletePhotoBytes tolerates an already-absent blob without throwing (photo-store.ts's own
// contract): a device that never held the bytes must still be able to delete the row it can see.
export async function deletePhoto(input: DeletePhotoInput, db: WriteDb = getPowerSync()): Promise<void> {
  const [existing] = await db
    .select({ storageKey: progressPhoto.storageKey })
    .from(progressPhoto)
    .where(and(eq(progressPhoto.id, input.id), eq(progressPhoto.userId, input.userId)));

  await db.delete(progressPhoto).where(and(eq(progressPhoto.id, input.id), eq(progressPhoto.userId, input.userId)));

  if (existing) {
    await deletePhotoBytes(existing.storageKey);
  }
}

export interface UpdatePhotoNoteInput {
  userId: string;
  id: string;
  note: string | null;
}

// Sets only the note column — taken_at/timezone/local_date/storage_key are never touched by this
// mutation, matching renameSession's own single-column update shape (history-mutations.ts).
export async function updatePhotoNote(input: UpdatePhotoNoteInput, db: WriteDb = getPowerSync()): Promise<void> {
  await db
    .update(progressPhoto)
    .set({ note: input.note })
    .where(and(eq(progressPhoto.id, input.id), eq(progressPhoto.userId, input.userId)));
}
