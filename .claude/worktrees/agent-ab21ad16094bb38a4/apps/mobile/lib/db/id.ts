// A client-generated UUID (D-02) — not cryptographically random. This value is a sync identity,
// never a secret: a collision would surface as the server's per-row ownership re-check rejecting
// the op not_owner, not as silent data corruption. Kept dependency-free deliberately — expo-crypto
// would be the natural choice for randomUUID(), but adding a new package mid-task requires the
// package-legitimacy checkpoint (deviation Rule 3), which this task does not carry.
export function generateClientId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
