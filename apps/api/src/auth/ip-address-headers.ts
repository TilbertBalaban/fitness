// Better Auth rejects a forwarded header holding more than one IP unless trusted proxies are
// configured, so Render's multi-hop x-forwarded-for chain (client, Cloudflare, Render's own
// proxy) resolves to nothing. The list must be lowercase because the plain-object header path
// (as opposed to a Headers instance) is case-sensitive and Node lowercases incoming header names.
export function resolveIpAddressHeaders(
  raw: string | undefined = process.env.RATE_LIMIT_IP_HEADERS,
): string[] | undefined {
  if (!raw) return undefined;

  const headers = raw
    .split(',')
    .map((segment) => segment.trim().toLowerCase())
    .filter((segment) => segment.length > 0);

  return headers.length > 0 ? headers : undefined;
}
