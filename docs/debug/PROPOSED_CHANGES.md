# Proposed Changes — ReDown Debugging and Remediation

**Status:** Proposed, not implemented  
**Initial case:** [DBG-001 — Nested child-depth disabled-state failure](DBG-001_NESTED_CHILD_DEPTH_DISABLED_STATE.md)  
**Scope:** Technical corrections, verification design, regression prevention and change control  
**Authorship policy:** Implementation and evidence are evaluated independently of whether work was produced by a person, an automated agent, or a combination. This document uses impersonal technical language, preserves provenance in change records, and demands equivalent quality and verification from every contributor.

## 1. Purpose and quality bar

Establish a repeatable route from a source-backed defect hypothesis to a minimally invasive, fully tested correction. A remediation is acceptable only if it protects contract semantics, handles asynchronous failure and recovery, avoids avoidable UI resets, preserves remote data integrity, and includes evidence at the right abstraction layers.

The debug history records **what happened**; this file specifies **what should change and why**. Neither source inspection nor a proposed patch is a substitute for browser reproduction and behavioral tests. Requirements below may be revised as evidence develops; update the historical case file rather than erasing prior reasoning.

## 2. DBG-001 — Correct disabled-state and readiness ownership

### 2.1 Root-cause correction

`extension/nested-menu-editor.js` currently uses `run()` to capture all editor control `disabled` states before an asynchronous action, then restore those old values in `finally`. This is unsound when the action changes semantic readiness; a valid selected or created folder can remain locked despite `node.ready === true`. Parent reselection can accidentally repair the UI by causing a fresh render and asynchronous verification.

**Required:** Separate transient *operation locking* from persistent *control eligibility*. Semantic eligibility is derived from authoritative model state and verified capabilities, not from the historical DOM snapshot at the beginning of an operation.

- Introduce an explicit row-local state reconciliation function or a small declarative row state machine that evaluates: parent validity, node selection, remote verification, pending mutation, errors and applicable permissions.
- A completed action MUST recompute availability from current state. `+ Child` must be enabled if and only if the effective parent and selected folder are valid and no blocking operation exists.
- Do not restore stale `disabled` booleans indiscriminately. Either manage transient lock state independently (for example `aria-busy` plus a narrowly scoped active-operation set and a deterministic reconciliation pass) or use a controller storing stable semantic conditions.
- Selecting an existing folder and creating a folder must follow the same post-commit reconciliation path.
- Remote-list failures must remain visible and must not produce false readiness.
- The fix must work for roots, descendants, siblings, and reopened saved models—not only one button or a hard-coded depth.

### 2.2 Async and state integrity

- Avoid locking every input/select/button across the complete editor for a row-local operation where unrelated destinations can remain interactive safely.
- Guard stale async reads and out-of-order responses using generation or request identity. Responses for an old parent/bucket must not overwrite a newly selected path.
- Deduplicate or serialize genuinely conflicting writes per row/target. Do not permit two concurrent mutations to create diverging local versus remote paths.
- Make state transitions explicit: unselected, verifying, verified, creating, failed, invalidated. Represent failures separately from unselected values.
- Revalidating one ancestor invalidates dependent descendants only when the effective bucket/folder path changes; unrelated sibling state must remain intact.
- Preserve focused controls, typed names, dropdown selection, scroll position and existing DOM nodes where correctness permits.
- Any save failure must have an explicit recovery path and must not silently claim the remote mutation failed if it may have succeeded. Query remote state before retrying uncertain creation.

### 2.3 Folder hierarchy and menu semantics

- Do not introduce an arbitrary limit at two or three levels; use correct recursive traversal for saved folder trees.
- Each descendant is represented by an account ID, bucket name, canonical parent prefix and child name. Path composition must be consistent for reads, creations, context-menu creation and transfers.
- Verify `RedownNestedLocations.destinations()` returns complete paths and ancestor chains for nested depth >= 5.
- Verify `addNestedLocations()` creates valid parent IDs, including the distinct `Send here` leaf for nodes that also contain children. Capture and report `chrome.runtime.lastError` or equivalent failure signals for context-menu creation.
- Deep paths must never silently route to root, a sibling prefix or the wrong bucket.
- Distinguish a dropdown's child-listing completeness from an actually empty folder. Paginated/capped remote results require an explicit completeness or continuation contract.

