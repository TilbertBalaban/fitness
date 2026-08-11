import '@/global.css';

import { Stack } from 'expo-router';
import { authClient } from '@/lib/auth-client';

export default function RootLayout() {
  const { data: session } = authClient.useSession();

  // D-02: the launch path never waits on the network. On native the Better Auth Expo plugin has
  // already restored the session from SecureStore synchronously, so the correct branch renders on
  // the first frame. `isPending` is deliberately NOT gated on here — doing so would reintroduce
  // exactly the blocking cold start this project rejects. The web treatment (a bounded, non-blocking
  // skeleton) arrives with plan 01-05.
  const signedIn = !!session;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="index" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}
