import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

export function AuthScreenLayout({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView
      // Android resizes the window for the soft keyboard on its own; adding 'height' on top of
      // that double-counts the inset and pushes the focused field back off screen.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-background"
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center' }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="w-full max-w-[400px] px-lg py-3xl">{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
