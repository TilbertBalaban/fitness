import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

export interface DetailSectionProps {
  heading: string;
  children?: ReactNode;
}

// Absent cues, instructions or aliases must omit their entire section header rather than
// rendering an empty section with a heading and no body — putting the decision here, rather than
// at each of four call sites, is what stops one of them drifting later.
function isEmptyBody(children: ReactNode): boolean {
  if (children === null || children === undefined || children === false) return true;
  if (typeof children === 'string') return children.trim().length === 0;
  if (Array.isArray(children)) return children.every(isEmptyBody);
  return false;
}

export function DetailSection({ heading, children }: DetailSectionProps) {
  if (isEmptyBody(children)) return null;

  return (
    <View className="mt-lg gap-xs">
      <Text className="text-body font-semibold text-foreground">{heading}</Text>
      {typeof children === 'string' ? (
        <Text className="text-body font-normal text-foreground">{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}
