import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { PrimaryButton } from '@/components/PrimaryButton';

export default function HomeScreen() {
  const router = useRouter();

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 32 }}
    >
      <View className="mt-xl items-center gap-md">
        <Text className="text-center text-heading font-semibold text-foreground">Home</Text>
        <Text className="text-center text-body font-normal text-foreground-muted">
          Your training dashboard will live here.
        </Text>
        <PrimaryButton label="Browse exercises" onPress={() => router.push('/exercises')} />
      </View>
    </ScrollView>
  );
}
