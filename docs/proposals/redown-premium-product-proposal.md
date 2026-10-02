# REDOWN Premium Product Proposal

## Status

Proposed product direction for the paid REDOWN edition.

## Product premise

REDOWN Premium should be the one-stop remote creator file manager for people who work with web assets, 2D art, 3D files, comics, media, archives, and project folders but do not want their local computer to be the bottleneck.

The core proposition is:

> Your computer is the interface. The cloud does the work.

The free REDOWN edition should remain useful and focused: remote downloading into connected storage, basic browsing, and potentially lightweight previews.

REDOWN Premium is the full remote workspace. It should let someone find an asset on the web, send it directly into remote storage, inspect it, organize it, preview it, move it, extract it, upload something from their computer, and continue working without repeatedly downloading everything locally.

Target price: **$4.99**.

The goal is not to compete with a full desktop operating-system file manager in every possible feature. The goal is to become the best lightweight remote creator file manager in its niche.

---

## Product identity

REDOWN Premium is not merely a downloader.

It is:

- a remote asset intake tool
- a cloud file explorer
- a creator-focused previewer
- a remote organizer
- a lightweight archive browser
- a cross-bucket transfer tool
- a destination-routing system
- eventually, a curation workspace

The defining experience should be:

1. Find something.
2. Send it remotely.
3. See it immediately.
4. Preview it.
5. Organize it.
6. Move or send it elsewhere.
7. Keep the entire workflow remote-first.

---

## Guiding principles

### 1. Remote-first

The browser should act as the controller, not the data pipe.

Operations such as copy, move, extract, archive inspection, and cross-bucket transfer should happen remotely whenever practical.

REDOWN should preserve the principle:

> Remote files should move remotely.

### 2. Low-end-friendly

The local machine should not need to be powerful.

REDOWN Premium should remain useful on modest hardware by shifting heavy work to Cloudflare Workers, R2, and other remote services where appropriate.

### 3. Familiar interaction grammar

The Explorer should feel immediately understandable to anyone who has used Windows File Explorer, Dolphin, Finder, or another conventional file manager.

REDOWN should use familiar behaviors:

- single click selects
- double click opens
- arrow keys move selection
- Ctrl/Cmd multi-select
- Shift range-select
- Ctrl+A
- F2 rename
- Delete
- Cut / Copy / Paste
- Back / Forward / Up
- context menus
- drag-and-drop
- breadcrumbs
- searchable paths

The visual design does not need to imitate an operating system. It should remain distinctly REDOWN.

### 4. Creator-first formats

Creator workflows are part of the product identity, not an afterthought.

Formats and experiences worth highlighting include:

- images
- video
- audio
- PDF
- text and code
- GLB / GLTF
- ZIP
- CBZ
- future creator formats where practical

### 5. Flexible destinations

REDOWN should never force users into a rigid 2D / 3D / Videos / Files taxonomy.

Those may be starter suggestions, but users should be able to create arbitrary structures such as:

- Historical
- Historical/Letters
- Worlds/Ships/Finished
- Comics/Issue-01
- Music/Masters
- Reference/Architecture/Cathedrals

The destination system should make creation and allocation effortless.

---

## Edition split

### REDOWN Free

The public GitHub edition should remain useful on its own.

Suggested scope:

- remote URL download into connected destination
- basic right-click sending
- basic R2 bucket browsing
- simple file listing
- possibly lightweight previews
- basic destination presets
- basic upload from computer

The free edition should demonstrate the core value proposition clearly.

### REDOWN Premium

Premium should include the full remote workspace:

- rich Explorer
- account-wide and bucket-wide browsing
- clickable bucket rows
- remote path-aware search
- rich context menus
- Copy / Cut / Paste
- Move To
- Send To
- Rename
- Delete
- New Folder
- Properties
- upload from computer
- smart destination selection
- recursive choose-or-create location builder
- cross-bucket operations
- richer previews
- lightbox mode
- GLB / GLTF interactive viewer
- archive browsing
- archive extraction
- archive Send To
- creator-oriented workflow improvements
- future Curate workspace
- optional quick-delete confirmation behavior

The free edition should be carved out from the stable Premium core later rather than constraining Premium development now.

---

## Explorer

Explorer should be the daily-use center of REDOWN Premium.

### Root and bucket browsing

At the account/root level, buckets should appear as proper clickable rows in the main file window, not merely as sidebar entries.

Clicking a bucket should navigate directly into it.

The sidebar can remain available as a secondary navigation surface.

### File rows

Rows should support:

- Name
- Size
- Modified
- Type

Rows should be selectable and keyboard navigable.

### Keyboard navigation

