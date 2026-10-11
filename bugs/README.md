# REDOWN bugs

Open reports recorded on October 3, 2026 (America/Chicago), against the v0.5.12 interface. These are reports and acceptance criteria, not completed fixes.

## Fixed — DBG-001: Nested editor cannot continue adding deep children (human testing pending)

**Status:** Fixed in source (`538006a`), regression tests added (`2a5e061`); **human Chrome testing pending**. Automated tests have not been run in this session because the checkout could not be retrieved from GitHub in the execution environment.

The Nested editor's asynchronous `run()` handler used to restore an outdated snapshot of disabled buttons after folder selection/creation. Its `+ Child` action could therefore remain disabled although the folder was ready. Row-specific eligibility is now recalculated after task completion for root selection/creation and folder selection/creation. Added regression tests for selection and multi-level creation. This is a **source fix**, not a verified browser outcome; do not infer that other Chrome context-menu depth constraints or R2 issues have been resolved.

**Human acceptance:** Reload the extension, select and create descendants at least five levels deep without reselecting the bucket, verify the full right-click menu hierarchy and exact destination after a safe test transfer, then report any unexpected errors. See [DBG-001](../docs/debug/DBG-001_NESTED_CHILD_DEPTH_DISABLED_STATE.md).

## BUG-001 — Bucket root must be a selectable nested destination

**Status:** Open · user-reported behavior / usability defect

The nested right-click menu does not provide the bucket's top-level location as the direct destination the user expects. A bucket must remain a valid destination even when it contains child folders; it must not require choosing a folder or adding a placeholder location.

**Expected behavior:** Clicking the bucket targets its root. In R2 terms, the destination prefix is empty (`""`), so a file is stored as `filename.ext`, rather than `files/filename.ext` or another child prefix. Hovering the bucket reveals its configured children.

**Acceptance criteria:**

- The nested destination configuration offers the bucket root as an explicit location option.
- Both an empty bucket and a bucket with configured children can be targeted at the root.
- A bucket-root transfer does not substitute a default folder or create a new folder.
- Selecting a child still targets that child's full path.

**Related:** BUG-002. The existing `Send here` workaround does not satisfy the requested direct-click interaction.

## BUG-002 — Replace “Send here” with click-to-send and hover-to-expand

**Status:** Open · interaction requirement

The user does not want a separate `Send here` menu item. It adds another step and makes the location hierarchy less intuitive.

**Expected behavior:** Every displayed bucket or folder is itself a destination. Clicking its name sends to that exact location. Hovering a location with children opens its submenu; hovering alone must never start a transfer. Leaves remain directly clickable.

**Acceptance criteria:**

- No `Send here` entry is needed or displayed.
- Parent and leaf locations are both directly selectable as transfer destinations.
- Child menus open on hover and retain a usable pointer path between levels.
- Simple and Nested remain mutually exclusive active modes.
- The same destination actions remain usable with a keyboard.

**Implementation constraint:** The current Chrome extension context-menu API renders a parent with children as a native submenu, rather than an actionable parent. The previous release retained `Send here` for that reason. Investigate a custom REDOWN menu surface to satisfy the requested interaction; do not remove parent-target access merely to hide the workaround. A custom solution must explicitly account for how it is opened from the page and how it interacts with Chrome's native menu.

## BUG-003 — Upload from computer: Add child produces a cramped, misaligned row

**Status:** CSS fix committed (2026-10-10); awaiting visual Chrome verification at 1366×768 and deeper nested paths

In **Upload from computer**, clicking **Add child** produces the layout shown in `image(20261004-040836).png`: beneath the selected `works` location, an indented child row contains an existing-child dropdown, a new-child field, another plus button, and a remove button. The existing-child label is clipped, and the action buttons extend to the right of the parent dropdown's width. The controls do not form a clear, consistently aligned hierarchy.

The screenshot shows `Upload destination: /works` while the new child row is still unselected. It does not establish that a child folder was created or that a transfer used the wrong path.

**Expected behavior:** Adding a child produces a readable row inside the selected parent, with existing-location selection and new-name creation clearly separated. Controls must fit the available panel width and remain understandable at the reported 1366 × 768 viewport.

**Acceptance criteria:**

- Parent and child rows align consistently; labels, fields, and actions remain readable.
- Adding further levels does not clip controls, cause horizontal overflow, or push actions out of their layout.
- Selecting an existing child does not populate the new-name field.
- Adding an empty child row does not create a remote folder.
- Once a child is selected or explicitly created, the displayed upload destination includes the complete parent/child path.

## BUG-004 — Nested dropdown interaction rebuilds and rearranges the whole editor

