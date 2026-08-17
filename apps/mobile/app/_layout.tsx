import '@/global.css';
// Side-effect-only: forces Metro to resolve @powersync/react-native / @powersync/web through the
// module graph on every platform build, including `expo export --platform web` — the one gate
// that actually exercises PowerSync's beta web-target package-export resolution. Nothing here
// calls getPowerSync() (lazy, DB-opening); only the pure AppSchema construction runs at import
// time, so this is safe with no screen wired to it yet.
import '@/lib/db/powersync';

// Side-effect-only, same reasoning as above: forces Metro to resolve the platform-specific export
// module (export-training-data.web.ts here, export-training-data.ts — and its expo-file-system /
// expo-sharing imports — on native) through the module graph before any screen calls
// exportTrainingData(), so `expo export --platform web` actually proves this file bundles rather
// than silently skipping it as dead code.
import '@/lib/export/export-training-data';

import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { apiFetch, setSessionCredentialProvider } from '@/lib/api-client';
import { authClient, getSessionCookieHeader } from '@/lib/auth-client';
import { AUTH_ENDPOINT, clearCachedSession } from '@/lib/auth-storage';
import { SyncConnector } from '@/lib/db/connector';
import { connectPowerSync, disconnectPowerSync } from '@/lib/db/powersync';
import { classifySessionProbe, isRevocation, WEB_SESSION_RESOLVE_BUDGET_MS } from '@/lib/session-guard';
import { applyAppearance, readStoredAppearance } from '@/lib/theme';
import { WebSessionSkeleton } from '@/components/WebSessionSkeleton';

const isWeb = Platform.OS === 'web';

// Module scope, not inside a hook or effect: Expo Router evaluates this file before any screen
// mounts, so every request from this launch — including the background probe below and a later
// signOut() from the Profile screen — goes out through an already-registered provider.
setSessionCredentialProvider(getSessionCookieHeader);

export default function RootLayout() {
  const { data: session, isPending } = authClient.useSession();
  const signedIn = !!session;
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
  // apiFetch/classifySessionProbe keeps the transport-failure-vs-revocation split in this project's
  // own code.
  useEffect(() => {
    if (isWeb || backgroundRefreshFired.current) return;
    backgroundRefreshFired.current = true;
    void (async () => {
      const credential = getSessionCookieHeader();
      const { response } = await apiFetch(`${AUTH_ENDPOINT}/get-session`);
      const outcome = await classifySessionProbe(response, !!credential);
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

  // Pull only — push already runs unconditionally once a local write happens (D-09, plan 02-01).
  // disconnect() on sign-out matches revokeServerSession()'s own local-first cleanup: the crud
  // queue's own upload loop is independent and untouched by either call (T-02-29).
  useEffect(() => {
    if (!signedIn) {
      void disconnectPowerSync();
      return;
    }
    void connectPowerSync(new SyncConnector());
  }, [signedIn]);

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
