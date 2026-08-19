import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { goBackOrReplace } from '@/lib/navigation/back';
import { useThemeColors } from '@/lib/theme-colors';

export interface NavBackButtonProps {
  fallbackHref: string;
}

// The header's headerLeft on every exercises route (app/exercises/_layout.tsx). A function-valued
// headerLeft, supplied explicitly, because the web stack view renders the DEFAULT back button only
// when a previous stack entry exists — false on a direct URL load or a refresh of a detail route,
// exactly the case the reported bug hits.
export function NavBackButton({ fallbackHref }: NavBackButtonProps) {
  const router = useRouter();
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={() => goBackOrReplace(router, fallbackHref)}
      accessibilityRole="button"
      accessibilityLabel="Back"
      style={{ minWidth: 48, minHeight: 48 }}
      className="items-center justify-center"
    >
      <Ionicons name="chevron-back" size={24} color={colors.accent} />
    </Pressable>
  );
}
