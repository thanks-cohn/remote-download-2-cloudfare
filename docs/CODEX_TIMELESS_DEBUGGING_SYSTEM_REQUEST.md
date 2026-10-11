# Codex Request — Timeless Debugging and Maintenance Intelligence

**Status:** Implementation request, not an implemented capability  
**Repository:** `thanks-cohn/remote-download-2-cloudfare`  
**Primary local references:** `AGENTS.md`, `agent/api.mjs`, `agent/catalog.json`, `docs/agent/API.md`, `docs/debug/README.md`, `docs/debug/PROPOSED_CHANGES.md`, `docs/debug/DBG-001_NESTED_CHILD_DEPTH_DISABLED_STATE.md`  
**Upstream standard:** `thanks-cohn/forever-works` (`docs/STANDARD.md`, `docs/API/PUBLIC_API_V0_1.md`, schemas and conformance fixtures)

## Mission

Design and incrementally implement a **durable, elegant debugging knowledge and evidence system** that makes each future failure easier to investigate, reproduce, correlate, repair, verify and understand—regardless of whether the maintainer is a human, Codex, ChatGPT or a future agent.

Treat the first Nested Mode failure (DBG-001) as a real case study. Do **not** implement a giant autonomous-maintenance framework prematurely. Create small composable primitives with stable identifiers and plain UTF-8 JSON/JSONL, source-backed evidence, deterministic queries and first-class lifecycle/history semantics.

**North star:** An unfamiliar agent can discover the project's architecture, ingest an incident, find related historical incidents and components, propose *evidence-backed* causes, reduce failures to common mechanisms, identify the smallest safe correction, locate appropriate tests, and produce a comprehensible report without losing the incident's history.

This system is **independent of the ordinary ReDown customer-facing CLI/API**, which must remain simple. It augments the Deep Agentic Project API without granting cloud data access or code-change authority by default.

## Core principles — timeless, understandable, economical

1. **Semantic durability:** Stable case, operation, subsystem, invariant, hypothesis, test, fix and evidence identifiers. Never anchor permanent meaning solely to line numbers, SHA hashes or a particular language/framework.
2. **Historical truth:** Append new dated observations rather than rewriting prior conclusions. Record when a belief changed and what evidence caused it. Superseded hypotheses remain visible.
3. **Provenance and confidence:** Distinguish reported symptoms, observed reproductions, source inspection, tests, deployed observations, hypotheses, accepted requirements and unknowns. Never convert correlation into root-cause proof.
4. **One meaning, multiple views:** Rich machine-readable records; concise human-readable Markdown generated from or linked to the same canonical data; adapters can later support CLI, web views or agents.
5. **Causal compression:** Cluster similar symptoms across reports and projects, identify plausible shared upstream defects and rank by impact and evidence. Always retain minority and independent edge cases; do not discard reports just because a cluster is large.
6. **Secure by construction:** Read-only defaults; secret/PII redaction; no automatic production access; mutation, telemetry ingestion and publishing require explicit scopes, permissions and approvals.
7. **Small surface, deep semantics:** Prefer a dependency-light offline library and index over a framework-heavy service. Keep deterministic non-AI behavior for indexing, validation, deduplication and graph traversal; LLM reasoning is optional.
8. **Backwards-readable records:** Version schemas and maintain fixtures for every released format. Future revisions must interpret previous records faithfully; preserve unknown fields and do not silently reinterpret old meanings.
9. **Explicit knowledge boundaries:** Intent belongs to the Forever Works model; current implementation and debug evidence belong to the project inspection/debug layer; runtime state belongs to the relevant operational store. Keep versioned, non-authoritative links across boundaries.
10. **Beautiful understanding:** Technical depth should collapse into honest, accessible explanations: what happened, why it may have happened, what has been verified, what changes are proposed, and what remains uncertain.

## Preparatory audit

