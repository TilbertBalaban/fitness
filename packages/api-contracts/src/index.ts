export const API_VERSION = '1' as const;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  image?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  expiresAt: string;
  token: string;
  createdAt: string;
  updatedAt: string;
}

export interface GetSessionResponse {
  user: SessionUser;
  session: SessionRecord;
}

export interface SignUpEmailRequest {
  email: string;
  password: string;
  name: string;
}

export interface SignInEmailRequest {
  email: string;
  password: string;
}

export interface HealthResponse {
  ok: boolean;
}

export * from './sync';
export * from './units';
export * from './catalog';
