# Codex Implementation Prompt — Premium Remote File Explorer

Implement the proposal in:

`docs/proposals/remote-file-explorer.md`

The primary goal is to redesign and upgrade REDOWN's **Explore** section into a premium, intuitive remote file manager that feels immediately familiar to users of Windows File Explorer and KDE Dolphin.

Do not redesign the entire extension. Focus the implementation on the Explore/file-management experience and the supporting background/Worker APIs needed to make it function.

## Product goal

REDOWN should let a connected Cloudflare user browse and manage the **entire accessible R2 account**, not only buckets that have already been configured as REDOWN right-click destination profiles.

The finished Explorer should feel like a polished desktop file manager translated onto Cloudflare R2.

The user should not need to understand buckets, object keys, or prefixes beyond the natural concepts of:

- account
- storage location / bucket
- folder
- file

Use normal file-manager conventions wherever possible. Do not invent unusual interaction patterns when Windows File Explorer or Dolphin already provide a familiar answer.

## Important current limitation to fix

The current Explore implementation derives its bucket selector from configured REDOWN profiles.

That means Explorer is effectively limited to buckets that have already been provisioned as REDOWN destinations.

Change this architecture.

Explorer state should be independent of right-click destination profiles.

The Cloudflare connection already exposes account-level data through the existing background messages for accounts, buckets, and objects. Use those account-level APIs as the source of truth for Explorer.

A bucket may have a matching REDOWN profile, but that profile must not be required for the bucket to appear or be browsed.

## Required Explorer hierarchy

Present Cloudflare storage approximately as:

```text
Cloudflare
└── Account
    ├── Bucket A
    │   ├── folder
    │   │   └── file
    │   └── file
    ├── Bucket B
    └── Bucket C
```

If multiple accounts are accessible, show all accounts cleanly.

On desktop, strongly prefer a persistent left-side source/sidebar model inspired by Dolphin/File Explorer.

On smaller screens, gracefully collapse this into a compact selector or drawer without losing functionality.

## Synthetic directories

R2 has object keys rather than real folders.

Translate key prefixes into normal directory entries.

For example, these keys:

```text
3d/characters/hero.glb
3d/characters/villain.glb
3d/props/chair.glb
images/logo.png
```

must render at bucket root as:

```text
3d/
images/
```

Opening `3d/` should show:

```text
characters/
props/
```

and opening `characters/` should show:

```text
hero.glb
villain.glb
```

Do not show users a flat list of full object keys when a normal directory view can be inferred.

Continue hiding REDOWN marker objects such as `.redown`.

## Premium desktop-style navigation

Implement a polished navigation model with:

- Back
- Forward
- Up
- clickable breadcrumbs
- current location
- Refresh
- Search
- selected account/bucket visibility
- remembered navigation history within the Explorer

Breadcrumb example:

```text
Cloudflare > My Account > webrev-assets > 3d > characters
```

Each breadcrumb segment must be clickable.

The existing raw prefix field should no longer be the primary way to navigate. It may remain as an advanced/internal affordance if useful.

## Main file list

Use a familiar details/list view.

At minimum expose:

- Name
- Size
- Modified
- Type

Folders should be visually distinguishable from files.

Use restrained, high-quality spacing, typography, hover states, selection states, icons, dividers, context menus, and focus states.

The visual goal is premium and quiet, not flashy.

REDOWN already has a dark visual identity. Preserve that identity while making the Explorer feel significantly more refined.

Avoid visual clutter, excessive cards, excessive gradients, or controls that make the file surface feel like a settings screen.

The Explorer should feel like an application workspace.

## Selection behavior

Implement standard desktop selection where practical:

- click selects
- Ctrl/Cmd+click toggles selection
- Shift+click selects a range
- Ctrl/Cmd+A selects visible items
- double click opens folders or files
- Enter opens selected item
- Escape clears transient UI such as context menus or rename mode

Maintain an explicit internal selected-items set.

The context menu should operate on the current selection.

## Standard right-click context menu

For files, support:

```text
Open / Preview
Download
----------------
Cut
Copy
Paste
----------------
Rename
Delete
----------------
Copy URL
Properties
```

For folders:

```text
Open
----------------
Cut
Copy
Paste
----------------
Rename
Delete
----------------
New folder
Properties
```

For empty Explorer background:

```text
Paste
New folder
Upload files
Refresh
```

Disable unavailable actions rather than displaying broken options.

Keep menu ordering close to standard desktop file-manager expectations.

## Copy / Cut / Paste

Implement an Explorer clipboard abstraction.

For example:

```js
{
  operation: "copy", // or "move"
  accountId,
  bucketName,
  keys: [...]
}
```

