import { eq } from 'drizzle-orm';
import {
  isUnavailableEquipmentRefs,
  parseEquipmentJson,
  serializeEquipmentJson,
  type UnavailableEquipmentRef,
} from '@fitness/api-contracts';
import {
  canEquip,
  MODEL_EQUIPMENT_TYPES,
  NON_MODEL_EQUIPMENT_TYPES,
  resolveInventory,
  type ResolvedInventory,
} from '@fitness/plate-math';
import type { SwapConstraints } from '../catalog/smart-swap';
import { loadEquipmentProfile, updateEquipmentProfile } from './equipment-profiles';
import { getPowerSync, type WriteDb } from './powersync';
import { workoutSession } from './schema';

// D-21's read side of the session's own mark set. Absent or malformed storage both read as "no
// marks" rather than throwing — the same defensive-collapse discipline resolveEquipmentBand
// already applies one layer up.
export async function loadSessionUnavailable(
  sessionId: string,
  db: WriteDb = getPowerSync(),
): Promise<UnavailableEquipmentRef[]> {
  const [session] = await db
    .select({ unavailableEquipment: workoutSession.unavailableEquipment })
    .from(workoutSession)
    .where(eq(workoutSession.id, sessionId));

  if (!session?.unavailableEquipment) return [];

  const parsed = parseEquipmentJson(session.unavailableEquipment);
  return isUnavailableEquipmentRefs(parsed) ? parsed : [];
}

function sameRef(a: UnavailableEquipmentRef, b: UnavailableEquipmentRef): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'equipment_type' && b.kind === 'equipment_type') return a.equipmentType === b.equipmentType;
  if (a.kind === 'machine' && b.kind === 'machine') return a.machineId === b.machineId;
  if (a.kind === 'dumbbell' && b.kind === 'dumbbell') return a.weightKg === b.weightKg;
  return false;
}

// D-20's session-scoped default: appends to the session's own unavailable list, never touches the
// profile. A ref already present is a no-op rather than a duplicate entry — marking the same
// machine unavailable twice in one session is idempotent.
export async function markEquipmentUnavailable(
  sessionId: string,
  ref: UnavailableEquipmentRef,
  db: WriteDb = getPowerSync(),
): Promise<void> {
  const existing = await loadSessionUnavailable(sessionId, db);
  if (existing.some((entry) => sameRef(entry, ref))) return;

  await db
    .update(workoutSession)
    .set({ unavailableEquipment: serializeEquipmentJson([...existing, ref]) })
    .where(eq(workoutSession.id, sessionId));
}

export async function clearEquipmentUnavailable(
  sessionId: string,
  ref: UnavailableEquipmentRef,
  db: WriteDb = getPowerSync(),
): Promise<void> {
  const existing = await loadSessionUnavailable(sessionId, db);
  const next = existing.filter((entry) => !sameRef(entry, ref));
  if (next.length === existing.length) return;

  await db
    .update(workoutSession)
    .set({ unavailableEquipment: serializeEquipmentJson(next) })
    .where(eq(workoutSession.id, sessionId));
}

// D-20's explicit, separately-confirmed write-through: "my gym doesn't have this" edits the
// profile itself, never the session's own marks. A machine is flipped unavailable rather than
// removed (the row, its stack config and its name stay editable later); a dumbbell weight is
// dropped outright, matching how the editor itself represents "this weight isn't in the rack";
// the whole bar is cleared to null for an equipment_type ref, the only kind this action reaches
// for barbell/ez_bar (the Equipment Availability Sheet only ever names the whole bar, never a
// per-plate mark).
export async function removeEquipmentFromProfile(
  profileId: string,
  ref: UnavailableEquipmentRef,
  db: WriteDb = getPowerSync(),
): Promise<void> {
  const profile = await loadEquipmentProfile(profileId, db);
  if (!profile) return;

  if (ref.kind === 'machine') {
    const machines = profile.machines.map((machine) =>
      machine.id === ref.machineId ? { ...machine, available: false } : machine,
    );
    await updateEquipmentProfile(profileId, { machines }, db);
    return;
  }

  if (ref.kind === 'dumbbell') {
    const dumbbells = profile.dumbbells.filter((dumbbell) => dumbbell.weightKg !== ref.weightKg);
    await updateEquipmentProfile(profileId, { dumbbells }, db);
    return;
  }

  await updateEquipmentProfile(profileId, { barbellWeightKg: null }, db);
}

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

  const unavailable = await loadSessionUnavailable(sessionId, db);
  return resolveInventory(profile, unavailable);
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

// D-22's small pure adapter: turns a resolved inventory into the constraint shape
// scoreAlternatives already accepts. No DB handle, no React import — the resolution already
// happened in loadSessionInventory; this only reshapes its answer. An inventory that can still
// equip everything this phase models returns {}, identical to scoreAlternatives' own default and
// therefore behaviourally unchanged from before this function existed.
export function equipmentSwapConstraints(inventory: ResolvedInventory): SwapConstraints {
  const unequippable = MODEL_EQUIPMENT_TYPES.filter((type) => !canEquip(type, inventory));
  if (unequippable.length === 0) return {};

  const equippable = MODEL_EQUIPMENT_TYPES.filter((type) => !unequippable.includes(type));
  // When what remains equippable is the smaller, genuinely bounded side, naming it directly is
  // clearer than naming everything that is gone — but every non-modelled type (D-14) must be
  // folded in too, since scoreAlternatives' allowEquipment is a positive list and a candidate
  // requiring an unmodelled type must never be excluded by omission.
  if (equippable.length > 0 && equippable.length < unequippable.length) {
    return { allowEquipment: [...equippable, ...NON_MODEL_EQUIPMENT_TYPES] };
  }

  return { excludeEquipment: unequippable };
}
