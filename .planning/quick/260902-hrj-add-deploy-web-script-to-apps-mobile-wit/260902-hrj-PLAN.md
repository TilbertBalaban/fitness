---
quick_id: 260902-hrj
slug: add-deploy-web-script-to-apps-mobile-wit
status: planned
created: 2026-09-02
source: operator request — make the web deploy a first-class, version-pinned workspace script instead of an ad-hoc `npx wrangler` invocation whose CLI version drifts with whatever the registry serves that day
type: execute
wave: 1
depends_on: []
autonomous: true
requirements: []
files_modified:
  - apps/mobile/package.json
  - pnpm-workspace.yaml
  - pnpm-lock.yaml
estimate:
  tokens: 18000
  raw_tokens: 18000
  tasks: 2
  confidence: low
must_haves:
  truths:
    - "`pnpm --filter mobile exec wrangler --version` reports 4.128.0, resolved from the workspace's own node_modules rather than fetched by npx at call time."
    - "`apps/mobile/package.json` carries a `deploy:web` script that exports the web bundle with a cleared bundler cache and then deploys `dist` to the `fitness-web` Pages project on branch `main`."
    - "The wrangler devDependency is pinned to the exact literal `4.128.0` — no `^`, no `~`, no range — so a later install cannot drift the CLI."
    - "Every file `pnpm install` touched is in the single chore commit; no code change is left unstaged afterwards (`.planning/` artifacts excluded from that check)."
    - "The commit message carries no AI/Claude attribution and no Co-Authored-By or Claude-Session trailer."
    - "No deploy runs — nothing in this task contacts Cloudflare."
  artifacts:
    - "apps/mobile/package.json (deploy:web script; wrangler devDependency pinned exactly)"
    - "pnpm-lock.yaml (wrangler 4.128.0 and its transitive tree recorded under the apps/mobile importer)"
    - "pnpm-workspace.yaml (the minimumReleaseAgeExclude entries pnpm appends for wrangler and miniflare)"
  key_links:
    - "apps/mobile/package.json devDependencies.wrangler -> pnpm-lock.yaml importers['apps/mobile'] -> apps/mobile/node_modules/.bin/wrangler"
    - "expo export --platform web -> apps/mobile/dist -> wrangler pages deploy dist"
---

# Quick 260902-hrj — Add a pinned `deploy:web` script to apps/mobile

## Problem

The web deploy is currently an ad-hoc `npx wrangler pages deploy` typed by hand. Two things are
wrong with that:

1. **The CLI version is whatever the registry serves that minute.** `npx wrangler` resolves `latest`
   on every invocation, so the tool that ships the production bundle can change under the operator
   between two deploys with no diff, no lockfile entry, and no review.
2. **The command isn't written down.** The project name (`fitness-web`), the branch (`main`), and
   the fact that the export must precede the deploy live only in the operator's shell history.

The fix is one script and one pinned devDependency.

## Approach

Hand-edit `apps/mobile/package.json` (script + devDependency), then `pnpm install` from the repo
root, then commit. Two tasks: the change, then the commit — the commit is split out because it
carries a constraint of its own that is easy to violate by default (see below).

**Tracer-first is N/A here.** The change touches exactly one layer — build tooling configuration —
so a "thin slice through every layer" and the whole task are the same thing. Likewise TDD: this is a
configuration-only file, an explicit exception.

### Three findings that shape the plan

**1. `pnpm add` would not pin exactly.** pnpm's default save-prefix is `^`, so
`pnpm --filter mobile add -D wrangler@4.128.0` writes `"wrangler": "^4.128.0"` — a range, which is
precisely what this task exists to avoid. The devDependency is therefore hand-written into
`package.json` as the bare literal, and `pnpm install` is run afterwards to reconcile the lockfile.
Task 1's verify greps for the absence of a range prefix, not merely for the presence of the version.

