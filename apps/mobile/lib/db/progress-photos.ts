import { desc, eq } from 'drizzle-orm';
import { captureCalendarDay } from '../calendar-day';
import { putPhotoBytes } from '../photos/photo-store';
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
