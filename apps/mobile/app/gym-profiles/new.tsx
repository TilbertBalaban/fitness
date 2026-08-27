import type { WeightUnit } from '@fitness/api-contracts';
import { useRouter } from 'expo-router';
import { GymProfileEditor } from '@/components/GymProfileEditor';
import { authClient } from '@/lib/auth-client';
import { createEquipmentProfile } from '@/lib/db/equipment-profiles';
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
): Promise<{ ok: true; id: string } | { ok: false }> {
  try {
    const id = await createEquipmentProfile({ userId, ...output });
    return { ok: true, id };
  } catch (error) {
    console.error('gym profile create failed', error);
    return { ok: false };
  }
}

export default function NewGymScreen() {
  const router = useRouter();
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;

  async function handleSubmit(output: EquipmentProfileDraftOutput): Promise<boolean> {
    if (!userId) return false;

    const result = await createGymProfile(userId, output);
    if (!result.ok) return false;

    router.replace('/gym-profiles');
    return true;
  }

  return <GymProfileEditor heading="New Gym" initialDraft={emptyGymProfileDraft(DEFAULT_UNIT)} onSubmit={handleSubmit} />;
}
