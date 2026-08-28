---
status: complete
phase: 06-gym-profiles-plate-math
source: [06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md, 06-04-SUMMARY.md, 06-05-SUMMARY.md, 06-06-SUMMARY.md, 06-07-SUMMARY.md, 06-08-SUMMARY.md]
started: 2026-08-28T00:00:00Z
updated: 2026-08-28T00:00:00Z
---

## Current Test

[testing complete — 30 auto-covered by passing tests, 5 human checkpoints skipped at user request]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running dev server / API. Clear ephemeral state (local SQLite/IndexedDB store, temp DBs, caches). Start the app and the NestJS API from scratch. Both boot without errors, the equipment-profile schema/migration applies cleanly, and a first workout screen load resolves live data (the seeded "My Gym" profile appears and the plate band renders).
result: skipped
reason: "User skipped: verifications requiring manual human interaction"

### 2. Plate strip renders in the reserved band
expected: On the workout screen, type a loadable barbell weight on the keypad. The per-side plate stack renders inside Phase 5's reserved 40px band, and the keypad digit grid does not shift or move.
result: skipped
reason: "User skipped: verifications requiring manual human interaction"
coverage_id: 06-01-D2

### 3. Gym Profiles click-through from the Profile tab
expected: From the Profile tab, the Gym Profiles row names the active gym and opens the list. You can see every configured gym, create a new one, set active, edit, duplicate, archive and restore — with archived gyms in a collapsed trailing section and the active gym pinned first with accent styling.
result: skipped
reason: "User skipped: verifications requiring manual human interaction"
coverage_id: 06-03-D1

### 4. Create a gym in lb and reopen it
expected: On the web target, create a gym in lb, add 45 and 25 lb plates with two pairs each, add a machine with a 20-200 stack in 10 steps, save, then reopen it — every value reads back exactly as typed, and the plate count stepper refuses to go below zero.
result: skipped
reason: "User skipped: verifications requiring manual human interaction"
coverage_id: 06-04-D7

### 5. Switch Gym mid-session
expected: The session menu shows Switch Gym between Session Note and Discard, with Discard last and destructively styled. Selecting it opens the sheet with no confirmation. Tapping a non-active gym restamps the session and dismisses immediately; the already-active row dismisses without a write; previously logged sets keep their displayed weight.
result: skipped
reason: "User skipped: verifications requiring manual human interaction"
coverage_id: 06-07-D3

### 6. A user with no configured gym gets exactly one seeded 'My Gym' profile the first time a session starts, and the session row carries its id
expected: A user with no configured gym gets exactly one seeded 'My Gym' profile the first time a session starts, and the session row carries its id
result: pass
source: automated
coverage_id: 06-01-D1

### 7. The breakdown honours recorded pair counts, proven by a one-pair inventory case
expected: The breakdown honours recorded pair counts, proven by a one-pair inventory case
result: pass
source: automated
coverage_id: 06-01-D3

### 8. A gym profile round-trips to Postgres under the authenticated user, and a malformed inventory is rejected
expected: A gym profile round-trips to Postgres under the authenticated user, and a malformed inventory is rejected
result: pass
source: automated
coverage_id: 06-01-D4

### 9. roundToAchievable has no default rounding direction; a halfway target between two achievable loads resolves to the lower one
expected: roundToAchievable has no default rounding direction; a halfway target between two achievable loads resolves to the lower one
result: pass
source: automated
coverage_id: 06-02-D1

### 10. A not-loadable barbell target names its two nearest achievable neighbours, with either side null when none exists on that side
expected: A not-loadable barbell target names its two nearest achievable neighbours, with either side null when none exists on that side
result: pass
source: automated
coverage_id: 06-02-D2

### 11. One resolveEquipmentBand function answers what the band shows for every equipment type, exhaustively over all twelve EQUIPMENT_TYPES members, and hasResolvableEquipment is the single shared predicate
expected: One resolveEquipmentBand function answers what the band shows for every equipment type, exhaustively over all twelve EQUIPMENT_TYPES members, and hasResolvableEquipment is the single shared predicate
result: pass
source: automated
coverage_id: 06-02-D3

### 12. warmupSets accepts an optional gym-aware roundWeight closure with every existing caller byte-identical
expected: warmupSets accepts an optional gym-aware roundWeight closure with every existing caller byte-identical
result: pass
source: automated
coverage_id: 06-02-D4

