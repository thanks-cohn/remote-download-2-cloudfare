# Proposed Bug Fixes — REDOWN

This file describes planned implementation changes. For reports, evidence, and reproduction details, see [README.md](README.md). A proposal is **not** an implemented or tested fix.

## BUG-013 — Scope Upload from Computer locations to the selected bucket

**Status:** Proposed · not implemented

### Intended user experience

The **Bucket** selector on the **left** is the single source of truth for the active Cloudflare R2 account and bucket. The **Location** builder on the **right** only displays folders *inside that selected bucket*, never peer/top-level buckets or unrelated saved locations.

For example:

```text
Bucket (left): works
Location (right):
  images/
  videos/
  projects/
    project-a/
    project-b/
      assets/
```

Each **+ Child** control adds the next path level and shows only immediate existing child folders beneath the selected parent. Switching the left bucket clears or revalidates the entire right-hand path. A bucket-root upload remains possible by selecting no child folders. A new folder is created only through an explicit creation action.

### Proposed implementation

1. Treat `(accountId, bucketName)` as the identity for the location builder's source data, selected hierarchy, cached prefixes, and in-flight lookup results.
2. In `extension/options.js`, change `loadUploadLocations()` so the first location dropdown draws exclusively from `cfFolderChildren` with an empty parent prefix for the selected bucket. Do **not** merge `uploadProfile()?.folders` paths into the verified existing-folder options.
3. In `fetchUploadBuilderChildren(parentSegments)`, request only the immediate children of `parentSegments.join('/')` in the selected bucket. Avoid leaking options cached for another account/bucket or a previous parent.
4. On left-bucket changes, invalidate pending asynchronous lookups, reset dependent selections, and fetch the newly selected bucket's actual root folders. Discard responses that arrive after the user has changed bucket or ancestor path.
5. Keep previously saved but unverified destination paths separate, labelled clearly (e.g., **Saved path — not verified in this bucket**). Never silently treat them as existing folders.
6. Distinguish **Loading folders…**, **No folders here**, **Could not load folders — Retry**, and **More folders available — Load more**. Do not turn failed requests into an empty-successful-looking dropdown.
7. Preserve the BUG-003 responsive layout fix, and keep folder creation separate from merely adding an empty child row.

### Acceptance tests

- Choosing bucket `works` only shows immediate folders belonging to `works`; another bucket name must not appear merely because it is a bucket.
- Choosing `projects` then **+ Child** shows only `works/projects/` children; deeper levels continue under the exact full parent path.
- Switching from bucket `works` to `extended` does not carry `works` folders, stale cached options, or an old selected path into the new bucket.
- A folder legitimately named `works` *inside* bucket `extended` may appear, but only after live verification that `extended/works/` actually exists.
- Empty, loading, permission-error, and partially loaded states are visibly distinct and retryable.
- An empty child row does not create a remote folder or alter the upload destination.
- Multiple sibling folders, large result sets, three or more child levels, and rapid bucket switching work without incorrect suggestions.
- At 1366×768, the builder remains readable without horizontal overflow.

### Code surfaces

- `extension/options.js`: `loadUploadLocations()`, `uploadBuilderChildren()`, `fetchUploadBuilderChildren()`, `renderUploadLocationBuilder()`, `uploadTarget()`.
- `extension/background.js`: `cfFolderChildren`, `listFolderChildren()`.
- `extension/options.html`: location dropdown layout and loading/error feedback.

**Scope:** This proposal concerns **Upload from Computer**, not the separate Nested right-click menu editor (BUG-012).

## BUG-004 — Preserve nested editor DOM and update only the affected branch

**Status:** Initial targeted-DOM fix committed October 10, 2026; Chrome verification pending. Folder-selection flows still need regression testing.

**Observed:** Clicking **+ Child** in the Nested right-click menu editor causes the entire panel to disappear/rebuild, disrupting selection, focus, scroll position, and parent rows.

**Confirmed code cause:** `extension/nested-menu-editor.js` invokes `render(context.profiles())` in the `run()` `finally` handler and `rerender()` within child-add/select handlers. `render()` calls `container.replaceChildren()`, recreating all profiles, roots and nested controls. CSS cannot retain DOM elements deleted by JavaScript.

**Proposed fix:**
- Keep stable DOM nodes keyed by profile/root/node ID. **+ Child** inserts only the new child row inside the relevant parent's existing `.nested-children` container, rather than rebuilding every row.
- Selecting a parent updates only that node and dependent descendants; untouched ancestors and siblings retain node identity, selection, focus, typed draft, collapsed state, and scroll.
- Separate save completion from UI redraw: a successful `context.save(profile)` must not call a global `render()` automatically. Do a full render only after initial mount or unavoidable structural changes.
- Fetch folder choices by exact account/bucket/prefix. Indicate loading/errors on only the affected row. Ignore stale async results when the parent changes.
- Prefer keyed DOM reconciliation where several nodes genuinely need changes; CSS handles layout, not state preservation.
- Test repeated `+ Child` operations at 3+ levels, two accounts with expanded branches, slow R2 responses, concurrent typing, and user keyboard focus.

