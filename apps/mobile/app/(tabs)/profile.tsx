import { ScrollView, Text, View } from 'react-native';

export default function ProfileScreen() {
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 32 }}
    >
      <View>
        <Text className="text-heading font-semibold text-foreground">Profile</Text>
      </View>
    </ScrollView>
  );
}
