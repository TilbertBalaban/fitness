import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export const authClient = createAuthClient({
  baseURL: API_URL,
  // Must match the server's betterAuth({ basePath }) — every API route this app calls carries an
  // explicit version segment.
  basePath: '/v1/auth',
  plugins: [
    // @ts-expect-error @better-auth/expo 1.6.26 types its getActions($fetch) more narrowly than
    // BetterAuthClientPlugin declares, which strictFunctionTypes rejects. This is the exact
    // composition the Better Auth docs prescribe and it is correct at runtime — the mismatch is in
    // the library's own declarations. Suppressed rather than cast because a cast collapses
    // createAuthClient's inference and useSession() degrades to `never`; @ts-expect-error leaves
    // full session typing intact. It will start failing loudly once upstream fixes the signature.
    expoClient({
      scheme: 'fitness', // must match app.json "scheme"
      storagePrefix: 'fitness',
      // Keep this on the web build too. The plugin guards it internally with an isWeb early return
      // and web carries session state in the browser cookie jar instead; removing it would break
      // native without helping web (01-RESEARCH.md Pitfall 1).
      storage: SecureStore,
    }),
  ],
});
