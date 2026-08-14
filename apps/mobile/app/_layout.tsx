import '@/global.css';

import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { apiFetch, setSessionCredentialProvider } from '@/lib/api-client';
import { authClient, getSessionCookieHeader } from '@/lib/auth-client';
import { AUTH_ENDPOINT, clearCachedSession } from '@/lib/auth-storage';
import { isRevocation, WEB_SESSION_RESOLVE_BUDGET_MS } from '@/lib/session-guard';
import { applyAppearance, readStoredAppearance } from '@/lib/theme';
import { WebSessionSkeleton } from '@/components/WebSessionSkeleton';

const isWeb = Platform.OS === 'web';

// Module scope, not inside a hook or effect: Expo Router evaluates this file before any screen
// mounts, so every request from this launch — including the background probe below and a later
// signOut() from the Profile screen — goes out through an already-registered provider.
setSessionCredentialProvider(getSessionCookieHeader);

export default function RootLayout() {
  const { data: session, isPending } = authClient.useSession();
  const [appearanceReady, setAppearanceReady] = useState(false);
  const [webBudgetElapsed, setWebBudgetElapsed] = useState(false);
  const backgroundRefreshFired = useRef(false);

  // A local AsyncStorage read, not a network call — holding render here does not
  // reintroduce D-02's rejected network wait, and is what keeps cold start from
  // painting the OS default appearance and then correcting to the stored choice.
  useEffect(() => {
    let mounted = true;
    readStoredAppearance().then((stored) => {
      applyAppearance(stored);
      if (mounted) setAppearanceReady(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // D-01/D-02/D-03: fired once, after the first frame, native only. This deliberately does not go
  // through authClient.getSession() — that would let Better Auth's own client silently clear the
  // session atom on a transport failure, exactly what D-03 exists to prevent. Routing it through
  // apiFetch/classifyAuthOutcome keeps the transport-failure-vs-revocation split in this project's
  // own code. An `offline` or `rejected` outcome is a silent no-op; only `revoked` clears anything.
  useEffect(() => {
    if (isWeb || backgroundRefreshFired.current) return;
    backgroundRefreshFired.current = true;
    void (async () => {
      const { outcome } = await apiFetch(`${AUTH_ENDPOINT}/get-session`);
      if (!isRevocation(outcome)) return;
      await clearCachedSession();
      await authClient.getSession();
    })();
  }, []);

  // Web has no local cache to render from (01-RESEARCH.md Pitfall 1) — authClient.useSession()'s
  // own `isPending` covers the one get-session round trip. Bounded at WEB_SESSION_RESOLVE_BUDGET_MS
  // (UI-SPEC rule R2): past that, stop waiting and render sign-in provisionally. Nothing is cleared
  // by the elapse, so a later authenticated response still swaps the shell in (D-03 untouched).
  useEffect(() => {
    if (!isWeb) return;
    const timer = setTimeout(() => setWebBudgetElapsed(true), WEB_SESSION_RESOLVE_BUDGET_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!appearanceReady) {
    return null;
  }

  if (isWeb && isPending && !webBudgetElapsed) {
    return <WebSessionSkeleton />;
  }

  // D-02: the launch path never waits on the network. On native the Better Auth Expo plugin has
  // already restored the session from SecureStore synchronously, so the correct branch renders on
  // the first frame. `isPending` is deliberately NOT gated on here for native — doing so would
  // reintroduce exactly the blocking cold start this project rejects.
  const signedIn = !!session;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}
