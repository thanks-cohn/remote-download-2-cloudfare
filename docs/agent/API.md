# Internal project inspection API 0.1 (M1 slice)

Incident history is available through the separate [offline debug API 0.1](../debug/API.md). Its own discovery/version contract does not change these project-inspection operations or Forever Works authority.

This is ReDown's **current-how** inspection contract, not Forever Works Public API v0.1 and not ReDown's proposed programmer/transfer API. It reads source/catalog files offline; no browser, Cloudflare account, running server, model provider or extra npm dependency is required. Node's built-in modules suffice. It never executes inspected code, reads process credentials, opens browser storage or invokes network/remote mutations.

## Try it

From the checkout:

```sh
node agent/cli.mjs describe --json
node agent/cli.mjs projectOverview
node agent/cli.mjs listOperations --json
node agent/cli.mjs explainOperation context-menu-transfer --json --request-id audit-1
node agent/cli.mjs getForeverLinks cfFolderChildren --json
node --test tests/agent-api.test.mjs
```

Library:

```js
import {createAgentApi} from './agent/api.mjs';
const api = createAgentApi();
const result = api.query('explainOperation', {
  id: 'cfCreateFolder', apiVersion: '0.1', requestId: 'audit-1'
});
console.log(result.explanation); // concise plain-language projection
console.log(result.data);        // navigable contract and trace
```

CLI is location-independent when invoked by absolute path. No command installs workflows, contacts Cloudflare or starts a browser. Default command is `describe`; default output contains an explanation, evidence/freshness and readable JSON. `--json` writes exactly one structured envelope to stdout. Operational errors exit **2**, success exits **0**. A stale catalog is a successful query with explicit freshness findings and evidence `unknown`, not a validation pass. Unexpected flags/arguments are rejected. `requestId` must be an opaque `[A-Za-z0-9._-]{1,80}` string; never supply secret or private data as an ID.

## Discovery and operations

`describe.data.operations` is the authority for supported operations, sorted lexically:

| Operation | Input | Result data |
| --- | --- | --- |
| `describe` | optional apiVersion/requestId | ReDown API/catalog versions, operations, baseline commit, limits, readOnly and Forever integration status |
| `projectOverview` | optional apiVersion/requestId | actual entry points, boundaries, commands, source versus proposed statuses |
| `listOperations` | optional apiVersion/requestId | six summaries sorted by exact case-sensitive ID, evidence label and coverage |
| `explainOperation` | required id, optional apiVersion/requestId | UI origin, input/output, ordered source path, checks, state, effects, failures, source/test references and unknown Forever links |
| `getForeverLinks` | required id, optional apiVersion/requestId | explicit unknown mapping with empty IDs/model support; no invented entity references |

`listSubsystems`, `getSubsystem`, `traceImpact`, `getDiagnosticGuide`, full `validateCatalog` and `planChange` are **not implemented or advertised**. Static architecture documentation covers subsystems in M0. M2 graph/drift semantics and M3 traces remain deferred.

## Result and errors

[Result schema](../../agent/result.schema.json) uses JSON Schema 2020-12. Required envelope fields: `apiVersion`, `data`, `sourceRefs`, `provenance`, `evidenceStatus`, `freshness`, `explanation`. Optional `requestId` is echoed only after validation. Operational failure adds `{error:{code,message,details:{}}}` and `data:null`. Codes are stable; messages are not a compatibility surface. Arbitrary input values are not echoed in errors.

- `invalid-request`: missing/invalid arguments, extra fields or malformed request ID.
- `unsupported-version`: explicit requested ReDown API version is not `0.1`.
- `unsupported-catalog-version`: catalog API/format not supported by this adapter.
- `unsupported-operation`: operation not advertised.
- `operation-not-found`: exact catalog ID absent (including case mismatch).

Source references contain repository-relative `path`, exact literal `symbol` anchor (function, handler or fixture title), and SHA-256 bytes revision. The catalog also records the inspected commit. Freshness compares current contents and anchors on demand; missing/unreadable/escaping files return findings, never source bytes or OS error details. Symlinks outside root and parent traversal are rejected. Tests are references, **not dynamic test outcomes**.

Evidence vocabulary: `verified-in-source`, `verified-by-test`, `documented-intent`, `inferred`, `proposed`, `unknown`. The catalog uses inspected source observations and separately names coverage gaps. Its author provenance remains `agent-proposed/unreviewed`; source verification does not accept durable intent. On drift, envelope evidence becomes unknown and the stored entry retains its baseline classification. Freshness `current` means only audited file hashes/literal anchors match, not semantic completeness or cloud readiness. Any missing test evidence remains unknown.

## Catalog editing and migration

[Catalog schema](../../agent/catalog.schema.json) defines version 0.1. `catalog.json` is intentionally small and curated, not a copy of source code or a purported AST/call graph. Six operation descriptions are canonical for this adapter; [message inventory](MESSAGE_INVENTORY.md) separately records all current literal handlers and static caller gaps. Every catalog operation has explicit coverage and Forever mapping status.

After source changes, inspect affected claims, update references/hashes only after review, and run tests. Never refresh hashes merely to hide drift. Arrays carrying trace order are significant; JSON object keys and operation list are ordered deterministically. Consumers should ignore future optional fields. Incompatible changes require a new API/catalog version and retained fixtures/migration documentation. No wall-clock timestamp, random ID or dependency on current Git branch affects query output.

`inspectReferences` is a narrow local helper and test obligation, not the promised full `validateCatalog`. It cannot detect an incorrect claim when unchanged source is cited, disambiguate repeated literal anchors or prove contract/test coverage. Schema validation is independently checked during this PR with the available Python jsonschema validator; it is not a new runtime dependency. Portable [request fixtures](../../tests/fixtures/agent/requests.json) specify expected success/error cases.
