import { useState } from 'react';
import { Image, Text, View } from 'react-native';

export interface ExerciseImageTileProps {
  uri?: string | null;
}

// The single fallback tile for the empty, loading and error image states (UI-SPEC E2/E3) — one
// component, never two broken-image states. Reserved and rendered immediately at a fixed 4:3
// aspect ratio so a later image swap causes zero layout shift.
export function ExerciseImageTile({ uri }: ExerciseImageTileProps) {
  const [failed, setFailed] = useState(false);
  const showImage = !!uri && !failed;

  return (
    <View className="w-full items-center justify-center rounded-md bg-surface" style={{ aspectRatio: 4 / 3 }}>
      {showImage ? (
        <Image
          source={{ uri: uri as string }}
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%', borderRadius: 6 }}
          resizeMode="cover"
        />
      ) : (
        <Text className="text-label font-normal text-foreground-muted">No image available</Text>
      )}
    </View>
  );
}