**Status:** Open · user-reported behavior with a confirmed full-render code path

In the **Nested · Cloudflare locations** settings panel, the user reports that clicking a dropdown makes the whole section appear to reload and rearrange itself. Selecting a location currently runs a full nested-editor render rather than updating only the affected row. Opening a dropdown without changing its value has not been independently verified to trigger a reload.

**Expected behavior:** Opening or selecting a dropdown feels local to that row. Update the selected row and, when its parent path changes, only its dependent descendant rows. Unrelated branches and account/preset cards must remain stable.

**Acceptance criteria:**

- Opening and closing a dropdown without changing its value does not rebuild the editor or fetch locations again.
- A changed selection updates only that row and the descendant locations that depend on it.
- Unrelated rows keep their position, collapse state, typed drafts, and loading state.
- Scroll position and focus remain stable; the entire section does not disappear and repopulate.
- The adjacent new-name field is never filled with the selected location's name.

**Relevant code:** `extension/nested-menu-editor.js` currently calls `render(context.profiles())` from selection handling / operation completion and replaces the container's children. Treat that as an investigation point, not proof of every aspect of the user's reported movement.


## BUG-005 — Cloudflare Simple mode cannot add multiple independent locations

**Status:** Open · source-confirmed editor limitation / user-reported requirement

The Cloudflare **Simple** right-click preset editor exposes one default-location builder per saved profile. Its **+ Child** control adds a deeper path segment; it does not create another independent saved destination. Users need multiple sibling destinations under Simple mode without having to confuse child folders with separate presets.

**Expected behavior:** Provide an explicit **+ Add location** control in Simple mode. Each destination independently selects an existing bucket and folder path (or explicitly creates a new location), has an editable menu label, and can be removed without deleting Cloudflare data. Keep Simple and Nested mutually exclusive as active right-click modes; retain both configurations when switching modes.

**Acceptance criteria:**
- Add, edit, reorder, and remove several independent Simple destinations, including paths such as `/images/`, `/videos/`, and `/projects/`.
- Adding a child extends only that destination's path; adding a location creates a separate destination.
- Every saved Simple destination appears in the right-click menu and sends to its exact R2 path, including the bucket root.
- Changing one destination does not reset another; changes survive reload and a new browser session.
- No remote folder or bucket is deleted merely by removing a menu entry.

**Relevant code:** `extension/options.js` `renderProfiles()` and `defaultLocationField()` currently render only a single Cloudflare default-location builder per profile. The menu-tree editor is rendered only for non-Cloudflare profiles.

## BUG-006 — Explorer file list expands downward instead of paginating in a bounded scroll area

**Status:** Implemented on default branch (2026-10-10); awaiting installed-Chrome verification, especially large R2 cursor results and keyboard selection

Explorer visually extends farther and farther down the settings page as file rows accumulate. The current `renderFileItems()` slices by `explorerVisibleLimit` and increases that limit on **Show more**, appending additional rows instead of replacing a numbered page. The actual viewport/scroll CSS impact still requires browser verification.

**Expected behavior:** Explorer behaves like a desktop file manager: its file table scrolls **inside a bounded pane**, while location navigation, headers, and pagination remain accessible. Use real pagination rather than making the entire settings page taller.

**Acceptance criteria:**
- Default to 50 visible entries per page, with 25/50/100 choices and previous/next page controls.
- Changing pages replaces rendered rows rather than cumulatively expanding them.
- File-list pane has viewport-aware bounded height and independent vertical scrolling; header and pagination stay accessible.
- No unintended whole-page vertical growth or horizontal overflow at 1366×768.
- Integrate R2 cursor-based retrieval for large folders without assuming all remote objects are preloaded; present honest counts when total size is unknown.
- Preserve navigation, selection, sorting, filtering, keyboard handling, and file operations across page changes.

**Relevant code:** `extension/options.js` `EXPLORER_RENDER_LIMIT`, `explorerVisibleLimit`, `renderFileItems()`, `explorerNextCursor`; `extension/options.html` `#workspace-objects`.

## BUG-007 — Explorer lightbox fails to display selected file reliably

**Status:** Open · user-reported broken feature / suspect implementation identified; exact rendering failure not yet reproduced

The user reports that the Explorer **Lightbox** does not work. `setWorkspacePreviewLightbox()` clones `.preview-media` or `.text-preview` into a separate overlay using `cloneNode(true)`. Cloning existing preview markup is not a substitute for a fully managed media renderer; the live root cause still needs reproduction (including URL validity, image loading, CSS sizing, lifecycle, and media-specific behavior).

**Expected behavior:** Opening Lightbox reliably presents the selected file at a legible, viewport-fitted size, with usable navigation and clear loading/error states.

