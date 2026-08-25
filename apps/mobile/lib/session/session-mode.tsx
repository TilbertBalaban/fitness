import { createContext, useContext, type ReactNode } from 'react';

// All three members declared up front (D-32): later plans add editing/summary-correction
// behaviour without ever redefining this union. A screen reads exactly one of these, provided
// once at the root, and every timer/auto-advance/rest-scheduling call site this phase and later
// phases add gates on this value alone — never on `session.status` or a boolean prop (R10).
export type SessionScreenMode = 'live' | 'editing' | 'summary-correction';

// No default value: a component reading the mode outside a provider must fail loudly rather than
// silently behave as though it were in 'live' mode.
export const SessionModeContext = createContext<SessionScreenMode | null>(null);

export interface SessionModeProviderProps {
  mode: SessionScreenMode;
  children: ReactNode;
}

export function SessionModeProvider({ mode, children }: SessionModeProviderProps) {
  return <SessionModeContext.Provider value={mode}>{children}</SessionModeContext.Provider>;
}

export function useSessionMode(): SessionScreenMode {
  const mode = useContext(SessionModeContext);
  if (mode === null) {
    throw new Error('useSessionMode() must be called within a SessionModeProvider');
  }
  return mode;
}

const LIVE_SESSION_STATUSES = ['in_progress', 'paused'];

export interface ResolveSessionScreenModeSession {
  id: string;
  status: string;
}

export interface ResolveSessionScreenModeInput {
  // Present when the workout route names a specific session (History's Edit action, or the
  // add-a-past-workout entry point) — unused by the predicate itself today (status alone decides),
  // but named in the signature per D-32/D-33's own framing: the mode is 'editing' precisely because
  // a sessionId route parameter is what put a non-in-progress session in front of this screen at
  // all, never an inference from session data alone.
  routeSessionId: string | null;
  session: ResolveSessionScreenModeSession | null;
}

// The ONE place SessionScreenMode is decided (D-32, UI-SPEC R10) — pure, no I/O. 'live' when the
// screen is showing the user's in-progress or paused session (regardless of whether a route
// parameter also happens to name it); 'editing' for any other resolved session, which in practice
// is always a completed session reached through History's Edit action or the add-a-past-workout
// entry point, since those are the only two callers that ever pass a routeSessionId. Every
// call site in this codebase reads the RESULT of this function through useSessionMode() — never
// re-derives its own answer from session.status or session.endedAt.
export function resolveSessionScreenMode({ session }: ResolveSessionScreenModeInput): SessionScreenMode {
  if (session !== null && LIVE_SESSION_STATUSES.includes(session.status)) {
    return 'live';
  }
  return 'editing';
}
