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

**Status:** Open · screenshot-supported layout defect

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
