export type AuthOutcome = 'ok' | 'offline' | 'revoked' | 'rejected';

// The one reason string a completed 401/403 body can carry to mean "the server actually revoked
// this session" (D-01's escape hatch), as opposed to a captive portal's 401 or a stale/malformed
// request. No server route emits this yet in Phase 1 — the threat register's T-01-06 mitigation
// depends on this branch existing before the emitter does, not on the emitter existing first.
export const SESSION_REVOKED_REASON = 'session_revoked';

// Bounds the web cold-start wait (Task 2, UI-SPEC "Session & Loading States" / rule R2).
export const WEB_SESSION_RESOLVE_BUDGET_MS = 3000;

const OFFLINE_STATUSES = new Set([500, 502, 503, 504]);
const AUTH_REJECTION_STATUSES = new Set([401, 403]);

interface ResponseLike {
  status: number;
  json: () => Promise<unknown>;
  clone?: () => ResponseLike;
}

function isResponseLike(value: unknown): value is ResponseLike {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as ResponseLike).status === 'number' &&
    typeof (value as ResponseLike).json === 'function'
  );
}

async function carriesRevocationReason(response: ResponseLike): Promise<boolean> {
  try {
    const readable = response.clone ? response.clone() : response;
    const body: unknown = await readable.json();
    return !!body && typeof body === 'object' && (body as { reason?: unknown }).reason === SESSION_REVOKED_REASON;
  } catch {
    return false;
  }
}

// The two categories below are structurally separate arms, not two conditions inside one arm: a
// thrown error, an aborted request, and a completed 5xx all reach the `offline` arm; a completed
// 401/403 whose body carries SESSION_REVOKED_REASON reaches the `revoked` arm; every other
// completed non-2xx reaches `rejected`. Only the `revoked` arm may ever end a session (D-01/D-03).
export async function classifyAuthOutcome(result: unknown): Promise<AuthOutcome> {
  if (!isResponseLike(result)) {
    return 'offline';
  }

  const { status } = result;
  if (status >= 200 && status < 300) return 'ok';
  if (OFFLINE_STATUSES.has(status)) return 'offline';
  if (AUTH_REJECTION_STATUSES.has(status) && (await carriesRevocationReason(result))) {
    return 'revoked';
  }
  return 'rejected';
}

export function isRevocation(outcome: AuthOutcome): boolean {
  return outcome === 'revoked';
}
