# Forever Works compatibility strategy

**Evidence:** inspected `thanks-cohn/forever-works` at `230c67fa7e27577c53b6f7895df442a2ab24e4cb`, including `AGENTS.md`, `docs/FOUNDATIONAL_PROPOSAL.md`, `docs/STANDARD.md`, `docs/API/PUBLIC_API_V0_1.md`, `spec/schemas/common.schema.json`, `manifest.schema.json`, `examples/file-transfer/forever/dependencies/old-streamer.json`, conformance case inventory, inferred-provenance fixture and replacement golden. No upstream files or semantics were changed. Upstream conformance suite was **not run**; this is a reviewed design boundary, not a conformance certification.

Authoritative pinned references: [standard](https://github.com/thanks-cohn/forever-works/blob/230c67fa7e27577c53b6f7895df442a2ab24e4cb/docs/STANDARD.md), [public API](https://github.com/thanks-cohn/forever-works/blob/230c67fa7e27577c53b6f7895df442a2ab24e4cb/docs/API/PUBLIC_API_V0_1.md), [common schema](https://github.com/thanks-cohn/forever-works/blob/230c67fa7e27577c53b6f7895df442a2ab24e4cb/spec/schemas/common.schema.json), [conformance cases](https://github.com/thanks-cohn/forever-works/blob/230c67fa7e27577c53b6f7895df442a2ab24e4cb/conformance/fixtures/cases.json), [replacement golden](https://github.com/thanks-cohn/forever-works/blob/230c67fa7e27577c53b6f7895df442a2ab24e4cb/conformance/expected/replacement.json). Offline essentials are summarized below; running ReDown inspection never requires this checkout or network.

## Contracts to preserve

| Concept | Forever Works 0.1 | ReDown boundary |
| --- | --- | --- |
| Version | `foreverVersion` is the model format; `foreverApiVersion` is the public operation contract | ReDown `apiVersion`/`catalogVersion` are independent. Discovery references standard/API 0.1 but reports `supportedModelVersions:[]`, `adapterImplemented:false` |
| Record identity | globally unique stable IDs matching `^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$`; exact references; missing targets errors; cycles valid | ReDown operation IDs are local catalog IDs, **not Forever entity IDs**. Missing accepted mappings return unknown/empty links |
| Authority | standard → schemas/conformance → bindings → tools; canonical UTF-8 JSON | inspection observations never define durable meaning or substitute for a Forever model |
| Provenance | `sourceType`: explicit/inferred/imported/historical/agent-proposed; confidence 0–1; reviewStatus unreviewed/accepted/rejected | catalog author provenance is agent-proposed/unreviewed, distinct from source/test evidence labels. No confidence estimate or human acceptance is fabricated |
| Dependency intent | separate required capabilities/invariants/constraints/compatibility and current implementation; LOCKED/SEMANTIC/CAPABILITY/TRANSITIONAL/LEGACY/OPTIONAL | do not assign classifications or replacement promises to ReDown dependencies without accepted records |
| Evaluation | enumerate all obligations; absent claims are unknown; fail if any fail, pass only if all pass, otherwise partial; migration additionally requires evidence | this slice performs no evaluation/migration. Hash match is not an invariant pass or runtime proof |
| Canonicalization | recursively sorted keys, normalized records by ID, manifest record paths sorted, 2 spaces and newline; other array order meaningful; preserve unknown fields | catalog JSON keys sorted and operation IDs sorted; source trace arrays retain execution order. It is not a normalized Forever model |
| Adapter | advertise only supported operations; stable errors; no vendor/transport semantics | ReDown advertises five of its own operations. It does not advertise Forever `getEntity`, `traceEntity`, `evaluateReplacement`, etc. |

The inferred-provenance fixture is structurally valid yet unreviewed: validity does not confer authority. Replacement golden includes unknown bounded-memory evidence and returns `partial` even with other passing claims. These examples constrain future integration; missing evidence must remain visible.

## Mapping plan (proposed, unaccepted)

1. Have a human accept a ReDown intent/capability/invariant/compatibility model using actual upstream JSON schemas; record provenance rather than treating this audit as acceptance.
2. Assign stable upstream-model IDs to accepted records; keep implementation observations in this catalog. Do not reuse Forever Works example project's IDs as ReDown's IDs.
3. Add reviewed links `{entityId, modelPath, foreverVersion, sourceReference, reviewStatus}` to operations/subsystems, validating exact targets against the selected manifest. Unresolved model/version/ID returns an explicit finding.
4. Record replacement obligations separately from mechanisms: remote-source transfer versus local upload, destination bucket/prefix fidelity, authentication boundaries, browser compatibility, data preservation and outcome semantics. These are **candidate obligations**, not accepted invariants. No bounded-memory promise for unknown-length ingest: current runtime buffers it.
5. Test future adapters with upstream fixtures for unknown fields, cycles, broken references, old versions, inferred provenance and conservative migration/evaluation. Keep upstream ownership independent; HTTP/MCP are optional transports later.

**Gaps:** no `forever/` ReDown manifest/accepted records, no genuine entity mappings, no model loader/validator, no public Forever API adapter or conformance evidence. `getForeverLinks` intentionally returns unknown. M0 mapping strategy is complete; actual model integration remains unfinished.
