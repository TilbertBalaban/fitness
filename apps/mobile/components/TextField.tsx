import { useState } from 'react';
import { Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';

export interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string | null;
  secure?: boolean;
}

export function TextField({ label, error, secure = false, ...inputProps }: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  return (
    <View className="gap-xs">
      <Text className="text-label font-normal text-foreground-muted">{label}</Text>

      <View
        className={`flex-row items-center rounded-md border bg-surface ${
          focused ? 'border-accent' : 'border-foreground-muted'
        }`}
      >
        <TextInput
          autoCapitalize="none"
          accessibilityLabel={label}
          {...inputProps}
          secureTextEntry={secure && !revealed}
          onFocus={(event) => {
            setFocused(true);
            inputProps.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            inputProps.onBlur?.(event);
          }}
          className="flex-1 px-md py-sm text-body font-normal text-foreground"
          style={{ minHeight: 48 }}
        />

        {secure ? (
          <Pressable
            onPress={() => setRevealed((current) => !current)}
            accessibilityRole="button"
            accessibilityLabel={revealed ? `Hide ${label}` : `Show ${label}`}
            className="items-center justify-center px-md"
            // Real layout size, not a hit-slop expansion: hit-slop leaves the visible pressed
            // state at the glyph's size, which the 48x48 floor exists to prevent.
            style={{ minWidth: 48, minHeight: 48 }}
          >
            <Text className="text-label font-normal text-foreground-muted">
              {revealed ? 'Hide' : 'Show'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {error ? <Text className="text-label font-normal text-destructive">{error}</Text> : null}
    </View>
  );
}
