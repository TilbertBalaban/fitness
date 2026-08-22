import { Pressable, ScrollView, Text, View } from 'react-native';

export interface RoutineAction {
  key: string;
  label: string;
  destructive?: boolean;
}

export interface RoutineActionSheetProps {
  programName: string;
  actions: RoutineAction[];
  onSelect: (key: string) => void;
  onCancel: () => void;
}

// The sheet behind each library row's "•••" trigger. Copies ArchiveDialog's overlay and 48x48
// control geometry — this is a different shape of the same modal surface, not a second visual
// language. The action list is passed in rather than derived here because which actions apply is a
// property of the row (already active? archived?), and computing it twice is how the two answers
// drift apart.
export function RoutineActionSheet({ programName, actions, onSelect, onCancel }: RoutineActionSheetProps) {
  return (
    <View className="flex-1 items-center justify-center bg-background/80 px-lg">
      <ScrollView
        className="max-h-full w-full max-w-[400px] rounded-md bg-surface p-lg"
        contentContainerStyle={{ flexGrow: 1 }}
      >
        <Text className="text-heading font-semibold text-foreground">{programName}</Text>

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
