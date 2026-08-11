import Ionicons from '@expo/vector-icons/Ionicons';
import { TabList, TabSlot, TabTrigger, type TabTriggerSlotProps, Tabs } from 'expo-router/ui';
import type { ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useThemeColors } from '@/lib/theme-colors';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

type WebTabProps = TabTriggerSlotProps & {
  label: string;
  icon: IoniconName;
  activeIcon: IoniconName;
};

// TabTrigger's `asChild` hands this component `href` and `onPress` alongside `isFocused`, and
// react-native-web turns a Pressable carrying `href` into a real anchor — which is what makes each
// tab pasteable into the address bar and reachable by browser back and forward.
function WebTab({ label, icon, activeIcon, isFocused, ...triggerProps }: WebTabProps) {
  const colors = useThemeColors();
  const color = isFocused ? colors.accent : colors.foregroundMuted;

  return (
    <Pressable
      {...triggerProps}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      style={{
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 8,
        // Applied unconditionally so the inactive tabs reserve the same 2px and the bar does not
        // shift height as focus moves.
        borderBottomWidth: 2,
        borderBottomColor: isFocused ? colors.accent : 'transparent',
      }}
    >
      <Ionicons name={isFocused ? activeIcon : icon} size={20} color={color} />
      <Text style={{ color, fontSize: 16, lineHeight: 24, fontWeight: '400' }}>{label}</Text>
    </Pressable>
  );
}

export default function WebTabsLayout() {
  const colors = useThemeColors();

  return (
    <Tabs>
      <TabList
        style={{
          minHeight: 56,
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: 16,
          paddingHorizontal: 24,
          backgroundColor: colors.surface,
        }}
      >
        <TabTrigger name="index" href="/" asChild>
          <WebTab label="Home" icon="home-outline" activeIcon="home" />
        </TabTrigger>
        <TabTrigger name="programs" href="/programs" asChild>
          <WebTab label="Programs" icon="list-outline" activeIcon="list" />
        </TabTrigger>
        <TabTrigger name="workout" href="/workout" asChild>
          <WebTab label="Workout" icon="barbell-outline" activeIcon="barbell" />
        </TabTrigger>
        <TabTrigger name="history" href="/history" asChild>
          <WebTab label="History" icon="time-outline" activeIcon="time" />
        </TabTrigger>
        <TabTrigger name="profile" href="/profile" asChild>
          <WebTab label="Profile" icon="person-outline" activeIcon="person" />
        </TabTrigger>
      </TabList>
      <View style={{ flex: 1 }}>
        <TabSlot />
      </View>
    </Tabs>
  );
}
