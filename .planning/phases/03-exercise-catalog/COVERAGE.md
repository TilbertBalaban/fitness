# API Coverage — external exercise data sources

> Full coverage by default. Opt-outs are explicit, reasoned decisions.

**Detector:** `api-coverage.cjs --json` returned `detected: true`. The literal signal it
matched (`"…no Android SDK on this machine…"`) is a false positive — that sentence is an
environment constraint, not an integration. Re-reading the phase scope confirms a *genuine*
external-data integration nonetheless: this phase ingests the **free-exercise-db** dataset
(and evaluates **wger**) as its seed source. A matrix is therefore produced rather than a
`No external API integration` declaration.

**Scope note:** these are *build-time* data-source integrations. Neither source is a runtime
dependency of the shipped app — the normalized output is a committed artifact
(`apps/api/src/seed/data/catalog-normalized.json`). The only runtime HTTP surface this phase
adds is the project's **own** `GET /v1/catalog/version` / `GET /v1/catalog/download`, which is
first-party and out of scope for this matrix.

**Decision is provisional on `03-04` task 1.** That `checkpoint:decision` is where the seed
source and its licensing commitment are locked. If the developer selects an option other than
"free-exercise-db only", this file is regenerated in the same task.

---

## Source A — free-exercise-db (`yuhonas/free-exercise-db`)

Capability surface = the fields the dataset exposes per exercise record (per `schema.json`,
fetched 2026-08-18), plus its image assets.

| capability | decision | reason |
|---|---|---|
| `id` | INTEGRATE | |
| `name` | INTEGRATE | |
| `aliases` (derived) | INTEGRATE | |
| `primaryMuscles` | INTEGRATE | |
| `secondaryMuscles` | INTEGRATE | |
| `equipment` | INTEGRATE | |
| `category` | INTEGRATE | |
| `force` | INTEGRATE | feeds `movement_pattern` inference |
| `mechanic` | INTEGRATE | feeds `movement_pattern` and `load_type` inference |
| `instructions` | INTEGRATE | |
| `images` | OPT-OUT | image copyright is an open, unanswered upstream question (`yuhonas/free-exercise-db` issue 13). `image_urls` stays empty in v1 and the UI renders the 4:3 placeholder tile contract; revisit when the upstream question is answered. Locked at `03-04` task 1. |
| `level` | OPT-OUT | no column and no requirement — EXER-01..10 never reference difficulty. Tracked for a later phase if a difficulty filter is ever requested. |

## Source B — wger REST API (`wger.de/api/v2`)

Evaluated and **wholly opted out**. Each capability is re-decided from the full-coverage
baseline rather than inherited from Source A's decisions.

| capability | decision | reason |
|---|---|---|
| `GET /exercise` | OPT-OUT | CC-BY-SA 4.0 ShareAlike obligates the merged dataset to carry the same license permanently; free-exercise-db alone (800+) meets the ~900 target, so the obligation buys nothing. |
| `GET /exerciseinfo` | OPT-OUT | same ShareAlike reason |
| `GET /exercisebaseinfo` | OPT-OUT | same ShareAlike reason |
| `GET /muscle` | OPT-OUT | canonical muscle taxonomy is defined in-repo (`packages/api-contracts/src/catalog.ts`), not imported |
| `GET /equipment` | OPT-OUT | canonical equipment vocabulary is defined in-repo |
| `GET /exercisecategory` | OPT-OUT | canonical movement-pattern vocabulary is defined in-repo |
| `GET /exerciseimage` | OPT-OUT | images are out of scope for v1 (see Source A `images`) |
| `GET /exercisecomment` | OPT-OUT | no column and no requirement |
| `GET /variation` | OPT-OUT | `variation_of_id` is derived in normalization from name families (D-03), not imported |
| `GET /language` | OPT-OUT | v1 is English-only; no i18n requirement in EXER-01..10 |
| write endpoints (`POST`/`PATCH`/`DELETE` on any of the above) | OPT-OUT | this project never writes upstream; the integration is read-only by construction |
