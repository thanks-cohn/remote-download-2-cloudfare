# M0/M1 implementation report and continuation handoff

## Delivered

**M0 complete for the requested static audit:** [architecture map](ARCHITECTURE_MAP.md), [full inventory of 33 literal extension messages](MESSAGE_INVENTORY.md), [six representative operation traces](OPERATION_CATALOG.md), [Forever Works compatibility/mapping strategy](FOREVER_WORKS_COMPATIBILITY.md), and root [AGENTS.md](../../AGENTS.md). Inspected ReDown at `75ffcf5b775e48f893126083b51890c730c9c3b4` and Forever Works at `230c67fa7e27577c53b6f7895df442a2ab24e4cb`. Source/test symbols and SHA-256 references are recorded in the catalog. Unknown callers, missing coverage and proposed features are explicit.

**Small M1 slice implemented:** dependency-free Node library/CLI, versioned JSON catalog, catalog/result schemas, portable request fixtures, nine new tests. Five operations: `describe`, `projectOverview`, `listOperations`, `explainOperation`, `getForeverLinks`. Every response provides a short explanation, provenance, evidence and source freshness. Missing IDs/unsupported operations/versions have deterministic typed errors. Forever links are unknown; no accepted IDs or conformance claims are invented.

No existing extension, Worker, bridge, CI, package declaration, lockfile or existing test was changed. Runtime independence is supported by additive files and passing existing targeted fixtures; installed-browser behavior was not revalidated. Inspection does not execute transfer code or access live/browser data.

## Verified in this environment

Node `24.19.0`, npm `11.9.0`, locked Wrangler `4.86.0`; repository CI requests Node 22. Node 22 was not tested in this task.

| Executed command/check | Actual result |
| --- | --- |
| `npm ci --cache /workspace/.npm-cache --no-audit --no-fund` | Passed; 88 locked packages installed; no lockfile changes |
| `npm run check` | Passed |
| `node --check local/bridge.mjs`, `node --check extension/popup.js`, manifest JSON parse | Passed |
| `node --check agent/api.mjs`, `node --check agent/cli.mjs` | Passed |
| `node --test tests/agent-api.test.mjs tests/cloudflare-files.test.mjs tests/explorer-worker.test.mjs` | **22 passed, 0 failed, 0 skipped**: nine new agent tests, six direct API tests, seven embedded Worker tests |
| Baseline `npm test` before changes | **38 executed: 23 passed, 15 failed**, no skips |
| Final `npm test` | **47 executed: 32 passed, the same 15 failed**, no skips |
| JSON Schema 2020-12 using available Python `jsonschema` | Both schemas valid; one catalog and ten real fixture result envelopes validated; invalid error envelope with success data rejected |
| CLI invoked from `/tmp` via absolute path | JSON and human projections work; success exit 0; missing ID/unsupported version/bad flag exit 2 |
| Source freshness/safety fixtures | Matching source current; changed/missing/unsafe/escaping-symlink references reported; evidence downgraded to unknown |
| Inventory integrity test | Documented 33 message names exactly match all literal handler branches |
| Native Git read for ReDown and clone/read of Forever Works | Passed via existing platform authentication; no token requested/extracted |

### Baseline failures diagnosed, left unchanged

- **14 Cloudflare login/provision tests:** `tests/cloudflare-login.test.mjs` harness `context.importScripts` only accepts cloudflare-auth/api/nested-locations; current background additionally imports `rfis-index.js`. It asserts that import is `cloudflare-api.js` and fails during harness initialization, before tested behavior. This is a source-confirmed stale fixture, not proof that login works or fails in Chrome.
- **One menu mode test:** `tests/nested-locations.test.mjs` fixture supplies only `use-nested-menu` and a status div. The extracted current options code also accesses `use-simple-menu` and editor panels/listeners, resulting in null `addEventListener`. Fixture expectations also use earlier status wording. The repository defect is in the test harness assumptions; actual UI correctness remains unverified.

No tests were skipped, relaxed or rewritten. The unchanged existing source hashes and unchanged failing cases distinguish baseline failures from this additive API change.

## Findings worth carrying forward

