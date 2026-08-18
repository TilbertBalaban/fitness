import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

export interface SearchFieldProps {
  onDebouncedChange: (query: string) => void;
  debounceMs?: number;
}

// Search is a synchronous in-memory query over the already-seeded local catalog (UI-SPEC E8) —
// nothing here is async, so there is no loading state to render. The debounce exists purely to
// avoid re-running the index on every keystroke, not to mask any network latency. A plain
// (non-multiline) TextInput already scrolls its own content horizontally instead of growing when
// the query text overflows the field's width, so an unusually long query never reflows the
// header around it.
export function SearchField({ onDebouncedChange, debounceMs = 200 }: SearchFieldProps) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => onDebouncedChange(text), debounceMs);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, debounceMs]);

  return (
    <View
      className={`flex-row items-center rounded-md border bg-surface ${
        focused ? 'border-accent' : 'border-foreground-muted'
      }`}
    >
      <TextInput
        value={text}
        onChangeText={setText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Search exercises"
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Search exercises"
        className="flex-1 px-md py-sm text-body font-normal text-foreground"
        style={{ minHeight: 48 }}
      />

      {text.length > 0 ? (
        <Pressable
          onPress={() => setText('')}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          className="items-center justify-center px-md"
          style={{ minWidth: 48, minHeight: 48 }}
        >
          <Text className="text-label font-normal text-foreground-muted">Clear</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