**Acceptance criteria:**
- Selected images actually render, preserving aspect ratio with `object-fit: contain`; no blank overlays.
- Previous/next buttons and keyboard arrows move among supported files; Escape, close button, and backdrop exit predictably.
- Preview URL lifetime and asynchronous loading are managed correctly; revoking/replacing one preview cannot blank the active lightbox.
- Media-specific handling for images, video, PDF, and text is deliberate and tested rather than relying solely on cloned markup.
- Loading errors show actionable messages and a retry option; focus returns appropriately on close.
- Verify on a real Chrome extension page with several files and repeated open/close/navigation cycles.

**Relevant code:** `extension/options.js` `showWorkspacePreview()`, `setWorkspacePreviewLightbox()`, preview URL/AbortController state, and lightbox styles.

## BUG-008 — Clicking a Downloads location does not locate, select, and preview that file in Explorer

**Status:** Fix implemented on default branch (2026-10-10), pending Chrome extension end-to-end verification; very large folders and unavailable files need testing

The Downloads table shows a clickable location for some Cloudflare R2 transfers. `openTransferLocation(item,parts)` currently derives the parent folder and calls `goLocation(...)`, then scrolls toward `#local-tools`. It does **not** find, highlight, scroll to, or preview the transferred file. The user further reports that clicking the location does not successfully return them to the expected Explorer view; investigate profile resolution, target availability, visibility, and navigation errors.

**Expected behavior:** Clicking a saved download's location switches to Explorer, selects the correct Cloudflare account, bucket, and full containing folder, then highlights and previews that exact downloaded object.

**Acceptance criteria:**
- Downloads location is an accessible clickable control and clearly indicates navigation.
- Clicking opens Explorer in the matching account/bucket/path, not merely the upload form or a different last-used location.
- Fetch pages/cursors as needed to find the exact object, select it, scroll it into view, and open its preview; allow Lightbox immediately afterward.
- Root-level objects and deeply nested paths work, including folder names with unusual characters.
- A missing profile, moved/deleted object, or authorization failure yields a clear explanation instead of silent navigation failure.
- Downloads and Explorer navigation retain correct back/forward behavior.

**Relevant code:** `extension/options.js` `transferDisplayParts()`, `renderHistory()`, `openTransferLocation()`, `goLocation()`, `showWorkspacePreview()`.

## BUG-009 — Cloudflare authorization expires inconsistently across sections and browser sessions

**Status:** Open · recurring user-reported authentication failure / refresh-token error path confirmed

The user frequently sees the exact message:

```text
Cloudflare session expired. Connect Cloudflare again.
```

The issue appears **section-specific**: some ReDown panels continue to function while other actions say permissions/session expired. Reopening Chrome or starting a new browser session reportedly often requires signing into Cloudflare again. The issue may involve missing refresh tokens, token renewal, uneven authentication handling, stale UI state, or different credentials/requests across sections. Do **not** assume that all of these causes are proven, nor conflate OAuth expiration with missing R2/Worker permissions.

**Source observations:**
- `extension/cloudflare-auth.js` persists `accessToken`, optional `refreshToken`, and `expiresAt` in `chrome.storage.local`.
- `extension/cloudflare-api.js` contains refresh-token logic and retries an API response on HTTP 401 when a refresh token is present.
- The quoted error is explicitly thrown when that renewal path finds no `refreshToken`.
- `extension/options.js` tests for presence of an access token when deciding whether Cloudflare panels appear; presence alone does not establish token validity.
- Existing refresh behavior is not proof that refresh tokens are always issued, remain valid, or are used consistently by every operation.

**Expected behavior:** An authorized ReDown connection remains usable across browser restarts for as long as Cloudflare permits it, using securely persisted credentials and automatic renewal where supported. Individual sections should not incorrectly appear disconnected while the connection is recoverable.

**Acceptance criteria:**
- Trace token acquisition and record whether a refresh token is actually returned (never log secrets); review required OAuth scopes/consent and Cloudflare's supported refresh semantics.
- Audit **all** Cloudflare-dependent panels and operations for consistent authenticated requests, including buckets, Explorer, uploads, right-click downloads, nested destinations, and Worker setup.
- Proactively refresh shortly before known expiration where supported; handle 401 once with coordinated renewal/retry, preventing racing refreshes across simultaneous calls.
- Confirm credentials survive an ordinary Chrome/browser restart via appropriate extension storage; do not depend on a transient tab or service-worker lifetime.
- Distinguish expiration/missing renewal credentials from 403 insufficient permissions, Worker failures, expired sessions in other systems, and connectivity errors.
- Do not erase valid profiles, destinations, or saved configuration when renewal fails; show a single understandable reconnect action only when genuinely necessary.
- Do not prolong provider-imposed expiration, bypass consent/security controls, or store permanent credentials insecurely.
- Test after restarting Chrome and after access-token expiration, including mixed-section usage, concurrent requests, absent refresh tokens, revoked refresh tokens, and permission failures.

