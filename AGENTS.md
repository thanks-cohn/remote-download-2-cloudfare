# ReDown agent onboarding

Read [the engineering handoff](docs/CODEX_REDOWN_DEEP_AGENTIC_PROJECT_API_REQUEST.md), [architecture](docs/agent/ARCHITECTURE_MAP.md), [operation traces](docs/agent/OPERATION_CATALOG.md), [message inventory](docs/agent/MESSAGE_INVENTORY.md), and [actual verification](docs/agent/CHANGE_REPORT.md) first. Proposals and bug reports are intent/reports, not proof of implemented or passing behavior.

Use the existing isolated checkout; do not create a Git worktree unless explicitly requested.

```sh
npm ci --cache /workspace/.npm-cache --no-audit --no-fund
node agent/cli.mjs describe --json
node agent/cli.mjs projectOverview --json
node agent/cli.mjs explainOperation context-menu-transfer --json
node --test tests/agent-api.test.mjs
npm run check
npm test
```

The offline inspection CLI has no credentials or cloud dependencies. Read [its version/error/evidence contract](docs/agent/API.md). Source freshness does not imply tests passed. Baseline has 15 existing test failures; do not disable assertions or call the full suite green.

The extension's primary Worker is the embedded `WORKER_SOURCE` in `extension/background.js`, bound to `STORAGE`. `worker/src/index.js` is a separate smaller `ASSETS` Worker. Do not treat its health check as extension readiness. The locked local runtime cannot execute the configured 2026-09-26 compatibility date. Windows CMake references an absent `windows/src/main.c`.

Keep runtime transfer behavior and ordinary GUI separate from agent inspection. Do not log tokens, private names or contents. Project inspection does not authorize remote reads/writes; preparation handlers may deploy Workers even on ostensibly read-oriented paths. Browser state, R2 object truth, transfer history and RFIS observations have different ownership and freshness.

For Forever Works integration, inspect the actual `thanks-cohn/forever-works` standard, schemas and conformance fixtures first; see [compatibility strategy](docs/agent/FOREVER_WORKS_COMPATIBILITY.md). Keep agent API, Forever API and `foreverVersion` separate. There is no accepted ReDown Forever model yet; never invent matching IDs or promote inferred/agent-proposed intent without acceptance.

Work in coherent small changes. Run relevant existing tests, identify uncovered behaviors explicitly, preserve extension message contracts, and record exact results. M2–M4 capabilities are deferred; discovery advertises only implemented operations.

For incident investigation, read [debug onboarding](docs/debug/README.md), [record design and source audit](docs/debug/DESIGN.md), [debug API contract](docs/debug/API.md), and [actual verification](docs/debug/IMPLEMENTATION_REPORT.md). The sibling debug API is offline, read-only and independent of extension execution and Forever intent. Preserve original debug Markdown and append JSONL events; never turn a source-confirmed cause into a verified Chrome/deployed outcome.

```sh
node agent/debug/cli.mjs describe --json
node agent/debug/cli.mjs listIncidents
node agent/debug/cli.mjs getIncident DBG-001
node agent/debug/cli.mjs getHistory DBG-001 --json
node agent/debug/cli.mjs validateDebugRecords --json
node --test tests/debug-api.test.mjs
```

Reader snapshots are pinned per API instance; recreate after edits. Unknown fields/provenance survive queries. Review append-only prefixes and validate the complete staged corpus before committing. Do not refresh evidence hashes to hide drift. Debug M2–M5 and the actual DBG-001 editor correction remain unfinished.
