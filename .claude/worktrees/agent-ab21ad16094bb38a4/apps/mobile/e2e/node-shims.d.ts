// A minimal ambient shim for the one Node builtin sync.spec.ts needs (execFileSync, to drive
// `psql`/`docker` directly from the Node-side Playwright test process). Deliberately not
// `@types/node` — that package isn't a dependency of apps/mobile (tsconfig.json's `types: ["jest"]`
// scopes ambient globals on purpose, and adding a new dependency here would trip the
// package-legitimacy gate for something the runtime doesn't actually need: `node:child_process`
// resolves and works with zero packages under Node, this file only teaches the type checker its
// shape).
declare module 'node:child_process' {
  export function execFileSync(
    file: string,
    args?: string[],
    options?: { encoding?: 'utf8'; [key: string]: unknown },
  ): string;
}
