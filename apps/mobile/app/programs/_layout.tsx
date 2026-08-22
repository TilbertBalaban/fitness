import { Stack } from 'expo-router';
import { NavBackButton } from '@/components/NavBackButton';

// Gives a deep-linked library or create route a stack entry beneath it. Without this a direct load
// of /programs/new produces a single-entry stack, react-navigation's own canGoBack predicate is
// false, and no back control renders even with the header shown.
export const unstable_settings = { anchor: 'library' };

// Load-bearing for authorization, not just chrome — the same T-03-58 pattern app/exercises/_layout.tsx
// records. Once this file exists, the programs routes stop being root-stack siblings and become
// children of one `programs` route, so the root layout's existing <Stack.Screen name="programs" />
// inside its signed-in guard covers the whole segment. Do not add a second guard here: a segment-level
// condition would be a second, independently-drifting answer to "who may see this".
export default function ProgramsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        // A function-valued headerLeft, not the default: on web the default back button renders only
        // when a previous stack entry exists, which is false on a direct URL load or a refresh.
        headerLeft: () => <NavBackButton fallbackHref="/programs/library" />,
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
      }}
    >
      <Stack.Screen name="library" options={{ title: 'Program Library' }} />
      <Stack.Screen name="new" options={{ title: 'New Program' }} />
    </Stack>
  );
}
