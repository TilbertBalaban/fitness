// The deployed web build and the API are different registrable domains, so Better Auth's
// SameSite=Lax default withholds the session cookie on the app's cross-site get-session call.
// The gate is the https API base URL, mirroring the check Better Auth itself uses to decide
// whether a cookie is `Secure` — a `Secure` cookie is rejected by browsers over plaintext
// localhost, so the same condition doubles as the local/CI no-op guard.
const CROSS_SITE_COOKIE_ATTRIBUTES = {
  sameSite: 'none',
  secure: true,
  partitioned: true,
} as const;

export function resolveDefaultCookieAttributes(apiBaseUrl: string | undefined = process.env.API_BASE_URL) {
  return apiBaseUrl?.startsWith('https://') ? CROSS_SITE_COOKIE_ATTRIBUTES : undefined;
}
