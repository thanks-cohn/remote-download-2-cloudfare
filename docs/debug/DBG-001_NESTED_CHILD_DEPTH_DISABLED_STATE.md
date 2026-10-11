# DBG-001 — Nested menu cannot reliably continue past two child levels

**Opened:** 2026-10-10  
**User symptom:** Nested menu does not extend past approximately two folders/children; user sometimes can continue only by selecting the root bucket again. This prevents usable deep nesting.  
**Status:** **Source-confirmed UI-state defect; not browser-reproduced or fixed in this investigation.**  
**Severity:** High — blocks principal Nested Mode workflow.  
**Relevant code:** `extension/nested-menu-editor.js` (`button`, `run`, `folderRow`, `rootRow`), `extension/nested-locations.js` (`setLocation`, `destinations`), `extension/background.js` (`addNestedLocations`, `listFolderChildren`).

## Definitive source-level mechanism

1. `folderRow()` initializes the **+ Child** button with `add.disabled = true`.
2. Clicking a button calls `run(key,controls,task)`. Before running the asynchronous task, `run` captures the **disabled state of every input/select/button in the editor**, then disables them all:
   `const locked=[...container.querySelectorAll("input,select,button")]; const previous=locked.map(el=>el.disabled); locked.forEach(el=>el.disabled=true)`.
3. At completion, `run` **unconditionally restores the old snapshots**: `locked.forEach((el,index)=>{if(el.isConnected)el.disabled=previous[index];})`. It does this even when the task legitimately changed the enabled state.
4. In the folder **Create** handler, the task sets `node.ready=true` and `add.disabled=false`; immediately afterwards, `run` restores the earlier `true`, re-disabling the add button.
5. In the existing-folder **select change** handler, `M.setLocation(node,select.value)` sets readiness, but the code does not invoke `repaint()` or otherwise enable the add button. The old disabled state is restored at the end of `run`.
6. When an ancestor (such as the top bucket) is reselected, its handler rebuilds descendant DOM and triggers fresh asynchronous location verification. The child `repaint()` callback then computes `add.disabled=!parentReady || !node.ready` **outside that earlier pending action**, enabling previously blocked controls. This is why forced reselection can appear to cure the problem.
7. The original cause can affect **any depth**; there is no observed deliberate two-level maximum in the recursion. Two levels is the user's visible failure threshold, not a source-defined limit.

This is stronger than a generic `needsSelection` hypothesis. A prior patch allowed confirmed saved nodes to become ready, but did not repair the action lock's stale-state restoration.

### Additional code risks; separate investigation required

- `run` tracks pending globally, locks the entire container, and restores an old snapshot of all controls, even those whose async state may have changed in the meantime. This introduces more general stale-control risks.
- After the root bucket is created, `rootRow` changes `add.disabled=false` inside `run`, subject to the same rollback.
- Folder creation replaces the select's choices with just the new folder and does not necessarily refresh existing siblings; verify usability separately.
- Check that `listFolderChildren` returns the requested descendants at depths 3+ and flags incomplete listings. It currently accumulates immediate children from delimiter entries; remote listing/provider problems may be a *second* independent failure.
- Background `addNestedLocations` recursively uses destination chains to create Chrome context menus, and `nested-locations.js` recursively enumerates them; inspect Chrome menu creation callbacks and `chrome.runtime.lastError` for platform/render limits rather than assuming unlimited display depth.
- Do not infer successful right-click menu nesting from successful settings-tree rendering: these are distinct paths.

## Historical chronology

1. **Earlier implementation:** The Nested settings editor reconstructed the full UI during many actions. Users reported lost state, unwanted refreshes, and blocked continuation.
2. **DOM-preservation patches:** Direct row insertion replaced some full redraws; `+ Child` began appending nodes without discarding siblings. These addressed redraw symptoms but preserved the global `run` disabled snapshot bug.
3. **2026-10-10, commit `03efcc07358f64970d6158831884c2d1431ebd66`:** Changed readiness from `!node.needsSelection && known.includes(node.name)` to `Boolean(node.name) && known.includes(node.name)`, clearing `needsSelection` once the provider confirmed a saved folder. This is a valid narrower correction but does not address buttons being re-disabled by `run`.
4. **Agent API M0/M1 audit, subsequently merged:** Documented message surfaces, source hashes and architecture, but did not execute Chrome end-to-end flow.
5. **2026-10-10, current investigation:** Found deterministic source path to stale enabled/disabled state. No source code modification made, no Chrome acceptance run performed.

## Minimal reproduction and tests to add

**UI fixture reproduction (no Cloudflare credentials):**
1. Mount `RedownNestedEditor` with one connected profile and a saved bucket, mock `cfBuckets` and `cfFolderChildren` for a hierarchy `bucket/one/two/three/four/`.
2. Add a blank child to a verified parent.
3. In the fresh child's existing-folder selector, choose `two`. Wait for asynchronous `save` and `run` completion. Assert the new row's `+ Child` is **enabled without touching the root**. With current source, it remains disabled.
4. Repeat by typing and **creating** a new folder instead of selecting an existing one. Assert `+ Child` becomes enabled; current stale-state restoration disables it.
5. Repeat for depths 3, 4, 5 and for multiple independent sibling branches. Confirm state survives reopen and a settings refresh.
6. Test intentional parent changes invalidate only impacted descendants. Test failed network results keep actions unavailable and provide a useful error; ensure no false success.
7. Separately simulate `chrome.contextMenus.create` with deeply nested destinations and confirm correct parent IDs, creation order and observable callback errors.

**Recommended code correction:** Make action locking separate from **semantic enabled state**. Never restore stale `disabled` snapshots after the task changed readiness. Have a deterministic control-state renderer for each row (for example `updateControls()`) that reevaluates `node.ready`, `parentReady`, loading, permission and error state **after pending completes**. Selection and creation should call it; newly created children should have verified ancestor paths. Keep unrelated rows, focus, form values and scroll intact.

Avoid a tempting one-line change that merely sets `add.disabled=false` *inside* a `run` task: the `finally` block will undo it.

## Acceptance criteria for closing

- From a freshly opened Nested settings view, without reselecting any bucket, a user can create/select and append folder descendants at **five or more levels**.
- Adding and configuring children preserves all unrelated sibling and ancestor controls.
- Saved hierarchy persists after panel reload and produces correct runtime right-click destination IDs/paths.
- A transfer to a depth-5 destination targets precisely the intended bucket/key.
- Simulated failures and stale provider listings are distinguishable; no accidental remote mutation from read-only actions.
- Automated UI-state and menu-generation tests pass, and a real Chrome manual smoke test confirms the workflow.

**Current conclusion:** The reported two-level ceiling is consistent with a **stale UI disabled-state restoration bug**, not with an explicit two-level restriction in the nested tree model. This is source-verified causation; browser behavior and any additional menu-depth limits remain to be tested.
