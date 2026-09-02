---
quick_id: 260902-ji2
status: complete
commit: 8ae4286
---

# Summary: Build @fitness/* workspace packages on EAS before Metro bundles

Added `eas-build-post-install` to `apps/mobile/package.json`:
`pnpm --filter="mobile^..." run build`. EAS runs it after `pnpm install`, so the six
`packages/*` `dist/` outputs exist before `expo export:embed` resolves `@fitness/*`.

Verified locally: removed every `packages/*/dist`, ran the filter, all six rebuilt in
topological order (api-contracts first, program-generator last).

Not yet verified on EAS itself; the next `eas build --platform android --profile preview`
run is the real check.
