import type { ReactElement } from 'react';
import { Stack } from 'expo-router';

export function renderRootStack(signedIn: boolean): ReactElement {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="exercises" />
        <Stack.Screen name="programs" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}
