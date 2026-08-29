---
name: gsd-start
description: Initialize once and walk away — runs every remaining phase (plan→execute→verify) with only UI/UX decisions surfaced
argument-hint: "[--from N] [--to N] [--all-checkpoints] [--plan-only]"
effort: max
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
  - Agent
  - Skill
requires: [cleanup, phase, progress]
---
<objective>
One orchestrator that drives the remaining milestone phases end to end so the user only has to
initialize. Each phase runs the full GSD fan-out — researcher, pattern-mapper, planner, plan-checker,
then wave-parallel executors in isolated worktrees, then the verifier.

This is `/gsd-autonomous` plus a preflight and four guardrails that were learned by running it and
watching it go wrong. The guardrails are the reason this command exists; do not skip them.

**Creates/Updates:** `.planning/STATE.md`, `.planning/ROADMAP.md`, and per-phase artifacts
(CONTEXT.md, RESEARCH.md, PATTERNS.md, VALIDATION.md, PLANs, SUMMARYs, VERIFICATION.md).
</objective>

<execution_context>
@/Users/tilbertbalaban/work/fitness/.claude/gsd-core/workflows/autonomous.md
@/Users/tilbertbalaban/work/fitness/.claude/gsd-core/references/ui-brand.md
</execution_context>

<context>
$ARGUMENTS

Flags:
- `--from N` / `--to N` — override the phase range instead of asking.
- `--all-checkpoints` — surface every checkpoint, not just UI/UX ones.
- `--plan-only` — stop after each phase's plans pass the checker; do not execute.

State, phase list, and config are resolved inside the workflow via `gsd-tools query
init.milestone-op` and `init.manager`. No upfront context loading needed.
</context>

<process>

## 1. Preflight — resolve the real range before starting anything

```bash
gsd-tools query init.milestone-op
gsd-tools query init.manager
```

Build the phase table from `init.manager`'s `phases[]`. For each phase report `number`, `name`,
`disk_status`, `verification_status`, `phase_complete`.

**Three things the default queue gets wrong — handle each explicitly:**

1. **Silently-incomplete earlier phases.** The autonomous queue keeps any phase where
   `phase_complete !== true`, which includes phases sitting at `gaps_found` or `human_needed` that
   the user believes are done. Never absorb these into the run without saying so. List them by
   number and state, then let the range decision account for them.

2. **Backlog phases.** Phases numbered `999.x` are manual verification sweeps under the ROADMAP's
   `## Backlog` heading. They are not autonomous work. Always exclude them — set `--to` to the last
   real phase rather than letting the queue run off the end.

3. **A bare phase number is not a flag.** `/gsd-start 7` must be read as `--from 7`. The underlying
   workflow only parses `--from`/`--to`/`--only`; a positional `7` is ignored and the run silently
   starts at the first incomplete phase, which may be much earlier.

Unless `--from`/`--to` were passed, ask **one** `AskUserQuestion` with the resolved default as the
recommended option: the range to run, and whether checkpoints auto-approve. Then stop asking about
scope for the rest of the run.

## 2. Checkpoint policy

Default (no `--all-checkpoints`): **auto-approve technical gates, surface UI/UX decisions.**

- Auto-approve: research gate, plan-checker iterations, coverage gates, security threat-model
  banners, schema/drift gates, gap-analysis reports.
- Surface via `AskUserQuestion`: anything that changes what the user sees or how the product
  behaves — visual layout, interaction model, copy, numbering/labelling, information architecture.

Ask UI/UX questions **before** spawning the planner, not after. They change acceptance criteria
across every plan in the phase, and re-planning to absorb a late answer is far more expensive than
a 30-second question. Research agents routinely surface these as "Open Questions" — read that
section and triage it rather than letting the planner guess.

Record every answer into the phase's `CONTEXT.md` `<decisions>` block as a new `D-NN` entry before
planning, so the decision-coverage gate can see it and executors inherit it.

