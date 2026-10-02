# Codex Implementation Prompt — Remote File Explorer Phase 2

Continue from the current merged REDOWN Remote File Explorer on `main`.

This is the next implementation phase. Do not replace or redesign the Explorer from scratch. Treat the current Explorer as the foundation and harden/extend it.

Read these first:

- `docs/proposals/remote-file-explorer.md`
- `docs/proposals/remote-file-explorer-codex-prompt.md`

The product goal remains:

> A premium, creator-friendly remote file manager that behaves according to familiar file-management conventions while letting a small local machine control large remote storage and transfers.

The visual design can remain distinctly REDOWN. We are standardizing behavior and expectations, not copying Windows, Dolphin, Finder, or any other file manager aesthetically.

---

## Priority 1 — Separate private Explorer access from public asset delivery

The most important hardening task is to make sure browsing, previewing, downloading, copying, moving, renaming, deleting, inspecting, or otherwise managing a bucket in Explorer does **not** implicitly make the bucket's files public.

The current architecture includes both:

- a public-style `/assets/<key>` route
- an authenticated Worker object route used for Worker-to-Worker operations

Those must become clearly separate product concepts.

### Required model

#### Explorer access

Private/authenticated by default.

Used for:

- Preview
- Download
- Copy
- Move
- Rename
- Delete
- Properties
- archive inspection
- archive extraction
- other file-management operations

#### Public asset delivery

Explicitly enabled by the user.

Used only when the user intentionally configures REDOWN to serve files publicly through a Worker/custom asset domain or equivalent.

Opening a bucket in Explorer must **not** make its contents publicly available.

Preparing a bucket for Explorer operations must **not** mean "publish this bucket."

### Implementation expectation

For Explorer-managed buckets, use authenticated Worker access for object reads.

Do not generate or depend on public asset URLs unless the bucket is explicitly configured for public asset delivery.

The existing public asset feature may remain for profiles that intentionally use it.

Add a clear capability distinction in the profile/bucket state if necessary, e.g. conceptually:

```js
{
  explorerManaged: true,
  publicAssetsEnabled: false
}
```

Exact names may differ.

### Download

Explorer Download should use an authenticated path.

Possible approaches:

- authenticated Worker response routed through an extension-controlled download
- a short-lived signed/tokenized URL generated for a specific object
- a secure extension fetch -> blob URL for modest files, but avoid this for large objects
- another secure approach that does not expose the object permanently

Prefer a design that still works well for very large files.

### Preview

Preview must also use authenticated access for private buckets.

Do not require public URLs for:

- image preview
- audio/video preview
- PDF preview
- text preview
- GLB/GLTF preview
- archive inspection

### Tests

Add tests proving that:

1. an Explorer-managed bucket can be browsed privately
2. authenticated object access succeeds
3. unauthenticated object access to private Explorer endpoints fails
4. enabling Explorer support alone does not expose objects through public asset routes
5. explicit public-asset profiles still work as intended

---

## Priority 2 — Refine provisioning and verification state

Keep the current automatic bucket preparation model, but ensure the user experience is calm and accurate.

When Cloudflare Worker/bucket access is still propagating, REDOWN should show:

```text
Verifying Cloudflare access…
```

with a small loading indicator.

Retry roughly every 30 seconds.

Do not show a transient 401/403/Worker readiness/DNS condition as a final failure while the preparation window is still active.

When verification succeeds:

- stop the retry loop
- remove the loading state
- mark the bucket ready
- continue the pending operation automatically
- do not require the user to click again

Only show a terminal error after a bounded verification window or a clearly permanent auth failure.

Keep the state model explicit, e.g.:

```text
idle
preparing
verifying
ready
failed
```

Avoid deriving UX directly from one HTTP response.

---

## Priority 3 — Treat ZIP and CBZ as virtual folders

REDOWN should be able to open supported archives inside the Explorer rather than treating them only as opaque blobs.

Start with:

- `.zip`
- `.cbz`

CBZ is effectively a ZIP-based comic archive and should be recognized as a creator/media-friendly special case.

### Expected interaction

Given:

```text
bucket/
  comics/
    issue-01.cbz
```

Double-clicking `issue-01.cbz` should enter a virtual directory view:

```text
Cloudflare > bucket > comics > issue-01.cbz
```

