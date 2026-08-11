export const CLIENT_VERSION_HEADER = 'X-Client-Version';
export const MIN_CLIENT_VERSION_REASON = 'client_version_below_minimum';

const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

export function compareSemver(a: string, b: string): number {
  if (!SEMVER_PATTERN.test(a) || !SEMVER_PATTERN.test(b)) {
    throw new Error(`compareSemver: not a valid semver string ("${a}", "${b}")`);
  }
  const [aMajor, aMinor, aPatch] = a.split('.').map(Number);
  const [bMajor, bMinor, bPatch] = b.split('.').map(Number);
  if (aMajor !== bMajor) return aMajor - bMajor;
  if (aMinor !== bMinor) return aMinor - bMinor;
  return aPatch - bPatch;
}

export function resolveMinClientVersion(): string {
  const raw = process.env.MIN_CLIENT_VERSION;
  return raw && SEMVER_PATTERN.test(raw) ? raw : '0.0.0';
}
