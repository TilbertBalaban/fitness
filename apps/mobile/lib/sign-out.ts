import { Platform } from 'react-native';
import { apiFetch } from './api-client';
import { AUTH_ENDPOINT, clearCachedSession } from './auth-storage';

// The seam D-04 requires. Always 0 in Phase 1 — there is no local database yet — so Phase 2
// replaces this one function body with a real count rather than threading a confirmation into a
// sign-out lifecycle that already shipped without one.
export async function pendingWriteCount(): Promise<number> {
  return 0;
}

export interface SignOutOptions {
  confirmDiscard?: (pendingCount: number) => Promise<boolean> | boolean;
  getPendingCount?: () => Promise<number>;
}

async function revokeServerSession(): Promise<void> {
  // Goes through this app's own classified request path rather than authClient's built-in
  // signOut, so it attaches CLIENT_VERSION_HEADER like every other call. Its outcome is
  // deliberately discarded below — an explicit sign-out always ends the session locally
  // regardless of what this attempt returns (the asymmetry with D-03 is deliberate).
  await apiFetch(`${AUTH_ENDPOINT}/sign-out`, {
    method: 'POST',
    credentials: Platform.OS === 'web' ? 'include' : undefined,
  });
}

export async function signOut(options: SignOutOptions = {}): Promise<void> {
  const getPendingCount = options.getPendingCount ?? pendingWriteCount;
  const pendingCount = await getPendingCount();

  if (pendingCount > 0) {
    const confirmed = options.confirmDiscard ? await options.confirmDiscard(pendingCount) : false;
    if (!confirmed) return;
  }

  await revokeServerSession();
  await clearCachedSession();
}
