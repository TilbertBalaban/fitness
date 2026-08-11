# API Coverage — Phase 1: Cross-Platform Foundation

No external API integration: this phase builds and consumes only this project's own NestJS API, and its
third-party dependencies (Better Auth, Drizzle, Expo Router, NativeWind, nodemailer) are self-hosted
libraries linked into the build rather than remote services with a capability surface to enumerate — the
one network egress, SMTP, terminates at a local catcher in development and at an operator-chosen host in
deployment, behind a single project-owned `MailerPort` with exactly one operation.

> The deterministic detector run at plan time over the phase scope returned `{"detected": false}`. This
> declaration is recorded so the seal-time re-run — which also scans the PLAN.md bodies, where words like
> "endpoint" and "integration" legitimately appear — resolves against a reasoned statement rather than
> blocking on a false positive.

Re-run the coverage decision if a later phase adds a genuine third-party service integration (a hosted
email provider's REST API rather than plain SMTP, an analytics service, a payment processor, or PowerSync
Cloud in place of the self-hosted service).