- Up / Down: move through the current file list
- Left / Right: move through previewable items when preview navigation is active
- Enter: open
- Backspace: up/back depending on context
- Alt+Left / Alt+Right: history
- F2: rename
- Delete: delete
- Ctrl/Cmd+C: copy
- Ctrl/Cmd+X: cut
- Ctrl/Cmd+V: paste
- Ctrl/Cmd+A: select all
- Ctrl/Cmd+F: focus search

Selection changes should update the preview automatically.

### Context menu

The right-click menu should feel like a real file manager.

Expected actions where applicable:

- Open
- Preview
- Download
- Cut
- Copy
- Paste
- Move To
- Send To
- Rename
- Delete
- New Folder
- Upload Here
- Properties
- Refresh

Bucket rows should support destination-relevant actions such as:

- Open
- Paste into bucket
- Upload here
- Refresh

---

## Search

Explorer search should search remote object keys and paths, not merely filter visible rows.

Examples that should work:

- stol
- stolen
- 2d/stolen
- partial folder names
- partial filenames
- loose path fragments

Search scope should follow context:

- inside a bucket: search that bucket
- at an account level: search that account's buckets
- at the root: search all connected buckets in scope

Search results should appear directly in the file window.

Clicking a result should:

1. navigate to the correct bucket
2. navigate to the correct parent folder
3. select the actual item
4. update the preview

---

## Preview system

Preview should feel integrated with selection rather than being a separate disconnected panel.

### Supported previews

Priority formats:

- images
- video
- audio
- PDF
- text
- code
- GLB / GLTF
- archive entries where practical

### GLB / GLTF

GLB viewership should be a marketed Premium feature.

The viewer should support:

- orbit
- zoom
- reset view
- automatic framing
- neutral readable lighting
- dark or transparent presentation
- useful handling of common model sizes

Future enhancements may include:

- wireframe toggle
- grid
- animation picker
- material information
- bounding-box information
- basic scene statistics

### Preview navigation

The preview should support:

- previous item
- next item
- arrow buttons
- keyboard left/right traversal
- up/down list traversal updating preview
- stable latest-request-wins rendering so stale async requests cannot duplicate previews

### Expand mode

Expand should enlarge the preview within the Explorer layout.

### Lightbox mode

Lightbox should be a distinct mode.

It should:

- float the preview above Explorer
- dim the background
- preserve current selection
- support previous/next navigation
- support left/right arrows
- close with Escape
- work with image, video, PDF, text, and 3D previews where practical

---

## Upload from computer

The upload workflow should be destination-first and intuitive.

### Bucket selection

The user chooses a bucket.

### Smart location selection

After choosing a bucket, REDOWN should offer:

- a dropdown of available remote locations
- a search box
- automatic matching as the user types

For example, typing:

`alm`

may automatically select a matching destination such as:

`almost`

The dropdown should not have to open automatically. Its selected value should simply update as matching occurs.

The user should be able to drop a file immediately after selecting or matching a destination.

### Recursive destination builder

For default locations and destination configuration, REDOWN should use a recursive choose-or-create interface.

Every level should provide:

- dropdown of existing folders at that level
- text field to create a new folder at that level
- + Child button
- small × button

Example:

`Worlds`
→ `Ships`
→ `Finished`

At each level, the user can either select an existing folder or type a new one.

Selecting an existing folder reveals the next level.

Typing a new folder can create/materialize it and then allow another child level.

There should be no fixed depth.

### X behavior

The small × only removes a level from the builder/configuration.

It must never delete the corresponding R2 folder or its files.

The destination builder is for:

- choosing
- creating
- allocating
- configuring

It is not a deletion surface.

### Starter suggestions

REDOWN may initially suggest:

- 3D
- 2D
- Videos
- Files

These are suggestions only.

Users must be free to:

- rename them
- remove them
- ignore them
- add arbitrary alternatives

---

## Right-click presets

Right-click presets should support both:

### Quick Send

One preset sends directly to a configured default location.

That default location should be arbitrary and exact.

If the user sets:

`Historical`

then Quick Send goes to:

`Historical/<filename>`

If the location does not exist, REDOWN should materialize it automatically.

### Nested menu

Nested menus should allow any depth.

Each leaf should represent an exact destination path.

A leaf such as:

`Historical`

must send to:

`Historical/<filename>`

It must not silently fall back to a generic `files` directory.

Nested destination configuration should also materialize folder markers so locations appear in Explorer before the first asset is sent there.

---

## Archive experience

ZIP and CBZ should behave like virtual folders.

### Opening archives

Double-clicking a ZIP or CBZ should enter it visually.

Breadcrumb example:

`Cloudflare > bucket > comics > issue-01.cbz`

### Inside archives

Supported actions should include:

- browse folders
- preview entries
- Ctrl+A
- multi-select
- Copy
- Send To
- Extract
- Download Selected
- Properties

