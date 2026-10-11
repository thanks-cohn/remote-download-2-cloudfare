# Codex Request — ReDown Deep Agentic Project API
**Status:** Engineering request; implementation is not yet complete  
**Repository:** `thanks-cohn/remote-download-2-cloudfare`  
**Primary reference:** `https://github.com/thanks-cohn/forever-works`  
**Objective:** Give an unfamiliar agent reliable, deep, evidence-backed understanding of ReDown's intent, implementation, operations, debugging surfaces, and modification boundaries, without compromising the elegant human-facing experience.

## Mission

Create a **distinct, internal Deep Agentic Project API**, separate from the simple public programmer/CLI API. This is an agent-maintenance and project-comprehension interface, **not** a paid feature gate. An agent should quickly answer what ReDown does, why it exists, how a function works end-to-end, what it depends on, what could break if changed, what evidence verifies behavior, and which facts remain uncertain. It must be usable by Codex, ChatGPT, Claude, and future tools without dependence on any particular agent vendor or transport.

**Product philosophy:** ReDown competes on the beauty of understanding, simplicity, pleasure, predictability and trust. Deep agent/debug capabilities must *reduce* complex actions to legible primitives, verifiable evidence and explanations even a nontechnical CEO can understand. The simple GUI, the ordinary developer CLI/API and the internal deep project API are distinct experiences over a consistent execution model. Do not turn the ordinary GUI or basic programmer interface into a debugging cockpit.

## Required preparatory investigation

1. **Inspect the actual ReDown repository**, entry points, manifest, background scripts, options UI, nested/simple menu editors, upload-from-computer, Explorer, Cloudflare authentication/Workers/R2, local storage, IndexedDB/RFIS experiments, transfer and failure paths, tests and documents. Confirm code paths rather than treating proposals as implemented.
2. **Read the actual Forever Works repository**, especially `AGENTS.md`, `docs/FOUNDATIONAL_PROPOSAL.md`, `docs/STANDARD.md`, `docs/API/PUBLIC_API_V0_1.md`, schemas and examples. Treat the Forever Works standard as authoritative for its own model; do not invent proprietary variants. Consult its conformance fixtures before changing semantics.
3. Review ReDown's `docs/proposals/UNIFIED_THREE_INTERFACE_API.md`, `docs/proposals/REDOWN_COMPETITIVE_LEADERSHIP_ROADMAP.md`, `docs/proposals/RFIS_PERSISTENT_FILE_IDENTITY_HISTORY.md`, and current bug reports. Correctly label implemented versus proposed versus partially implemented behavior.
4. Produce an inventory of extension messages, their handlers, initiating UI controls, side effects, remote calls, security checks, persisted state, async boundaries, and errors. Identify any unknowns explicitly. Do not make up functions, test coverage, or production capability.

## Architectural boundaries

**Forever Works (durable why):** intent, capabilities, invariants, constraints, implementation/dependency rationale, replacement requirements, compatibility and migration evidence. JSON remains canonical and technology neutral. Agent-inferred intent must never become authoritative without explicit acceptance.

**Deep Agentic Project API (current how):** navigable source/subsystem topology, caller/callee relationships, operation lifecycles, side effects, state ownership, testing and evidence, diagnostics, suspected regressions, change impact and explainable execution plans. Reference Forever Works stable IDs, not duplicate or replace the project's durable meaning.

**Simple programmer API / future native CLI (do):** convenient explicit commands for listing, uploading, downloading, organizing, inspecting and automating Cloudflare assets. It must not require an agent model or expose internal debugging complexity to ordinary users.

**Runtime execution core:** existing browser/worker/R2 operations and shared contracts. Do not rewrite core transfer logic in milestone one or duplicate behavior in different layers.

## Functional contract — initial target

Provide a tiny versioned read-only semantic interface, with capability discovery. Exact names may be refined after the code audit; document the chosen schema and stable error semantics.

- `describe()` — agent API version, model/schema versions, available operations, status and source freshness.
- `projectOverview()` — actual project purpose, entry points, architecture boundaries, setup/test commands, implemented/proposed distinctions and trustworthy starting references.
- `listSubsystems()` / `getSubsystem(id)` — purpose, owner files and symbols, storage boundaries, dependencies, risky operations and evidence.
- `listOperations()` / `explainOperation(id)` — input/output contracts; UI origin; event/message/handler/Worker/R2 path; security, persisted state, invariants, error cases, actual test references.
- `traceImpact(id)` — both upstream/downstream influences and plausible regression points, with source references and confidence.
- `getDiagnosticGuide(codeOrOperation)` — known failure state, evidence and reproduction steps; no secret logs.
- `getForeverLinks(id)` — references to matching Forever Works IDs, with explicit provenance, supported model-version status and unknown mappings.
- `validateCatalog()` — stale/missing references, orphan IDs, ambiguous citations, mismatched operation contracts and non-existent source/test symbols. Treat absent evidence as **unknown**, never as pass.

Use a stable, lightweight structured result envelope with `apiVersion`, `requestId` where relevant, `data`, `sourceRefs`, `provenance`, `confidence` or evidence status, and structured errors. Reserve names and formats explicitly; do not claim Forever Works v0.1 defines these new ReDown operations. Provide concise human-readable projection of every result.

## Source and evidence rules

