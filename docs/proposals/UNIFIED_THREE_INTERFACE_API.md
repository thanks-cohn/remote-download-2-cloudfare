# Proposal — ReDown Unified API: Three Interfaces, Two Tiers

**Status:** Proposed architecture, not implemented  
**Scope:** ReDown first; reusable principles for Substrate, Chute, and future family applications  
**Pricing assumption:** Full API access **$8 one-time**, subject to confirmation and storefront economics. This does not automatically replace the proposed $5 application Premium or $1/month feature-rollout policies.

## Thesis

**One dependable core. Three purpose-built experiences. Two meaningful capability tiers.**

Separate the existing Cloudflare/transfer logic from the UI and make it a small, versioned, independently testable API core. Expose the *same semantics* through three adapters rather than writing three divergent implementations:

1. **Agent-centric API:** Machine-discoverable operation catalog, typed JSON schemas, explicit preconditions, declarative plans, structured errors, safe retries, dry runs and explainable results.
2. **Programmer/debugger API:** Stable request IDs, human-readable errors, trace contexts, inspection tools, replayable non-secret diagnostic fixtures, profiling and deterministic reproduction.
3. **Everyday scripting API:** Straightforward functions, CLI or JavaScript ergonomics for listing, searching, downloading, uploading, creating folders, organizing objects and automating simple workflows.

Each adapter must provide a compelling **Basic** edition rather than being a teaser. **Full API ($8 proposal)** adds sophistication, scale, introspection and advanced orchestration. Core correctness, data integrity, safety checks, security patches and usable error diagnostics are never paywalled.

## Product philosophy — limitless creation, exceptional tools

**Basic is a real foundation, not a crippled demonstration.** An independent programmer, student, creator, or agent should be able to use the free API to build ambitious, original applications, worlds, integrations, and automations without artificial caps on creativity, arbitrary project limits, or intentionally missing correctness guarantees. Practical provider quotas, compute costs, security limits and resource constraints still exist and must be disclosed rather than confused with product-tier restrictions.

**Premium is the better way to work, not permission to work.** Full API should be notably more elegant, functional, productive and desirable through high-level abstractions, efficient bulk workflows, richer debugging and visualization, advanced recovery, history-aware operations, excellent developer tooling, and polished integrations. Premium users pay to accomplish complex work with less effort and greater visibility—not to remove obstacles deliberately imposed on Basic.

The three experiences—Agent API, Debugger API, and Scripting API—each ship as capable Basic products and evolve into substantially richer Full experiences. Shared operation semantics, file safety, reliable results, and clear error messages remain consistent across tiers.

**Release test:** Can a capable developer accomplish a serious task in Basic, even if it takes more manual composition? Does Premium provide a clearly superior, demonstrably more pleasant way to accomplish it? If both answers are not yes, rethink the tier split.

## Capability matrix

| Interface | Basic (included/free) | Full API (proposed $8) |
| --- | --- | --- |
| Agent | Capability discovery, typed schema, explicit single-step actions, confirmations, typed errors | Multi-step plans, validated batch execution, dependency graphs, resumable jobs, lineage and history-aware actions |
| Debugger | Logs, operation IDs, readable error codes, inspect current request/response summaries, limited safe diagnostic export | Rich traces, performance profiling, reproducible sanitized fixtures, timeline/correlation views and diagnostic automation |
| Scripting | Simple documented calls for bucket/folder listing, transfers and common file operations, pagination | Advanced query/filter pipelines, resilient bulk jobs, event-driven automation and high-level workflows |

### Example underlying operation contract (illustrative)

```json
{
  "apiVersion": "redown.v1",
  "operation": "r2.listChildren",
  "target": { "accountId": "account-ref", "bucket": "works", "prefix": "art/" },
  "paging": { "cursor": null, "pageSize": 100 },
  "requestId": "example-operation-id"
}
```

```json
{
  "ok": true,
  "requestId": "example-operation-id",
  "data": { "folders": [], "objects": [], "nextCursor": null },
  "verification": { "source": "remote", "complete": true }
}
```

