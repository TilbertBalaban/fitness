import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { loadEquipmentProfiles, type EquipmentProfileRow } from '@/lib/db/equipment-profiles';
import { getPowerSync, type WriteDb } from '@/lib/db/powersync';

export interface SwitchGymSheetGymRow {
  id: string;
  name: string;
  archivedAt: string | null;
}

export interface SwitchGymSheetViewProps {
  gyms: SwitchGymSheetGymRow[];
  activeGymId: string | null;
  onSelect: (gymId: string) => void;
  onManageGyms: () => void;
  onDismiss: () => void;
}

// Hook-free, prop-driven — mirrors SessionActionSheetView's row-list-in-a-sheet shape verbatim
// (same overlay, same ScrollView, same max-w-[400px], same 48px row floor). Archived gyms are
// filtered here rather than trusted from the caller, so a caller that hands over every profile
// (including archived ones) still renders the correct list — a gym you archived is not somewhere
// you are training today. Tapping the already-active row calls onDismiss, never onSelect: D-18
// makes that a no-op equivalent to Cancel, not a write.
export function SwitchGymSheetView({ gyms, activeGymId, onSelect, onManageGyms, onDismiss }: SwitchGymSheetViewProps) {
  const liveGyms = gyms.filter((gym) => gym.archivedAt === null);

  return (
    <View className="flex-1 items-center justify-center bg-background/80 px-lg">
      <ScrollView className="max-h-full w-full max-w-[400px] rounded-md bg-surface p-lg" contentContainerStyle={{ flexGrow: 1 }}>
        <Text className="text-heading font-semibold text-foreground">Switch Gym</Text>

        <View className="mt-md gap-xs">
          {liveGyms.map((gym) => {
            const isActive = gym.id === activeGymId;
            return (
              <Pressable
                key={gym.id}
                onPress={() => (isActive ? onDismiss() : onSelect(gym.id))}
                accessibilityRole="button"
                accessibilityLabel={gym.name}
                style={{ minHeight: 48 }}
                className={`flex-row flex-wrap items-center justify-between gap-sm rounded-md border px-md py-sm ${
                  isActive ? 'border-accent bg-surface' : 'border-transparent bg-surface'
                }`}
              >
                <Text className={`flex-1 flex-wrap text-body ${isActive ? 'font-semibold text-accent' : 'font-normal text-foreground'}`}>
                  {gym.name}
                </Text>
                {isActive ? <Text className="text-label font-normal text-foreground-muted">Active now</Text> : null}
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={onManageGyms}
          accessibilityRole="button"
          accessibilityLabel="Manage Gyms"
          style={{ minHeight: 48, alignSelf: 'flex-start', justifyContent: 'center' }}
          className="mt-md"
        >
          <Text className="text-body font-normal text-accent">Manage Gyms</Text>
        </Pressable>

        <View className="mt-lg flex-row justify-end">
          <Pressable
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            style={{ minWidth: 48, minHeight: 48 }}
            className="items-center justify-center rounded-md px-md py-sm"
          >
            <Text className="text-body text-foreground-muted">Cancel</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

export interface SwitchGymSheetProps {
  userId: string;
  activeGymId: string | null;
  db?: WriteDb;
  onSelectGym: (gymId: string) => void;
  onManageGyms: () => void;
  onDismiss: () => void;
}

// Thin stateful wrapper: loads the caller's own gym list once on mount (loadEquipmentProfiles), so
// the caller only supplies identity/db plus the three outward-facing intents (select/manage/
// dismiss) — the restamp write itself, and the reload it triggers, stay the caller's own (D-18's
// "on selection, call restampSessionGym" lives in workout.tsx's handler, not in here), matching
// this file's own contract: the write is one function away from the session it mutates, not buried
// inside a sheet component.
export function SwitchGymSheet({ userId, activeGymId, db, onSelectGym, onManageGyms, onDismiss }: SwitchGymSheetProps) {
  const [gyms, setGyms] = useState<EquipmentProfileRow[]>([]);

  useEffect(() => {
    let active = true;
    void loadEquipmentProfiles(userId, db ?? getPowerSync()).then((rows) => {
      if (active) setGyms(rows);
    });
    return () => {
      active = false;
    };
  }, [userId, db]);

  return (
    <SwitchGymSheetView gyms={gyms} activeGymId={activeGymId} onSelect={onSelectGym} onManageGyms={onManageGyms} onDismiss={onDismiss} />
  );
}
