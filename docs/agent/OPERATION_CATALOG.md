# Representative operation traces (M0)

Baseline and evidence definitions: [architecture](ARCHITECTURE_MAP.md). All six entries are **verified in source**, not certified end-to-end. The JSON catalog is canonical for the adapter. This prose is a navigable audit projection, not an execution API. See [all messages](MESSAGE_INVENTORY.md) for remaining handlers.

## Simple and Nested location dependency rule

**Verified in source:** account → bucket root → immediate folder child → deeper child. The root bucket is selected once; descendants receive its bucket and exact accumulated parent prefix, not another bucket selector. Existing selection and new-name draft are separate. `RedownNestedLocations.setLocation/invalidate/path/destinations` carry readiness and paths; `nested-menu-editor.js` `populate` validates stored roots and recursively loads children without a required manual re-selection. Root prefix is empty. Native parents become submenus with **Send here**; BUG-001/002 requests must not be described as solved.

**Known mechanism/risk:** Upload from Computer has separate state and listing callers. Its `loadUploadLocations` mixes profile defaults with returned children and preserves previous prefixes; `fetchUploadBuilderChildren` returns `[]` on failed responses and requests limit 250. Simple callers often request limit 100000. Backend `listFolderChildren` caps without completeness metadata. The editor fixture does not prove live hierarchy correctness or unlimited pagination.

## `cfCreateBucket`

Create a new Cloudflare R2 bucket; preparation is a separate operation.

**Input:** {type:cfCreateBucket, accountId, name, locationHint?}; name normalized to lowercase.

**Output:** {ok:true,bucket:providerResult}; invalid names fail before POST.

**UI origin:** Cloudflare #create-bucket; Simple bucket creator; Nested rootRow Create.

**Source-confirmed chain:**

`Create click` → `cfCreateBucket` → `createBucket` → `cfJson → cfFetch → RedownCloudflareApi.request` → `POST /accounts/{accountId}/r2/buckets` → `Caller may separately invoke cfProvision or save nested root`

**Security:**

- 3–63 lowercase alphanumeric/hyphen validation
- Cloudflare OAuth permissions

**State ownership:**

- createBucket itself does not save profiles; caller may save/provision later

**Side effects:**

- Creates remote bucket; no rollback if later profile save/provision fails

**Failure/async boundaries:**

- Invalid name, missing/expired OAuth, Cloudflare provider error
- Bucket creation success is not Worker readiness

**Coverage:** unknown: Nested fixture mocks creation; no live bucket or createBucket handler test.

**Navigate source:**

- [extension/background.js](../../extension/background.js) — `async function createBucket` (content revision in catalog).
- [extension/options.js](../../extension/options.js) — `function simpleBucketCreator` (content revision in catalog).
- [extension/options.js](../../extension/options.js) — `$("create-bucket").addEventListener` (content revision in catalog).
- [extension/nested-menu-editor.js](../../extension/nested-menu-editor.js) — `function rootRow` (content revision in catalog).

**Existing fixture references (not an automatic pass):**

- Unknown/no matching fixture identified.

## `cfCreateFolder`

Create a zero-byte folder marker at the exact selected parent prefix.

**Input:** {type:cfCreateFolder, accountId, bucketName, accountName?, prefix, name}.

**Output:** {ok:true,key:prefix/name/} after Worker response; no independent read-back.

**UI origin:** Nested Create; Explorer New folder; Upload location builder uses cfEnsurePrefixes via materializeUploadBuilderPrefix instead.

**Source-confirmed chain:**

`UI sends cfCreateFolder` → `runtime.onMessage` → `createExplorerFolder` → `cleanExplorerPrefix + cleanExplorerName` → `preparedProfile` → `callBucketWorker action ensurePrefixes` → `WORKER_SOURCE.fetch → STORAGE.head/put marker`

**Security:**

- Reject invalid parent/name
- OAuth for preparation; Bearer for Worker; callBucketWorker repairs once on 401/403

**State ownership:**

- May persist profile and session Worker secret

**Side effects:**

- May deploy/repair Worker and create configured markers
- Writes marker only; does not move existing files

**Failure/async boundaries:**

- Invalid name/path, missing account/bucket, failed deployment/auth/put
- Remote marker write and local UI save are separate awaits

**Coverage:** partial: embedded Worker marker operation tested; UI fixture mocks cfCreateFolder; full deployed operation untested.

**Navigate source:**

