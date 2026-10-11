# ReDown architecture map (M0)

Audit baseline: `75ffcf5b775e48f893126083b51890c730c9c3b4`. Machine references carry SHA-256 content revisions in [catalog.json](../../agent/catalog.json). Labels below classify evidence, not product maturity. **Verified in source** means inspected code; **verified by test** applies only to the specific fixture behavior listed in the change report. Browser/cloud production behavior remains **unknown** unless separately exercised.

Start with [operation traces](OPERATION_CATALOG.md), [all 33 messages](MESSAGE_INVENTORY.md), [API contract](API.md), and [Forever Works boundaries](FOREVER_WORKS_COMPATIBILITY.md). The internal agent interface is free, read-only and independent of proposed commercial tiers.

## Entry points and ownership

| Subsystem | Actual files/symbols | State/dependencies and risk | Evidence |
| --- | --- | --- | --- |
| Manifest V3 shell | `extension/manifest.json` → `background.js`, `popup.html`, `options.html` | contextMenus, notifications, storage, identity, navigation, alarms, downloads; host permissions limit browser requests | verified in source |
| Capture and destination routing | `background.js`: `selectedUrl`, `categoryForContext`, `buildMenus`, `addNestedLocations`, `chrome.contextMenus.onClicked`; `popup.js`: Send click → `ingest` | `profiles` and `rightClickMode`; Simple `defaultBucketName/defaultPrefix/simpleOptions`, Nested `nestedMenu.roots`; GitHub `menuTree/paths`; selecting the wrong persisted bucket/prefix changes remote destination | verified in source; nested menu fixture coverage |
| Settings/preset editors | `options.js`: `renderProfiles`, `simplePrimaryLocationField`, `simpleExtraOptions`, `saveNestedMenu`; `nested-menu-editor.js`: `render/rootRow/folderRow`; `nested-locations.js`: `path`, `setLocation`, `destinations`, `menuMode` | local profile saves; async folder discovery; ancestor changes invalidate descendants; menu removal is local configuration removal, not remote deletion | verified in source; selection/creation tests use mocked messages |
| Cloudflare authentication | `cloudflare-auth.js`: `startCloudflareLogin`, `completeCloudflareLogin`, `storeCloudflareToken`; `cloudflare-api.js`: `auth`, `request`, `boundedFetch` | PKCE/state, exact callback/tab/frame matching, five-minute attempt expiry; session login state and Web Locks; local OAuth token storage; 30-second shared request timeout and serialized refresh | verified in source; settings-context fixtures pass, background fixtures currently fail before login assertions |
| Bucket provisioning | `background.js`: `createBucket`, `provisionCloudflareProfile`, `deployCloudflareProfile`, `preparedProfile`, `workerAcceptsProfile` | OAuth REST bucket/script/subdomain actions; serialized provisioning; Worker token persisted in local profile/session; inspection-like preparation may deploy/repair | verified in source; no live deployment proof |
| Primary per-bucket runtime | **`background.js` embedded `WORKER_SOURCE`**, uploaded by `deployCloudflareProfile`; binding **`STORAGE`** | Bearer secret; public assets explicitly enabled; signed private reads; remote ingest, local upload, markers, copy/move/delete, archives; writes may overwrite keys; known-length ingest streams, unknown-length ingest buffers under size limit | verified in source; embedded Worker tests use MemoryBucket |
| Separate Worker sample | `worker/src/index.js` via `wrangler.toml`; binding **`ASSETS`** | `/health`, `/ingest`, `INGEST_TOKEN`, `MAX_BYTES`, optional source allowlist; category whitelist `2d/3d/files`; **not** the extension's provisioned runtime | verified in source; local startup blocked by template bucket and runtime date mismatch |
| Local uploads | `options.js`: `uploadTarget`, `ensureUploadProfile`, `loadUploadLocations`, `renderUploadLocationBuilder`, `uploadLocalFiles` | options page directly sends File body to Worker; hidden `local-prefix`; capped child discovery and unverified profile folder merging; stops on first error | verified in source; end-to-end upload coverage unknown |
| Explorer | `options.js`: `goLocation`, `browseWorkspace`, `buildDirectoryItems`, `openExplorerItem`, `ensurePrepared`; `background.js`: `listObjectsPage`, `transferExplorerObjects`, `deleteExplorerObjects` | OAuth listing; UI location/cursor/selection/cache and persisted explorerLastLocation; transient retries can prepare Worker; direct previews/downloads use `RedownCloudflareApi`, while older Worker read-message handlers remain | verified in source; preview/download and Worker fixtures pass, browser navigation unknown |
| Transfer history | `background.js`: `recordTransfer`, `renameTransferHistoryItem`; `options.js`: `renderHistory` | `chrome.storage.local.transferHistory` capped at 50; recent same-source failures removed after success; separate remote write and history save, no atomic journal | verified in source; restart/crash recovery unknown |
| RFIS experiment | `rfis-index.js`: `observe`, `exportJSON`; `background.js`: `listObjectsPage`, `rfisExport`; options preview toggle/export | opt-in `rfisPreviewEnabled`; IndexedDB `redown-rfis` v1 `files/events`, locator account/bucket/key; first observations and metadata changes; export `complete:false`; unchanged observations do not refresh timestamp | verified in source; dedicated IndexedDB tests absent |
| GitHub transfer | `background.js`: `ensureGitHubWorkflow`, `ingestGitHub`, embedded `GITHUB_WORKFLOW`; `github/remote-ingest.yml` | may install workflow through Contents API then dispatch Actions; browser success means dispatch accepted, not file committed; workflow curl on runner → git commit/push | verified in source; no Actions execution proof |
| Legacy Node bridge | `local/bridge.mjs`: `loadDotEnv`, HTTP callback | optional REMOTE_INGEST_URL/TOKEN; extension-origin check, localhost port; current popup goes directly to runtime messages, does not call bridge | verified in source; syntax only |
| Native Windows scaffold | `windows/CMakeLists.txt`, `windows/README.md`, `build-windows.bat` | Win32/WinHTTP/DPAPI documented; **referenced `windows/src/main.c` is absent in this checkout** | source absence verified; executable behavior unknown |

