import { eq } from 'drizzle-orm';
import { resolveInventory, type ResolvedInventory } from '@fitness/plate-math';
import { loadEquipmentProfile } from './equipment-profiles';
import { getPowerSync, type WriteDb } from './powersync';
import { workoutSession } from './schema';

// D-17's read side: a session's equipment is a snapshot, not a live lookup. Returns null on a
// missing stamp or a stamp naming a profile that no longer resolves — falling back to the current
// active pointer here would make a session started at one gym silently re-resolve against
// another, exactly what the snapshot exists to prevent.
export async function loadSessionInventory(
  sessionId: string,
  db: WriteDb = getPowerSync(),
): Promise<ResolvedInventory | null> {
  const [session] = await db
    .select({ equipmentProfileId: workoutSession.equipmentProfileId })
    .from(workoutSession)
    .where(eq(workoutSession.id, sessionId));

  if (!session?.equipmentProfileId) return null;

  const profile = await loadEquipmentProfile(session.equipmentProfileId, db);
  if (!profile) return null;

  return resolveInventory(profile, []);
}

// D-18's write side: rewrites only the session's gym column. Every already-logged set keeps its
// recorded weight untouched — only forward-looking resolution changes.
export async function restampSessionGym(
  sessionId: string,
  profileId: string,
  db: WriteDb = getPowerSync(),
): Promise<void> {
  await db.update(workoutSession).set({ equipmentProfileId: profileId }).where(eq(workoutSession.id, sessionId));
}