- [extension/background.js](../../extension/background.js) — `async function createExplorerFolder` (content revision in catalog).
- [extension/background.js](../../extension/background.js) — `async function callBucketWorker` (content revision in catalog).
- [extension/background.js](../../extension/background.js) — `body.action === "ensurePrefixes"` (content revision in catalog).
- [extension/options.js](../../extension/options.js) — `function beginNewFolder` (content revision in catalog).
- [extension/nested-menu-editor.js](../../extension/nested-menu-editor.js) — `function folderRow` (content revision in catalog).

**Existing fixture references (not an automatic pass):**

- [tests/explorer-worker.test.mjs](../../tests/explorer-worker.test.mjs) — `folder markers, properties, and batched deletes are real R2 operations`.

## `cfFolderChildren`

List immediate existing folder children under one account, bucket and parent prefix.

**Input:** {type:cfFolderChildren, accountId, bucketName, parentPrefix?, limit?}; defaults empty parent and 250.

**Output:** {ok:true, children:string[]} sorted with localeCompare; errors use {ok:false,error:string}. No completeness flag.

**UI origin:** Simple selectors, Nested folderRow/populate, Upload from Computer child selectors.

**Source-confirmed chain:**

`UI sends cfFolderChildren` → `runtime.onMessage` → `listFolderChildren` → `cleanExplorerPrefix` → `listObjectsPage with delimiter / and cursor` → `RedownCloudflareApi.request → Cloudflare objects API`

**Security:**

- OAuth access/refresh through shared API adapter
- Reject dot segments, backslash and NUL in parent prefix

**State ownership:**

- Optional rfisPreviewEnabled observation writes IndexedDB files/events
- UI caches are local observations, not remote truth

**Side effects:**

- Listing; OAuth refresh may update cloudflareAuth
- Optional RFIS writes; no Worker preparation needed

**Failure/async boundaries:**

- Connect/session expired, provider listing error
- Limit caps children without reporting incomplete
- Upload fetch failures become empty arrays in fetchUploadBuilderChildren

**Coverage:** unknown: editor tests mock this message; real listFolderChildren pagination/marker logic is not exercised by those fixtures.

**Navigate source:**

- [extension/background.js](../../extension/background.js) — `async function listFolderChildren` (content revision in catalog).
- [extension/background.js](../../extension/background.js) — `async function listObjectsPage` (content revision in catalog).
- [extension/options.js](../../extension/options.js) — `async function fetchUploadBuilderChildren` (content revision in catalog).
- [extension/nested-menu-editor.js](../../extension/nested-menu-editor.js) — `function folderRow` (content revision in catalog).

**Existing fixture references (not an automatic pass):**

- [tests/nested-locations.test.mjs](../../tests/nested-locations.test.mjs) — `Add child and Create use the exact parent path; actual dropdown children stay scoped`.

## `context-menu-transfer`

Send a selected HTTPS source to the saved Simple or Nested destination.

**Input:** Chrome context-menu event: menuItemId, srcUrl/linkUrl/pageUrl; persisted profile and selected prefix.

**Output:** Notification and a capped local transferHistory entry; R2 Worker returns key/publicUrl, while GitHub dispatch is only an acknowledgement.

**UI origin:** Native REDOWN context menu built by buildMenus/addNestedLocations.

**Source-confirmed chain:**

`chrome.contextMenus.onClicked` → `selectedUrl` → `RedownNestedLocations.destinations or Simple profile lookup` → `ingestCloudflareAtPrefix` → `preparedProfile (may deploy/repair)` → `WORKER_SOURCE.fetch → checkedFetch → STORAGE.put` → `recordTransfer → notify`

**Security:**

- Bearer secret on deployed Worker
- HTTPS, obvious private-host blocking and redirect revalidation in checkedFetch
- cleanExplorerPrefix/cleanName; source validation is not full DNS-rebinding protection

**State ownership:**

- profiles/rightClickMode in chrome.storage.local
- Worker secret in profile plus session provisioning cache
- transferHistory capped at 50; no crash-safe journal

**Side effects:**

- May deploy Worker, enable subdomain and create prefix markers before transfer
- R2 object write; same key can overwrite
- GitHub branch may install workflow and dispatch Actions; dispatch does not verify final commit

**Failure/async boundaries:**

- Missing destination or unprepared selected Simple bucket
- Invalid source/path, remote HTTP failure, size limit, authorization, provisioning or R2 failure
- Nested parent uses Send here due to native menu constraints

**Coverage:** partial: nested menu routing fixture tests exist; full event → network ingest/R2 write and interruption tests absent.

**Navigate source:**