The clipboard stores references only.

Do not load the complete object payload into browser memory simply because the user chose Copy.

Users must be able to:

1. right-click one or more files/folders
2. Copy or Cut
3. navigate to another folder
4. optionally navigate to another bucket
5. Paste

This should work across directories and, where technically feasible with the available REDOWN architecture, across buckets.

## Move semantics

For object storage, "Move" can internally be implemented as:

1. create/copy the destination object
2. verify success
3. delete the source object

For directory moves, repeat for all keys under the source prefix.

The user-facing UI should simply call this **Move**.

Do not expose implementation jargon.

## Cloud-side transfer principle

Preserve REDOWN's central philosophy:

> Remote files should move remotely.

For large copy/move operations, do not unnecessarily route object bytes through extension/browser memory.

Reuse the existing per-bucket REDOWN Worker architecture where appropriate.

If file-management actions require a bucket to be prepared with Worker functionality, support lazy preparation/provisioning without forcing the user to first create a right-click download preset.

A bucket's Explorer availability and a bucket's right-click-preset configuration must remain separate concepts.

User-facing status should say things like:

```text
Preparing bucket for file operations…
Copying 8 files…
Moving 1.2 GB…
```

not implementation-heavy Worker/R2 terminology unless shown in diagnostics.

## Download

Within Explorer, **Download** means downloading the selected remote object to the user's local computer.

Implement single-file download cleanly.

Architect multi-file/folder download so it can be added without undoing the Explorer model.

Do not confuse Explorer Download with REDOWN's browser-context remote-ingest action.

## Upload

Reuse REDOWN's existing local-upload machinery.

Make upload contextual:

- dragging local files into the file list uploads to the currently open folder
- dragging local files onto a folder uploads into that folder
- right-click background -> Upload files
- an Upload button may also be present

The user should not need to manually duplicate the active prefix in a separate input field.

The visual Explorer location should define the upload destination.

## Rename

Support standard inline rename:

- right-click -> Rename
- F2
- inline text field
- Enter commits
- Escape cancels
- select the basename while preserving the extension when practical

Existing object rename support may be reused/refactored.

Folder rename requires rewriting the keys under that prefix.

For folder operations involving many objects, expose progress and errors.

## Delete

Support Delete for:

- file
- multiple files
- folder/prefix
- mixed selections

Folder deletion means deleting all keys underneath that prefix.

Before destructive operations, show a concise confirmation with useful scope.

Example:

```text
Delete "characters" and 143 files inside it?
```

Do not pretend a large multi-object operation is atomic.

Surface partial failures clearly.

## New folder

Implement `New folder`.

Because R2 cannot inherently represent an empty directory, use REDOWN's existing hidden marker-object approach or an equivalent compatible mechanism.

The marker must remain invisible during normal browsing.

## Search

Implement a proper Explorer search box.

Initial scope can be the current bucket.

Current-folder search is also acceptable if made clear.

Search should be based on object key/name and present results as normal file entries.

Results should expose enough location information to support:

- Open
- Open file location
- Copy
- Cut
- Download
- Rename
- Delete

Do not make manual prefix entry the main search experience.

## Preview

Keep and polish the existing REDOWN preview pane.

Retain support for the formats already handled, including images, video, audio, PDF, text/code, and metadata/details.

The preview pane should be collapsible and subordinate to the file list.

Selection should drive preview.

Do not turn the preview into the main navigation surface.

## Properties

Add a Properties surface for technical information that should not clutter the main file list.

Useful fields include:

- Name
- Type
- Size
- Modified
- Bucket
- Path
- Public URL when available
- ETag
- Content-Type
- custom metadata when available

This is the correct place for R2-specific information.

## Suggested Explorer state

Refactor away from:

```js
workspaceTarget = REDOWN profile
```

toward something conceptually like:

```js
workspaceLocation = {
  accountId,
  accountName,
  bucketName,
  prefix
}
```

Then independently derive:

- matching REDOWN profile, if one exists
- selected objects
- clipboard
- back history
- forward history
- search state
- preview state

## Background API

Reuse existing APIs where possible:

- `cfAccounts`
- `cfBuckets`
- `cfObjects`

Add well-scoped internal actions as needed, for example:

- `cfCopyObjects`
- `cfMoveObjects`
- `cfDeleteObjects`
- `cfRenameObject`
- `cfCreateFolder`
- `cfDownloadObject`

Names may differ if a cleaner internal design emerges.

Keep UI intent separate from R2 implementation details.

## Bucket enumeration bug / concern

Investigate why the user currently experiences only one bucket appearing.

Do not simply patch the selector.