**Relevant code:** `extension/cloudflare-auth.js`, `extension/cloudflare-api.js` (including the literal error), `extension/options.js` `refreshCloudflare()`, and Cloudflare operations in `extension/background.js`.


## BUG-010 — Simple and Nested menu settings should share one unified section

**Status:** Fix implemented on default branch (2026-10-10), pending visual and interaction testing

The right-click menu settings currently make **Simple** and **Nested** feel like separate sections. Instead, provide a single **Right-click menu** settings area with two side-by-side checkable mode choices at its top:

- **☑ Use Simple Menu**    **☐ Use Nested Menu**
- Selecting **Nested Menu** changes the selection to **☐ Use Simple Menu**    **☑ Use Nested Menu**.

These should look like checkmarked options, but behave as **one active choice** (mutually exclusive), not two independently active menus. The corresponding configuration editor appears directly beneath the choices in the **same section**, rather than being presented as an unrelated second area.

**Expected behavior:** A tidy, unified settings page where the user chooses which right-click menu to use and edits that mode immediately below the selector. Switching modes does not discard either mode's saved destinations.

**Acceptance criteria:**
- Display **Use Simple Menu** and **Use Nested Menu** side by side at the top of the unified Right-click menu section.
- Both choices have clear checked/unchecked states; only one mode can be active at a time.
- Show the active mode's configuration under the same heading, hiding the inactive editor without clearing its data.
- Switching is immediate, accessible via keyboard, and persisted across settings reloads and browser sessions.
- Eliminate redundant scattered mode controls, duplicated headings, and separate Simple/Nested sections, while retaining all destination-editing functionality.
- Remain usable on smaller windows with sensible wrapping.

**Relevant code:** `extension/options.html`, `extension/options.js` (`renderRightClickMode()`, `renderProfiles()`), `extension/nested-menu-editor.js`; existing `rightClickMode` storage.

## Implementation triage — October 10, 2026

**Implemented, not yet verified in an installed Chrome extension:**
- **BUG-010:** Settings now show side-by-side checkmarked Simple/Nested choices, preserve saved configuration, and show only the active editor. Modified `extension/options.html` and `extension/options.js`.
- **BUG-008:** Downloads location attempts Explorer navigation, exact-object lookup through bounded additional R2 cursor pages, selected-row highlighting, and preview. Modified `extension/options.js`. Existing user-observed navigation failures are not yet proven resolved. The 50-page safeguard prevents unlimited fetches; files beyond that search window may not be located.

**Next candidate fixes and risks:**
- **BUG-006:** Replace cumulative 400-row **Show more** with paginated, scroll-contained rendering. This touches cursor loading, sorting, selection, keyboard behavior, layout CSS and archive listing. Test large folders to avoid breaking operations.
- **BUG-007:** Lightbox must manage preview resource lifetime, media rendering, navigation and CSS together. A cloned node alone is a suspicion, not proof of root cause. Reproduce in Chrome before changing URL ownership or media behavior.
- **BUG-003:** Fix the responsive upload-child row after inspecting CSS and testing nested levels at 1366×768; do not disturb path creation semantics.
- **BUG-004:** Nested editor full rerenders are confirmed; changing them requires carefully preserving async folder fetches, collapse state, pending changes, draft fields and correct data persistence.
- **BUG-005:** Multiple Simple R2 destinations require a data-model and background context-menu mapping change, not just another settings button.
- **BUG-009:** The OAuth refresh-token missing branch is confirmed. Inspect why renewal credentials aren't always available, and audit API/Worker paths before touching authentication; do not replace scoped OAuth with long-lived insecure credentials.
- **BUG-001/002:** Native Chrome parent context-menu entries cannot simultaneously act as a direct-click destination and a hover submenu under the current API. A custom menu surface would need separate design and accessibility testing.

**Validation note:** Repository updates were committed, but the installed extension has not been exercised; runtime/browser and automated tests remain outstanding.

### October 10 — BUG-003 first-pass layout fix

Updated `extension/options.html` upload-path CSS to bound rows to their parent width, use flexible min-width-zero selection/input columns, stack the new-child input below the existing-child dropdown, constrain indentation, and keep action buttons in fixed-width columns. Commit `78aaa0f`. This is a stylesheet-only change; no remote directory operations were changed. Visual confirmation in the installed extension remains necessary, especially at 1366×768 and several child levels.