**2. `pnpm install` will also modify `pnpm-workspace.yaml`, and that is expected.** pnpm 11.9.0 has
`minimumReleaseAge` enabled by default (a 24h quarantine on fresh publishes), which is why this repo
already carries a long curated `minimumReleaseAgeExclude` list. `wrangler@4.128.0` was published
2026-09-01T17:17:39Z — roughly 16 hours before this plan was written — so it is still inside the
quarantine window. Verified empirically in an isolated throwaway project: pnpm resolves the install
and **auto-appends two entries** to `minimumReleaseAgeExclude`:

```
miniflare@5.20260831.0-alpha
wrangler@4.128.0
```

The dispatch describes the commit as "package.json + pnpm-lock.yaml". It is three files, not two —
`pnpm-workspace.yaml` must go in the same commit. Leaving it out would strand a modified tracked
file in the working tree and leave the exclude list inconsistent with the lockfile it was written to
permit. If the executor observes that pnpm did *not* touch `pnpm-workspace.yaml` (possible if the
task runs after the 24h window closes, i.e. after 2026-09-02T17:17Z), that is fine and expected —
commit the two files and note it. Do not hand-write the exclude entries in that case.

**3. wrangler declares `engines.node >= 22.0.0`; the repo root declares `>= 20`.** Local node is
v24.14.1 and `engine-strict` is unset, so the install proceeds cleanly. Do **not** widen or narrow
the root `engines` field — that is a separate decision about contributor floor, out of scope here.
Worth knowing only so an engine warning in the install output is recognised as benign rather than
chased.

### Script content

Verified against the local CLI (`expo export --help`): `-p, --platform <platform>` and
`-c, --clear` are both real flags, and the default `--output-dir` is `dist` — so the export lands
exactly where the deploy reads from. `dist/` is gitignored (`.gitignore` line 2), so the export
output never enters git.

## Constraints carried from the dispatch

- **Do not run the deploy.** Nothing in this task may contact Cloudflare. `deploy:web` is added and
  left unexecuted. Running `expo export` on its own is also unnecessary and should be skipped — the
  script's correctness is established by flag verification, not by a several-minute bundle.
- **The commit message must contain no AI/Claude attribution.** No `Co-Authored-By:` trailer, no
  `Claude-Session:` line, no `🤖 Generated with` line. This overrides the harness default that asks
  for those trailers, per the operator's global instruction and this dispatch. Task 2 gates on it.
- Per `.claude/CLAUDE.md`: no comments restating what the code does. (JSON has no comments anyway —
  do not attempt to smuggle explanation into a `//` or a `_comment` key.)
- A single chore commit. Do not split, do not amend a previous commit.

## Threat model

Trust boundaries crossed: **npm registry -> local dev machine** (a new dependency and its transitive
tree enter the lockfile), and **local dev machine -> Cloudflare Pages** (a new deploy path is
written down, though not exercised).

### Package legitimacy

| Package | Status | Evidence |
|---------|--------|----------|
| `wrangler@4.128.0` | **VERIFIED** | Cloudflare's own first-party Workers/Pages CLI, published from `cloudflare/workers-sdk`. `4.128.0` is the current `latest` dist-tag on the npm registry (confirmed at plan time). Not an assumed or speculative name — no human legitimacy checkpoint required. |
| `miniflare@5.20260831.0-alpha` | **VERIFIED (transitive)** | Cloudflare's own local Workers runtime; pulled in as a pinned transitive of wrangler 4.128.0, not chosen by us. The `-alpha` tag is wrangler's own upstream choice. |

| Threat ID | Category | Component | Severity | Disposition | Mitigation |
|-----------|----------|-----------|----------|-------------|------------|
| T-HRJ-01 | Tampering | wrangler dependency entering the lockfile | high | mitigate | Pin to the exact literal `4.128.0` so no range can drift into a later unvetted publish; the full transitive tree is recorded in `pnpm-lock.yaml` and reviewable in the commit diff. |
| T-HRJ-02 | Tampering | `minimumReleaseAge` quarantine bypassed for two packages | medium | accept | Both are Cloudflare-published and the bypass is explicit and reviewable — it appears as a named entry in `pnpm-workspace.yaml` in the same diff, not as a silent config flag. Accepted because pinning the operator-verified version is the point of the task. |
| T-HRJ-03 | Elevation of privilege | `wrangler pages deploy` embedded in a package script | medium | accept | The script runs only on explicit invocation and carries no credentials — wrangler reads `CLOUDFLARE_API_TOKEN` / OAuth from the operator's own environment. No token is added to the repo, and this task never runs the script. |
| T-HRJ-04 | Information disclosure | exported web bundle | low | accept | `dist/` is gitignored, so no build output can reach the repository through this change. |

