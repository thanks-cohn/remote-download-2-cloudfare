# ReDown Debug History

This is the persistent chronology of investigated defects. Preserve previous entries and distinguish **reported behavior**, **source-confirmed cause**, **hypotheses**, **fixes**, and **verified outcomes**. Never rewrite past findings as though they were always known. Every entry links to a detailed case file.

| Date | Case | Status | Summary |
| --- | --- | --- | --- |
| 2026-10-10 | [DBG-001 — Nested menu stops accepting deeper children](DBG-001_NESTED_CHILD_DEPTH_DISABLED_STATE.md) | **Source cause confirmed; Chrome reproduction and fix pending** | Shared async action wrapper restores stale disabled controls after the folder becomes ready; select/create paths omit the refresh necessary to enable `+ Child`. |

## Debugging record policy

1. New bugs receive a stable `DBG-###` ID and case file.
2. Record observed symptoms and environment separately from proven implementation behavior.
3. Keep a dated timeline of prior attempted fixes, regressions, root cause discoveries, commit IDs and validation.
4. A source diagnosis is not a browser-confirmed fix. Only close cases after relevant automated tests and a real user-flow reproduction pass.
5. Record uncertainties, false leads, linked issues, and precise next tests; do not guess away discrepancies.
6. Preserve project intent: an existing valid ancestor should never need to be reselected to activate a child.
