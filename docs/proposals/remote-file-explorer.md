# Remote File Explorer

## Purpose

REDOWN's Explorer should behave as much like a normal desktop file manager as possible.

The reference interaction model is **Windows File Explorer** and **KDE Dolphin**. Users should not have to learn "R2 object storage" concepts in order to browse, organize, copy, move, rename, download, or upload their files.

The guiding rule is:

> Do not reinvent file management. Translate familiar file-manager behavior onto Cloudflare R2.

Cloudflare R2 does not have real directories. It has buckets and object keys. REDOWN should hide that implementation detail by presenting prefixes as normal folders.

---

## Current limitation

The current Explore implementation is tied to configured REDOWN R2 destination profiles.

In the present code:

- `renderWorkspaceProfiles()` builds the bucket selector from `profiles.filter(p => p.type === "cloudflare-r2")`.
- A bucket therefore appears in Explore only after it has already been made into a REDOWN destination/profile.
- The Cloudflare connection itself can enumerate accounts and buckets through `cfAccounts` and `cfBuckets`, but Explore does not use that account-wide inventory.
- `browseWorkspace()` browses only the currently selected profile's `accountId` + `bucketName`.

This is why it can feel like REDOWN only has one bucket even when the Cloudflare account contains several.

**Explorer and right-click destination presets should be separate concepts.**

A connected Cloudflare account should be browsable in its entirety whether or not any bucket has been configured as a REDOWN preset.

---

# Reference model: Windows File Explorer

Windows File Explorer gives users a very familiar set of expectations.

## Navigation

Typical structure:

```text
This PC
├── Drive C:
├── Drive D:
└── Network / cloud locations
```

For REDOWN, the equivalent should be:

```text
Cloudflare
└── Account
    ├── Bucket A
    ├── Bucket B
    ├── Bucket C
    └── Bucket D
```

A bucket should feel roughly like a drive or top-level storage location.

Inside a bucket:

```text
Bucket A
├── images
│   ├── portraits
│   └── textures
├── video
└── models
```

These "folders" are synthetic views of R2 prefixes.

## Familiar Windows behaviors to preserve

REDOWN should support the recognizable behaviors people already expect:

- single click selects
- double click opens a folder or file
- Back and Forward navigation
- Up one level
- breadcrumb path
- search box
- refresh
- sortable columns
- right-click context menu
- Copy
- Cut
- Paste
- Rename
- Delete
- Download
- New folder
- drag and drop
- multi-selection with Ctrl
- range selection with Shift
- keyboard shortcuts where practical
- `Ctrl+C`, `Ctrl+X`, `Ctrl+V`
- `F2` to rename
- `Delete` to delete
- `Ctrl+A` to select all
- `Enter` to open
- `Backspace` or Alt+Left for back navigation where appropriate

The UI does not need to visually clone Windows. The **behavioral vocabulary** is what matters.

---

# Reference model: KDE Dolphin

KDE Dolphin is especially useful as a reference because it combines a conventional file manager with powerful but understandable navigation.

Useful Dolphin conventions for REDOWN include:

## Places / source sidebar

Dolphin commonly exposes storage locations in a persistent sidebar.

REDOWN can use the same mental model:

```text
Cloudflare
  My Account
    bucket-assets
    bucket-backups
    bucket-site
    bucket-video
```

If multiple Cloudflare accounts are connected later:

```text
Cloudflare
  Personal
    bucket-a
    bucket-b

  Work
    assets
    archive
```

This makes switching buckets far more obvious than hiding all storage behind a single dropdown.

## Breadcrumb navigation

Dolphin's breadcrumb model translates cleanly:

```text
Cloudflare > My Account > webrev-assets > 3d > characters
```

Every breadcrumb segment should be clickable.

A user should never have to manually type a prefix just to move around.

The existing "Prefix filter" field can become secondary/advanced functionality rather than the primary navigation mechanism.

## Split-view inspiration

Dolphin supports two-pane browsing.

REDOWN does not need split view for the first version, but the architecture should not prevent it.

A future mode could show:

```text
SOURCE                         DESTINATION
bucket-a / images              bucket-b / archive
```

Then drag/drop or Copy/Paste between them.