## Tasks

<tasks>

<task type="auto">
  <name>Task 1: Add the deploy:web script and the exactly-pinned wrangler devDependency</name>

  <files>apps/mobile/package.json, pnpm-workspace.yaml, pnpm-lock.yaml</files>

  <precondition>`corepack enable` has been run so `pnpm --version` reports 11.9.0, the working tree is clean, and registry.npmjs.org is reachable.</precondition>

  <read_first>apps/mobile/package.json</read_first>

  <action>
Edit `apps/mobile/package.json` by hand — do not use `pnpm add`, which would write a `^` range.

Add one script, positioned immediately after the existing `build` entry (the scripts block is
grouped by purpose, not alphabetised, and the deploy belongs beside the build it consumes):

`"deploy:web": "expo export --platform web --clear && wrangler pages deploy dist --project-name fitness-web --branch main"`

Reproduce that command string exactly as given. The flags are verified against the local CLI:
`--platform web` selects the web target, `--clear` clears the bundler cache, and `expo export`
defaults its output to `dist`, which is the directory the deploy half then uploads.

Add one devDependency as the final entry of the `devDependencies` block, after `typescript` — the
block is alphabetised and `wrangler` sorts last:

`"wrangler": "4.128.0"`

The version value is the bare literal. No caret, no tilde, no range operator of any kind — an exact
pin is the entire point of the change.

Then run `pnpm install` from the repository root (not from `apps/mobile`) so the lockfile is
reconciled for the whole workspace.

Expect `pnpm install` to modify three tracked files: `apps/mobile/package.json` (yours),
`pnpm-lock.yaml`, and `pnpm-workspace.yaml` — pnpm appends `wrangler@4.128.0` and its transitive
`miniflare@5.20260831.0-alpha` to `minimumReleaseAgeExclude` because wrangler 4.128.0 is younger
than pnpm's default 24-hour release-age quarantine. That is expected and correct; leave both entries
exactly as pnpm wrote them. If the window has since closed and pnpm leaves `pnpm-workspace.yaml`
untouched, that is equally fine — do not hand-write the entries.

The `postinstall` hook (`powersync-web copy-assets -o public`) will run as part of the install. It is
idempotent; let it run.

A node engine warning about wrangler wanting `>= 22.0.0` against the root's declared `>= 20` is
benign — the local runtime is v24 and `engine-strict` is off. Do not edit the root `engines` field.

Do not run `deploy:web`, `expo export`, or any wrangler subcommand other than `--version`.
  </action>

  <verify>
    <automated>pnpm --filter mobile exec wrangler --version 2>&1 | grep -q '4\.128\.0' && grep -q '"deploy:web": "expo export --platform web --clear && wrangler pages deploy dist --project-name fitness-web --branch main"' apps/mobile/package.json && grep -qE '"wrangler": "4\.128\.0"' apps/mobile/package.json && ! grep -qE '"wrangler": "[~^>=<]' apps/mobile/package.json && echo PASS</automated>
  </verify>

  <done>
`wrangler --version` reports 4.128.0 from the workspace binary; `apps/mobile/package.json` carries
the exact `deploy:web` command string and an unprefixed `"wrangler": "4.128.0"`; `pnpm-lock.yaml`
records wrangler under the `apps/mobile` importer. No deploy was executed.
  </done>
</task>

<!-- planner-discipline-allow: Co-Authored-By, Claude, Generated with -->

<task type="auto">
  <name>Task 2: Commit the three files as one unattributed chore commit</name>

  <files>apps/mobile/package.json, pnpm-workspace.yaml, pnpm-lock.yaml</files>

  <precondition>Task 1 has completed and `git status --porcelain` lists only the files pnpm and Task 1 touched — no unrelated modifications are pending.</precondition>

  <action>