### 13. Setting a gym active moves the single active pointer; it never changes any other gym's row, and archiving the active gym leaves the pointer resolvable rather than dangling.
expected: Setting a gym active moves the single active pointer; it never changes any other gym's row, and archiving the active gym leaves the pointer resolvable rather than dangling.
result: pass
source: automated
coverage_id: 06-03-D2

### 14. Archived gyms sit in a collapsed trailing section, the active gym is pinned first with accent styling, and the row subtitle joins only configured sections in fixed order — never a zero count.
expected: Archived gyms sit in a collapsed trailing section, the active gym is pinned first with accent styling, and the row subtitle joins only configured sections in fixed order — never a zero count.
result: pass
source: automated
coverage_id: 06-03-D3

### 15. The Gym Profile Action Sheet's action list is dynamic per row state — Set Active omitted on the active row, Restore in place of Archive on an archived row.
expected: The Gym Profile Action Sheet's action list is dynamic per row state — Set Active omitted on the active row, Restore in place of Archive on an archived row.
result: pass
source: automated
coverage_id: 06-03-D4

### 16. The Profile tab's Gym Profiles row names the active gym when it resolves, is absent otherwise, and always navigates — never disabled or broken.
expected: The Profile tab's Gym Profiles row names the active gym when it resolves, is absent otherwise, and always navigates — never disabled or broken.
result: pass
source: automated
coverage_id: 06-03-D5

### 17. A user can configure a gym's bar weight (via preset chips or manual entry), plate denominations with per-denomination pair counts, dumbbell weights, and named machines with stack min/max/increment/starting-resistance, and pick the profile's unit system — through one shared create/edit form.
expected: A user can configure a gym's bar weight (via preset chips or manual entry), plate denominations with per-denomination pair counts, dumbbell weights, and named machines with stack min/max/increment/starting-resistance, and pick the profile's unit system — through one shared create/edit form.
result: pass
source: automated
coverage_id: 06-04-D1

### 18. Every weight is stored in canonical kilograms regardless of the profile's unit, and a draft-to-profile-to-draft round trip preserves the exact stored value — no floating-point arithmetic on a parsed decimal.
expected: Every weight is stored in canonical kilograms regardless of the profile's unit, and a draft-to-profile-to-draft round trip preserves the exact stored value — no floating-point arithmetic on a parsed decimal.
result: pass
source: automated
coverage_id: 06-04-D2

### 19. A plate count stepper cannot go below zero or express a decimal/negative; a duplicate denomination merges into the existing row rather than creating a second one.
expected: A plate count stepper cannot go below zero or express a decimal/negative; a duplicate denomination merges into the existing row rather than creating a second one.
result: pass
source: automated
coverage_id: 06-04-D3

### 20. A failed local write on Save renders the shipped error surface above the field stack, and the form stays open with every entered value preserved; sync failure is not surfaced inline.
expected: A failed local write on Save renders the shipped error surface above the field stack, and the form stays open with every entered value preserved; sync failure is not surfaced inline.
result: pass
source: automated
coverage_id: 06-04-D4

### 21. The create route saves through createEquipmentProfile; the edit route loads the profile, seeds the draft, and saves through updateEquipmentProfile. Editing an existing gym's plate count changes only that column.
expected: The create route saves through createEquipmentProfile; the edit route loads the profile, seeds the draft, and saves through updateEquipmentProfile. Editing an existing gym's plate count changes only that column.
result: pass
source: automated
coverage_id: 06-04-D5

