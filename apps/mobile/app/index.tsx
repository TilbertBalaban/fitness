import { View, Text } from 'react-native';
import { authClient } from '@/lib/auth-client';

export default function HomeScreen() {
  const { data: session } = authClient.useSession();

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 }}>
      <Text style={{ fontSize: 20, fontWeight: '600' }}>Signed in</Text>
      <Text style={{ fontSize: 16 }}>{session?.user.email}</Text>
    </View>
  );
}
