import Ionicons from '@expo/vector-icons/Ionicons';
// expo-router 57 publishes native tabs at the `unstable-native-tabs` subpath only; there is no
// `expo-router/native-tabs` entry point to import from yet.
import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useThemeColors } from '@/lib/theme-colors';

// The five triggers are written out rather than mapped so the set is literally fixed at build time:
// there is no array a later edit could filter, and therefore no reachable empty or partial tab bar.
// Nothing here restyles the bar's height, blur, or safe-area handling — NativeTabs renders real
// native tab-bar controllers, not views, and overriding those is what UI-SPEC D-09 forbids.
export default function TabsLayout() {
  const colors = useThemeColors();

  return (
    <NativeTabs
      iconColor={{ default: colors.foregroundMuted, selected: colors.accent }}
      labelStyle={{
        default: { color: colors.foregroundMuted },
        selected: { color: colors.accent },
      }}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon
          src={{
            default: <NativeTabs.Trigger.VectorIcon family={Ionicons} name="home-outline" />,
            selected: <NativeTabs.Trigger.VectorIcon family={Ionicons} name="home" />,
          }}
        />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="programs">
        <NativeTabs.Trigger.Icon
          src={{
            default: <NativeTabs.Trigger.VectorIcon family={Ionicons} name="list-outline" />,
            selected: <NativeTabs.Trigger.VectorIcon family={Ionicons} name="list" />,
          }}
        />
        <NativeTabs.Trigger.Label>Programs</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="workout">
        <NativeTabs.Trigger.Icon
          src={{
            default: <NativeTabs.Trigger.VectorIcon family={Ionicons} name="barbell-outline" />,
            selected: <NativeTabs.Trigger.VectorIcon family={Ionicons} name="barbell" />,
          }}
        />
        <NativeTabs.Trigger.Label>Workout</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="history">
        <NativeTabs.Trigger.Icon
          src={{
            default: <NativeTabs.Trigger.VectorIcon family={Ionicons} name="time-outline" />,
            selected: <NativeTabs.Trigger.VectorIcon family={Ionicons} name="time" />,
          }}
        />
        <NativeTabs.Trigger.Label>History</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Icon
          src={{
            default: <NativeTabs.Trigger.VectorIcon family={Ionicons} name="person-outline" />,
            selected: <NativeTabs.Trigger.VectorIcon family={Ionicons} name="person" />,
          }}
        />
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