- Cite repository paths and function/symbol names; include a commit or content revision when possible. Line numbers may supplement references, but must not be the sole link because they drift.
- Classify every claim as **verified in source**, **verified by test**, **documented intent**, **inferred**, **proposed**, or **unknown**. Separate current code behavior from proposals.
- The generated catalog is not omniscient: state discovery limits, stale-index status, missing test coverage and uncertainty.
- Minimize redundant indexes. Prefer deterministic manifests plus on-demand source navigation and explicit references rather than duplicating whole files.
- Use plain UTF-8, JSON and small dependency-free components where practical; maintain schema evolution, canonical ordering, CI drift checks and a migration path.
- Documentation and catalog must remain usable offline from a checkout. Do not require paid proprietary agent products or network calls just to answer basic architectural questions.

## End-to-end tracing, diagnosis and safe change planning (later phases)

A complex action must be reducible to a comprehensible chain:
```text
human intention / visual configuration
  -> UI event / state transition
  -> extension message / API operation
  -> authorization and policy checks
  -> Worker / Cloudflare R2 action
  -> durable local journal / cache updates
  -> verified success, uncertain outcome or structured failure
  -> short plain-language explanation + expandable technical trace
```

- Stable correlation IDs; sanitized, structured errors; explicit `planned`, `attempted`, `unknown`, `verified`, `failed`, `recovered` states. Do not confuse a local acknowledgement with remote verification.
- Project inspection is read-only by default. Never implicitly authorize Cloudflare mutations or production data access. Distinguish read-only code investigation, local fixture/test execution, configuration mutation, remote writes and destructive operations.
- Future `planChange` may show affected symbols/files/Forever Works invariants/test obligations and recovery steps but **must not silently execute changes**.
- An agent's sophisticated workflow should be explainable as ordered primitive steps with policy boundaries and evidence; high-level abstractions must not hide unverified actions.
- Build standard diagnostic fixtures using mock workers and scrubbed logs; do not log credentials, tokens, private filenames, or sensitive file content without explicit permission.

## Forever Works integration requirements

- Use actual Forever Works standard/schema/API v0.1 contracts where they apply. `foreverVersion` and public API version are distinct; never conflate them with ReDown agent API version.
- Forever Works remains the authority for accepted project intent and semantics. ReDown's deep API provides implementation-level links and current evidence.
- Keep explicit stable references between capabilities/invariants and concrete ReDown subsystems/operations; missing links are visible findings.
- Respect provenance: inferred or agent-proposed declarations remain unapproved until a human accepts them.
- Do not silently alter Forever Works' standard or force proprietary transport. Optionally add a compatible adapter in a later phase; MCP or HTTP are **adapters**, not canonical semantics.
- Protect interoperability with `thanks-cohn/forever-works` and future **Forever Works project integration**, keeping separate repository ownership and version-aware adapters.

## Phased execution; no giant rewrite

**M0 — Audit and map (first PR):** Verify repository architecture and create a concise navigable architecture map, operation catalog, explicit coverage/unknowns and source references. Record a proposed directory layout based on actual repository conventions. Do not refactor transfer code. Document Forever Works mapping strategy.

**M1 — Minimum working API:** Implement a tiny dependency-light read-only agent inspection package/CLI adapter for discovery, overview, operation descriptions and source trace references. Supply examples, JSON schema, unit tests and validation. Existing extension must behave identically.

**M2 — Drift detection and impact:** Automate catalog/source reference integrity checks, discover changed operations, add dependency/impact and test cross-references. Keep generated output reproducible. No live remote services required to test.

**M3 — Diagnostics and recovery understanding:** Add scrubbed operation traces, correlation IDs, failure catalog and human/agent explanation views after reviewing privacy/security boundaries. Do not equate planned journaling with working crash recovery.

**M4 — Agent maintenance workflow:** Read-only change-plan and verification suggestions, fixtures, Forever Works invariant-aware regression checklists and optional integration transport. Mutating agent actions require explicit authorization and tests.

Do **not** skip directly to M4. Commit small coherent changes, retain compatibility and document what remains incomplete.

## First Codex implementation request — start here

Complete **M0**, then implement the smallest useful and tested slice of **M1** if feasible without invasive changes. This first PR should include:
1. An accurate `docs/agent/ARCHITECTURE_MAP.md` grounded in source.
2. An `docs/agent/OPERATION_CATALOG.md` tracing representative operations: context-menu transfer, `cfFolderChildren`, `cfCreateFolder`, new R2 bucket creation, Upload from Computer, and Explorer navigation.
3. An `docs/agent/FOREVER_WORKS_COMPATIBILITY.md` mapping Forever Works versioning, provenance, intent and replacement obligations; clearly marked gaps.
4. A small versioned machine-readable catalog plus read-only discovery/query adapter and test fixtures, if M1 can be completed safely.
5. An `AGENTS.md` at repository root for *accurate*, concise agent onboarding, referencing this handoff and current docs without replacing them.
6. A change report: verified findings, source links, test commands actually run, test results, missing coverage, residual risks and next steps.

### Demonstration / acceptance

A fresh agent should be able to inspect the handoff and API, then accurately explain a browser right-click → selected ReDown destination → background handler → Worker → R2 flow, identify the relevant source and failure conditions, and name the tests protecting it—or explicitly state that tests are missing. It should likewise identify Simple/Nested folder dependencies without suggesting redundant bucket reselection.

The API must respond deterministically to missing operations and unsupported versions, report provenance, avoid leaking secrets, and pass tests without requiring a live Cloudflare account. Existing user flows must remain intact. Document actual verification; do not declare success from generated documents alone.

**Final engineering goal:** Make ReDown easier for any capable agent to understand and maintain as it grows, while making the product itself more delightful, comprehensible, dependable and preferable for humans.
