import { Stack } from 'expo-router';

// Required even though it adds no chrome: the root layout's <Stack.Screen name="(auth)" /> has no
// route to bind to without a layout inside the group, and Expo Router throws "No route named
// (auth)". Headers stay hidden so nothing competes with each screen's Display heading.
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
