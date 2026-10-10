# REDOWN bugs

Open reports recorded on October 3, 2026 (America/Chicago), against the v0.5.12 interface. These are reports and acceptance criteria, not completed fixes.

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

**Status:** Open · user-reported layout defect / source-confirmed load-more behavior

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
