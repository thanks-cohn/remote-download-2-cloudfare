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