### 22. Setting a gym active moves the preference pointer (proven by Set Active disappearing from that row's own action list on reopen), and archiving moves the row into the archived partition with an archive timestamp, leaving the row present.
expected: Setting a gym active moves the preference pointer (proven by Set Active disappearing from that row's own action list on reopen), and archiving moves the row into the archived partition with an archive timestamp, leaving the row present.
result: pass
source: automated
coverage_id: 06-04-D6

### 23. The session's resolved inventory is read through loadSessionInventory (D-17 snapshot) — a session started at one gym never re-resolves against a later-switched active gym
expected: The session's resolved inventory is read through loadSessionInventory (D-17 snapshot) — a session started at one gym never re-resolves against a later-switched active gym
result: pass
source: automated
coverage_id: 06-05-D1

### 24. PlateStripView renders every EquipmentBandState kind (plates, pair, stack, not_loadable, no_plates, collapsed) per the UI-SPEC Copywriting Contract, grows past the 40px reservation only for a real tap target, and collapses defensively on a thrown computation
expected: PlateStripView renders every EquipmentBandState kind (plates, pair, stack, not_loadable, no_plates, collapsed) per the UI-SPEC Copywriting Contract, grows past the 40px reservation only for a real tap target, and collapses defensively on a thrown computation
result: pass
source: automated
coverage_id: 06-05-D2

### 25. The band is live on the workout screen for the currently focused weight field only, memoised on (inventory, target), and both tap-to-autofill and generated warm-ups produce loads the active gym can actually make
expected: The band is live on the workout screen for the currently focused weight field only, memoised on (inventory, target), and both tap-to-autofill and generated warm-ups produce loads the active gym can actually make
result: pass
source: automated
coverage_id: 06-05-D3

### 26. A user can mark the equipment an exercise needs as unavailable for this workout only, and is immediately offered substitute exercises the gym can still equip.
expected: A user can mark the equipment an exercise needs as unavailable for this workout only, and is immediately offered substitute exercises the gym can still equip.
result: pass
source: automated
coverage_id: 06-06-D1

### 27. A separate, explicitly-labelled action writes the unavailability through to the gym profile, behind its own confirmation — the default action never edits the profile.
expected: A separate, explicitly-labelled action writes the unavailability through to the gym profile, behind its own confirmation — the default action never edits the profile.
result: pass
source: automated
coverage_id: 06-06-D2

### 28. Equipment marked unavailable is subtracted from the session's resolved inventory once, and the band, the achievability rounder and the substitute candidates all read that same subtracted view.
expected: Equipment marked unavailable is subtracted from the session's resolved inventory once, and the band, the achievability rounder and the substitute candidates all read that same subtracted view.
result: pass
source: automated
coverage_id: 06-06-D3

### 29. Choosing a substitute replaces the exercise for this session only, carrying the original's target sets/rep range/RIR across; the program row is untouched.
expected: Choosing a substitute replaces the exercise for this session only, carrying the original's target sets/rep range/RIR across; the program row is untouched.
result: pass
source: automated
coverage_id: 06-06-D4

### 30. The Equipment overflow row is a structural exclusion (absent, not disabled) for exercises with no resolvable equipment band, e.g. bodyweight.
expected: The Equipment overflow row is a structural exclusion (absent, not disabled) for exercises with no resolvable equipment band, e.g. bodyweight.
result: pass
source: automated
coverage_id: 06-06-D5

### 31. The session menu gains a fourth row, Switch Gym, between Session Note and Discard; Discard stays last and destructively styled; selecting Switch Gym closes the menu and opens the sheet with no confirmation step.
expected: The session menu gains a fourth row, Switch Gym, between Session Note and Discard; Discard stays last and destructively styled; selecting Switch Gym closes the menu and opens the sheet with no confirmation step.
result: pass
source: automated
coverage_id: 06-07-D1

### 32. The Switch Gym sheet lists every non-archived gym ordered as the gym list orders them, accent-tints and labels the session's current gym, excludes archived gyms entirely, and its Manage Gyms link routes to the gym profiles list.
expected: The Switch Gym sheet lists every non-archived gym ordered as the gym list orders them, accent-tints and labels the session's current gym, excludes archived gyms entirely, and its Manage Gyms link routes to the gym profiles list.
result: pass
source: automated
coverage_id: 06-07-D2

### 33. The shape of every equipment-profile JSON column and the session's unavailable-equipment column is documented in the repository, following the same structure the project's other vocabulary references use, with every field name verified against the shipped contract module
expected: The shape of every equipment-profile JSON column and the session's unavailable-equipment column is documented in the repository, following the same structure the project's other vocabulary references use, with every field name verified against the shipped contract module
result: pass
source: automated
coverage_id: 06-08-D1

### 34. The whole browser durability suite, including this phase's four new specs, passes end to end on two consecutive runs, with zero skip markers in any of the four new spec files
expected: The whole browser durability suite, including this phase's four new specs, passes end to end on two consecutive runs, with zero skip markers in any of the four new spec files
result: pass
source: automated
coverage_id: 06-08-D2

### 35. The phase's validation contract names a real automated command for every requirement, and every named test file exists
expected: The phase's validation contract names a real automated command for every requirement, and every named test file exists
result: pass
source: automated
coverage_id: 06-08-D3

## Summary

total: 35
passed: 30
issues: 0
pending: 0
skipped: 5
blocked: 0

## Gaps

[none yet]