**Pause point:** The next remaining Explorer pagination task (BUG-006) is more substantial because it interacts with remote cursor pages, sorting, selection, keyboard navigation, and current load-more state. Do not treat it as a pure CSS change.

### October 10 — BUG-006 pagination implementation

Replaced the cumulative `Show more` rendering in `extension/options.js` with 25/50/100 entry page sizes (50 by default), Previous/Next controls, visible-range count, and page navigation that replaces rather than appends rendered rows. `extension/options.html` now contains a pagination footer and CSS for bounded internal file-list scrolling. Changing folders/search resets the page; selecting a file can navigate to its containing loaded page. Next loads additional R2 cursor batches when necessary (bounded to 20 additional batches per click). Source changes: `1d9e108`, `dafdbf3`, `5745d68`.

**Manual verification required before closing:** At 1366×768, test 25/50/100 entries per page; check scrolling, buttons, folder transitions, sorting, keyboard selection, multi-select, search, archive contents, Downloads-to-Explorer jumps, and remote folders containing more entries than an initial R2 cursor response. File counts are counts of loaded items (a `+` indicates more available), not a guaranteed total until all remote results are fetched. This does not implement server-side global sorting of all unseen R2 objects.

### October 10 — Numbered Explorer pages refinement

Explorer footer now uses **‹ 1 2 3 … [current-page neighborhood] … [last loaded page] ›** instead of only Previous/Next text buttons. Current page is highlighted; page-size choices remain 25/50/100. When an R2 continuation cursor exists, the true final page is unknown, so the final numbered button represents the **last loaded page**, with a **More pages available** indicator and forward navigation fetching more batches. Do not label that as the ultimate last page until the cursor is exhausted. Implementation commits `818652e` and `bd60fa3`. Manual installed-Chrome validation remains pending.


## BUG-011 — Right-click video transfers fail on some websites

**Status:** Open · user-reported site-specific compatibility; root cause unverified

The user can right-click media and send it to a REDOWN destination from ordinary websites (including 4chan), but reports that videos from `watchpeoplelive.tv` do not transfer successfully. It is not yet known whether the site exposes a direct media URL, whether the video uses HLS/DASH segments or browser `blob:` URLs, or whether the source enforces access restrictions. Do not characterize the failure as a Cloudflare permission problem without evidence.

**Source observations:**
- `extension/background.js` selects `info.srcUrl || info.linkUrl || info.pageUrl` as the source, and recognizes `info.mediaType === "video"` when categorizing files.
- The remote-ingest fetch path expects an accessible public HTTPS URL and may reject a failed HTTP response, a missing response body, private/insecure addresses, or files beyond configured size limits.
- Some embedded players provide a playlist, segmented stream, expiring signed URL, or `blob:` reference rather than a standalone downloadable video. Source-side session, Referer, anti-hotlink, or authorization requirements are also possible. These are hypotheses, not confirmed findings for the named website.

**Expected behavior:** REDOWN distinguishes direct downloadable media files from embedded/segmented/unsupported streams, succeeds on publicly accessible media where possible, and reports a specific, accurate reason for failure instead of implying a Cloudflare permission fault.

**Acceptance criteria:**
- Reproduce using a permitted, non-DRM video from an ordinary direct-file site and a failing embedded-video site; record the context menu input (`mediaType`, URL scheme, file extension only), HTTP status, and which stage fails without logging access tokens or sensitive signed query parameters.
- Detect `blob:`, non-HTTPS, HLS `.m3u8`, and DASH `.mpd` URLs, and distinguish them from ordinary `.mp4` / `.webm` transfers.
- Preserve working downloads from straightforward image/video hosts.
- Show a meaningful failure message for inaccessible, signed-expired, 401/403, segmented-stream, oversized, or unsupported sources.
- If implementing support for an authorized, unprotected segmented-media source, separately design assembly, size/time/cost limits, consent, and streaming behavior. Do not bypass DRM, authentication, or site access controls.
- Confirm whether the user's failure occurs before transfer begins, during source fetch, or during Cloudflare upload; document the exact cause once reproduced.

**Relevant code:** `extension/background.js` `selectedUrl()`, `categoryForContext()`, `checkedFetch()`, remote ingest and error recording; Downloads error surface in `extension/options.js`.


## BUG-012 — Nested destination dropdowns show incorrect folder hierarchy or omit children

**Status:** Open · screenshot-supported user report; exact cause not yet reproduced