This would be especially valuable for R2 management.

---

# REDOWN Explorer model

## Hierarchy

REDOWN should present:

```text
Provider
  -> Account
    -> Bucket
      -> Folder-like prefix
        -> Folder-like prefix
          -> Object
```

For the current product:

```text
Cloudflare
  -> Cloudflare account
    -> R2 bucket
      -> prefix
        -> object
```

The user should not need to know that folders are actually prefixes.

---

# Whole-account browsing

This is a prime use case.

Once Cloudflare is connected, Explorer should enumerate:

1. all available Cloudflare accounts
2. all R2 buckets for the selected account
3. all visible folder-like prefixes and objects in the selected bucket

This must happen independently of REDOWN right-click presets.

## Important distinction

### Destination profiles

These answer:

> Where should REDOWN send a remote download when I use the browser right-click menu?

### Explorer

This answers:

> What files are in my Cloudflare account, and how do I manage them?

A bucket should not need to become a download preset before it can be viewed.

---

# Folder behavior over R2 prefixes

R2 object keys can emulate folders naturally.

Example objects:

```text
3d/characters/hero.glb
3d/characters/villain.glb
3d/props/chair.glb
images/logo.png
```

REDOWN should render:

```text
3d/
  characters/
    hero.glb
    villain.glb
  props/
    chair.glb

images/
  logo.png
```

The UI should derive child directories from the next path segment rather than displaying every full object key as one flat list.

## Opening a folder

Opening `3d/` simply changes the active prefix to:

```text
3d/
```

Opening `characters/` changes it to:

```text
3d/characters/
```

No real directory needs to exist.

## Empty folders

R2 cannot inherently represent an empty directory.

REDOWN already has the concept of `.redown` marker objects.

That mechanism can continue to represent intentionally created empty folders while hiding the marker from normal Explorer views.

---

# Main Explorer layout

A conventional layout is preferred:

```text
┌─────────────────────────────────────────────────────────────┐
│ Back  Forward  Up   Cloudflare > Account > Bucket > folder │
│                                            Search [       ] │
├──────────────────┬──────────────────────────────────────────┤
│ Cloudflare       │ Name          Size      Modified   Type  │
│   Account        │ 📁 images                               │
│     Bucket A     │ 📁 models                               │
│     Bucket B     │ 📄 logo.png    184 KB   ...       PNG   │
│     Bucket C     │ 📄 ship.glb    4.2 MB   ...       GLB   │
│                  │                                          │
├──────────────────┴──────────────────────────────────────────┤
│ Optional preview/details pane                               │
└─────────────────────────────────────────────────────────────┘
```

The existing preview pane can remain. It is useful and already fits the file-manager model.

---

# Bucket switching

Buckets should be visible as first-class storage locations.

Preferred behavior:

- account in sidebar
- all buckets beneath it
- clicking a bucket opens its root
- currently selected bucket is visually highlighted
- switching buckets should not require creating a REDOWN destination profile
- Refresh should refresh the selected folder/bucket
- an account-level refresh should re-enumerate buckets

A compact bucket dropdown can still exist for small/mobile layouts, but desktop Explorer should make the bucket tree obvious.

---

# Search

Search should feel like file search, not like manually supplying an R2 prefix.

## Initial implementation

Search the currently loaded bucket by object key/name.

Useful scopes:

- current folder
- current bucket
- eventually entire account

The interface can default to **current folder** with an optional scope selector.

Example:

```text
Search webrev-assets
```

or:

```text
Search 3d/characters
```

## Search results

Results should still show their parent location so users can choose:

- Open
- Open file location
- Copy
- Cut
- Download
- Rename
- Delete

---

# Right-click context menu

A normal file row should support:

```text
Open
Preview
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

A folder should support:

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

Empty background space should support:

```text
Paste
New folder
Upload files
Refresh
```

Only relevant actions should be enabled.

For example, Paste is disabled when the clipboard is empty.

---

# Copy, Cut, Paste, and Move

This is essential to making REDOWN feel like a normal file manager.

## Copy

User:

1. right-clicks an object
2. chooses Copy
3. navigates to another folder or bucket
4. right-clicks empty space or destination folder
5. chooses Paste

REDOWN stores a lightweight internal clipboard descriptor:

```js
{
  operation: "copy",
  accountId,
  bucketName,
  keys: [...]
}
```

The actual object data should **not** be copied into browser memory.

## Cut / Move

Cut works the same way but uses:

```js
{
  operation: "move",
  accountId,
  bucketName,
  keys: [...]
}
```

After a successful destination copy, REDOWN removes the original object.

This provides the expected desktop behavior while still working on top of object storage.

## Across folders in the same bucket

Moving an object from:

```text
images/a.png
```

to:

```text
archive/a.png
```

is conceptually:

1. create/copy object at the new key
2. verify success
3. delete old key

The UI simply calls this **Move**.

## Across buckets

The same interaction should work between buckets.

Example:

```text
webrev-assets/images/logo.png
        ↓ Copy