- [extension/background.js](../../extension/background.js) — `chrome.contextMenus.onClicked.addListener` (content revision in catalog).
- [extension/background.js](../../extension/background.js) — `async function ingestCloudflareAtPrefix` (content revision in catalog).
- [extension/background.js](../../extension/background.js) — `async function checkedFetch` (content revision in catalog).
- [extension/background.js](../../extension/background.js) — `const WORKER_SOURCE` (content revision in catalog).
- [extension/nested-locations.js](../../extension/nested-locations.js) — `function destinations` (content revision in catalog).

**Existing fixture references (not an automatic pass):**

- [tests/nested-locations.test.mjs](../../tests/nested-locations.test.mjs) — `native nested menu targets every verified depth and offers Send here for parents`.

## `explorer-navigation`

Browse one R2 location, assemble directory rows, and page through remote objects.

**Input:** Selected workspaceTarget account/bucket, workspacePrefix and append/cursor.

**Output:** Rendered rows and cursor/pagination; provider failure shown as preparing or error, not successful listing.

**UI origin:** Source tree, folder double-click, breadcrumb/back/forward/up/refresh and pagination.

**Source-confirmed chain:**

`goLocation/openExplorerItem` → `browseWorkspace` → `cfObjects` → `listObjects → listObjectsPage → Cloudflare objects API` → `buildDirectoryItems → renderFileItems` → `On transient error: ensurePrepared and retry up to seven attempts`

**Security:**

- OAuth listing; browser preparation may deploy/repair Worker
- Preview/download now use RedownCloudflareApi directly, not cfPrivateObjectUrl/cfDownloadObject handlers

**State ownership:**

- UI target/prefix/raw objects/cursor/selection; navigation history
- Optional RFIS observations only when preview flag enabled

**Side effects:**

- Listing can refresh OAuth and optionally write IndexedDB
- Transient recovery path can mutate Worker configuration through ensurePrepared

**Failure/async boundaries:**

- Stale async target/result risk requires browser reproduction
- 401/403 propagation may wait 20 seconds between attempts
- R2 listing is not proof of durable file identity or complete inventory

**Coverage:** partial: direct API preview/download tested; navigation/listing retry UI lacks end-to-end coverage.

**Navigate source:**

- [extension/options.js](../../extension/options.js) — `async function goLocation` (content revision in catalog).
- [extension/options.js](../../extension/options.js) — `async function browseWorkspace` (content revision in catalog).
- [extension/background.js](../../extension/background.js) — `async function listObjectsPage` (content revision in catalog).
- [extension/cloudflare-api.js](../../extension/cloudflare-api.js) — `async function preview` (content revision in catalog).

**Existing fixture references (not an automatic pass):**

- [tests/cloudflare-files.test.mjs](../../tests/cloudflare-files.test.mjs) — `private WEBP preview reads nested keys without a Worker or background messaging`.

## `upload-from-computer`

Send selected local File bodies from the options page directly to the bucket Worker.

**Input:** FileList/drop event; selected account/bucket from local-profile and hidden local-prefix.

**Output:** Per-file status and recordLocalTransfer; stops at first failure and refreshes history.

**UI origin:** #local-files/#local-dropzone and Explorer upload/drop controls.

**Source-confirmed chain:**

`uploadLocalFiles` → `ensureUploadProfile → ensurePrepared if missing` → `fetch(profile.workerUrl) with x-redown-action:upload-local and body:File` → `WORKER_SOURCE upload-local → STORAGE.put` → `recordLocalTransfer → recordTransfer` → `renderHistory and optional browseWorkspace`

**Security:**

- Bearer Worker secret
- Worker cleanName/cleanPrefix and MAX_BYTES
- This intentionally sends local bytes; unlike remote source ingest

**State ownership:**

- Upload location segments/prefix cache in UI
- profiles and transferHistory locally persisted

**Side effects:**

- May provision Worker; writes object; same-key overwrite possible
- Location materialization can create markers before file upload

**Failure/async boundaries:**

- No bucket/profile, failed auth/provision, upload/JSON error
- History recording and remote write are separate operations; no resumable batch or durable job

**Coverage:** unknown: no uploadLocalFiles or upload-local body integration test in current suite.

**Navigate source:**

- [extension/options.js](../../extension/options.js) — `async function uploadLocalFiles` (content revision in catalog).
- [extension/options.js](../../extension/options.js) — `async function ensureUploadProfile` (content revision in catalog).
- [extension/options.js](../../extension/options.js) — `async function loadUploadLocations` (content revision in catalog).
- [extension/background.js](../../extension/background.js) — `request.headers.get("x-redown-action") === "upload-local"` (content revision in catalog).

**Existing fixture references (not an automatic pass):**

- Unknown/no matching fixture identified.
