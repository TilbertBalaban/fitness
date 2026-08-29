import Constants from 'expo-constants';

// Must match apps/api/src/common/client-version.constants.ts — the guard reads this exact header.
export const CLIENT_VERSION_HEADER = 'X-Client-Version';

export const CLIENT_VERSION = Constants.expoConfig?.version ?? '0.0.0';
