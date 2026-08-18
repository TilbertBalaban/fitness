# Exercise Catalog Seed Dataset — License Record

This document is the record `docs/catalog-dataset-license.md`'s third `must_haves` prohibition
requires: nothing in the seeded catalog ships without its license terms having been read and
recorded here first. It also corrects the record on one point — see **Image licensing: corrected
finding** below — where a live re-fetch during this plan's execution found materially different,
more concrete information than what the Task 1 checkpoint decision was made against.

## Decision (Task 1, human-answered `checkpoint:decision`)

**Selected: `fedb-with-images`** — free-exercise-db including its images, vendored into the app
bundle. This was a live human decision, not auto-selected. Verbatim rationale accepted at the
time:

> Vendor free-exercise-db's images into the app bundle. Delivers EXER-03's static imagery and
> PROJECT.md's stated content model, and stays offline-true — no cache warming, no broken
> placeholder mid-workout. Cost: accepts an unresolved copyright question on the images
> specifically, and ~900 exercises × 2 images is real bundle weight that CONTEXT.md rates costly
> to unwind once shipped.

Concretely: **free-exercise-db is the sole source** — wger is NOT merged (see "wger — declined"
below). **Images ship in v1** — `image_urls` is populated (see "What this plan populates" below),
not left empty.

The rationale above characterized the image-copyright question as "an unresolved copyright
question" / "an open, unanswered upstream GitHub issue." Re-verification during this plan's Task 2
(see below) found the actual state of that question is more concrete — and less favorable — than
that characterization. This is recorded plainly below, not narrowed or hidden, per this plan's own
instruction not to re-litigate the human's decision but to document accurately.

### Re-confirmed after the corrected finding (2026-08-18)

The corrected finding was put back to the human before any image binary was vendored, with the
option to drop images from v1 at no cost. **The decision was re-confirmed: keep images, ship
anyway** — on the explicit ground that *this project is not for commercial use for now*.

That ground matters, because it is exactly the condition the upstream statement is scoped to:
`wrkout/exercises.json`'s `CONTRIBUTING.md` advises against use **in commercial projects**. A
personal, non-distributed training app is outside the case upstream warns about.

**This makes the decision contingent, not settled.** If this project is ever distributed
commercially — sold, monetized, or published to an app store as a paid or ad-supported product —
the image-licensing question must be reopened before that happens. `.planning/WINDOWS.md` #35 is
deliberately left **open** rather than waived so `/gsd-ship` keeps surfacing it.

Not legal advice: the upstream note is a stated position by a third party, not an adjudication of
the underlying rights.

## Source

- **Dataset:** `yuhonas/free-exercise-db` (GitHub)
- **File fetched:** `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json`
- **Fetch date:** 2026-08-18
- **Record count:** 873 exercises
- **Committed to:** `apps/api/src/seed/data/free-exercise-db.source.json`
- **SHA-256 of the committed file:** `d68a817484964095e6af0be2cdcbcc2c2504168d1d190c7d5c725ce52f3ae1f4`

## Text/JSON data license

**Verified directly** by fetching `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/README.md`
on 2026-08-18 (32 lines) and grepping the full text for `licen|copyright|attribut`. The only
license signal found is the top-of-file badge:

> ## Free Exercise DB 💪 &nbsp; [...] [![License: Unlicense](https://img.shields.io/badge/license-Unlicense-blue.svg)](http://unlicense.org/)
>
> Open Public Domain Exercise Dataset in `JSON` format, 800+ exercises with a browsable public
> searchable frontend

No per-exercise licensing caveat text was found anywhere in the README. This directly
**contradicts** this repository's own `.claude/CLAUDE.md`, which states free-exercise-db's
"README explicitly warns only exercises with a 'relatively free' license were included and that
per-exercise license terms must still be honored." That claim could not be reproduced against the
live source and should be treated as stale — see "What was NOT established" below for what the
discrepancy's most likely explanation is.

**What was NOT established:**
- A root `LICENSE` file **404s** at `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/LICENSE`
  — no separate license file exists at the conventional path.
- The GitHub repo API's own `license` metadata field for this repo returned no usable value in
  this session (a raw schema-shape response was returned instead of live data on one query
  attempt — treated as inconclusive/rate-limiting-adjacent, not as proof of absence).
- Whether an older README revision, a different branch, or the individual per-exercise JSON files
  (not sampled one-by-one) carry different terms was not checked — the live `main` branch README
  and the aggregated `dist/exercises.json` file are what this record covers.

**Conclusion for text/metadata (name, muscles, equipment, instructions, cues):** Unlicense is
public-domain-equivalent — no attribution obligation, no ShareAlike obligation, no restriction on
commercial use. This is the strongest possible outcome for the text/data half of the dataset, and
is treated as safe to seed without any accompanying attribution notice in the app.

## Image licensing: corrected finding

