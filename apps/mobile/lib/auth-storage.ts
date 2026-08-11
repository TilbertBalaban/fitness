import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

// Must match the server's betterAuth({ basePath }) — every API route this app calls carries an
// explicit version segment.
const AUTH_BASE_PATH = '/v1/auth';
export const AUTH_ENDPOINT = `${API_URL}${AUTH_BASE_PATH}`;

// @better-auth/expo's own ExpoClientOptions.storagePrefix JSDoc documents this exact key format
// ("my-app_cookie", "my-app_session_data") — auth-client.ts's expoClient() plugin config, the
// background-revocation clear (app/_layout.tsx), and the explicit sign-out wipe (sign-out.ts) all
// need to address the same two keys without redeclaring the prefix in three places. This module
// deliberately carries no dependency on better-auth/react or @better-auth/expo — both ship ESM-only
// builds Jest's transform can't reach through the rest of this app's transformIgnorePatterns, and
// sign-out.ts's own logic (pending-count gating, the classified revocation attempt, the local wipe)
// never needs the real authClient instance, only these constants and the wipe itself.
export const AUTH_STORAGE_PREFIX = 'fitness';

export async function clearCachedSession(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Promise.all([
    SecureStore.deleteItemAsync(`${AUTH_STORAGE_PREFIX}_cookie`),
    SecureStore.deleteItemAsync(`${AUTH_STORAGE_PREFIX}_session_data`),
  ]);
}
