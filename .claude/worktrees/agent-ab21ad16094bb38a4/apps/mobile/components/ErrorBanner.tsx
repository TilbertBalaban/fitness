import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

export interface ErrorBannerProps {
  message?: string | null;
  children?: ReactNode;
}

export function ErrorBanner({ message, children }: ErrorBannerProps) {
  if (!children && !message) return null;

  return (
    <View accessibilityRole="alert" className="rounded-md bg-surface px-md py-sm">
      {children ?? <Text className="text-body font-normal text-destructive">{message}</Text>}
    </View>
  );
}