In the **Nested · Cloudflare locations** editor, the user selects bucket `extended` and clicks **+ Child**, but the first child selection offers `extended` again rather than the immediate folders they expect under the bucket. A further level offers `animeplex.lol`, and the next dropdown does not show the expected children of that folder. The displayed path becomes `extended/extended/animeplex.lol/`, apparently introducing an unwanted duplicate level. The screenshot shows an unassigned final child row. We must confirm the actual R2 keys/folder markers before deciding whether the duplicate is a real folder, stale saved configuration, or a discovery/path bug.

**Expected behavior:** The bucket is selected once as the root. Every **+ Child** dropdown lists only the immediate existing folders under the exact selected parent prefix, without inserting or suggesting a duplicate bucket name unless that is genuinely an existing folder. For example, `extended` bucket → `animeplex.lol` → actual children inside `animeplex.lol/`. Creation of a new folder must remain a separate explicit action.

**Acceptance criteria:**
- Query immediate folders under the bucket's empty prefix for the first child; under `animeplex.lol/` for its child; and so on at arbitrary depth.
- Do not mistake the bucket name for a folder name, prepend an extra `extended/`, or list top-level buckets in child selectors.
- Differentiate a genuine same-named folder (if R2 actually contains `extended/`) from an accidental duplicate; never silently modify or delete existing R2 data.
- On selecting a parent, update descendants using its correct full prefix, preserve the selection and typed drafts, and show loading/errors explicitly.
- Verify with actual R2 directory prefixes, existing marker objects, and folders represented only by object keys; test three or more depths.
- Ensure saved nested-menu paths match the dropdown hierarchy and right-click destinations.
- Test together with BUG-004 (full-editor rerenders) because asynchronous fetching and rerenders could cause stale or misleading child options.

**Relevant code:** `extension/nested-menu-editor.js` `folderRow()`, `rootRow()`, `repaint()`; `extension/background.js` `listFolderChildren()`, `cfFolderChildren`; `extension/nested-locations.js` `path()` and `setLocation()`.

**Evidence:** User screenshot provided October 10, 2026, showing `extended` bucket → `extended` folder → `animeplex.lol` → unassigned child dropdown.


## BUG-013 — Upload from Computer child-folder dropdown omits or fails to load existing subfolders

**Status:** Open · screenshot-supported user report; separate from right-click nested menu BUG-012

In **Upload from computer**, after choosing the Cloudflare R2 bucket `works`, the user reports that the successive **Location / + Child** dropdowns do not reliably enumerate the real immediate child folders. Only one or a few options appear, and deeper existing folders may be unavailable even though the user expects them in R2. The screenshot shows the root selection `Komochi_Tsuma_no_Arai-san_Arai-san_a_wife_with_a_child`, then `chapter_1`, a second input also containing `chapter_1`, and an additional empty **Choose an existing child…** row. This is **not** the same panel as the nested right-click menu; do not treat fixing BUG-012 as sufficient.

**Expected behavior:** Selecting bucket `works` displays *all* actual top-level folders in that bucket. Selecting a parent folder then lists all its immediate existing children from R2; the next level is scoped to that exact parent path. Existing-folder selection is separate from the new-folder text field. The UI must honestly indicate loading, incomplete results, and errors rather than showing a partial list as complete.

**Code-level investigation points:**
- `extension/options.js`: `fetchUploadBuilderChildren()` requests `cfFolderChildren` with `limit:250` but silently returns `[]` on a failed response; this can make an authorization or API error look like an empty folder.
- `uploadBuilderChildren()` derives entries from cached `uploadLocationPrefixes` and may show previously cached entries while the live request is still pending.
- `renderUploadLocationBuilder()` asynchronously populates dropdown options; investigate stale requests, bucket changes, and whether previous selections/new-folder drafts are being displayed as separate path levels.
- `extension/background.js` `listFolderChildren()` loops through R2 delimiter/cursor pages but stops at the requested limit; check missing subfolders, folder-marker representation, and whether the provider returns all prefixes.
- The screenshot does **not** prove Cloudflare connectivity is broken or that all expected child folders exist remotely. Compare actual R2 object keys and directory markers before assigning the root cause.

**Acceptance criteria:**
- List immediate child folders accurately under the selected account/bucket/parent prefix, including directories represented only by deeper object keys and folders with marker objects.
- Fetch additional result pages as needed and show a clear **Loading folders…** / **Loading more folders…** indicator. If results are capped, label them as incomplete and offer further loading.
- Expose per-row fetch failures and a **Retry** action; distinguish empty folder from authorization/Worker/API error instead of silently returning an empty list.
- Ensure asynchronous results from a previous bucket or parent cannot overwrite the new selection.
- Selecting an existing folder does not copy its name into **Create new child** input or produce an unintended duplicate path segment.
- Ensure an empty child row does not create a folder, and upload destination always reflects the exact selected hierarchy.
- Test with a bucket containing many siblings (more than 250), deep folders (3+ levels), and with temporary Cloudflare failures.
- Preserve the layout improvement from BUG-003 without reintroducing overflow at 1366×768.

