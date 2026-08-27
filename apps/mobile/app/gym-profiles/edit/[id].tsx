import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { GymProfileEditor } from '@/components/GymProfileEditor';
import { loadEquipmentProfile, updateEquipmentProfile } from '@/lib/db/equipment-profiles';
import type { WriteDb } from '@/lib/db/powersync';
import { draftFromProfile, type EquipmentProfileDraftOutput, type GymProfileDraft } from '@/lib/gym/profile-draft';

export async function updateGymProfile(
  id: string,
  output: EquipmentProfileDraftOutput,
  db?: WriteDb,
): Promise<{ ok: true } | { ok: false }> {
  try {
    await updateEquipmentProfile(id, output, db);
    return { ok: true };
  } catch (error) {
    console.error('gym profile update failed', error);
    return { ok: false };
  }
}

type LoadState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error' }
  | { status: 'ready'; draft: GymProfileDraft };

export interface EditGymScreenProps {
  // The durability harness's own seam (06-04 Task 3), mirroring NewGymScreenProps/
  // GymProfilesScreenProps. `id` overrides the route param — the harness mounts this component
  // directly rather than through a matched /gym-profiles/edit/[id] route, so useLocalSearchParams
  // resolves against whatever route the page actually is (/__durability), never this one's param.
  id?: string;
  userId?: string;
  db?: WriteDb;
  // Receives the just-updated row's id (always the same as the `id` prop/param here — kept for
  // interface symmetry with NewGymScreenProps.onSaved, which is where an id genuinely cannot be
  // known any other way).
  onSaved?: (id: string) => void;
}

export default function EditGymScreen({ id: idProp, db, onSaved }: EditGymScreenProps = {}) {
  const params = useLocalSearchParams<{ id: string }>();
  const id = idProp ?? params.id;
  const router = useRouter();

  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!id) return;
    let mounted = true;

    (async () => {
      try {
        const row = await loadEquipmentProfile(id, db);
        if (!mounted) return;

        if (!row) {
          setState({ status: 'not-found' });
          return;
        }

        setState({ status: 'ready', draft: draftFromProfile(row) });
      } catch (error) {
        console.error('gym profile load failed', error);
        if (mounted) setState({ status: 'error' });
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id, db]);

  async function handleSubmit(output: EquipmentProfileDraftOutput): Promise<boolean> {
    if (!id) return false;

    const result = await updateGymProfile(id, output, db);
    if (!result.ok) return false;

    if (onSaved) {
      onSaved(id);
    } else {
      router.replace('/gym-profiles');
    }
    return true;
  }

  if (state.status === 'loading') {
    return null;
  }

  if (state.status === 'not-found') {
    return (
      <ScrollView className="flex-1 bg-background" contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 32 }}>
        <View className="mt-xl items-center">
          <Text className="text-center text-heading font-semibold text-foreground">Gym not found</Text>
          <Text className="mt-sm text-center text-body font-normal text-foreground-muted">
            This gym may have been removed. Go back and try another.
          </Text>
        </View>
      </ScrollView>
    );
  }

  if (state.status === 'error') {
    return (
      <ScrollView className="flex-1 bg-background" contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 32 }}>
        <View className="mt-xl items-center">
          <Text className="text-center text-heading font-semibold text-foreground">{"Gym Profiles couldn't load"}</Text>
          <Text className="mt-sm text-center text-body font-normal text-foreground-muted">
            Restart the app to try again. Your programs and history are safe.
          </Text>
        </View>
      </ScrollView>
    );
  }

  return <GymProfileEditor heading="Edit Gym" initialDraft={state.draft} onSubmit={handleSubmit} />;
}
