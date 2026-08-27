import type { WeightUnit } from '@fitness/api-contracts';
import { useRouter } from 'expo-router';
import { GymProfileEditor } from '@/components/GymProfileEditor';
import { authClient } from '@/lib/auth-client';
import { createEquipmentProfile } from '@/lib/db/equipment-profiles';
import type { WriteDb } from '@/lib/db/powersync';
import { emptyGymProfileDraft, type EquipmentProfileDraftOutput } from '@/lib/gym/profile-draft';

// A new gym starts with an empty draft and needs no data read before it can render (E2: "No
// loading state for a new gym"), so this defaults to kg synchronously rather than awaiting the
// user's saved preference — a genuine DB round trip here would be exactly the loading gate R6
// rules out. The Unit system selector sits second in the form for the same reason: correcting a
// wrong default costs one tap.
const DEFAULT_UNIT: WeightUnit = 'kg';

export async function createGymProfile(
  userId: string,
  output: EquipmentProfileDraftOutput,
  db?: WriteDb,
): Promise<{ ok: true; id: string } | { ok: false }> {
  try {
    const id = await createEquipmentProfile({ userId, ...output }, db);
    return { ok: true, id };
  } catch (error) {
    console.error('gym profile create failed', error);
    return { ok: false };
  }
}

export interface NewGymScreenProps {
  // The durability harness's own seam (06-04 Task 3), mirroring GymProfilesScreenProps — both
  // undefined for every real navigation to this route.
  userId?: string;
  db?: WriteDb;
  // Runs instead of the real router.replace('/gym-profiles') on a successful save, receiving the
  // newly created row's id. The harness uses this to surface the id it could not otherwise learn
  // (createEquipmentProfile generates it server-side, mid-write) — it mounts this screen directly
  // (not through expo-router's own navigation), so a real replace() would navigate the single
  // harness page away from /__durability and drop the window[DURABILITY_HARNESS_GLOBAL] object
  // every later harness call in the same spec needs.
  onSaved?: (id: string) => void;
}

export default function NewGymScreen({ userId: userIdOverride, db, onSaved }: NewGymScreenProps = {}) {
  const router = useRouter();
  const session = authClient.useSession();
  const userId = userIdOverride ?? session.data?.user?.id ?? null;

  async function handleSubmit(output: EquipmentProfileDraftOutput): Promise<boolean> {
    if (!userId) return false;

    const result = await createGymProfile(userId, output, db);
    if (!result.ok) return false;

    if (onSaved) {
      onSaved(result.id);
    } else {
      router.replace('/gym-profiles');
    }
    return true;
  }

  return <GymProfileEditor heading="New Gym" initialDraft={emptyGymProfileDraft(DEFAULT_UNIT)} onSubmit={handleSubmit} />;
}
