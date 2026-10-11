# Extension message inventory (M0)

**Verified in source** at the audit baseline: all 33 literal `message?.type` branches in `extension/background.js` `chrome.runtime.onMessage.addListener`. This is a static inspection, not a public API contract. Dynamic invocation, browser execution and nonliteral callers are not exhaustively resolved. Representative arguments/results appear in [operation traces](OPERATION_CATALOG.md).

## Shared contracts and security

- Every handler runs in an async closure; listener returns `true` for deferred `sendResponse`. Success uses `{ok:true,...}`; caught exceptions become `{ok:false,error:string}`. Unknown types throw “Unknown request.” These strings are not stable typed diagnostic codes. No request/correlation ID exists in this message layer.
- The listener does not add sender-specific authorization checks (`_sender` unused); manifest does not expose externally_connectable. These messages are extension-internal, not a safe remote agent API.
- `cfFetch/cfJson` use `RedownCloudflareApi.request`: OAuth from local auth, serialized refresh and 30-second bounded request. Provider authorization is required; an OAuth session refresh may write local auth even for GET.
- Worker operations use a persisted Bearer secret. `preparedProfile` can deploy/repair; `callBucketWorker` repairs and retries once on 401/403. Prefix/name validation is operation-specific. Worker `checkedFetch` checks HTTPS/obvious private hosts and redirects, not complete DNS-rebinding protection.
- Local profile/history responses and RFIS export are sensitive. New agent inspection never calls any handler or serializes browser state.
- Remote writes, UI save, history/index updates and response delivery cross separate async boundaries; no shared transaction or durable job/journal is demonstrated. Cancellation/worker suspension outcomes remain unknown.

## Complete handler inventory