archive-assets/2026/logo.png
```

The user should not care that these are different R2 buckets.

### REDOWN architecture requirement

The browser should remain the controller, not the data pipe.

For buckets already provisioned with REDOWN Workers, REDOWN can perform cloud-to-cloud transfer by streaming from the source Worker to the destination Worker rather than downloading the entire object through the user's computer.

For an unprepared bucket, REDOWN can lazily prepare/provision the minimum Worker capability when the user first performs an operation that requires it.

The user should be told what is happening in ordinary product language, e.g.:

```text
Preparing bucket for file operations…
```

not:

```text
Deploying R2-bound Worker script…
```

The technical implementation remains hidden.

---

# Download

Right-click -> Download should behave exactly as users expect:

- selected file downloads to the local machine
- multiple selected files can eventually be packaged or handled as a batch
- folder download can eventually create a ZIP stream

This is distinct from REDOWN's original remote-ingest feature.

"Download" inside Explorer means:

> Give this file to my computer.

---

# Upload

Explorer should allow standard file-manager upload behavior:

- Upload button
- right-click -> Upload files
- drag local files into the current folder
- drag files onto a folder to upload into that folder

The existing upload machinery can be reused.

The current Explorer folder becomes the upload prefix automatically. Users should not have to retype the path into a separate "Location / prefix" input when browsing visually.

---

# Rename

Rename should behave like ordinary file managers:

- right-click -> Rename
- `F2`
- inline editable filename
- preserve extension selection behavior where practical
- Enter saves
- Escape cancels

For folders, renaming means rewriting every object beneath that prefix to the new prefix and deleting the old keys after successful copies.

Because that can be expensive for large prefixes, REDOWN should show progress.

---

# Delete

Delete should support files, folders, and multiple selections.

For a synthetic folder, delete means deleting all keys under that prefix.

A confirmation should clearly state scope:

```text
Delete "characters" and 143 files inside it?
```

For large operations, show progress and partial failures rather than pretending the operation is atomic.

A future Trash/recycle-bin model can be considered, but basic Explorer behavior does not need to depend on it.

---

# Multi-selection

Desktop users expect to manipulate more than one object.

Support:

- Ctrl+click toggles selection
- Shift+click selects a range
- Ctrl+A selects all visible items
- right-click on selected group operates on the selection

Then:

- Copy 12 files
- Move 12 files
- Delete 12 files
- Download 12 files

becomes natural.

---

# Drag and drop

There are two kinds.

## Local -> REDOWN

Drag files from Windows/Dolphin into the Explorer.

Result:

- upload into current folder
- or upload into the folder the cursor is over

## REDOWN -> REDOWN

Drag an object or selection onto another folder.

Default behavior should match familiar file managers as closely as practical:

- same bucket: Move by default
- different bucket: Copy by default

Modifier keys can eventually mirror desktop conventions, but right-click Copy/Cut/Paste should be implemented first because it is unambiguous and familiar.

---

# Details columns

A standard Details view should include:

- Name
- Size
- Modified
- Type

Potential later columns:

- Bucket
- Storage class
- ETag
- Custom metadata

Technical metadata belongs in Properties, not in the default view.

---

# Preview pane

REDOWN already has a useful preview system.

Keep it.

Selecting a file can show:

- image preview
- video
- audio
- PDF
- text/code
- metadata
- public URL when available

The preview pane should be optional/collapsible, similar to preview/details panes in desktop file managers.

The file list remains the primary interaction surface.

---

# Properties

Right-click -> Properties can expose R2-specific information without contaminating the normal interface.

Example:

```text
Name
Type
Size
Modified
Bucket
Path
Public URL
ETag
Content-Type
Custom metadata
```

This is where object-store concepts belong.

---

# Back / Forward / Up history

Explorer should maintain navigation history independently of browser page history.

Example:

```text
bucket-a/
-> images/
-> portraits/
-> back to images/
-> forward to portraits/
```

Suggested state:

```js
{
  accountId,
  bucketName,
  prefix
}
```

Each location change pushes one Explorer navigation state.

---

# Proposed implementation

## 1. Separate Explorer state from profiles

Today:

```js
workspaceTarget = REDOWN profile
```

Change toward:

```js
workspaceLocation = {
  accountId,
  accountName,
  bucketName,
  prefix
}
```

A matching REDOWN profile may be attached when one exists, but should not define whether a bucket can appear.

---

## 2. Load accounts and buckets directly

Reuse the existing background messages:

```text
cfAccounts
cfBuckets
cfObjects
```

On Cloudflare connection:

1. fetch accounts
2. fetch buckets for selected account
3. populate Explorer sidebar
4. select the first or previously active bucket
5. browse it directly

This immediately fixes the current "only one bucket shows up" experience.

---

## 3. Convert flat object keys into directory entries

Instead of rendering every key returned by `cfObjects` directly, derive the immediate child entries for the active prefix.

For:

```text
3d/a.glb
3d/characters/b.glb
3d/characters/c.glb
images/logo.png
```

At root show:

```text
3d/
images/
```

At `3d/` show:

```text
a.glb
characters/
```

This is the core abstraction that makes R2 feel like a filesystem.

---

## 4. Add Explorer clipboard state

Example:

```js
let explorerClipboard = {
  operation: "copy", // or "move"
  accountId: "...",
  bucketName: "...",
  keys: ["images/logo.png"]
};
```

Persisting it in extension session/local storage can allow navigation and tab changes without losing the operation.

---

## 5. Add object-operation background messages

Suggested internal API:

```text
cfCopyObjects
cfMoveObjects
cfDeleteObjects
cfRenameObject
cfCreateFolder
cfDownloadObject
```

The UI should communicate user intent.

The background/Worker layer decides how R2 must implement it.

---

## 6. Reuse/lazily provision Workers

Existing REDOWN profiles already have per-bucket Workers for remote ingest and local upload.

File-management operations should reuse those Workers when available.

Explorer should not force the user to create a right-click preset merely to browse.

If an operation requires Worker access to a bucket that has not yet been prepared, provision it lazily and keep that implementation detail separate from destination-profile configuration.

---

## 7. Keep the browser out of large transfer paths

Copy/move between R2 locations should be cloud-side whenever possible.

The extension should send commands and metadata.

It should not download a 5 GB object into browser memory just to upload it again.

This preserves REDOWN's defining principle:

> Remote files should move remotely.

---

# Recommended first iteration

The first useful Explorer milestone should implement:

1. whole Cloudflare account visibility
2. account -> bucket sidebar
3. all buckets visible without destination profiles
4. synthetic directory browsing
5. Back / Forward / Up
6. breadcrumbs
7. normal details list
8. file selection
9. right-click menu
10. Copy
11. Cut
12. Paste
13. Rename
14. Delete
15. Download
16. Upload into current folder
17. New folder
18. search current bucket
19. keep the existing preview pane

This is enough for REDOWN to stop feeling like a specialized R2 utility and start feeling like a genuine remote file manager.

---

# Product principle

The ideal outcome is that a user who has never heard the phrase "object key prefix" can still open REDOWN and immediately understand it.

They should see:

- their Cloudflare account
- all of their buckets
- folders
- files
- familiar navigation
- familiar right-click commands

and simply use it.

Underneath, REDOWN translates those actions into R2 operations.

**Windows File Explorer and Dolphin provide the interaction vocabulary. Cloudflare R2 provides the storage. REDOWN is the translation layer between them.**