## 3. Per phase: plan → execute → verify

Run the standard chain, skipping any step whose artifact already exists:

```
Skill(skill="gsd-plan-phase",    args="{N}")
Skill(skill="gsd-execute-phase", args="{N} --no-transition")
```

Then route on `gsd-tools query verification.status "{phase_dir}" --pick status` exactly as
`autonomous.md` specifies. With `--plan-only`, stop after the plan step.

### GUARDRAIL A — commit every planning artifact before dispatching any executor

Worktree executors fork from the orchestrator's `HEAD`. **Anything uncommitted is invisible to
them**, and they will not tell you it was missing — they quietly fall back to a lesser source and
report success.

This has already burned a real run: `07-PATTERNS.md` was written by the pattern-mapper but never
committed, so the first executor never saw the pattern map at all.

Before the first `Agent()` dispatch of a phase:

```bash
git status --porcelain .planning/
```

Every `??` or ` M` under the phase directory must be committed first. Treat a non-empty result as
blocking, not advisory.

### GUARDRAIL B — verify each executor's reported `expected_base`

Executors sometimes report their **own final commit** as `expected_base` instead of the fork point.
Recording that value poisons `worktree.cleanup-wave`'s validation. Always trust the SHA captured at
dispatch and confirm it:

```bash
git merge-base "$EXPECTED_BRANCH" "worktree-agent-<id>"   # must equal the dispatch-time SHA
```

Record the verified value with `gsd-tools query worktree.record-agent`, not the executor's claim.

### GUARDRAIL C — give every executor the fresh-worktree bootstrap

A fresh worktree has no `node_modules` and no built workspace packages. Failures from that look
exactly like real code errors — missing modules, unresolved `@fitness/*` imports, `turbo` not
found — and executors waste entire runs "fixing" them.

Embed this in every executor prompt:

> This is a fresh git worktree. Before running turbo, typecheck, or any test: `corepack enable`,
> then `pnpm install` at the repo root, then build the workspace packages once. Failures from
> skipping these look like real code errors but are not. Bootstrap first, then trust the output.

### GUARDRAIL D — re-check intra-wave file overlap against the live index

`gsd-tools query phase-plan-index` regroups waves from the dependency graph, so its grouping can
differ from the `wave:` value in plan frontmatter — plans the planner separated may end up in the
same wave. Recompute the `files_modified` pairwise overlap from the index before every wave and
serialize that wave if any two plans share a file. Do not rely on the planner's assurance.

## 4. Between waves

Merge via `worktree.cleanup-wave` (manifest-scoped only — never broad worktree discovery), then run
the post-merge build and test gates. **Only update ROADMAP/STATE tracking when the tests pass**; a
failing or timed-out suite leaves the plans in-progress.

Report executor deviations rather than passing them through. When an executor edits a file outside
its plan's `files_modified` (usually under the blocking-typecheck rule), check whether any sibling
plan in the same wave claims that file before merging.

## 5. Lifecycle

After the last in-range phase completes, follow `autonomous.md`'s lifecycle: audit → complete →
cleanup. **Skip the lifecycle entirely when `--to` stopped the run short of the final phase**, or
when any phase outside the range is still incomplete — a milestone with unfinished phases must not
be archived.

## 6. Report honestly

At the end, state plainly: which phases completed and verified, which were skipped and why, which
manual verifications were deferred to the end-of-phase sweep, and any phase left at `gaps_found` or
`human_needed`. A deferred check is not a passed check.

</process>

<notes>
- Runs in the main loop, not a detached background agent. A backgrounded orchestrator cannot reach
  the user with `AskUserQuestion`, so it would have to auto-answer the UI/UX decisions this command
  exists to surface.
- Resuming a stopped worktree executor loses its worktree. Re-dispatch it fresh with the decision
  baked into the prompt instead of trying to continue it.
- Expect long silent stretches. A phase's planner alone can run 20+ minutes; that is the subagent
  working, not a freeze.
</notes>
