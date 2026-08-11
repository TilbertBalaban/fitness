import { ScrollView, Text, View } from 'react-native';

export default function HomeScreen() {
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 32 }}
    >
      <View className="items-center">
        <Text className="text-center text-heading font-semibold text-foreground">Home</Text>
        <Text className="mt-sm text-center text-body font-normal text-foreground-muted">
          Your training dashboard will live here.
        </Text>
      </View>
    </ScrollView>
  );
}
