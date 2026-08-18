import { useState } from 'react';
import { Image, Text, View, type ImageSourcePropType } from 'react-native';

export interface ExerciseImageTileProps {
  uri?: string | null;
  // Additive (03-07, WINDOWS #36): a Metro asset module id from a static require() call —
  // e.g. from catalog-image-map.generated.ts — for a vendored local image. Takes precedence
  // over `uri` when both are provided, since the whole point of vendoring is to never need the
  // remote fetch a `uri` implies. `uri` is left fully intact so an existing or concurrent caller
  // (e.g. the list row) that only ever passes `uri` keeps working unchanged.
  localSource?: number | null;
}

// The single fallback tile for the empty, loading and error image states (UI-SPEC E2/E3) — one
// component, never two broken-image states. Reserved and rendered immediately at a fixed 4:3
// aspect ratio so a later image swap causes zero layout shift.
export function ExerciseImageTile({ uri, localSource }: ExerciseImageTileProps) {
  const [failed, setFailed] = useState(false);
  const source: ImageSourcePropType | null =
    localSource != null ? localSource : uri ? { uri } : null;
  const showImage = !!source && !failed;

  return (
    <View className="w-full items-center justify-center rounded-md bg-surface" style={{ aspectRatio: 4 / 3 }}>
      {showImage ? (
        <Image
          source={source as ImageSourcePropType}
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