**Identical core contract** beneath a friendly script wrapper like `redown.r2.listChildren({bucket:"works", path:"art/"})`, a diagnostic inspector, and an agent tool schema. The illustrated JSON is a design target, not a currently supported public endpoint.

## Engineering rules

- **Capability before adapter:** Operation contracts define inputs, output shapes, authorization, side effects, progress, retries, cancellations, and errors. Adapters must not invent different behavior.
- **Bucket identity persists invisibly:** A stored account/bucket target is an API parameter. Users should never have to reselect an already known bucket merely to use or edit a destination.
- **Separate provider drivers:** Cloudflare R2 is the first adapter, but avoid coupling generic file identity/history and scripting abstractions to Cloudflare internals.
- **Security boundaries:** Chrome extension messages are not a public unauthenticated API. Validate origin/permissions, authenticate operations, safeguard secrets, explicitly authorize remote mutations, rate-limit and audit relevant actions.
- **Predictable errors:** Never return an empty success result for a network/auth failure; include request IDs, failure codes, retryability and precise partial-result status.
- **No silent destructive automation:** Dry-run previews and clear confirmations for deletes, cross-bucket moves, and potentially expensive bulk operations. Agent proposals cannot bypass approval policies.
- **Basic must be fast:** Keep common one-step operations lightweight, with no dependency on Premium RFIS manifests, deep telemetry or history databases.
- **Premium compatibility:** Full API may integrate RFIS persistent IDs, location deltas, event history and portable manifests. Its absence must never break Basic.
- **Backwards compatibility:** Version APIs, maintain compatibility adapters for current options/background callers and add contract tests before removing legacy message handlers.
- **Great developer experience:** Public docs, copyable examples, typed declarations, deterministic test fixtures, stable migration notes, and meaningful ordinary logs from day one.
- **Honest packaging:** Define license entitlement for $8 API separately from app Premium at $5 and optional $1/month new feature updates; resolve bundles before launch.

## Extraction path — incremental, not a rewrite

### M0 — Inventory current API surface
Document present `chrome.runtime` messages and their corresponding handlers, worker calls, authentication, transfer actions, side effects, and data shapes. Map every caller in the Simple/Nested destination editors, Upload from Computer and Explorer. This prevents a new module from breaking existing destinations.

### M1 — Stable core contracts
Extract typed, documented operation contracts and errors into a separate module. Build a compatibility layer routing existing messages to these contracts. Test representative Cloudflare listing, folder creation, uploading and transfer flows against mocked providers.

### M2 — Basic three-interface release
Ship a small agent tool catalog, a usable human/debug console or diagnostic view, and a straightforward scripting interface. Include real examples and contract tests. No Full API subscription or RFIS dependency needed.

### M3 — Full API
Add batch and resumable jobs, deeper traces and advanced workflows, RFIS history-aware operations, and optional user-controlled detailed diagnostics. Implement actual entitlement checks for premium-only capabilities, never just hidden UI.

### M4 — Scale and portability
Benchmark large and rapidly changing object sets, maintain provider-independent contracts, add versioned migration guides, and use streaming/partitioning rather than artificial limits.

## Immediate acceptance criteria

- Existing right-click and Upload from Computer transfers remain functional when adapters are swapped.
- A saved destination works without manual bucket re-selection.
- Each operation has documented arguments, deterministic error handling, and an auditable request ID.
- Basic agent/programmer/debugger entry points can perform realistic work without a paid license or a rich local JSON database.
- Full API functions cannot be invoked merely by bypassing UI; entitlement protection is implemented at the capability boundary.
- All three interfaces call the same core function and produce compatible semantic results for equivalent actions.
- An API migration cannot silently change an R2 destination or delete an object.

## Decisions to confirm

- Is **$8 a one-time per-application Full API license** or a family-wide developer entitlement?
- Is Full API included with an eventual Premium bundle, or sold separately?
- Which invocation surfaces are exposed publicly: extension-internal API, CLI, localhost service, SDK, remote API, or a combination?
- Which features are achievable within Chrome Manifest V3 without a native host or backend?

**Product principle:** Basic feels state of the art; Full API makes serious automation and observability exceptional. Avoid creating six implementations.