- Inspect the real current source, tests, deep agent API, `docs/debug/`, old bug tracker, transfer logs and existing event/error formats. Do not assume previous handoff claims remain current.
- Read and follow the actual Forever Works specification and conformance policy. Preserve distinctions among `foreverVersion`, Forever Works API version, and ReDown agent/debug API versions.
- Determine which parts of incident indexing can be reliably supported offline now; identify unavailable observability, environment constraints and browser-only verification.
- Examine DBG-001 as an initial case, including prior source-confirmed stale disabled-state restoration, root reselection workaround, and unverified Chrome behavior.
- Make a compact design decision record comparing a canonical JSON case + append-only JSONL evidence/events against Markdown-only documentation. Choose one authoritative machine-readable representation, establish atomic update and migration semantics, and avoid competing mutable truths.

## Proposed minimal data model

Use JSON Schema and explicit version identifiers. Refine details based on code audit. Suggested entities:

- **Incident:** `caseId`, stable fingerprint(s), product/version/environment, symptom, user impact, lifecycle state, linked reports, firstSeen/lastSeen and privacy classification.
- **Observation/evidence:** immutable event ID, case ID, timestamp (or deterministic fixture clock), provenance, collector, claim, supporting source/test/log reference, redaction class and evidence quality. Record observation separately from interpretation.
- **Hypothesis:** proposed cause, linked evidence, counterevidence, scope, confidence, state (`unverified`/`supported`/`refuted`/`confirmed`) and revision history. Confirmation requires a defined test or verifiable proof.
- **Dependency/impact link:** references to agent catalog operation/subsystem IDs, source symbols, known tests, and optional accepted Forever Works capability/invariant IDs.
- **Remediation:** intended change, preconditions, affected paths/contracts, tests before/after, rollback considerations, result status, review/commit/PR references and outstanding risks.
- **Cluster:** grouping criterion, likely shared cause, incident membership, exceptions, version/date scope, confidence and explainability. Deduplication must be reversible.
- **Outcome:** deployed/verified status, environment, timestamp, regression checks and evidence. A merged PR is not deployment verification.

Keep schemas easily inspected; use deterministic ordering and explicit stable error codes. Avoid including user files, raw secret-bearing logs or API tokens in committed fixtures.

## Read-only debugging interface — first API design

Extend the **existing** `agent/api.mjs` contracts where appropriate, or add a clean sibling `agent/debug/` package that uses the same principles. Advertise *only implemented* operations:

- `listIncidents(filters)` / `getIncident(caseId)`
- `getHistory(caseId)` with chronological, unmodified events
- `getEvidence(caseId)` and `getHypotheses(caseId)`
- `findRelated(caseId)` returning grounded matches, rationale and uncertainty
- `traceImpact(operationOrSubsystemId)` through known, verified graph edges
- `getRemediationPlan(caseId)` for documented proposed changes, not automatic patch execution
- `validateDebugRecords()` and `describeDebugApi()` with coverage/schema/version compatibility and stale/missing links

CLI `--json` and legible explanation modes are adapters, not alternate truth sources. Avoid expensive full-tree scans on every query; update indexes incrementally when source content or case records change. Track freshness and known coverage gaps precisely.

**Do not implement all operations in one PR.** The first phase may ship `describe`, `listIncidents`, `getIncident`, `getHistory`, and validation plus one grounded case fixture.

## Debugging lifecycle (reusable for every project)

```text
Incoming report(s)
 -> normalize & redact
 -> create/link durable case ID
 -> retrieve earlier cases and architectural context
 -> collect observations and counterexamples
 -> map symptoms to operations, components and invariants
 -> enumerate causal hypotheses with uncertainty
 -> select highest-value reproduction / falsification test
 -> develop minimal change and regression test
 -> verify locally, then in appropriate real environment
 -> append results, retain failed attempts, explain in plain language
 -> optionally close, reopen or supersede case with provenance
```

Reports are not presumed reliable; raw count is not independent evidence of impact. A common outage can create thousands of reports, while a rare high-severity data-loss bug deserves immediate attention. Prioritization must consider impact, severity, confidence, blast radius and cost—not merely duplicate volume.

## Forever Works attachment and compatibility