The Task 1 decision was made against the characterization "an open, unanswered upstream GitHub
issue asking whether the repo's images carry different terms than its JSON text data." During
Task 2 of this plan, that characterization was re-verified directly and found to be **stale in a
materially more concerning direction** — not merely unresolved, but answered, and answered
unfavorably for commercial/redistributed use.

**What was verified, directly, via the GitHub API and raw file fetches on 2026-08-18:**

1. `yuhonas/free-exercise-db` issue [#2 "License of Images?"](https://github.com/yuhonas/free-exercise-db/issues/2)
   is **closed** (`state_reason: completed`), not open. The maintainer's own reply (2023-06-27):

   > "this project is a fork/reworking of exercises.json [...] the derived project is licensed
   > using Unlicense license though I actually have no idea where the images are from or if they
   > are royalty free so usage would be at your own risk (i will update the README to make this
   > clearer)"

   A later comment on the same issue (2025-02-20, a third-party contributor) states: "It seems
   that the images aren't royalty free sadly," linking to `wrkout/exercises.json#305`.

2. `yuhonas/free-exercise-db` issue [#12 "Enquiry regarding the license status of the images"](https://github.com/yuhonas/free-exercise-db/issues/12)
   is also **closed** (`state_reason: completed`). The maintainer's reply (2024-04-14) points back
   to issue #2 and confirms: "in regards to image licensing it has come up before [...] I _still_
   need to add that to the README."

3. `free-exercise-db` is itself a fork/restructuring of `wrkout/exercises.json`. That upstream
   repository's own `CONTRIBUTING.md` — fetched directly at
   `https://raw.githubusercontent.com/wrkout/exercises.json/master/CONTRIBUTING.md` on
   2026-08-18 — contains an explicit statement under "Exercise Images" (quoted verbatim,
   including the source's own spelling):

   > "Currently all exercises have two images, these have been scrapped off the internet,
   > therefore l do not own the copy right for these images and would advise against using them
   > in comercial projects."

**This is the accurate, current state of the image-license question: it is not an open,
unanswered question.** It is an answered one, and the answer — from the dataset's own upstream
maintainer, in the upstream project's own contribution guidelines — is that the images were
scraped without a documented source, no one in this dataset's maintenance chain owns copyright on
them, and commercial use is explicitly discouraged.

**What this does and does not change:** per this plan's explicit instruction, this finding does
not re-litigate or narrow the human's `fedb-with-images` decision — that decision was made
knowingly accepting an image-copyright risk, and this plan implements it as directed (`image_urls`
populated below, no silent fallback to a text-only seed). What changes is the fidelity of the risk
being accepted: the risk is now a documented admission from the image source, not an open
question. **This is flagged as an open `unmet-truth` entry in `.planning/WINDOWS.md` and should be
weighed again, with this corrected information, before `/gsd-ship`** — the original decision's own
rationale explicitly named the bundle-size half of this call as "costly to unwind once shipped";
the same is true of shipping app-bundled images now confirmed scraped without ownership.

## wger — declined

Not merged, per the Task 1 decision. wger's CC-BY-SA 4.0 license's ShareAlike clause would attach
permanently to the merged dataset and everything derived from it; free-exercise-db's 873 exercises
already exceed the phase's normalized-catalog floor (700) on its own, so the obligation would have
bought coverage this dataset doesn't need at a permanent licensing cost. No wger data — exercises,
muscle-taxonomy cross-checks, or metadata — appears anywhere in this catalog.

## Attribution

**Text/JSON data (Unlicense):** no attribution required or rendered anywhere in the app.

**Images:** given the corrected finding above, no attribution is possible even if desired — the
upstream project itself does not know the original source of the images well enough to attribute
them. No attribution text is rendered for images; this is a limitation of the source material, not
an omission on this project's part.

## What this plan populates (and what it does not)

This plan (`03-04`) is normalization only — it does not download or vendor any image binary. Its
declared file scope (`apps/api/src/seed/**`, `docs/catalog-dataset-license.md`) does not include
`apps/mobile/assets/**`. Per the `fedb-with-images` decision, `catalog-normalized.json`'s
`image_urls` field is populated with the **raw, resolvable GitHub URLs** to each exercise's source
images (e.g. `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/<id>/0.jpg`),
verified live-resolvable during this plan (`HTTP 200`, `content-type: image/jpeg`) — not left
empty, satisfying the decision's "images ship in v1" requirement at the artifact level.

**Actually downloading and bundling those images into the app** so they are available offline
(not fetched at runtime, per the decision's own offline-true requirement) is explicitly **out of
this plan's scope** and is the responsibility of the plan that builds "the bundled mobile
snapshot" referenced throughout this phase's plans (03-05, per `03-04-PLAN.md`'s own objective:
"produce the single artifact both the Postgres seed (03-05) and the bundled mobile snapshot
(03-05) read from"). Until that vendoring step runs, `image_urls` pointing at a live GitHub raw
URL is metadata describing where to fetch the images from, not yet a bundled, offline-available
asset — 03-05 must not treat a populated `image_urls` array as proof the offline requirement is
already satisfied.
