# Offline debug API 0.1

This sibling to [project inspection](../agent/API.md) reads local UTF-8 incident records. It does not load extension modules, execute referenced commands, read browser stores/environment credentials, contact networks or fix/deploy anything. Node built-ins suffice. The project API remains 0.1 with its original five operations; debug API version and debug record version are independent of it and of Forever Works.

```js
import {createDebugApi} from '../../agent/debug/api.mjs';
const debug = createDebugApi();
const result = debug.query('getIncident', {caseId:'DBG-001', requestId:'audit.1'});
```

Create the API from any working directory. Library `root` and `manifestPath` overrides support isolated corpus testing; the CLI exposes neither. A reader pins its lazy first record snapshot, indexes exact case IDs, caches cited bytes and never scans the full repository. Recreate it after edits. Discovery is independent of corpus validity; validation is the authority on whether that pinned corpus can be queried.

## Implemented operations

`describe.data.operations` is the authority; operations sort lexically.

| Operation | Optional / required arguments | Data |
| --- | --- | --- |
| `describe` | optional `debugApiVersion`, `requestId` | implemented operations, supported record versions, offline boundary, limits, snapshot/coverage and absent Forever adapter |
| `listIncidents` | optional `state`, `severity`, common arguments | complete incident projections sorted by exact case ID; filters combine with AND |
| `getIncident` | required `caseId`, optional common arguments | unmodified descriptor, derived lifecycle, history count, latest full event per kind/hypothesis ID/outcome scope |
| `getHistory` | required `caseId`, optional common arguments | full unmodified event objects in original sequence; no event reordering or deduplication |
| `validateDebugRecords` | optional common arguments | `valid`, stable `errors`, freshness `warnings`, case/event counts |

State filters: `open`, `investigating`, `closed`. Severity: `low`, `medium`, `high`, `critical`. Case IDs are exact, case-sensitive `DBG-` plus at least three digits. Missing valid IDs return `incident-not-found`. Unknown arguments/filters, missing case IDs and invalid request IDs return `invalid-request`; no arbitrary input is echoed. `requestId` is opaque `[A-Za-z0-9._-]{1,80}`.

Unsupported operations return `unsupported-operation`. An explicit incompatible debug API version returns `unsupported-version`. Evidence/hypothesis queries, similarity, graph tracing, remediation-plan execution, runtime imports and transport adapters are not advertised.

## Envelope and evidence

Every response follows the [result schema](../../agent/debug/schemas/0.1/result.schema.json) and includes `debugApiVersion`, `debugRecordVersion`, `data`, `sourceRefs`, `recordRefs`, `provenance`, `evidenceStatus`, `freshness`, and `explanation`. Optional valid `requestId` is echoed. Errors add `{error:{code,message,details:{}}}` with `data:null`. Messages are explanatory, not a compatibility contract.

`recordRefs` hashes identify exactly which descriptor/journal/manifest bytes were loaded. `sourceRefs` retain repository-relative paths, literal symbols, SHA-256 and source/test/document roles. Hashes/anchors matching yield `freshness.current`; changed bytes, missing anchors or missing/unreadable evidence files yield `stale` with warnings. Unsafe escaping evidence paths invalidate the corpus. Structurally invalid records yield freshness `unknown` and block all case queries; validation still returns its findings as data.

The envelope's overall behavioral `evidenceStatus` remains `unknown`: structural validation and unchanged source do not establish an incident is fixed. Historical events keep their authored labels even on source drift; the warning qualifies their relevance to the current checkout. Provenance is preserved independently of evidence quality. An inferred/agent-proposed record remains so regardless of confirmation scope or schema validity.

Source/test/document references are navigation, never execution. Source confirmation requires a static-analysis proof scoped to source and a source reference. Recorded test success needs automated scope, method, command, environment, pass result and test reference. Browser observation needs browser scope, manual-browser method, environment, pass result and a document artifact. Validation checks the declared proof structure, **not its truth**.

Confirmed hypothesis revisions also need earlier supporting evidence-event IDs and the evidence label matching their proof scope. A source-confirmed cause does not imply a verified browser outcome. Outcomes preserve their environment/proof and remain separate per scope. Closure needs explicitly linked earlier verified **automated and browser outcomes**; a commit or merged PR does not satisfy either. A later open/investigating event reopens the case without erasing closure history.