- The primary extension Worker is embedded `WORKER_SOURCE`, binding `STORAGE`; the Wrangler `ASSETS` Worker is a different sample. Do not validate one and claim the other is ready.
- Simple/Nested account/bucket/parent-prefix ownership is explicit. Nested stored roots populate recursively; users should not need ancestor reselection. Upload has separate discovery/cache state and confirmed profile-default/old-selection mixing mechanisms; screenshots require live R2 reproduction before assigning every root cause.
- `cfFolderChildren` returns capped children without a completeness flag. Upload's failed child fetch can look empty. UI fixtures mock the message and do not establish provider pagination correctness.
- `preparedProfile`, properties/private-read handlers and Explorer transient recovery can deploy/repair Workers. They are not read-only agent-inspection operations.
- R2 ingest success follows Worker put but is not independent read-back verification; GitHub success is dispatch acknowledgement only. Transfer history is capped local observations, not an atomic recoverable journal.
- RFIS observations/export are now opt-in. The proposal's unconditional-observation warning is stale relative to audited code. Export is incomplete; stable identity across moves, recovery, packed format and entitlement enforcement are not demonstrated.
- Windows CMake references missing `windows/src/main.c`; the native README is not executable proof.

## Environment setup and publication boundary

Reusable `install_script` and `start_skill` were saved to the environment draft for the offline workflow, with working directory, checks and known failures. `api.github.com` was added to the custom network domain list to permit the requested GitHub PR operation. The draft tool confirmed `saved` and `requires_publish:true`; saving does not activate networking or publish a snapshot. Review/save the environment settings, then publish when appropriate.

Local Wrangler sample startup was attempted and diagnosed: template bucket name invalid; an ignored `.wrangler/onboarding.toml` supplies a valid **local emulated** bucket. A second startup still fails because configured compatibility date `2026-09-26` exceeds the locked workerd maximum `2026-05-03`. No compatibility semantics were silently downgraded, no Worker was deployed, and no service is running. This does not block offline catalog/test development. Browser OAuth, real R2 transfers, deployed compatibility, Windows build and fresh-task snapshot restoration are **unverified**.

## Continue from here

Branch: `feat/agent-project-inspection`, successfully pushed to origin. Implementation commits: `490201a` (M0 audit) and `a381a0f` (M1 slice). PR title/body are prepared in [PR_DRAFT.md](PR_DRAFT.md). `gh pr create --draft --base main --head feat/agent-project-inspection --title "Audit ReDown and add an offline read-only project inspection API" --body-file docs/agent/PR_DRAFT.md` was attempted and failed: `Post "https://api.github.com/graphql": Forbidden`. **No PR was created.** Network policy is the confirmed blocker; branch push and native Git authentication succeeded.

1. Once `api.github.com` is active, retry `gh api repos/thanks-cohn/remote-download-2-cloudfare --jq .permissions` and draft PR creation. Initial requests failed at the proxy CONNECT tunnel with 403; `gh auth status` alone does not establish missing credentials. Do not request a token before checking restored connectivity/authentication.
2. Fix the two stale fixture harnesses in a separate focused change, with full suite execution and browser smoke validation. Preserve existing assertions; add RFIS/global mocks and current menu DOM contract deliberately.
3. Obtain human acceptance of a genuine Forever Works ReDown model before adding ID mappings; use upstream schema/provenance/version/closed-world evaluation semantics. Do not manufacture accepted intent from this audit.
4. Expand M1 only as needed: structured subsystem navigation and additional curated operations. Keep ordinary runtime independent.
5. M2: semantic source/contract integrity, genuine caller/callee/dependency graph and impact analysis. Current `inspectReferences` is only content/anchor freshness, not full `validateCatalog`.
6. M3/M4: privacy-reviewed diagnostic fixtures, correlation/recovery evidence and read-only change plans. No live mutation adapter is implemented or authorized by inspection.

Unfinished: full functional target, actual Forever model/adapter/conformance, cloud/browser end-to-end and crash/interruption tests, full graph/semantic drift detection, diagnostic guide, change plans, live transports and native programmer CLI. No claim of production transfer readiness or fully passing existing suite is made.
