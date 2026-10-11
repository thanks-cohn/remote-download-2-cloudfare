# DBG-002 — Simple Mode path rows, redirection and directory creation

**Reported:** 2026-10-10  
**Status:** **Source fix committed — automated execution and human Chrome testing pending**  
**Related requirements:** BUG-005, BUG-016, and Simple Mode parent-row follow-up in `bugs/README.md`.

## Report and scope

Simple right-click destination selection needs an `×` on each folder level, allowing a path to be redirected without deleting any R2 object. Removing a higher-level selection should **keep lower selectors visible but clear their previous choices**. Each row also needs an independent new-directory name field and an explicit Create operation. Existing-folder dropdown selection must never populate that new-name field. Routine operations should not rebuild unrelated settings cards.

## Source investigation

The original `extension/options.js` had separately implemented primary-location and additional-destination folder controls. Both used asynchronous remote folder queries and rebuilt their folder selector subtrees on selection. Neither provided consistent per-level `×` and directory-creation controls. These limitations were visible in the source before the patch; exact pre-fix Chrome behavior is reported, not independently reproduced in this session.

## Changes committed

- `7c1b0d6`: Introduced `simpleFolderPathEditor`, used by both primary and additional Simple destinations. A cleared parent invalidates child selections while retaining the child rows. Dropdown selection and input draft are independent. Creation calls `cfCreateFolder` with the selected account/bucket/parent prefix and requires explicit Create.
- `3ac4496` and `376d933`: Corrected initialization order so the editor can build and resolve initial selector rows before its containing settings card is mounted.
- `b6f2cda`: Added `tests/simple-location-rows.test.mjs` with coverage for ancestor clearing, empty draft preservation and explicit folder creation.

The implementation preserves surrounding settings cards and confines redraws to the affected path editor's dependent rows. The change is not a broad rewrite of unrelated Simple Mode UI or Native Chrome context menu semantics.

## Verification status

**Source patch and tests committed; tests not executed in this session.** The local execution container could not resolve `github.com` to fetch a checkout. No claim of passing regression tests, browser behavior, correct R2 creation, persistence after reload or production readiness is made. The debug case remains open.

## Manual Chrome acceptance steps

1. Reload unpacked extension, open Simple Mode, and select a bucket and path at least three levels deep.
2. Click `×` on a top-level or middle row: it clears that level and all dependent selections while keeping lower rows visible for reselection. Verify no Cloudflare deletion.
3. Choose a different parent, then choose each child from its newly scoped dropdown. Ensure no stale folder names from the previous path appear.
4. Confirm all create-input fields begin empty when selecting existing folders. Type a new directory name at root and at a deep level; creation should happen only on explicit Create, and appear at the exact intended path.
5. Check that unrelated cards, menu labels and drafts do not reset. Reload settings; verify the saved selected path and actual right-click destination.
6. Simulate failed `cfFolderChildren` / `cfCreateFolder` requests; verify errors are visible and no imaginary successful destination is created.
7. Run `node --test tests/simple-location-rows.test.mjs` and `npm test`, and record results separately from installed Chrome verification.

## Learning and follow-up

Use the structured debug reader and canonical journal to record validated findings, not guesses. Common folder-selection semantics belong in one path editor rather than divergent implementations. Keep async freshness, remote creation certainty, focused input persistence and whole-app rerender coverage under test. This case is not closed until automated and browser outcomes are recorded.
