# 02-08 Task 1 Decision: Where the sync service runs

**Status:** Resolved
**Decided by:** Human, via interactive checkpoint response (prior executor session)
**Selection:** `self-host`

## Decision

Run the PowerSync Service **self-hosted**, alongside this project's existing dev services in
`docker-compose.dev.yml`. The `cloud` (PowerSync Cloud free tier) and `defer` (carry the pull leg
forward without a running service) options were presented and explicitly declined.

## Context carried forward from the plan

`02-08-PLAN.md`'s Task 1 framed this as a real three-way choice, not a formality: at the time it
was first reached, this machine had no container runtime at all, making `self-host` the option
that adds a hard new prerequisite to developing this project. `cloud` avoids that but needs an
account and a tunnel to reach this machine's local-only Postgres, with free-tier instances
deprovisioning after seven idle days. `defer` was explicitly framed as *not* a failure outcome —
PLAT-04's merge semantics are already proven at the protocol level by plan 02-03's two-device
test, so deferring would only leave the transport unbuilt, not the correctness unproven.

A prior executor session reached this checkpoint, probed the machine (confirmed no `docker` on
`PATH`), and returned control without committing anything. The human then selected `self-host`
directly, outside of auto-mode. That session's worktree was discarded before any code was
written — this plan starts from a clean base with the decision already made, not resumed
mid-execution.

## What changed between the decision and this execution

The blocker that made `self-host` costly — no container runtime — is gone. The orchestrator
installed and verified **Colima** (not Docker Desktop) plus the `docker`/`docker compose` CLIs
before this plan resumed:

- `colima` + Docker CLI 29.7.2 + `docker-compose` 5.4.0, via Homebrew, VM running on
  `macOS Virtualization.Framework` (aarch64, `virtiofs` mounts).
- Docker server reachable (client 29.7.2 / server 29.5.2); `docker run --rm hello-world`
  succeeded before this plan began writing any config.
- No privileged helper, no GUI, no `sudo` prompt anywhere in the toolchain — Colima provides the
  same Docker API surface Docker Desktop's first-launch flow would have needed a password for.

This resolves the plan's stated "hard prerequisite" cost of `self-host` without changing the
tradeoff's shape: no account, no tunnel, and the local Postgres this project already runs stays
local (`02-RESEARCH.md`'s confirmation that the service needs Postgres only, not Postgres+MongoDB,
still holds — see `ops/powersync/powersync.yaml`).

## Options considered

| Option | Pros | Cons |
|---|---|---|
| **`self-host`** (selected) | No account, no third party, no tunnel; local Postgres stays local; the service joins `docker-compose.dev.yml` next to Postgres and Mailpit; nothing deprovisions when the project sits idle. | Requires a container runtime (now resolved via Colima) and reconfiguring the local Postgres for logical replication with a dedicated replication role (done in Task 2 via `psql`/`brew services`, no hand-edited files). |
| `cloud` (declined) | No container runtime or local service process to operate; the same instance works from any machine. | Needs an account and a tunnel from the hosted service back to this machine's local-only Postgres; free-tier instances deprovision after seven idle days — a poor fit for intermittent solo work. |
| `defer` (declined) | Ships everything that doesn't need external infrastructure, with PLAT-03/PLAT-04 still proven at the protocol level via plan 02-03. | Leaves PLAT-03/PLAT-04 undemonstrable end-to-end on two real clients; Phase 5's in-gym loop would dogfood against push-only sync. No longer the right tradeoff once the toolchain blocker was resolved for free. |

## Consequence

Task 2 proceeds on the self-hosted branch: a `powersync` service is added to
`docker-compose.dev.yml`, configured from `ops/powersync/powersync.yaml` with Postgres as its own
bucket storage (no MongoDB), replicating from the same native Homebrew `postgresql@18` instance
`apps/api` already writes to (reached via `host.docker.internal`, not the separate `postgres`
service also declared in `docker-compose.dev.yml` — see `02-08-SUMMARY.md`'s "Two Postgres
instances" section for why). The service was verified running against real replicated data before
this plan's tasks were considered done, not merely configured and left unverified.
