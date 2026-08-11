import { isValidEmail, isValidPassword, MIN_PASSWORD_LENGTH } from '../validation';
import { PASSWORD_RESET_REDIRECT_URL, WEB_APP_ORIGIN } from '../web-app-origin';

describe('isValidEmail', () => {
  it.each(['a@b.co', 'first.last@example.com', 'user+tag@sub.example.co.uk'])(
    'accepts %s',
    (value) => {
      expect(isValidEmail(value)).toBe(true);
    },
  );

  it.each(['', '   ', 'nope', 'no-at-sign.com', 'two@@example.com', 'user@nodot', 'a b@c.com'])(
    'rejects %s',
    (value) => {
      expect(isValidEmail(value)).toBe(false);
    },
  );

  it('ignores surrounding whitespace', () => {
    expect(isValidEmail('  user@example.com  ')).toBe(true);
  });
});

describe('isValidPassword', () => {
  it('rejects a password one character below the floor', () => {
    expect(isValidPassword('a'.repeat(MIN_PASSWORD_LENGTH - 1))).toBe(false);
  });

  it('accepts a password at the floor', () => {
    expect(isValidPassword('a'.repeat(MIN_PASSWORD_LENGTH))).toBe(true);
  });

  it('matches the length Better Auth enforces server-side', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
  });
});

describe('password reset redirect target', () => {
  it('is a browser URL, never a custom app scheme (D-07)', () => {
    expect(PASSWORD_RESET_REDIRECT_URL).toMatch(/^https?:\/\//);
    expect(PASSWORD_RESET_REDIRECT_URL).not.toMatch(/^fitness:/);
  });

  it('resolves to the reset page served by the web build', () => {
    expect(PASSWORD_RESET_REDIRECT_URL).toBe(`${WEB_APP_ORIGIN}/reset-password`);
  });

  it('carries no trailing slash into the path', () => {
    expect(PASSWORD_RESET_REDIRECT_URL).not.toContain('//reset-password');
  });
});