### Archive object context menu

- Open
- Preview / Inspect
- Extract here
- Extract to
- Copy
- Cut where semantics are safe
- Send To
- Download
- Rename archive
- Delete archive
- Properties

### Safety

Archive handling should defend against:

- zip-slip
- path traversal
- absolute paths
- malformed names
- unsupported encryption
- giant expansion ratios
- pathological depth
- archive bombs

Do not pretend arbitrary in-place archive mutation is cheap or safe when it requires rewriting the archive.

---

## Curate workspace

Curate should be a future Premium workspace distinct from ordinary Explorer.

Explorer remains fast and lightweight.

Curate is for heavy-duty organization.

Potential capabilities:

- large multi-selection
- batch Move To
- batch Send To
- batch Delete
- cross-bucket organization
- rich sorting/filtering
- staging operations
- before/after review
- folder restructuring
- archive extraction planning
- collection cleanup
- creator-oriented asset organization

Curate should feel like a deliberate workbench rather than ordinary browsing.

---

## Delete behavior

Premium Settings should include:

### Confirm quick delete

**On**

Deleting from Explorer or expanded/lightbox workflows asks for confirmation.

Example:

> Delete this item?
> Yes / No

**Off**

Delete happens immediately.

This preference should apply to quick single-item or lightweight deletion flows.

Large, unusual, or bulk destructive actions in Curate may still justify stronger confirmation regardless of the quick-delete preference.

---

## Privacy model

Explorer usage must remain private by default.

Opening a bucket in REDOWN must never implicitly publish it.

Private browsing, preview, download, transfer, archive inspection, and organization should use authenticated/private access.

Public `/assets/` delivery should exist only when the user explicitly enables public asset serving for a profile/domain.

Public-serving capability and private Explorer capability should remain separate concepts.

---

## Cloudflare readiness UX

Temporary provisioning and Worker propagation should not leak raw infrastructure errors into the product.

During initial setup or self-repair, REDOWN should display:

> Preparing bucket…
> Verifying Cloudflare access…

Temporary 401/403/route/DNS/Worker readiness conditions should remain in that preparation state during the bounded retry window.

Only genuinely terminal failures should surface as failures.

The product should self-heal stale Worker/token pairs where practical.

---

## Premium polish requirements

For the $4.99 package to feel obvious rather than questionable, the product should be extremely polished in the basics.

Important qualities:

- responsive
- stable
- understandable
- quick
- low-friction
- visually premium
- keyboard-friendly
- mouse-friendly
- touch-friendly where practical
- no raw infrastructure jargon
- no accidental data exposure
- no surprising fallback destinations
- no destructive ambiguity

The extension should feel small and focused even though its capabilities are substantial.

---

## Marketing position

Primary message:

> **Remote files, without bringing them home first.**

Supporting message:

> **Your computer is the interface. The cloud does the work.**

Creator-focused message:

> **Move, inspect, preview, and organize remote assets without downloading them first.**

### Features worth advertising directly

- remote downloads
- Cloudflare R2 Explorer
- cross-bucket organization
- remote Copy / Move / Send To
- searchable remote paths
- smart upload destinations
- ZIP / CBZ browsing
- PDF preview
- code/text preview
- **interactive GLB / GLTF viewing**
- lightbox media browsing
- low-end-friendly workflow

GLB viewership should be visible in store screenshots and marketing material because it immediately signals that REDOWN Premium is intended for creators rather than being another generic storage browser.

---

## Store positioning

Suggested framing:

### REDOWN Premium

**Remote creator file management for $4.99.**

Remote download, inspect, preview, organize, and move your assets directly in the cloud.

Possible concise store copy:

> Send files directly from the web to remote storage, browse your buckets like a file manager, preview images, PDFs, code and GLB models, open ZIP/CBZ archives, and organize assets without downloading everything to your computer first.

---

## Packaging strategy

Development should remain Premium-first until the product feels cohesive and hardened.

Then:

1. identify the common stable core
2. separate Premium-only modules cleanly
3. release the basic REDOWN edition publicly on GitHub
4. package REDOWN Premium as the paid downloadable/browser-store edition

Avoid scattering arbitrary `if (premium)` checks throughout the codebase.

Prefer clear capability/module boundaries so the free edition remains maintainable and Premium can continue evolving independently.

---

## Long-term opportunity

REDOWN Premium can become a small but unusually capable creator utility for people working with remote assets on modest hardware.

Its strongest niche is not generic cloud storage.

Its strongest niche is the combination of:

**web discovery → remote ingest → remote Explorer → rich preview → remote organization → creator-aware workflows**

That combination should guide future feature decisions.

The product should continue asking one question:

> Can the user accomplish this remotely, intuitively, and without making their local machine do unnecessary work?
