import { CLIENT_VERSION, CLIENT_VERSION_HEADER } from './client-version';
import { classifyAuthOutcome, type AuthOutcome } from './session-guard';
import { API_URL } from './auth-storage';

const DEFAULT_TIMEOUT_MS = 15000;

export interface ApiFetchInit extends Omit<RequestInit, 'headers' | 'signal'> {
  headers?: Record<string, string>;
}

export interface ApiFetchResult {
  response: Response | null;
  outcome: AuthOutcome;
}

export type SessionCredentialProvider = () => string | null | Promise<string | null>;

let sessionCredentialProvider: SessionCredentialProvider = () => null;

// The one registration site for the credential seam (app/_layout.tsx, at module scope). Deliberately
// takes no dependency in the other direction: this module must not import auth-client.ts or the
// native secure-storage package, so the shared request path never pulls the ESM-only better-auth
// chain into Jest (see plan 01-05's Deviations for the exact failure that guards against).
export function setSessionCredentialProvider(provider: SessionCredentialProvider): void {
  sessionCredentialProvider = provider;
}

async function resolveSessionCredential(url: string): Promise<string | null> {
  if (!url.startsWith(API_URL)) return null;
  try {
    const credential = await sessionCredentialProvider();
    return credential || null;
  } catch {
    return null;
  }
}

// The one request path the app uses. It attaches CLIENT_VERSION, applies an abort-based timeout,
// and runs both the success and the throw through classifyAuthOutcome — it never clears session
// state itself and never signs out, so a caller can legitimately ignore an offline result (D-03).
export async function apiFetch(
  input: string,
  init: ApiFetchInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<ApiFetchResult> {
  const credential = await resolveSessionCredential(input);
  const headers = {
    ...(init.headers ?? {}),
    [CLIENT_VERSION_HEADER]: CLIENT_VERSION,
    ...(credential ? { cookie: credential } : {}),
  };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(input, { ...init, headers, signal: controller.signal });
    const outcome = await classifyAuthOutcome(response);
    return { response, outcome };
  } catch (error) {
    const outcome = await classifyAuthOutcome(error);
    return { response: null, outcome };
  } finally {
    clearTimeout(timeoutId);
  }
}