## 3. Test specification

### 3.1 Deterministic editor regression tests

Using a DOM-capable fixture with mocked `cfBuckets`, `cfFolderChildren`, `cfCreateFolder` and persistence:

1. Open a saved, remotely verified bucket and nested hierarchy without manually reselecting the root.
2. Select an existing folder in a newly added child row; after all asynchronous work settles, assert `+ Child` is enabled.
3. Create a new folder in a newly added child row; assert the same.
4. Repeat both pathways through **at least five nested levels** with two independent sibling branches.
5. Reload/reopen from persisted state; assert deep branch readiness and accurate generated paths.
6. Change an ancestor, verify only relevant descendants become invalid and pending stale reads cannot reactivate them.
7. Simulate provider errors, delayed responses, duplicate names, interrupted saves and remote-success/local-failure uncertainty.
8. Confirm unrelated destination editors retain focus, draft text, selections and scroll where applicable.
9. Assert repeated clicks during pending mutations do not create duplicate nodes or remote operations.

### 3.2 Background and end-to-end tests

- Generate the complete Chrome right-click hierarchy for a deep saved tree; assert IDs, parent references and submenu actions.
- Verify `Send here` resolves the exact account/bucket/prefix at each depth.
- Exercise folder-listing continuation and missing/empty/list-error cases independently.
- Test transfer dispatch with fake Worker/R2 responses and inspect observable outcomes, avoiding live credentials in unit tests.
- Run manual Chrome smoke tests for desktop right-click behavior at depth five or deeper, including UI refresh and extension reload.

### 3.3 Existing test baseline and compatibility

The initial agent audit reported a full-suite baseline of **15 existing failures** in stale Cloudflare authentication and menu-mode fixtures. Confirm the current baseline before attributing failures to this change. Update stale fixtures in a discrete reviewable commit or PR without weakening assertions; record before/after counts and browser verification separately.

A passing isolated test cannot justify a claim that the extension is production verified.

## 4. Minimal implementation sequence

**Phase A — Reproduction:** Introduce tests that fail against the current `run()` stale-disabled-state behavior. Save exact commands and output in DBG-001.

**Phase B — Correction:** Replace the snapshot-restore mechanism with explicit state reconciliation. Limit asynchronous locks to necessary scopes; keep changes in the current editor module and small helpers before attempting broader architecture refactoring.

**Phase C — Behavioral coverage:** Add depth-five selection/creation/persistence/menu tests and investigate any independent Chrome limits or server listing problems discovered.

**Phase D — Browser validation:** Verify user-level behavior in unpacked extension and record precise environment, steps, outcomes and evidence.

**Phase E — History update:** Add commit/PR references, tests, remaining risks, and closure decision to the DBG-001 case record. Do not relabel a proposal as shipped before it actually passes acceptance.

## 5. Review and acceptance gates

A proposed correction is ready for merge only when:

- The original bug has a deterministic test demonstrating pre-fix failure and post-fix success.
- No stale DOM disabled-state restoration can override a newly verified row's eligibility.
- An existing saved bucket can be used and edited with **zero redundant root reselections**.
- Both select-existing and create-new child flows support at least five levels.
- Deep right-click routing and transfer destination identity are preserved.
- Source/contract tests pass, or all unrelated baseline failures are explicitly documented.
- Errors and uncertain outcomes remain legible and are never misrepresented as completed operations.
- The architecture stays understandable and proportionate; no large framework is introduced to cure a local state bug.

## 6. Cross-project engineering convention

Future entries in `docs/debug/` should use the same evidence discipline: **symptom → historical attempts → current hypotheses → reproduction → minimal correction → impact analysis → test evidence → closure or remaining uncertainty**.

Each proposed change must remain understandable to a skilled maintainer regardless of author identity. Statements such as “the agent fixed it” or “a human fixed it” are not evidence. Record concrete diffs, versioned interfaces, reproducible commands, observed results and provenance. The objective is durable, author-independent technical knowledge compatible with the later Forever Works project and maintenance model.
