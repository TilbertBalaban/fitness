import { resolveIpAddressHeaders } from '../ip-address-headers';

describe('resolveIpAddressHeaders', () => {
  it('parses a comma-separated list into an ordered array', () => {
    expect(resolveIpAddressHeaders('cf-connecting-ip,x-forwarded-for')).toEqual([
      'cf-connecting-ip',
      'x-forwarded-for',
    ]);
  });

  it('trims whitespace and lowercases mixed-case header names', () => {
    expect(resolveIpAddressHeaders(' CF-Connecting-IP , X-Forwarded-For ')).toEqual([
      'cf-connecting-ip',
      'x-forwarded-for',
    ]);
  });

  it('drops empty segments produced by stray commas', () => {
    expect(resolveIpAddressHeaders('cf-connecting-ip,,x-forwarded-for,')).toEqual([
      'cf-connecting-ip',
      'x-forwarded-for',
    ]);
  });

  it('returns a single-element array for one header', () => {
    expect(resolveIpAddressHeaders('cf-connecting-ip')).toEqual(['cf-connecting-ip']);
  });

  it('returns undefined for an unset value', () => {
    expect(resolveIpAddressHeaders(undefined)).toBeUndefined();
  });

  it('returns undefined for an empty string', () => {
    expect(resolveIpAddressHeaders('')).toBeUndefined();
  });

  it('returns undefined when only separators and whitespace survive filtering', () => {
    expect(resolveIpAddressHeaders('  ,  ,')).toBeUndefined();
  });
});