and display entries such as:

```text
cover.jpg
001.jpg
002.jpg
003.jpg
notes.txt
```

The archive itself remains one R2 object unless the user explicitly extracts entries.

### Standard selection behavior inside archives

Support:

- click
- Ctrl/Cmd+click
- Shift+click
- Ctrl/Cmd+A
- context menu
- search/filter if practical
- sort by name/size/type where metadata is available

### Actions inside archive

Initial supported actions should include:

- Preview
- Copy
- Send To
- Extract
- Download selected
- Properties

Do **not** pretend that editing/moving entries inside the archive is cheap.

For the first version, avoid true in-place archive mutation.

If a user chooses Copy or Send To on archive entries, interpret it as:

> extract selected entries directly to the destination

This is a remote operation.

### Archive context menu

On the archive object itself:

```text
Open
Preview / Inspect
Extract here
Extract to…
----------------
Copy
Cut
Send To >
----------------
Download
Rename
Delete
Properties
```

Inside the archive:

```text
Preview
Extract
Copy
Send To >
Download selected
Properties
```

### Architecture

Prefer server/Worker-side archive inspection.

For ZIP/CBZ, use range reads to inspect the ZIP central directory instead of downloading the entire archive into the browser.

The Worker should:

1. inspect the archive index remotely
2. return entry metadata
3. extract/stream only requested entries when the user previews, downloads, copies, or sends them elsewhere

Avoid pulling a multi-gigabyte archive into browser memory just to list its files.

### Safety

Protect against:

- zip-slip/path traversal entries such as `../foo`
- absolute paths
- malformed entry names
- decompression bombs
- huge uncompressed expansion ratios
- maliciously deep archive structures
- unsupported encryption

Sanitize extracted destination paths.

For encrypted archives, report unsupported/encrypted state clearly instead of failing mysteriously.

---

## Priority 4 — Rich creator previews

REDOWN should lean into creator workflows.

A remote file manager that understands creator assets is a differentiator.

### Text and code

Continue supporting inline previews for text/code formats such as:

- TXT
- Markdown
- JSON
- CSV
- JavaScript
- TypeScript
- CSS
- HTML
- YAML
- Python
- Rust
- Go
- C/C++
- logs

Use ranged/truncated reads for large files.

Do not download a huge text file in full just to preview it.

### PDF

Provide inline PDF preview for private and public buckets.

Private PDFs must preview through authenticated access rather than requiring a public URL.

### GLB / GLTF

Add a lightweight interactive 3D preview.

This is an important REDOWN creator niche.

Required basics:

- load GLB
- load GLTF where practical
- auto-frame model
- orbit
- zoom
- reset view
- neutral lighting
- dark/transparent-compatible background
- no editing requirement

Optional later features:

- wireframe toggle
- axis/grid
- animation selector
- material inspector
- bounding-box info

Keep the viewer lightweight.

Do not import a huge 3D editor framework solely for preview.

If a small dependency is necessary, keep it isolated and justified.

### Archive-contained previews

Where practical, selecting a previewable item inside ZIP/CBZ should allow previewing it without extracting the whole archive to a permanent bucket location.

Examples:

- image inside CBZ -> image preview
- text file inside ZIP -> text preview
- PDF inside ZIP -> PDF preview
- GLB inside ZIP -> 3D preview if remote extraction/streaming can support it safely

This is a stretch goal after the base archive browser works.

---

## Priority 5 — Preserve standard file-manager behavior

Do not regress existing Explorer conventions.

Continue supporting:

- Back
- Forward
- Up
- breadcrumbs
- account/bucket switching
- synthetic folders
- search
- sort
- single selection
- multi-selection
- Ctrl/Cmd+A
- Copy
- Cut
- Paste
- Move
- Rename
- Delete
- New folder
- Upload
- Download
- Send To
- Properties
- drag/drop
- keyboard shortcuts
- operation progress

The Explorer should feel predictable to anyone who already understands a normal file manager.

The style may remain original and premium.

---

## Priority 6 — Improve Send To as a creator workflow

`Send To` should become a fast creator-oriented action.

Sources may include:

- normal R2 files
- folders
- selected archive entries

Destinations may include:

- another bucket
- a saved REDOWN destination
- a saved prefix
- potentially a right-click preset destination tree

Examples:

```text
Send To >
  Website Assets
    Images
    Video
    3D
  Archive
  Backup
  Project Bucket
```

For archive entries, Send To means remote extraction directly to the target.

For normal files, Send To means remote copy.

Keep the browser as controller, not data pipe.

---

## Priority 7 — Operation progress and interruption clarity

Archive extraction, cross-bucket transfers, large folder moves, and downloads can take time.

Use the Explorer operation surface to show meaningful progress.

Examples:

```text
Inspecting archive…
```

```text
Extracting 24 of 180 files…
```

```text
Copying 8 files…
```

```text
Verifying Cloudflare access…
```

Avoid fake precision when the backend cannot provide byte-level progress.

For multi-entry operations, item-count progress is acceptable.

If a partial failure occurs, report:

```text
176 files extracted
4 files could not be extracted
```

and expose details.

---

## Priority 8 — Keep large-file behavior remote and lightweight

The MinMax-style product philosophy behind REDOWN is:

> small local machine, big remote capability

The extension should avoid becoming the compute/storage bottleneck.

Do not:

- load entire multi-GB objects into JavaScript memory
- download an archive just to enumerate it
- download a file locally just to copy it to another bucket
- require public exposure merely for previews
- render tens of thousands of rows at once

Prefer:

- range requests
- Worker-side parsing
- Worker-to-Worker streaming
- paginated/incremental listings
- bounded batches
- lazy preview loading

---

## Priority 9 — Explicit capability model

Consider introducing a small capability layer so the UI can reason about what a bucket/object supports.

Conceptually:

```js
{
  canBrowse: true,
  canPrivateRead: true,
  canPublicRead: false,
  canWrite: true,
  canTransfer: true,
  canArchiveInspect: true
}
```

This does not need to be exposed verbatim to users.

It should prevent the UI from conflating:

- public asset profile
- Explorer-ready bucket
- authenticated private-read bucket
- not-yet-prepared bucket

Keep the distinction clean for future versions.

---

## Priority 10 — Tests

Add meaningful automated coverage.

At minimum:

### Privacy

- private Explorer read requires auth
- Explorer preparation does not automatically publish bucket content
- public asset delivery still works only when explicitly enabled

### Archive browser

- ZIP central directory listing
- nested paths
- CBZ recognition
- Ctrl+A-compatible entry enumeration
- selected-entry extraction
- Copy/Send To extraction
- path traversal blocked
- malformed archive handled
- unsupported encryption handled
- large expansion ratio rejected or safely bounded

### Preview

- text range/truncation
- private PDF access path
- GLB preview source retrieval
- archive-contained preview path if implemented

### Transfer

- archive entry -> same bucket
- archive entry -> another bucket
- normal file copy/move remains working
- folder move remains working

### Provisioning

- transient unauthorized/readiness state
- 30-second retry behavior or equivalent testable state transition
- success after transient failures
- terminal failure

Run:

```text
npm test
npm run check
```

and add any additional focused tests that make sense.

---

## UX / visual quality

Keep the current premium REDOWN direction.

Do not visually imitate Windows or Dolphin.

The Explorer should feel:

- calm
- intentional
- responsive
- creator-friendly
- compact
- premium
- understandable without instructions

Archive browsing should visually feel like entering a folder, with a subtle indication that the current location is a virtual archive.

For example, the breadcrumb can show:

```text
Cloudflare > Assets > comics > issue.cbz
```

with a small archive icon or label.

Do not overwhelm the user with technical R2/ZIP terminology unless they open Properties or diagnostics.

---

## Deliverables

Update the current codebase from `main`.

When complete:

1. summarize architecture changes
2. list files changed
3. explain how private Explorer access differs from public asset delivery
4. explain authenticated preview/download
5. explain ZIP/CBZ virtual folder implementation
6. explain archive extraction/Send To behavior
7. explain GLB preview implementation
8. explain provisioning/verification handling
9. list tests added
10. run checks/tests
11. provide final commit SHA
12. open a new PR for review
13. do not merge the PR yourself

This phase should leave REDOWN with a stronger identity:

> not merely a remote downloader, but a remote creator file manager capable of understanding and moving the kinds of assets creators actually work with.
