import { View } from 'react-native';

// The bounded, non-blocking web cold-start placeholder (D-02, UI-SPEC E8). No shimmer, no spinner,
// no text — it must never itself become the thing that overstays, since that recreates the
// Clerk-style offline black screen this project structurally rejects.
export function WebSessionSkeleton() {
  return <View className="flex-1 bg-surface" />;
}
