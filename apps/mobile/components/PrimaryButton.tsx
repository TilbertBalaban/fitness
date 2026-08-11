import { ActivityIndicator, Pressable, Text } from 'react-native';

export interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  submitting?: boolean;
}

export function PrimaryButton({ label, onPress, submitting = false }: PrimaryButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={submitting}
      accessibilityRole="button"
      accessibilityState={{ disabled: submitting, busy: submitting }}
      className="flex-row items-center justify-center gap-sm rounded-md bg-accent px-md py-sm"
      style={{ minHeight: 48 }}
    >
      {submitting ? <ActivityIndicator size="small" color="white" /> : null}
      <Text className="text-body font-semibold text-white">{label}</Text>
    </Pressable>
  );
}