## Boundaries that must survive

**Documented intent:** The handoff separates Forever Works durable meaning, this internal current-how catalog, a future simple programmer API/CLI, and the existing execution core. Agent-inferred intent is unreviewed. Ordinary GUI and transfer functions must not import the agent catalog or depend on Node-based inspection.

**Verified in source:** The new `agent/` adapter reads committed catalogued sources only, does not import extension modules, access browser state, read environment/credential files, invoke Git, or call network services. No HTTP/MCP/mutation transport is provided. Root and catalog overrides exist for isolated library testing; the CLI exposes neither.

**Inferred risk:** `preparedProfile`, `cfPrepareBucket`, properties and private-read handlers can provision/repair remotely. They are not safe project-inspection primitives merely because their names resemble queries. Source listing can also refresh OAuth and optionally update RFIS. The new API never invokes them.

## Proposed versus partial

- **Proposed:** `UNIFIED_THREE_INTERFACE_API.md` programmer/agent/debugger execution architecture, entitlements and pricing. This catalog is a distinct internal inspection API, not its implementation.
- **Partially implemented:** RFIS browser observations and export are present and opt-in. The proposal's statement about unconditional observation is older than current source. Durable cross-move identity, packed encoding, reconciliation/import and crash recovery are not demonstrated.
- **Proposed:** competitive roadmap job journals, native CLI, synchronization, resumability, paid feature gates and performance ambitions. Do not cite them as working capability.
- **Documented reports:** `bugs/README.md` BUG-001–013 include menu/root semantics, redraws, previews and folder discovery. Reports are not reproduction evidence. Current `loadUploadLocations` merges profile defaults and prior selection; `fetchUploadBuilderChildren` suppresses listing errors. These are inspected mechanisms, not proof of every screenshot's cause.

## Layout and next evidence

Actual new layout: `agent/catalog.json` (reviewed observations), `agent/api.mjs` (read-only library), `agent/cli.mjs` (offline adapter), JSON schemas, `docs/agent/` (navigation/contracts/report), `tests/agent-api.test.mjs`. No package/build dependency or browser wiring is added.

**Proposed next:** optional `forever/` canonical model only after accepted intent records; M2 semantic drift/caller graph tooling; M3 scrubbed diagnostics; M4 change plans. `inspectReferences` only checks content revisions and literal anchors; it is not the handoff's complete `validateCatalog` and cannot establish behavioral correctness, full symbol resolution or test execution.
