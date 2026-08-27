import { Stack } from 'expo-router';
import { NavBackButton } from '@/components/NavBackButton';

// Gives a deep-linked route in this segment a stack entry beneath it. Without this a direct load
// of /gym-profiles produces a single-entry stack, react-navigation's own canGoBack predicate is
// false, and no back control renders even with the header shown. Anchors on `index` — the segment's
// only route file today — matching exercises/_layout.tsx's own anchor-on-index precedent.
export const unstable_settings = { anchor: 'index' };

// Load-bearing for authorization, not just chrome — the same T-03-58 pattern programs/_layout.tsx
// and exercises/_layout.tsx record. Once this file exists, the gym-profiles routes stop being
// root-stack siblings and become children of one `gym-profiles` route, so the root stack's own
// signed-in guard (apps/mobile/lib/navigation/root-stack.tsx) covers the whole segment the moment
// it is declared there. Do not add a second guard here: a segment-level condition would be a
// second, independently-drifting answer to "who may see this".
export default function GymProfilesLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        // A function-valued headerLeft, not the default: on web the default back button renders
        // only when a previous stack entry exists, which is false on a direct URL load or a
        // refresh.
        headerLeft: () => <NavBackButton fallbackHref="/gym-profiles" />,
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Gym Profiles' }} />
      <Stack.Screen name="new" options={{ title: 'New Gym' }} />
      <Stack.Screen name="edit/[id]" options={{ title: 'Edit Gym' }} />
    </Stack>
  );
}
