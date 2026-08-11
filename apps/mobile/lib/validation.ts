export const MIN_PASSWORD_LENGTH = 8;

// Deliberately permissive rather than an RFC 5322 implementation: Better Auth's own server-side
// email and minPasswordLength checks stay authoritative (T-01-23), so a stricter client pattern
// would only reject addresses the server would have accepted.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export function isValidPassword(value: string): boolean {
  return value.length >= MIN_PASSWORD_LENGTH;
}
