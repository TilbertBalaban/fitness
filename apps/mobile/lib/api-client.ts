import { CLIENT_VERSION, CLIENT_VERSION_HEADER } from './client-version';
import { classifyAuthOutcome, type AuthOutcome } from './session-guard';

const DEFAULT_TIMEOUT_MS = 15000;

export interface ApiFetchInit extends Omit<RequestInit, 'headers' | 'signal'> {
  headers?: Record<string, string>;
}

export interface ApiFetchResult {
  response: Response | null;
  outcome: AuthOutcome;
}

// The one request path the app uses. It attaches CLIENT_VERSION, applies an abort-based timeout,
// and runs both the success and the throw through classifyAuthOutcome — it never clears session
// state itself and never signs out, so a caller can legitimately ignore an offline result (D-03).
export async function apiFetch(
  input: string,
  init: ApiFetchInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<ApiFetchResult> {
  const headers = { ...(init.headers ?? {}), [CLIENT_VERSION_HEADER]: CLIENT_VERSION };
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
