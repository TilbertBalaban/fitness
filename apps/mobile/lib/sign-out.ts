import { Platform } from 'react-native';
import { apiFetch } from './api-client';
import { AUTH_ENDPOINT, clearCachedSession } from './auth-storage';
import { pendingWriteCount } from './pending-write-count';

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
