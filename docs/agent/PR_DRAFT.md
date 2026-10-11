# Audit ReDown and add an offline read-only project inspection API

An unfamiliar agent currently has to reconstruct ReDown's runtime from extension code and proposals that describe capabilities at different stages. This change adds a source-backed M0 architecture map, all 33 message handlers, six end-to-end operation descriptions, Forever Works compatibility strategy and root agent onboarding.

The minimal M1 slice adds an offline, dependency-free Node inspection library/CLI with five discoverable operations, versioned catalog/result schemas, provenance, content freshness and deterministic errors. Missing Forever Works mappings remain explicitly unknown. Existing extension/transfer code and package/lock files are unchanged.

Validation: 22 targeted tests passed (nine new inspection tests and 13 existing direct API/embedded Worker tests); syntax and catalog/result schema checks passed. Full suite: 32 passed, 15 existing failures from stale importScripts/menu DOM harnesses, matching the pre-change baseline. Cloudflare/browser/native execution and upstream Forever conformance were not tested. See docs/agent/CHANGE_REPORT.md for exact evidence, limitations and continuation steps.

M2–M4 and actual Forever Works accepted-model integration are deferred. This is a draft for review, with no runtime mutation transport.
