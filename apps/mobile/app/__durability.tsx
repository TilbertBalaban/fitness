import { Text, View } from 'react-native';

// This route exists only as __durability.web.tsx — Expo Router resolves platform extensions at
// build time, so the durability harness ships in the web bundle and in neither native bundle.
// This file has no imports beyond react-native, so a native build never resolves any part of
// the browser-only harness through this route.
export default function DurabilityHarnessFallback() {
  return (
    <View>
      <Text>web-only</Text>
    </View>
  );
}