- Link cases and remediation claims to actual accepted Forever Works IDs **only when the model exists and the IDs resolve**. Unknown links remain unknown, never fabricated.
- Do not duplicate or override Forever Works' durable intent, invariants, dependencies, decisions or migration semantics.
- Keep the debugging format implementation/vendor neutral, preserving unknown fields and historical version decoders.
- Add archived v0.1 example fixtures and backwards-read conformance tests. Do not require eager migration of historical records. If migration is performed, retain original bytes and an auditable transform.
- Distinguish *schema compatibility* from *semantic preservation*; new readers must prove both.
- Provide explicit future extension points for fleet-scale maintenance across many repositories without adding an unnecessary always-on central service in ReDown today.

## Phase plan

### M0 — Contract and source audit
Document the existing debugging/history practices and their gaps; select canonical JSON/JSONL format; record a decision and schema migration/retention policy. Update `docs/debug/README.md` to link this request and explain the author-neutral process.

### M1 — Working local case intelligence (first implementation)
Implement a tiny tested offline debug record reader + validator + query interface and stable schemas. Convert DBG-001 into a **new machine-readable companion record** while retaining the existing original Markdown and its chronology. Provide chronological history, evidence status and readable summaries. Add tests for malformed data, stale references, unknown IDs, unsafe paths, schema evolution and provenance preservation.

### M2 — Causal links and test mapping
Connect documented operations, subsystems, tests and incident cases; introduce evidence-backed impact tracing and grounded similarity grouping. Include false-positive and dissimilar-symptom examples, plus reversible clustering and explainable prioritization.

### M3 — Runtime diagnostic imports
Add *opt-in*, privacy-reviewed import of sanitized traces and structured errors; link by correlation IDs. Support uncertain outcomes, interrupted transfers and causal timelines without promising crash safety until durable journal testing exists.

### M4 — Safe maintenance planning
Provide bounded change impact, recommended falsification/regression tests, reviewable patch plans and Forever Works invariant checks. Read-only default; no self-deployment, irreversible action or unapproved remote mutation.

### M5 — Fleet compatibility trial
Demonstrate ingestion and analysis across multiple independent projects with distinct schema/implementation versions, preserving old records. Compare maintenance time, correctness, causal cluster precision, rate of unsupported assumptions and recovery effectiveness against ordinary repository search.

## Acceptance for the first Codex PR

1. A documented authoritative record format with human-readable history and versioned JSON Schema, preserving old debug Markdown unchanged.
2. DBG-001 is represented faithfully, including *reported symptoms*, *source-confirmed mechanism*, *earlier partial fixes*, and *unverified Chrome status*; no claim that it is resolved.
3. Deterministic read-only API/CLI commands can list the case, retrieve its history and report evidence/unknowns from an offline checkout.
4. Explicit, testable semantics for source reference freshness, malformed or inconsistent records, absence, duplicate IDs, unsafe paths and unsupported versions.
5. Backwards-compatibility fixture(s) and schema/version test policy established. Provenance and unknown fields survive round trips.
6. Tests, actual command outputs and remaining limitations recorded. No browser extension transfer or Worker code changed merely to add debugging infrastructure.
7. A concise `docs/debug/IMPLEMENTATION_REPORT.md` and updated agent onboarding documentation link the new tools.
8. Work in a focused branch with a **draft PR**, small reviewable commits, and explicit baseline/after test results. If PR creation is blocked, report the error and pushed branch without claiming a PR exists.

## Success demonstration

An unfamiliar agent receives only the ReDown checkout and the issue **“Nested Mode cannot add folders beyond two levels unless I reselect the bucket.”** It discovers DBG-001, reads the chronological evidence and proposed correction, locates exact source symbols and known tests, explains the suspected source-level cause in ordinary language, lists what is *not* yet verified, and proposes a minimal next verification step. It does not need to rummage through every file or infer an invented depth limit.

The long-term benchmark is whether a future agent can repeat this process for a thousand distinct reports—grouping true common causes without burying important rare defects—and still explain the results to a nontechnical owner.

**Design mandate:** Make the system *more understandable as it grows*. Complexity belongs in inspectable primitives; clarity belongs at every surface.