**Evidence:** User screenshot October 10, 2026 of Upload from Computer showing `works` and a partly populated multi-level location builder.


### October 10 follow-up — misleading top-right locations after selecting a bucket

**Additional screenshot:** The left **Bucket** selector was set to `extended`, while the right **Location** selector offered `works` and allowed a path beneath it. The user reports that the child list under this combination is incomplete, whereas selecting the corresponding real bucket in the **left** selector leads to correctly enumerated children. The user reasonably interprets the right-hand option as another bucket; the UI must not present a cached or unrelated path as if it is a verified folder belonging to the selected bucket.

**Confirmed code-level contamination risk:** `loadUploadLocations()` in `extension/options.js` combines live `cfFolderChildren` results for the selected bucket with values from `uploadProfile()?.folders`, without verifying those saved prefixes against the live bucket hierarchy. It also preserves a previously selected `local-prefix` value even after changing the bucket. These mechanisms can make a path from an earlier preset or selection appear under a different bucket. This is a concrete suspect mechanism, not yet runtime proof of every option shown in the screenshot.

**Fix requirements:**
- Bind the Location options, cached prefixes and selected path strictly to the selected **account ID + bucket name**, resetting them on bucket changes unless the path is actually validated in the newly selected bucket.
- Populate the first location dropdown from verified *immediate* children of that bucket. Never mix other bucket names or unverified profile defaults into the verified list.
- If a saved preset references a missing path, show it separately as **Saved path — not verified in this bucket**; don't silently present it as an existing folder.
- Clear or validate old selections before rendering descendants, and discard stale asynchronous responses if bucket selection changes while loading.
- Preserve a visible **Loading folders…** state, distinguish incomplete results from empty folders, and surface lookup failures with retry.
- Compare results from the left-selected `works` bucket against those for `extended` with `works` selected on the right, to reproduce and isolate the mismatch.


### Clarification — strict separation of Bucket and Location selectors (October 10, 2026)

**User requirement:** The **left** selector is the **only bucket selector**. The **right** selector is **not another bucket selector** and MUST contain exclusively the verified **immediate child folder names** of the bucket selected on the left. It MUST NOT list bucket names, unrelated account locations, stale profile defaults, or folders from any other bucket as choices.

**Required semantics and tests:**
- Left: select an account/bucket. Right: query that exact account + bucket at root prefix `""` and display only its immediate child folders.
- The right selector must not provide alternative bucket selection, even if an actual child folder happens to share a bucket's name. Treat such a value strictly as a verified folder from the selected bucket, not a bucket; never substitute cached bucket names for directory results.
- Descending into a selected right-side folder reveals only its own immediate children at the next location level. Do not flatten grandchildren into the initial selector.
- On left bucket change, discard stale child options and selections, show a clear loading state, then repopulate from the new bucket's verified immediate children. Ignore late responses for old bucket requests.
- For an empty bucket, show an honest empty-folder state; for lookup failure, show the error and Retry rather than using bucket lists or stale options as a fallback.
- Test two buckets with overlapping folder names and distinct trees; ensure the right dropdown contains only the correct immediate children before/after rapid bucket switching.
- Preserve **Create new location** as a separate empty draft field. Selecting an existing folder on the right must not copy the selection into the draft (see BUG-014).

**Scope:** This tightens BUG-013's wrong-bucket/mixed-prefix report. No implementation change or browser verification has yet occurred for this clarification.

## BUG-014 — Upload from Computer: choosing an existing location fills the new-name input

**Status:** Open · user-reported regression (October 10, 2026); runtime mechanism not yet verified

In the **Upload from Computer** location builder, selecting an existing folder from a dropdown also fills the adjacent text input intended for **creating** a new folder. The selected existing location appears twice in different roles, creating confusion and potentially implying that a duplicate directory will be created. This is distinct from the earlier cramped-layout defect and overlaps BUG-013's separation-of-selection requirement.

**Expected behavior:** The dropdown represents the *existing selected location*. The text field represents an *optional, new, not-yet-created child name*. Selecting an existing folder MUST NOT copy its name into this text field. It should remain empty unless the user explicitly typed a draft.

