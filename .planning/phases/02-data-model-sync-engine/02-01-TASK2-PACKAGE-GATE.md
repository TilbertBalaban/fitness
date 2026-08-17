# 02-01 Task 2 Verification Record: Package Legitimacy Gate

**Status:** Resolved — **approved**
**Gate:** `blocking-human` (never auto-approvable)
**Decided by:** Human, via interactive checkpoint response, after reviewing the executor's registry evidence

## Outcome

All four SUS-verdict ("too-new") packages were cleared for install:

- `@powersync/react-native`
- `@powersync/web`
- `@op-engineering/op-sqlite`
- `@powersync/drizzle-driver`

## Evidence gathered (executor, via `npm view` against the live registry)

| Package | Latest version | Latest publish date | First published | Total versions | Repository | Publisher |
|---|---|---|---|---|---|---|
| `@powersync/react-native` | 2.1.0 | 2026-08-13 | 2024-04-24 | 228 | `powersync-ja/powersync-js` | JourneyApps (`journeyapps-platform`, `journeyapps-admin`) |
| `@powersync/web` | 2.2.0 | 2026-08-13 | 2024-04-24 | 228 | `powersync-ja/powersync-js` | JourneyApps |
| `@op-engineering/op-sqlite` | 18.0.0 | 2026-08-14 | 2023-11-06 | 208 | `OP-Engineering/op-sqlite` | `ospfranco` (individual account) |
| `@powersync/drizzle-driver` | 0.8.0 | 2026-07-21 | 2024-11-07 | 38 | `powersync-ja/powersync-js` | JourneyApps |

All four repository URLs and publisher identities matched what `02-01-PLAN.md` Task 2 expected. Every
package's version history spans well over a year of continuous releases, supporting the researcher's
reading that the SUS "too-new" verdict is a false positive triggered by the latest version's recent
publish date, not the package's actual age.

## Evidence gathered (orchestrator, via `api.npmjs.org`, window 2026-08-09 → 2026-08-15)

The executor could not reach `api.npmjs.org` directly (sandboxed network access returned schema
stubs rather than live data, and no WebFetch/WebSearch tool was available in that session). The
orchestrator closed this gap:

| Package | Weekly downloads | Plan's expectation | Delta |
|---|---|---|---|
| `@powersync/react-native` | 28,252 | ~35k | ~19% under |
| `@powersync/web` | 54,545 | ~70k | ~22% under |
| `@op-engineering/op-sqlite` | 127,192 | ~130k | ~2% under, in range |
| `@powersync/drizzle-driver` | 11,872 | ~13k | ~9% under, in range |

## Caveats recorded for auditability (per human's explicit direction — not a silent clean pass)

1. **Both PowerSync-published packages' download counts sit roughly 20% under the plan's rounded
   estimates.** `@powersync/react-native` (28,252 vs. ~35k) and `@powersync/web` (54,545 vs. ~70k)
   are still tens of thousands of weekly downloads — well outside slopsquat territory — but the gap
   from the plan's figures is real and worth carrying forward. `02-RESEARCH.md`'s estimates were
   captured 2026-08-05/10; the discrepancy is consistent with normal week-to-week download variance
   over that window rather than a legitimacy signal, but no independent confirmation of that
   explanation was sought.
2. **`@op-engineering/op-sqlite` is maintained under an individual npm account (`ospfranco`) rather
   than an organization account.** This is consistent with the package's own GitHub repository
   (`OP-Engineering/op-sqlite`), where `ospfranco` is the recognized primary maintainer, and is not
   unusual for actively-maintained OSS native modules. It differs from the org-account pattern of the
   three PowerSync-published packages, which is why it is called out explicitly rather than folded
   into a generic "looks fine" note.

The human reviewed both caveats alongside the full evidence table above and approved all four
packages for install. Task 3 proceeds.