## Record schema and history

The frozen [schemas/0.1](../../agent/debug/schemas/0.1/manifest.schema.json) comprise manifest, incident, event and common definitions (JSON Schema 2020-12). Runtime structure checks execute the exact assertion subset used there, with Node built-ins; this is not a general JSON Schema validator. Independent Python JSON Schema verification is part of this release's tests. Unknown optional object fields are permitted/preserved at every level, including provenance and nested extensions.

`debugRecordVersion:0.1` is required on each manifest/incident/event; any other explicitly supplied version is rejected as `unsupported-record-version`. Case descriptors hold initial reported context, not a mutable conclusion. Append observations or corrections to the journal. Event IDs are globally unique in the corpus; sequence is consecutive, starting at 1 per case. `recordedAt` is canonical second-resolution UTC with no invented current clock; timestamps are nondecreasing in the file. `occurredOn` is a real date or null when unknown. Recording chronology governs query order; an older occurrence discovered later stays later in the journal. The imported historical narrative order and unknown patch dates remain explicit.

Event links are exact earlier IDs within the same case; missing, self and forward links are errors. Cross-case causal graphs are deferred. Repeated hypothesis IDs mean revisions, not duplicate events. Counterevidence remains visible. No implicit authority acceptance or lifecycle change is inferred from narrative text.

Limits: 4 MiB per file, 1,000 manifest cases, 10,000 journal events per case. Complete JSONL records must end with a newline; blanks, malformed lines or a truncated tail invalidate the corpus. CRLF JSONL is accepted. Files must be regular, strict UTF-8. Paths use repository-relative forward-slash components; absolute paths, backslashes, dot/parent components, NUL and symlinks escaping root are rejected. Internal symlinks are permitted. This is an offline checkout reader, not a hardened service for hostile concurrent filesystem mutation.

## Stable validation codes

Structural findings include `invalid-record`, `invalid-json`, `invalid-utf8`, `incomplete-journal`, `unsupported-record-version`, `invalid-date`, `invalid-sequence`, `invalid-chronology`, `duplicate-case-id`, `duplicate-event-id`, `duplicate-record-path`, `inconsistent-case-id`, `missing-event-link`, `invalid-proof`, `invalid-hypothesis`, `invalid-outcome`, `invalid-lifecycle`, `unverified-closure`, `unsafe-path`, `missing-record-root`, `missing-record-file`, `unreadable-record-file`, `invalid-record-file`, `record-too-large`, `too-many-events`, `invalid-catalog`, `unsupported-catalog-version`, `missing-operation-link`. Findings sort deterministically and have safe structural locations. Error details never contain file contents or native OS exception messages.

Freshness warnings are `stale-reference`, `missing-anchor`, `missing-reference`, `unreadable-reference`. Missing evidence is a warning; missing canonical records is a structural error. Catalog operation links resolve exactly against catalog 0.1 but do not establish causal impact. There is no accepted ReDown Forever model: only unknown empty links are allowed; future actual attachments require a new supported contract.

## CLI and compatibility

```sh
node agent/debug/cli.mjs describe --json
node agent/debug/cli.mjs listIncidents --state open --severity high
node agent/debug/cli.mjs getIncident DBG-001 --request-id audit.1
node agent/debug/cli.mjs getHistory DBG-001 --json
node agent/debug/cli.mjs validateDebugRecords --json
node --test tests/debug-api.test.mjs
```

`--json` emits exactly one envelope. Human output explains symptom, source mechanism, unknown outcome, provenance, next verification and navigable references. Success exits 0; operational errors and validation `valid:false` exit 2. Freshness warnings alone exit 0. Bad/duplicate flags are rejected. No root selection, environment secrets or network configuration is accepted.

[Archived 0.1 corpus and semantic golden](../../tests/fixtures/debug/v0.1/expected.json) must remain unchanged in future releases. Conformance tests prove required shape, old meaning, unknown-field round trips and unchanged inferred/unreviewed provenance. Retain old decoders; preserve original bytes and auditable transforms for any future migration. See [atomic publication/retention policy](DESIGN.md); no writer or crash-safety promise is made.
