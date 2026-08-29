import { ScrollView, Text, View } from 'react-native';

export interface PlaceholderScreenProps {
  heading: string;
  body: string;
}

// D-09 scopes these as labelled screens whose content Phase 3 and later replace entirely, so there
// is deliberately no card, icon illustration, or skeleton here.
export function PlaceholderScreen({ heading, body }: PlaceholderScreenProps) {
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 32 }}
    >
      <View className="mt-xl items-center">
        <Text className="text-center text-heading font-semibold text-foreground">{heading}</Text>
        <Text className="mt-sm text-center text-body font-normal text-foreground-muted">
          {body}
        </Text>
      </View>
    </ScrollView>
  );
}
