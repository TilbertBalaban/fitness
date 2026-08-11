const CONFIGURED_ORIGIN = process.env.EXPO_PUBLIC_WEB_APP_ORIGIN ?? 'http://localhost:8081';

const BROWSER_SCHEMES = ['http://', 'https://'];

// D-07 holds only because the reset link opens a browser on every platform. A custom app scheme
// here would silently reinstate the native deep-link path D-07 exists to remove — and it would
// fail at the far end of an email, hours later, so it fails at import instead.
if (!BROWSER_SCHEMES.some((scheme) => CONFIGURED_ORIGIN.startsWith(scheme))) {
  throw new Error(
    `EXPO_PUBLIC_WEB_APP_ORIGIN must be an http or https browser origin, received "${CONFIGURED_ORIGIN}"`,
  );
}

export const WEB_APP_ORIGIN = CONFIGURED_ORIGIN.replace(/\/+$/, '');

// Resolves to reset-password.web.tsx, and must stay a member of the server's trustedOrigins so
// Better Auth's originCheck accepts it (T-01-24). Built from configuration, never from input.
export const PASSWORD_RESET_REDIRECT_URL = `${WEB_APP_ORIGIN}/reset-password`;