**Acceptance criteria:**
- Select a bucket, then an existing location at any depth; the adjacent **New location / Create child** input stays empty.
- If a user has manually typed a draft, selecting another existing location must not silently populate or overwrite it; if its parent changes, handle the draft explicitly and predictably.
- The selected path appears once as a chosen existing destination; no duplicate segment is appended by selection alone.
- Creating a new location requires explicit user action and must use the exact currently selected account/bucket/parent path.
- Reopening and changing dropdowns does not generate extra folders, duplicate input text, or unintended Cloudflare writes.
- Add a deterministic DOM regression for existing location selection and independent draft preservation in **Upload from Computer**, not merely in the Nested editor.

**Investigation:** Inspect `extension/options.js` upload location state, row rendering, dropdown change handlers, `local-prefix`, cached prefixes, and new-name draft binding. Keep existing dropdowns and compact layout; do not redesign the panel to fix a data-binding bug. Cross-reference BUG-013 and its stale bucket/profile cache risk.

## BUG-015 — Explorer and file previews should show a verified public URL alongside local blob preview URLs

**Status:** Open · requested capability (October 10, 2026); bucket-by-bucket eligibility unknown

A preview currently may have a browser-local `blob:` URL, useful for rendering locally, but it is not a durable publicly shareable address. For objects in a Cloudflare R2 bucket configured for public access with a resolvable public base/custom-domain URL, also show the **actual public URL**, without removing the blob-based preview option.

**Expected behavior:** Expose distinct, plainly labeled **Local preview URL (blob)** and **Public URL** where applicable. A private bucket or inaccessible object must not display a fabricated public URL; show **Public URL unavailable — bucket/object not publicly accessible or not configured** when that is the supported finding.

**Acceptance criteria:**
- A local `blob:` preview can continue functioning for eligible files regardless of whether the bucket is public; label it as temporary and browser-local, not a sharable public link.
- Where an R2 bucket has a verified public-domain/base URL and the object key is eligible, display its canonical object URL separately, with copy/open controls and correct URL encoding for nested keys and special characters.
- Never assume `https://<bucket>.<provider-domain>/...` is public merely because a bucket exists. Resolve and verify configured public URL metadata and distinguish configured/verified/unverified/unavailable states.
- Do not mistake authenticated Worker download/preview URLs or short-lived signed URLs for unrestricted public URLs. Do not leak credentials or private access tokens in UI, logs, or copied links.
- A private bucket displays no invented public URL; do not automatically enable public bucket access merely to provide a link.
- If public access changes, or an object is missing/blocked, present appropriate status and errors rather than promising a working public URL.
- Preserve current preview/lightbox behavior and object identity. Test public/custom-domain, private, missing-domain, nested/Unicode key, and cross-account cases.

**Investigation:** Inspect `extension/options.js` Explorer/preview URL handling, Cloudflare R2 bucket public endpoint metadata, profile configuration, stored per-object URLs, and authenticated blob creation. If public URL verification requires an extra network request, use an explicit bounded, safe check and honest freshness indication. This feature is **additive**, not a requirement to convert private objects into public files.

## BUG-016 — Simple Mode settings unnecessarily rerender the entire panel after small edits

**Status:** Open · user-reported UX/state regression (October 10, 2026); exact triggering handlers still to be traced

In the **Simple right-click menu** settings panel, a small change to an existing selection or configuration causes the wider editor to reload/rebuild. This interrupts interaction and may reset focus, scroll, dropdown openness, draft names, or sibling row state.

**Expected behavior:** Simple Mode should update only the changed row and dependent descendants. A dropdown selection or text-field change must not destroy and recreate unrelated settings UI. Preserve the already simple and usable design.

**Acceptance criteria:**
- Opening/closing a dropdown without changing its value causes no panel rerender or unnecessary location fetch.
- Changing a bucket or existing folder updates only the affected row and dependent path segments; other destinations and profiles remain mounted and stable.
- Typing in a new-name field does not recreate the panel, overwrite the draft, change scroll position, or lose keyboard focus.
- Async completion, save failure and stale responses cannot undo more recent user selections or disable valid controls.
- Updates to menu configuration persist and are reflected in the right-click menu without rebuilding the entire settings page unnecessarily.
- Add DOM regression tests for rerender counts, focus/draft preservation, sibling identity and async out-of-order operations, including nested paths.
- Preserve existing Simple Mode aesthetics and interaction patterns; prefer a narrowly scoped update/reconciliation over a redesign.

**Investigation:** Trace `extension/options.js` Simple Mode rendering and profile save/refresh paths, relevant callbacks and bucket/folder fetches; distinguish a necessary native context-menu rebuild from an avoidable settings-panel DOM rebuild. Related but independent: BUG-004 (Nested Mode full-editor refresh), BUG-005 (multiple independent Simple destinations).