Ensure bucket enumeration is account-wide, reliable, and not constrained by the configured profile list.

If the Cloudflare API response is paginated, handle pagination correctly rather than assuming the first response contains the entire account.

Likewise, object listing should be designed with pagination/cursors in mind so large buckets do not silently truncate.

## Performance

Keep REDOWN lightweight.

Requirements:

- no unnecessary framework migration
- avoid adding a large dependency for interactions that can be cleanly implemented in the existing architecture
- do not render thousands of objects at once without limits/virtualization/pagination strategy
- avoid large object contents in extension memory
- keep interactions responsive
- render incremental/progress states for long operations

A premium experience should feel fast, not heavy.

## Accessibility and interaction quality

Include:

- keyboard focus states
- sensible tab order
- ARIA roles/labels where useful
- usable keyboard context-menu alternative
- sufficient contrast
- no hover-only critical functionality
- clear busy/progress/error states

## Preserve working behavior

Do not regress:

- Cloudflare OAuth
- account enumeration
- bucket creation
- right-click destination presets
- nested preset menu trees
- GitHub destination support
- remote ingest
- local upload
- download history
- object previews
- rename behavior already working elsewhere
- custom asset domains/CORS configuration

Refactor shared logic rather than duplicating it where practical.

## UX principle

When deciding how an interaction should work, ask:

> What would a Windows File Explorer or Dolphin user expect here?

Use that expectation unless R2 makes it impossible.

If R2 imposes an unusual internal implementation, hide that complexity behind the conventional interaction whenever possible.



## Provisioning / propagation waiting state

There is an important current UX problem after a fresh Cloudflare login or when a user clicks a bucket that is only just becoming usable.

The bucket/Worker path may take several minutes to become reachable or fully authorized from the browser. During that window, the current experience can surface **Unauthorized** even though the setup is still propagating and later succeeds.

Do not present this temporary propagation state as a failure.

### Required behavior

When a newly connected or newly prepared bucket is not yet reachable:

- enter a visible **Preparing / Connecting / Finishing setup** state
- keep the user on the current screen
- disable only actions that truly cannot run yet
- show an indeterminate progress indicator or calm progress status
- retry automatically with backoff
- distinguish temporary 401/403/route/DNS/Worker-readiness responses from a confirmed invalid-auth state
- keep retrying for the existing provisioning window or a reasonable bounded period
- if the operation eventually succeeds, transition directly into the bucket Explorer without requiring another click
- only show a hard failure after the retry/provisioning window is exhausted or when the API returns a clearly terminal authorization error

Suggested user-facing copy:

```text
Preparing this bucket…
Cloudflare is finishing setup. This can take a few minutes.
```

Optional secondary copy:

```text
You can leave this open. REDOWN will continue checking automatically.
```

Do not show raw messages such as:

```text
Unauthorized
401
Worker unavailable
DNS error
```

during the expected propagation window.

If a true terminal failure occurs, show a useful final error with a retry action and concise diagnostics.

### State model

Prefer an explicit state machine such as:

```text
idle
connecting
provisioning
propagating
ready
failed
```

Avoid deriving the UX directly from one transient HTTP response.

### UX goal

The user should think:

> REDOWN is still finishing setup.

not:

> My login failed.

This is especially important immediately after OAuth connection and the first time a bucket is opened or prepared.

## Validation

Before completion, test or reason through at least these scenarios:

1. Cloudflare account with one bucket.
2. Cloudflare account with several buckets.
3. Bucket that has no REDOWN destination profile.
4. Bucket that already has a REDOWN profile.
5. Empty bucket.
6. Deep prefix hierarchy.
7. Hundreds of objects.
8. Copy within same folder.
9. Copy to another folder.
10. Move within bucket.
11. Copy/move across buckets.
12. Rename file.
13. Rename folder with descendants.
14. Delete file.
15. Delete non-empty folder.
16. Create empty folder.
17. Upload into currently open folder.
18. Navigate Back / Forward / Up.
19. Search and open file location.
20. Refresh after an external change.
21. Preview supported file types.
22. Keyboard selection and shortcuts.
23. Context-menu actions with multi-selection.
24. Failure during a multi-object operation.

## Deliverables

Implement the Explorer, not merely a visual mockup.

At completion provide:

- concise summary of architecture changes
- files changed
- new/changed background message APIs
- explanation of how synthetic folders are derived
- explanation of how cross-folder/cross-bucket copy/move works
- any known limitations
- tests/checks performed
- screenshots if practical
- final commit SHA / PR information if the workflow creates one

The result should make REDOWN's Explore area feel like a **premium remote file system browser**, while staying recognizably REDOWN and remaining lightweight.
