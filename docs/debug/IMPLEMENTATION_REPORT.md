# Timeless debugging M0/M1 implementation report

Delivered against ReDown `1fb1c691c536fd407b16798ecf7ae8b031e61c45`. **M0 complete; smallest M1 implemented and tested.** This is incident-record infrastructure, not the DBG-001 editor correction.

The [audit/design decision](DESIGN.md) compares Markdown-only, mutable snapshots and a descriptor/journal pair; defines authoritative JSON/JSONL, append-only review, atomic Git publication and conservative migration/retention. [API documentation](API.md) and onboarding link the author-neutral process and actual commands.

The sibling `agent/debug/` uses Node built-ins, five operations, frozen 0.1 record/result schemas, manifest-directed loading, an in-memory index and a pinned per-instance snapshot. Structural validation rejects malformed/version-incompatible/inconsistent records, duplicate IDs, unsafe paths and unsupported links. Missing or changed evidence yields explicit freshness warnings. Unknown fields and provenance survive round trips. The archived old-version corpus has a semantic golden and independent schema proof.

DBG-001 has a new descriptor and nine retained events: report, earlier DOM/readiness changes, project audit, scoped source inspection, confirmed source mechanism, independent unverified depth hypotheses, proposed correction, and unknown browser outcome. Unknown historical dates stay null; recording dates identify the companion import, not fabricated original observation times. Hypothesis revisions and counterevidence retain prior beliefs. Source confirmation never closes the case. Closure validation requires declared automated and browser outcome evidence but cannot independently certify its truth.

**Original DBG-001 Markdown and PROPOSED_CHANGES.md are byte-identical to upstream**, with Git blob hashes checked by tests. Existing extension, Worker, bridge, agent API/catalog, package/lock files, CI and old tests are unchanged. Debug README gained navigation; no existing chronology was removed.

## Verification

Environment: Node `24.19.0`, npm `11.9.0`, Python `jsonschema 4.26.0`. Existing locked dependencies were already installed. Node 22 and installed Chrome were not tested.

| Command/check | Actual result |
| --- | --- |
| Baseline `npm test` | **47 tests: 32 pass, 15 fail**, no skips/cancellations |
| New `tests/debug-api.test.mjs` within targeted/full runs | **24 pass, 0 fail** |
| `node --test tests/debug-api.test.mjs tests/agent-api.test.mjs tests/cloudflare-files.test.mjs tests/explorer-worker.test.mjs` | **46 pass, 0 fail**, no skips/cancellations |
| After `npm test` | **71 tests: 56 pass, the identical 15 fail**, no skips/cancellations |
| `npm run check`; Node syntax checks for both debug modules | Pass, exit 0 |
| `python tests/debug-schema-conformance.py` | Five valid schemas; 28 independent fixture/constraint checks pass |
| Independent generated structural/result corpus | Five valid schemas; **72 checks pass**, including all required-field omissions, old fixtures and eight actual result envelopes |
| Real CLI from `/tmp`, valid/missing case | One JSON envelope; exit 0 / 2 respectively; no stderr |
| Real CLI in isolated malformed checkout | Validation returns `valid:false`, stable invalid-json finding, exit 2 |
| `validateDebugRecords` on committed case | `valid:true`, zero errors/warnings, one case, nine events; freshness current, overall behavioral evidence unknown |
| Baseline/after failure identity comparison | Exact same 15 original test names/locations |
| `git diff --check`; runtime-path diff inspection | Pass; no extension/Worker/bridge/package changes |

Retained named test outputs and failure locations: [TEST_RESULTS.txt](verification/TEST_RESULTS.txt). Actual human success demonstration: [DBG-001.txt](verification/DBG-001.txt). The verification script's generated comparison corpus is temporary, not a second canonical record store; regenerate with the frozen fixtures and actual envelopes when changing schema assertions.

The 15 baseline failures remain 14 Cloudflare login/provision fixture failures on unexpected `rfis-index.js` import, plus one settings-mode fixture missing current menu DOM/listeners. They occur before the intended behavior checks. Assertions were not weakened or skipped. Passing fixtures do not establish Chrome readiness.

The first default-sandbox test attempt could not spawn Node child processes, yielding file-level failures; an isolation-free diagnostic exposed an additional CLI spawn restriction (`EPERM`). Actual baseline/after numbers above come from normal `node --test` with permitted subprocess execution, not that constrained diagnostic. No implementation or fixture was changed to conceal the restriction.

## Boundaries and unfinished work

- **DBG-001 is open:** no fresh-child reproduction/regression test, editor fix, depth-five live menu/transfer validation, Chrome smoke test or deployed outcome. Next: add a failing select-existing/create-new child fixture asserting `+ Child` enables after action completion; then correct semantic state reconciliation in a separate change.
- Source hashes/literal anchors cannot prove claim correctness, disambiguate identical anchors, run tests, validate deployment or establish causation across all symptoms. Historical labels remain unchanged on drift, with current applicability warnings.
- The reader pins one snapshot and intentionally does not watch the filesystem. Atomic generation writers, concurrent-write protection, journal-prefix enforcement in CI, runtime crash recovery, durable transaction ingestion and persistent incremental indexes are deferred. Append-only retention depends on version control/review; the reader cannot prove it without prior bytes.
- M2–M5: causal/impact graph, grounded similarity, reversible clusters, runtime imports/redaction automation, automated prioritization, maintenance plans and fleet trials. M1's privacy classification is a contributor declaration, not a secret scanner.
- No accepted ReDown Forever model/IDs, no model adapter or conformance certification. Inspected the pinned actual standard/API/schemas/fixtures; did not execute upstream conformance. Versions and ownership remain separate.
- Debug record v0.1 and Node adapter are the only decoder/runtime tested. Future versions need retained decoders and semantic fixtures; no eager/destructive migration is implemented.

## Branch and publication

Dedicated branch: `feat/timeless-debugging-m0-m1`; draft PR targets `main`. Do not merge automatically.

Native Git fetch initially failed because the configured proxy endpoint was unavailable. The connected GitHub reader supplied the four added upstream documents and authoritative main metadata; the restored local tree exactly matched upstream tree `30a4661d636a43671f0c2975569c69f3a60ed4fe`. The verified main commit is a local shallow boundary. Publication uses the authorized GitHub connector with trees based on upstream main, then verifies pushed content and draft status. Publication results are recorded in the PR and task completion message; no browser/cloud execution is involved.
