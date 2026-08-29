import { createHmac } from 'node:crypto';

export const SYNC_TOKEN_TTL_SECONDS = 300;

// Must match ops/powersync/powersync.yaml's client_auth.audience and jwks.keys[0].kid exactly --
// a static, non-secret pair of labels, not a network address or a rotated credential.
const POWERSYNC_JWT_AUDIENCE = 'fitness-sync';
const POWERSYNC_JWT_KID = 'app-key-1';

function base64url(input: string): string {
  return Buffer.from(input).toString('base64url');
}

// Hand-rolled instead of a JWT library: the only consumer is PowerSync's own client_auth.jwks
// (a static HS256 key), so there is no JWKS fetch, no RS256, and no library-specific claim
// validation to replicate -- three HMAC-SHA256-signed base64url segments is the whole format.
function signHs256(payload: Record<string, unknown>, secret: Buffer): string {
  const header = { alg: 'HS256', typ: 'JWT', kid: POWERSYNC_JWT_KID };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = createHmac('sha256', secret).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}

export interface SyncToken {
  token: string;
}

// Reads POWERSYNC_JWT_SECRET on every call rather than once at import time, so the "unset secret"
// case is a normal per-request failure the token endpoint can catch and answer honestly, not a
// crash that takes the whole process down before any test (or an unrelated request) can run.
export function mintSyncToken(userId: string): SyncToken {
  const secretRaw = process.env.POWERSYNC_JWT_SECRET;
  if (!secretRaw) {
    throw new Error('POWERSYNC_JWT_SECRET is not set -- refusing to mint an unsigned PowerSync token');
  }
  const secret = Buffer.from(secretRaw, 'base64url');
  const now = Math.floor(Date.now() / 1000);
  const token = signHs256(
    { sub: userId, aud: POWERSYNC_JWT_AUDIENCE, iat: now, exp: now + SYNC_TOKEN_TTL_SECONDS },
    secret,
  );
  return { token };
}