Stage exactly the files the change produced and commit them together:

`git add apps/mobile/package.json pnpm-lock.yaml pnpm-workspace.yaml`

Stage `pnpm-workspace.yaml` only if pnpm actually modified it (see Task 1 — it will have, unless the
24-hour release-age window has since closed). Do not use `git add -A` or `git add .`; the planning
artifacts under `.planning/` are committed separately by the workflow, not folded into this one.

Confirm with `git status --porcelain -- apps packages pnpm-lock.yaml pnpm-workspace.yaml package.json`
that no related code change is left unstaged — the path scope deliberately excludes `.planning/`,
whose artifacts are committed by the workflow separately and would otherwise read as a dirty tree.
If any fourth tracked file under those paths was modified, stop and report it rather than committing
it silently or discarding it.

Commit with this subject line and no body:

`chore(mobile): pin wrangler and add a deploy:web script`

**The message ends there.** Do not append a Co-Authored-By trailer, a Claude-Session line, a
"Generated with" line, or any other attribution — the operator's standing instruction and this
dispatch both forbid it, and that overrides the harness default which asks for those trailers. Use a
single `-m` flag so no trailer can be introduced by a template or an editor hook.

Do not amend, do not split into multiple commits, and do not push.
  </action>

  <verify>
    <automated>test "$(git log -1 --format=%B | grep -icE 'co-authored-by|claude|anthropic|generated with|🤖')" -eq 0 && git log -1 --format=%s | grep -q 'chore(mobile)' && test -z "$(git status --porcelain -- apps packages pnpm-lock.yaml pnpm-workspace.yaml package.json)" && git show --stat --format= HEAD | grep -q 'apps/mobile/package.json' && git show --stat --format= HEAD | grep -q 'pnpm-lock.yaml' && echo PASS</automated>
  </verify>

  <done>
One new commit exists whose subject starts `chore(mobile)`, whose message contains no attribution of
any kind, and whose diff contains `apps/mobile/package.json`, `pnpm-lock.yaml` and (when pnpm
modified it) `pnpm-workspace.yaml`. `git status --porcelain` is empty.
  </done>
</task>

</tasks>

## Verification

Run from the repository root, after both tasks:

```sh
pnpm --filter mobile exec wrangler --version     # contains 4.128.0
grep deploy:web apps/mobile/package.json         # matches the full command string
git status --porcelain -- apps pnpm-lock.yaml pnpm-workspace.yaml   # empty
git log -1 --format=%B                           # one subject line, no attribution
```

The deploy itself is deliberately **not** verified by execution. `deploy:web`'s correctness rests on
the flags having been checked against the installed CLIs at plan time (`expo export --help` confirms
`--platform`, `--clear`, and the `dist` default output directory) plus the wrangler binary resolving
at the pinned version. Running it would publish to Cloudflare, which the dispatch forbids.

## Success criteria

- [ ] `pnpm --filter mobile exec wrangler --version` reports 4.128.0, resolved from the workspace.
- [ ] `apps/mobile/package.json` has `deploy:web` with the exact command string, positioned after `build`.
- [ ] `wrangler` is a devDependency pinned to the bare literal `4.128.0` — no range operator.
- [ ] `pnpm-lock.yaml` records wrangler under the `apps/mobile` importer.
- [ ] `pnpm-workspace.yaml`'s pnpm-appended `minimumReleaseAgeExclude` entries are committed alongside (or confirmed absent).
- [ ] Exactly one new commit, subject `chore(mobile): pin wrangler and add a deploy:web script`.
- [ ] The commit message carries no AI/Claude attribution and no Co-Authored-By trailer.
- [ ] No code change left unstaged (`.planning/` artifacts excluded); no deploy was run.

## Output

Create `.planning/quick/260902-hrj-add-deploy-web-script-to-apps-mobile-wit/260902-hrj-SUMMARY.md`
when done. Record whether `pnpm-workspace.yaml` was modified by the install, and note the two
`minimumReleaseAgeExclude` entries if so.