| Message | Handler/source anchor in background.js | Initiating UI/control or explicit caller gap | Effects, remote/state boundary |
| --- | --- | --- | --- |
| `cfAccounts` | `listCloudflareAccounts` | Settings refresh / Explorer inventory | OAuth GET accounts; may refresh local auth |
| `cfArchiveEntries` | `preparedProfile → callBucketWorker listArchive` | Explorer openArchive | Worker archive bytes/read; validation and bounds; preparation possible |
| `cfArchiveEntryUrl` | `preparedProfile → callBucketWorker createArchiveEntryReadUrl` | Explorer previewArchiveEntry | Signed URL for entry; preparation/repair possible |
| `cfBuckets` | `listBuckets` | Cloudflare account selector; Simple/Nested root selectors; Explorer inventory | OAuth GET buckets; may refresh auth |
| `cfConnect` | `connectCloudflare → RedownCloudflareAuth.connect` | Legacy message login path; current Settings loginRequest calls shared auth directly | Opens sign-in window; session PKCE/state; local auth save after verification |
| `cfCreateBucket` | `createBucket` | Settings #create-bucket, Simple creator, Nested rootRow Create | OAuth POST bucket; validates name; no automatic profile persistence in handler |
| `cfCreateFolder` | `createExplorerFolder` | Nested folderRow Create; Explorer beginNewFolder | Sanitize prefix/name; prepared Worker ensurePrefixes markers |
| `cfDeleteObjects` | `deleteExplorerObjects` | Explorer deleteSelection (UI confirmation) | Expand listings; prepared Worker deleteKeys; destructive remote deletes; partial result |
| `cfDisconnect` | `disconnectCloudflare` | Settings #disconnect-cloudflare | Best-effort POST OAuth revoke; remove local cloudflareAuth only; profiles retained; no R2 deletion |
| `cfDownloadObject` | `preparedProfile → createReadUrl → chrome.downloads.download` | No literal current UI caller found; current explorerDownload uses direct RedownCloudflareApi.download | Legacy signed Worker URL/download; sanitize key/name; configuration repair possible |
| `cfEnsurePrefixes` | `preparedProfile → callBucketWorker` | Settings ensureProfileMenuPrefixes; Upload materializeUploadBuilderPrefix | Worker ensurePrefixes; marker writes; may repair/provision |
| `cfExtractArchive` | `preparedProfile → callBucketWorker extractArchiveEntries` | Explorer extractArchiveSelection | Archive extraction writes destination objects; traversal/size validation in Worker |
| `cfFolderChildren` | `listFolderChildren` | Simple/Nested/Upload child selectors | OAuth delimiter listings; normalized parent/capped sorted children; optional RFIS |
| `cfFolderPrefixes` | `listFolderPrefixes` | Settings defaultLocationField | OAuth listings; capped all-prefix collection; optional RFIS |
| `cfLoginCancel` | `RedownCloudflareAuth.cancel` | Legacy cancel message; Settings direct shared controller | Cancels attempt/closes window; session mutation |
| `cfLoginStatus` | `RedownCloudflareAuth.status` | Legacy status message; Settings shared login controller direct path | Reads session login state; may expire/cancel attempt |
| `cfObjectProperties` | `preparedProfile → callBucketWorker headObject` | Explorer showProperties | Worker metadata read; preparation/repair may mutate remote configuration; returns Worker/public base |
| `cfObjects` | `listObjects → listObjectsPage` | Explorer browseWorkspace | OAuth GET objects/cursor; optional RFIS observations; auth refresh; no Worker unless UI retry prepares |
| `cfPrepareBucket` | `preparedProfile` | Explorer ensurePrepared; Upload missing profile | Checks Worker with ensurePrefixes empty; can provision/repair and persist profiles |
| `cfPrivateObjectUrl` | `preparedProfile → callBucketWorker createReadUrl` | No literal current UI caller found | Signed private URL generation; sanitizes key; preparation/repair possible |
| `cfProvision` | `provisionCloudflareProfile → deployCloudflareProfile` | Settings addBucketPreset; Simple creator | OAuth Worker/script/subdomain changes and markers; save profile/session secret; Web Lock |
| `cfRenameEntry` | `renameExplorerEntry` | Explorer beginExplorerRename | Sanitize name; move through transferExplorerObjects; remote copy/delete; no-op when name unchanged |
| `cfSearchObjects` | `searchExplorerObjects` | Explorer runExplorerSearch | OAuth listing across targets; local scoring/limit; optional RFIS; errors may be per-target |
| `cfSetAssetCors` | `configureAssetDomain` | No literal caller found; alias retained | Same behavior as cfSetAssetDomain including CORS/domain remote writes |
| `cfSetAssetDomain` | `configureAssetDomain → configureBucketAssetCors → provisionCloudflareProfile` | Settings assetCorsControl/website configuration | OAuth Worker domain/R2 CORS writes; origin validation; local profile update then Worker redeploy for public delivery |
| `cfTransferArchive` | `preparedProfile twice → callBucketWorker` | Explorer pasteExplorer archive clipboard branch | Same profile extracts; cross-profile receiveArchiveEntries Worker-to-Worker; passes source secret to destination Worker, writes objects |
| `cfTransferObjects` | `transferExplorerObjects` | Explorer pasteExplorer/moveSelectionTo | Expand entries via listing; prepare source/destination; Worker transferBatch; copy writes, move deletes after copied results; partial errors |
| `ingest` | `ingest → ingestCloudflare / ingestGitHub` | Popup #send | Validate HTTPS; selected profile lookup; R2 write or GitHub workflow install/dispatch; history write separate from remote result |
| `profiles` | `getProfiles` | No literal current caller found; Settings reads local storage directly | Local profile read; response can contain secrets, so not suitable as public inspection API |
| `recordLocalTransfer` | `recordTransfer` | Options uploadLocalFiles per-file success/failure | Local capped history write; a claimed observation, no remote verification |
| `renameTransfer` | `renameTransferHistoryItem` | History beginRename | Find entry/profile; renameCloudflareTransfer remote mutation then local history rewrite; Cloudflare-only validation |
| `rfisExport` | `RedownRFIS.exportJSON` | Settings #rfis-export | Requires preview flag; reads IndexedDB files/events; complete:false; may contain private locator/metadata |
| `transferHistory` | `chrome.storage.local.get` | Settings renderHistory | Reads recent history only; can contain sensitive source/location; no verification |

## Coverage and paths outside messages

**Unknown unless specifically noted:** individual handler integration coverage, cloud permission propagation, full pagination under caps, browser suspension and destructive-operation recovery. `tests/explorer-worker.test.mjs` executes embedded Worker operations against MemoryBucket; it does not exercise background message routing or Cloudflare REST. `tests/nested-locations.test.mjs` mocks message responses for selection/Create and menu generation. `tests/cloudflare-files.test.mjs` tests direct API reads/downloads. Login tests contain a stale importScripts harness and currently fail before most login behavior can execute.

Important **verified-in-source** paths bypass messages: native context-menu transfers call background ingest directly; Settings Connect Cloudflare uses the shared auth controller; `uploadLocalFiles` posts File bodies directly to Worker; `showWorkspacePreview/explorerDownload` use `RedownCloudflareApi.preview/download` directly; menu mode/profile settings write local storage and trigger `chrome.storage.onChanged`. These paths are why enumerating messages alone does not establish full architecture coverage.
