import * as ImagePicker from 'expo-image-picker';

export interface CapturedPhoto {
  uri: string;
}

// Full quality in — the downscale.ts D-17 step owns the compression, not this call
// (RESEARCH Pattern 2). Native only: this module is never imported from a .web.tsx sibling.
export async function capturePhoto(): Promise<CapturedPhoto | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
  });
  if (result.canceled) return null;

  const asset = result.assets[0];
  return asset ? { uri: asset.uri } : null;
}