**UI wording:** The checkbox now reads **Show this account in the Nested right-click menu**. Checked means this account's configured nested destinations may appear in that menu; unchecked preserves its configuration without showing it. This wording change was implemented separately and does not solve the editor reset.

## BUG-005 — Add multiple independent Simple right-click menu options

**Status:** Initial additional-option UI and context-menu routing committed October 10, 2026; Chrome verification pending. A verified-folder picker and reorder controls remain future improvements.

**Observed:** Simple Mode offers a default location on a profile, but no obvious **+ Add New Option** action analogous to Nested Mode's **+ Add bucket**.

**Desired behavior:**
- Add a visible **+ Add New Option** button in Simple Mode, with the ability to create several distinct right-click destination entries for the same Cloudflare account or bucket.
- Each option has its own display label and path, and uses the same verified bucket/folder selection rules as other location pickers.
- Add/remove/reorder one option without disturbing other configured options; removal changes menu configuration only and never deletes remote R2 objects.
- Use stable IDs and backward-compatible migration from existing Simple destination profiles.
- Keep Simple fast and approachable; do not depend on the Premium RFIS JSON/history engine.
- Test new options appearing in the actual right-click menu after save and Chrome background menu refresh; confirm no duplicate or stale entries.

**Note:** Both proposals apply to right-click menu settings, not to the separate Upload from Computer panel (BUG-013).


## October 10 — Destination editor dependency audit and follow-up

**Report:** Nested destinations sometimes stop after two levels unless the user reselects the top bucket; Simple destination folder selection still rebuilds its selectors; Simple and Upload from Computer have incomplete new-location creation workflows. User wants editing to start from the existing saved context with no unnecessary bucket toggling.

### Dependency map

| Interface | What genuinely requires bucket identity | What does NOT require manual re-selection |
| --- | --- | --- |
| Nested right-click editor | Remote `cfBuckets` verification, `cfFolderChildren(accountId,bucketName,parentPrefix)`, `cfCreateFolder`, and context-menu destination generation | Editing a saved verified child, adding another descendant, expanding/collapsing a branch |
| Simple right-click editor | Finding actual existing buckets and children; choosing the target Cloudflare account/bucket; selecting a prepared transfer profile for a different bucket | Re-selecting an already saved bucket before changing the menu label or extending its folder path |
| Upload from Computer | The actual target account/bucket for uploads, listing existing children, and creating remote folders | Selecting the same bucket a second time inside the Location hierarchy |
| Explorer | Current target account/bucket for listing/preview/action APIs | Choosing a new account/bucket each time the user opens an existing folder |

**Code examined:** `extension/nested-menu-editor.js`, `extension/nested-locations.js`, `extension/options.js` (`simplePrimaryLocationField`, `simpleExtraOptions`, `renderUploadLocationBuilder`), `extension/background.js` (`cfBuckets`, `cfFolderChildren`, context menu routing, and transfer handling).

### Confirmed implementation problems

1. Nested `folderRow()` computed `node.ready = !node.needsSelection && known.includes(node.name)`. Once a child was marked `needsSelection`, even successful verification of the saved folder left it non-ready, disabling its `+ Child` button until another selection. **Initial fix committed**: a saved node is marked ready if its name is confirmed by the provider. Verify this in Chrome with a three-plus-level hierarchy.
2. Simple `simplePrimaryLocationField()` and `simpleExtraOptions()` use `replaceChildren()` on selection changes. They should reconcile the changed path level and descendants only, retaining prior ancestors, focus, and sibling destination cards. **Still to implement**.
3. Simple destination rows currently contain bucket and folder selectors, but no dedicated action to create a *folder* at the selected parent. `Make New Bucket` creates buckets, not directories. **Still to implement**.
4. Upload from Computer hides the new-folder field on level zero and its plus action requires an existing top-level folder, blocking creation of a fresh root-level directory from the same picker. **Still to implement**.
5. The selected bucket remains genuinely necessary as **data** for API calls, transfers, and provider verification. It does not need to be repeatedly selected by **a human**. Never remove underlying bucket identity or transfer-target checks to simplify the UX.
6. Remote Cloudflare creation needs explicit confirmation, a visible progress/failure state, and refresh of only the affected bucket/parent and dropdowns. An empty option row alone should not create a remote object.

### Acceptance criteria

- Open a saved nested hierarchy and add children at depths 3, 4, and deeper without clicking any saved ancestor again.
- Every verified saved bucket and folder is ready immediately after asynchronous validation, with no false `needsSelection` deadlock.
- Changing a Simple folder touches only that row and its descendants; unrelated destination panels, labels, and scroll remain stable.
- Both Simple Mode and Upload from Computer can create a new folder beneath the selected parent, including the bucket root, and then immediately select it.
- Display the selected bucket by default. Changing it intentionally invalidates only dependent folder selections; none of the users must reselect the current bucket to edit their configured destinations.
- Check actual right-click destination routing and upload paths after bucket and child changes; never send to the wrong account/bucket.
- Never conflate an R2 **bucket** with a folder under that bucket. This remains related to BUG-012 and BUG-013.
