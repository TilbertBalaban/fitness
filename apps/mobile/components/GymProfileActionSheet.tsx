import { Pressable, ScrollView, Text, View } from 'react-native';

export interface GymProfileAction {
  key: string;
  label: string;
  destructive?: boolean;
}

export interface GymProfileActionSheetProps {
  gymName: string;
  actions: GymProfileAction[];
  onSelect: (key: string) => void;
  onCancel: () => void;
}

// Copies RoutineActionSheet.tsx verbatim — same overlay, same scroll container, same maximum
// width, same row geometry — this is a different subject of the same modal surface, not a second
// visual language. The action list is passed in rather than derived here because which actions
// apply is a property of the row (already active? archived?), and the caller is the one that
// already knows the answer.
export function GymProfileActionSheet({ gymName, actions, onSelect, onCancel }: GymProfileActionSheetProps) {
  return (
    <View className="flex-1 items-center justify-center bg-background/80 px-lg">
      <ScrollView
        className="max-h-full w-full max-w-[400px] rounded-md bg-surface p-lg"
        contentContainerStyle={{ flexGrow: 1 }}
      >
        <Text className="text-heading font-semibold text-foreground">{gymName}</Text>

        <View className="mt-md gap-xs">
          {actions.map((action) => (
            <Pressable
              key={action.key}
              onPress={() => onSelect(action.key)}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              style={{ minHeight: 48 }}
              className="justify-center rounded-md px-md py-sm"
            >
              <Text
                className={`text-body font-normal ${action.destructive ? 'text-destructive' : 'text-foreground'}`}
              >
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View className="mt-lg flex-row justify-end">
          <Pressable
            onPress={onCancel}
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
