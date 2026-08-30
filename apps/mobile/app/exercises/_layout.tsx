import { Stack } from 'expo-router';
import { NavBackButton } from '@/components/NavBackButton';

// Gives a deep-linked detail, create or edit route a stack entry beneath it. Without this a
// direct load of /exercises/<id> produces a single-entry stack, react-navigation's own canGoBack
// predicate is false, and no back control renders even with the header shown. This version of
// expo-router reads unstable_settings.anchor first and falls back to initialRouteName.
export const unstable_settings = { anchor: 'index' };

// This file is load-bearing for authorization, not just chrome: once it exists, the four
// exercises routes stop being root-stack siblings and become children of this single `exercises`
// route, so the root layout's existing <Stack.Screen name="exercises" /> inside its signed-in
// guard covers the whole segment instead of the list route alone. Do not add a second guard here
// and do not edit app/_layout.tsx — the root declaration already does the right thing the moment
// this segment exists (T-03-58, WINDOWS security-fix entry recorded in the plan SUMMARY).
export default function ExercisesLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        // A function-valued headerLeft, not the default: on web the default back button renders
        // only when a previous stack entry exists, which is false on a direct URL load or a
        // refresh of a detail route — exactly the case the reported bug hits. Relying on the
        // default here would reproduce it.
        headerLeft: () => <NavBackButton fallbackHref="/exercises" />,
        // Both explicit even though a custom headerLeft replaces the platform back button: on
        // iOS the interactive pop gesture is not guaranteed to survive that swap, so this is the
        // mitigation. Both typecheck on web too; there they are inert, since expo-router's web
        // stack view contains no gesture code at all.
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Exercises' }} />
      <Stack.Screen name="[id]" options={{ title: 'Exercise' }} />
      <Stack.Screen name="new" options={{ title: 'Add Custom Exercise' }} />
      <Stack.Screen name="edit/[id]" options={{ title: 'Edit Exercise' }} />
      <Stack.Screen name="exclusions" options={{ title: 'Excluded Exercises' }} />
    </Stack>
  );
}
