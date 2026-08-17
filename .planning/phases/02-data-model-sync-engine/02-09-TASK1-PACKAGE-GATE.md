# 02-09 Task 1 Verification Record: Package Legitimacy Gate

**Status:** Resolved — **approved**
**Gate:** `blocking-human` (never auto-approvable)
**Decided by:** Human (the user), via an interactive decision prompt presented by the orchestrator. Auto-mode was not used and does not apply to this gate.

## Outcome

`@playwright/test@1.62.1` is cleared for install as a devDependency of `apps/mobile`, chromium project only.

## Evidence gathered (executor, via `npm view` against the live registry, re-verified independently of the plan-time snapshot)

| Field | Value |
|---|---|
| Latest version | `1.62.1` |
| First published (`time.created`) | `2020-09-24T05:44:34.469Z` |
| Last published (`time.modified`) | `2026-08-17T05:34:53.830Z` |
| Total published versions | 3326 |
| Repository | `git+https://github.com/microsoft/playwright.git` |
| Maintainers | `pavelfeldman`, `yurys`, `dgozman-ms`, `playwright-bot@playwright-npm-bot@microsoft.com` |

Every field above matches `02-09-PLAN.md`'s plan-time evidence table exactly, including the last-published date landing on the same day this checkpoint was resolved — Microsoft ships to this package continuously.

## Evidence gathered (orchestrator, via `api.npmjs.org`, out-of-band)

The executor's sandboxed network returned a schema stub (not live data) for `https://api.npmjs.org/downloads/point/...` — the identical limitation `02-01-TASK2-PACKAGE-GATE.md` recorded for the same endpoint. The orchestrator closed this gap:

| Field | Value | Source |
|---|---|---|
| Weekly downloads | 37,489,737 | `https://api.npmjs.org/downloads/point/last-week/@playwright/test` |
| Measurement window | 2026-08-09 → 2026-08-15 | same response |
| Package field in response | `@playwright/test` | same response |

This download count was retrieved by the orchestrator, not independently confirmed by the executor — attributed accurately per the orchestrator's instruction. 37.5M weekly downloads is two orders of magnitude beyond slopsquat territory and is consistent with `@playwright/test`'s position as one of the most widely adopted browser-automation packages in the npm ecosystem.

## Caveats recorded for auditability

None remaining. The one gap flagged at checkpoint time (weekly download count unconfirmable from the executor's sandbox) is now closed by the orchestrator's out-of-band evidence above. No adverse signal was found in any field checked — version history spans six continuous years, the repository and maintainer identities match the plan's expectations, and the download count is high enough to rule out slopsquatting.

## Decision

The human reviewed the full evidence table above (re-verified registry fields + the orchestrator-sourced download count) and approved `adopt-playwright`. Task 2 (database-injection seam) and Task 3 (browser-driven durability tracer) proceed.
