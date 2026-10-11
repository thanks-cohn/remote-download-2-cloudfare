# DBG-003 — Upload from Computer: selection/draft duplication and cross-bucket folder contamination

**Opened:** 2026-10-10  
**Status:** Source patch committed; automated and installed Chrome testing pending  
**Related reports:** BUG-013 and BUG-014 in `bugs/README.md`  
**Implementation:** `extension/options.js` commit `79c90c4`; tests `tests/upload-location-builder.test.mjs` commit `74896f4`.

## Reported symptoms

1. Selecting an existing Upload from Computer child location also displays its name in the adjacent new-folder input.
2. The right-side location dropdown can contain names associated with another bucket or a saved profile, contrary to the left-bucket / right-immediate-children contract.
3. The user requires the left selector to be the only bucket selector; the right selector must represent verified immediate children within that account and bucket.

## Source-backed mechanisms

- `renderUploadLocationBuilder()` previously initialized the new-name input with the selected folder segment for non-root rows. The control mixed selection and creation intent.
- Its input listeners wrote draft names into the selected upload path and materialized remote prefixes on change/blur. This could make typing appear to redirect or create a path before the intended explicit action.
- `loadUploadLocations()` merged the selected bucket's live child listing with `uploadProfile()?.folders`, without verifying those saved prefixes belonged to the selected bucket.
- Pending requests from a prior left-bucket selection were not guarded by an account/bucket-scoped request identity.

## Source correction

- Initialize new-name inputs empty; changing or blurring the draft cannot alter the selected path. Directory creation is bound to an explicit `+` continuation action.
- Existing-folder selection updates selected path without attempting folder materialization.
- Show only observed `cfFolderChildren` results for the selected bucket at the right-side root. Stop injecting profile prefix values into that verified list.
- Keep a monotonic request generation and active account/bucket key. Reset location state on switching buckets, and ignore obsolete results.
- Add unit test fixtures for empty drafts, exact bucket scoping and stale asynchronous results.

## Verification and known gaps

This source change was committed, but **the tests were not executed in this session** because the code execution environment could not resolve `github.com` to retrieve the checkout. Inspecting a test file is not equivalent to running it. Live R2 folder listings, error/empty states, browser keyboard focus and large folders require browser verification. Nested row repaints remain a separate potential UX concern; no wholesale UI rewrite was attempted.

To verify locally:

```sh
node --test tests/upload-location-builder.test.mjs
npm test
```

Human test: choose bucket `alpha`, verify right-side immediate children; switch to bucket `beta`, verify no `alpha` choices survive; select an existing second-level child, verify new-folder input remains empty; type a new name without pressing `+` and verify nothing is created; press `+` and inspect intended R2 location.

## Historical semantics

This is an **implemented but unverified correction**, not a closed incident. Append subsequent test runs, counterevidence and real browser outcomes to the canonical `debug/cases/DBG-003.events.jsonl` history; do not erase the original symptoms or claim universal success.
