import { eq } from 'drizzle-orm';
import { getPowerSync, type WriteDb } from './powersync';
import { userPreference } from './schema';

export interface WorkoutPreferences {
  autoAdvanceEnabled: boolean;
  warmupSetsEnabled: boolean;
}

// Both flags default to true when no user_preference row exists yet — matching the schema's own
// column defaults (userPreference.autoAdvanceEnabled/.warmupSetsEnabled, both notNull().default(true)).
const DEFAULT_PREFERENCES: WorkoutPreferences = { autoAdvanceEnabled: true, warmupSetsEnabled: true };
const DEFAULT_WEIGHT_UNIT = 'kg';

export async function loadWorkoutPreferences(userId: string, db: WriteDb = getPowerSync()): Promise<WorkoutPreferences> {
  const [row] = await db
    .select({ autoAdvanceEnabled: userPreference.autoAdvanceEnabled, warmupSetsEnabled: userPreference.warmupSetsEnabled })
    .from(userPreference)
    .where(eq(userPreference.id, userId));

  if (!row) return DEFAULT_PREFERENCES;
  return { autoAdvanceEnabled: row.autoAdvanceEnabled, warmupSetsEnabled: row.warmupSetsEnabled };
}

export type WorkoutPreferenceKey = keyof WorkoutPreferences;

// Same insert-or-update singleton pattern as programs/lifecycle.ts's activateRoutine (D-14's row
// IS the user id) — writes exactly the one named column, leaving the sibling flag and weight_unit
// untouched on an update, and defaulting every other column sensibly on a first-ever insert.
export async function setWorkoutPreference(
  userId: string,
  key: WorkoutPreferenceKey,
  value: boolean,
  db: WriteDb = getPowerSync(),
): Promise<void> {
  const [existing] = await db.select({ id: userPreference.id }).from(userPreference).where(eq(userPreference.id, userId));

  if (existing) {
    await db.update(userPreference).set({ [key]: value }).where(eq(userPreference.id, userId));
    return;
  }

  await db.insert(userPreference).values({
    id: userId,
    userId,
    weightUnit: DEFAULT_WEIGHT_UNIT,
    defaultEquipmentProfileId: null,
    activeRoutineId: null,
    autoAdvanceEnabled: DEFAULT_PREFERENCES.autoAdvanceEnabled,
    warmupSetsEnabled: DEFAULT_PREFERENCES.warmupSetsEnabled,
    [key]: value,
  });
}
