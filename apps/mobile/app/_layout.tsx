import '@/global.css';

import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { applyAppearance, readStoredAppearance } from '@/lib/theme';

export default function RootLayout() {
  const { data: session } = authClient.useSession();
  const [appearanceReady, setAppearanceReady] = useState(false);

  // A local AsyncStorage read, not a network call — holding render here does not
  // reintroduce D-02's rejected network wait, and is what keeps cold start from
  // painting the OS default appearance and then correcting to the stored choice.
  useEffect(() => {
    let mounted = true;
    readStoredAppearance().then((stored) => {
      applyAppearance(stored);
      if (mounted) setAppearanceReady(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // D-02: the launch path never waits on the network. On native the Better Auth Expo plugin has
  // already restored the session from SecureStore synchronously, so the correct branch renders on
  // the first frame. `isPending` is deliberately NOT gated on here — doing so would reintroduce
  // exactly the blocking cold start this project rejects. The web treatment (a bounded, non-blocking
  // skeleton) arrives with plan 01-05.
  const signedIn = !!session;

  if (!appearanceReady) {
    return null;
  }

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
