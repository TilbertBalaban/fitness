export function resolveWebOrigins(): string[] {
  return (process.env.WEB_ORIGINS ?? 'http://localhost:8081')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}
