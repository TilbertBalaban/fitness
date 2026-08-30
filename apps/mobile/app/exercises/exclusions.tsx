import { FlashList } from '@shopify/flash-list';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ErrorBanner } from '@/components/ErrorBanner';
import { authClient } from '@/lib/auth-client';
import { loadExcludedExercises, removeExclusion, type ExcludedExerciseSummary } from '@/lib/db/exclusions';
import { getPowerSync, type WriteDb } from '@/lib/db/powersync';

export const EMPTY_EXCLUSIONS_COPY =
  'Nothing excluded yet. Exclude an exercise from its detail screen and generated programs will leave it out.';

export type ExclusionsScreenState = 'error' | 'loading' | 'empty' | 'populated';

export interface ExclusionsScreenStateInput {
  failed: boolean;
  rows: ExcludedExerciseSummary[] | null;
}

// A failed read and an empty list must not look the same: reporting "nothing excluded" after a read
// that never succeeded would tell the user their exclusions are gone.
export function deriveExclusionsScreenState({ failed, rows }: ExclusionsScreenStateInput): ExclusionsScreenState {
  if (failed) return 'error';
  if (rows === null) return 'loading';
  if (rows.length === 0) return 'empty';
  return 'populated';
}

export interface ExclusionsScreenProps {
  db?: WriteDb;
  userId?: string | null;
}

export default function ExclusionsScreen({ db, userId }: ExclusionsScreenProps = {}) {
  const session = authClient.useSession();
  const resolvedUserId = userId ?? session.data?.user?.id ?? null;

  const [rows, setRows] = useState<ExcludedExerciseSummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      if (!resolvedUserId) return;
      try {
        const loaded = await loadExcludedExercises(db ?? getPowerSync(), resolvedUserId);
        if (mounted) setRows(loaded);
      } catch {
        if (mounted) setFailed(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [db, resolvedUserId]);

  // Drops the row locally rather than re-reading: the write is local-first and cannot fail against
  // a server it never waits for, so a reload would only re-render the same list.
  const handleRemove = useCallback(
    async (exerciseId: string) => {
      if (!resolvedUserId) return;
      setRows((current) => (current ?? []).filter((row) => row.exerciseId !== exerciseId));
      await removeExclusion(db ?? getPowerSync(), resolvedUserId, exerciseId);
    },
    [db, resolvedUserId],
  );

  const screenState = deriveExclusionsScreenState({ failed, rows });

  if (screenState === 'error') {
    return (
      <View className="flex-1 bg-background px-lg pt-lg">
        <ErrorBanner message="Excluded exercises couldn't load. Restart the app to try again — your exclusions are safe." />
      </View>
    );
  }

  if (screenState === 'loading') {
    return (
      <View className="flex-1 items-center justify-center bg-background px-lg">
        <Text className="text-body font-normal text-foreground-muted">Loading…</Text>
      </View>
    );
  }

  if (screenState === 'empty') {
    return (
      <View className="flex-1 items-center justify-center bg-background px-lg">
        <Text className="text-center text-body font-normal text-foreground-muted">{EMPTY_EXCLUSIONS_COPY}</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <FlashList
        data={rows ?? []}
        keyExtractor={(row) => row.exerciseId}
        renderItem={({ item }) => (
          <View className="flex-row items-center justify-between px-lg py-md">
            <Text className="flex-1 text-body font-normal text-foreground">{item.name}</Text>
            <Pressable
              onPress={() => handleRemove(item.exerciseId)}
              accessibilityRole="button"
              accessibilityLabel={`Allow ${item.name} in generated programs`}
              style={{ minWidth: 48, minHeight: 48 }}
              className="items-center justify-center rounded-md border border-foreground-muted px-md py-sm"
            >
              <Text className="text-body font-normal text-foreground">Allow</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}
