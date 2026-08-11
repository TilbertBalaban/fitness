import { ScrollView, Text, View } from 'react-native';

export default function WorkoutScreen() {
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 32 }}
    >
      <View className="items-center">
        <Text className="text-center text-heading font-semibold text-foreground">Workout</Text>
        <Text className="mt-sm text-center text-body font-normal text-foreground-muted">
          Start and log your workouts here.
        </Text>
      </View>
    </ScrollView>
  );
}
