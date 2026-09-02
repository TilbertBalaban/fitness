import { resolveDefaultCookieAttributes } from '../cookie-attributes';

describe('resolveDefaultCookieAttributes', () => {
  it('gates SameSite=None/Secure/Partitioned on an https API base URL', () => {
    expect(resolveDefaultCookieAttributes('https://fitness-umcg.onrender.com')).toEqual({
      sameSite: 'none',
      secure: true,
      partitioned: true,
    });
  });

  it('returns undefined for an http API base URL (localhost dev)', () => {
    expect(resolveDefaultCookieAttributes('http://127.0.0.1:3000')).toBeUndefined();
  });

  it('returns undefined for an http API base URL (CI e2e literal)', () => {
    expect(resolveDefaultCookieAttributes('http://localhost:8081')).toBeUndefined();
  });

  it('returns undefined for an unset API base URL', () => {
    expect(resolveDefaultCookieAttributes(undefined)).toBeUndefined();
  });
});
