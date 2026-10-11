# Debug records 0.1: decision and audit (M0)

Audit baseline: ReDown `1fb1c691c536fd407b16798ecf7ae8b031e61c45`; Forever Works `230c67fa7e27577c53b6f7895df442a2ab24e4cb`. Inspected the existing agent API/catalog/contracts, debug chronology/proposals, BUG-001–013, Nested editor/model/menu handlers and tests, transfer-history writer, RFIS observations/export, Forever standard/public API/common schemas, inferred-provenance fixture and replacement/migration golden results. No upstream standard changes or conformance certification.

## Existing evidence and gaps

The project API is an offline current-implementation catalog, not execution authority. Its five operations and version 0.1 remain unchanged. Hash/anchor freshness proves cited bytes match, never that a claim is correct or a test passed. Source observations and author acceptance are independent.

Debug Markdown supplies valuable chronology but lacks validated IDs, deterministic queries and immutable event references. The old bug tracker includes reports and requested interactions; it is neither a reproduction log nor independent evidence for DBG-001. Existing DOM fixtures do not cover the fresh-child select/create action-lock failure. No live Chrome/R2 evidence is available.

`background.js:recordTransfer` stores only 50 local entries, assigns UUID/time, and removes recent same-source failures after success. Remote writes and history saves are separate; this is not a durable transaction journal. Runtime messages commonly return `{ok,error}`; Worker results may have per-item statuses. GitHub dispatch acknowledgement is not committed-file verification. These formats are not debug evidence and can contain private URLs/names.

`rfis-index.js:observe/exportJSON` uses browser-local IndexedDB files/events and opt-in observation; export is incomplete. Its object locators, provider metadata and wall-clock observations have different ownership from project incidents. Neither browser store is read or imported here. No raw logs, credentials or customer data are committed.

DBG-001 source still captures every disabled control before an action and restores the snapshot in `run.finally`. Folder creation enables `+ Child` inside the task, then restoration disables it again; selection sets readiness without reconciling that control. The earlier `needsSelection` patch and DOM-preservation changes addressed narrower problems. Ancestor reselection rebuilds/reverifies descendants; it is a reported workaround, not a verified Chrome cure. There is no source-defined two-level ceiling. The companion keeps the source diagnosis separate from unperformed reproduction, correction and deployment.

## Decision: one case descriptor plus an event journal

Choose plain UTF-8 JSON descriptors and append-only JSONL events, enumerated by a small JSON manifest. Markdown-only avoids a parser but cannot reliably preserve types, referential integrity or version semantics. A mutable JSON snapshot alone erases changes of belief. A database/service adds deployment and ownership costs before they are needed.

`debug/manifest.json` locates complete case/journal pairs. Case JSON holds stable identity, reported symptom/impact, fingerprints, initial open state, privacy, environment and known gaps. JSONL owns historical observations, hypotheses, remediation proposals, outcomes and lifecycle changes. Hypothesis revisions reuse a semantic hypothesis ID but have new immutable event IDs, evidence/counterevidence links and scope. Earlier revisions remain visible. A latest-event projection is computed, never saved as a competing mutable status.

No claim is promoted by serialization. Provenance retains source type, collector, reference and review status; optional confidence is preserved, never synthesized. A source-confirmed hypothesis needs a scoped proof and linked source evidence; it does not imply a browser outcome. Test references are navigation only unless an event explicitly records a test result, command and environment. Accepted Forever entity links are unsupported: the only valid mapping is unknown with empty links. Versions remain separate.

## Atomic publication, retention and migration

This release is a reader, not a writer. Edit in a dedicated branch and publish each coherent descriptor/journal/manifest change in one Git commit. Before publication, append complete newline-terminated event records with consecutive sequence numbers, validate the staged snapshot and inspect the diff. Existing event bytes/IDs must not be rewritten: corrections are new events referencing the old event. CI/review must compare the journal prefix with the previous commit. The reader detects structural inconsistency but cannot independently prove append-only retention without an earlier snapshot.

For future local writers: one writer lock; write and fsync a complete new journal segment/descriptor in a temporary file, rename atomically, then publish a manifest referencing the completed immutable generation. Readers pin one generation. Cross-file crash recovery, concurrent writers and runtime ingestion are **not implemented or claimed**. Never partially publish files or silently ignore a truncated JSONL tail.

Format 0.1 schemas are frozen with archived fixtures. Future optional fields are tolerated and preserved; array order is meaningful. A new incompatible version requires a separate decoder and retained semantic golden fixtures. Unknown format versions fail explicitly; readers never rewrite files or eagerly migrate. Any future transform must retain original bytes, version, digest, transform identity and an auditable event linking old/new representations. Schema acceptance alone is not semantic preservation.

## Deliberately small implementation

The sibling `agent/debug/` has five operations: discovery, list, case, history and validation. It reads only manifest-listed files and cited references, once per API instance. That immutable snapshot has no wall-clock dependency and no full-tree scan; recreate the API to observe edits. Indexes are in memory by exact case ID. Persistent incremental indexes, similarity, impact graphs, runtime imports, maintenance plans, accepted intent attachments and fleet trials are M2–M5 work.

Records and APIs are vendor neutral; the first adapter uses Node built-ins and does not import extension code. Unknown object fields survive round trips and queries. No automatic fix, cloud access, telemetry or deployment is implied.
