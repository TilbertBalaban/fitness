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
