# Proposal: ReDown Persistent File Identity and History Engine

**Status:** Architecture proposal — not implemented  
**Working standard:** RFIS (ReDown File Identity Standard), version 0 proposal  
**Project:** ReDown / Cloudflare R2 first; storage-provider-independent core  
**Date:** 2026-10-10

## 1. Vision

A file is not merely a path. It is an entity with a persistent identity, a current state, a provenance record, and a history of movement and change.

ReDown should discover every Cloudflare R2 asset it has permission to enumerate, assign each discovered asset an identity (or recover its existing identity), and maintain a durable, portable **local manifest** with its known name, location, download/import date where known, last-modified date where available, and historical events. ReDown's initial client is a Chrome extension, but the format must be independent of browsers, Cloudflare, IndexedDB, and any future agent or application implementation.

**Non-negotiable principle:** No routine move, rename, recatalog, or update overwrites the historical record. Current state is a materialized view; historical records remain append-only. Corrections are new events referencing erroneous events, not silent edits.

**Design for pathological churn:** Treat **1,000,000,000,000 addressable file records**, **1,000,000 changes/day**, for **10 years** as a design stress model for the *format and architecture*, not a claim that a single Chrome extension can enumerate or store a trillion R2 objects. At that rate there are approximately **3.65 billion events** over 3650 days, even before discovery events. This exercise must force bounded-memory indexing, independent segments, and inexpensive updates.

## 2. Deliverables: a standard and two encodings

1. **Logical standard (RFIS):** Defines identities, objects, locations, event semantics, timestamps, provenance, and recovery, independent of physical encoding.
2. **RFIS-JSON:** Versioned, human-readable, developer/agent-traversable projection supporting incremental import/export. JSON is the **interoperability layer**, not the database write path.
3. **RFIS-Packed:** Canonical compact append-only segment encoding using dictionary-coded strings, prefix/path compression, varints/delta coding, chunk checksums, and optional compression. The choice of exact codec must be benchmarked, versioned, and interchangeable.
4. **IndexedDB adapter:** Browser-local object stores for the identity registry, current state, path lookups, event segments, scan checkpoints, and migration state. Browser storage is a cache/working database, *not* an everlasting backup.
5. **Manifest portability:** Deterministic import/export, segment verification, schema migration, and optional user-approved backup to a local file or R2 object.

### User experience

- Select Cloudflare account and bucket(s) and **Index storage**; show traversal progress and limitations.
- Fast Explorer navigation and search from local state; label remote status as **verified**, **cached**, **unverified**, or **scan incomplete**.
- A **File Biography** view displays identity, names/locations over time, discovered changes, fingerprints, and the source/confidence of events.
- One-click **Export manifest**, **Import manifest**, **Verify**, and **Repair/reconcile**. No need to expose the binary layout during ordinary use.

## 3. Identity model

- Every *logical file entity* receives a stable opaque ID on first cataloging, using cryptographically secure randomness. A proposal for human-facing filename stamps is **16 case-sensitive Base62 characters** (~95 bits). Generation must check for existing IDs; use a longer canonical internal ID (e.g., 128-bit or greater) where possible.
- IDs must never be tied to a path, bucket, filename, content hash, account, or timestamp. A rename or move preserves identity when lineage is confirmed.
- A SHA-256 value is an **optional content fingerprint** for a particular version, not a replacement for the stable entity ID. Multiple different files may contain identical bytes; the same logical file may have multiple hashes across revisions.
- A copy creates a **new file identity by default**, linked by a `copied_from` relation; multiple storage locations of one logical entity require explicit `replica_of` / placement semantics. This prevents one filename-stamped copy from silently merging two biographies.
- Multiple identifiers and mappings may coexist. When migrating an ID scheme, record an **alias/supersedes identity relation** and preserve prior references; never silently substitute the old ID.
- Cloudflare R2 key paths identify **object locations**, not immutable object identities. External renames cannot be asserted solely from two listings.

### Optional Identity Stamp migration (later phase)

A user-approved tool may append `~<16-character-Base62-ID>` before file extensions, e.g. `portrait~aK7mQ2xP9bL4nR6s.webp`. This is *not* required for initial indexing. R2 key renames are copy/delete-style migrations with costs and URL breakage risks; require dry run, collision detection, resumable journal, link impact review, verification, and rollback guidance. Parsing stamps must not override verified identity mappings; stamp reuse from copied files must be detected. No mass rename without explicit consent.

## 4. Data model

**Identity:** `file_id`, birth/discovery details, optional external aliases.

**Placement:** `placement_id`, provider, provider account identifier, bucket/container, object key, status, last verified time. Placement history must not be conflated with identity history.

**Current state:** File's name, current placements, known timestamps, size, content type, fingerprints, last event sequence, and confidence. This is a rebuildable *materialized projection*.

**Event:** `event_id`, `file_id`, `kind`, observed and effective timestamps, actor/source, precondition/revision, typed before/after changes, references to placements, optional content hash/version, provenance/confidence. Event IDs must permit retries without duplicating history.

**Scan/checkpoint:** Account/bucket, prefix, continuation cursor, generation, observation window, state (`partial`, `complete`, `failed`), last verified sequence and manifest version.

**Manifest root:** Format name/version, feature flags, identity namespace, chunk inventory, per-chunk hashes, export time, snapshot boundary, scan completeness, metadata provenance, and optional references to external payloads.

The registry must distinguish timestamps:
- `downloaded_at`: when ReDown actually downloaded/saved it, **only if known**.
- `provider_last_modified_at`: what R2 or the provider reports for that object/version.
- `first_seen_at`, `last_verified_at`: ReDown observation times.
- `event_observed_at` versus `event_effective_at`: distinguish discovery from actual operation timing. Unknown is `null`, never fabricated.

A directory need not be a real R2 object; represent inferred prefixes and explicit marker objects distinctly. Design path segments as byte-safe or well-specified encoded strings, preserving case and Unicode normalization semantics.

## 5. Append-only updates, never rewriting all history

Use **segmented event logs** and periodically generated, independently versioned **current-state snapshots**:

```text
RFIS Manifest Root
  identity namespace + schema version
  snapshots/
    state-000010.snapshot
  events/
    event-000010.segment
    event-000011.segment
    event-000012.segment
  dictionaries/
    names-000004.dict
  checkpoints/
    r2-bucket-works.scan
```

The folder names above describe logical portable entries; the browser need not write individual files. Each event appends to a bounded-size segment. Once sealed, a segment is immutable and content-addressable. Compaction **never discards required events**; it creates updated indexes/snapshots and retains or archives history segments. An optional retention policy, if ever offered, is an explicit lossy choice with clear consequences, not the default.

The JSON projection may stream records as NDJSON for bulk interoperability, or export a structured JSON manifest with segment references. Avoid rewriting a monolithic JSON array for every move: that would make event ingestion O(total history) per update. Use transactions and atomic root-pointer generation changes, verified checksums, crash recovery and idempotent retries.

### Example JSON projection (illustrative)

```json
{
  "format": "rfis",
  "schemaVersion": 1,
  "namespace": "redown-local-example",
  "files": [{
    "id": "rd_aK7mQ2xP9bL4nR6s",
    "name": "portrait.webp",
    "placements": [{
      "provider": "cloudflare-r2",
      "account": "account-reference",
      "bucket": "works",
      "key": "art/portrait.webp"
    }],
    "timestamps": {
      "downloaded_at": null,
      "provider_last_modified_at": "2026-10-10T12:00:00Z",
      "first_seen_at": "2026-10-10T14:00:00Z"
    },
    "contentHashes": []
  }],
  "events": [{
    "event_id": "ev_example001",
    "file_id": "rd_aK7mQ2xP9bL4nR6s",
    "kind": "observed",
    "observed_at": "2026-10-10T14:00:00Z",
    "source": "r2-listing",
    "confidence": "observed"
  }],
  "scan": { "complete": false }
}
```

Actual exports will be chunked for large collections, with a top-level manifest referencing data segments rather than placing billions of events in one JSON document.

## 6. Moves, renames and reconciliation

**Performed by ReDown:** After confirming the R2 operation, emit typed `moved`, `renamed`, `copied`, `created`, `deleted`, `modified` or `fingerprinted` events, atomically update indexed current state, and retain original paths. If an operation partially succeeds, record an explicit **pending/ambiguous** outcome and reconcile; do not assert a completed move.

**Performed externally:** Compare observations across verified scans. A vanished key plus an arriving key is *not proof* of a move. Correlate content fingerprint, size, timestamps, embedded identity stamp and any provider metadata; produce a **candidate relationship** until confidence or user confirmation supports a lineage event. Preserve gaps and uncertainty.

**Agents churning locations:** Represent operations by stable IDs and small deltas, not by duplicating whole file descriptions. Support idempotency keys, concurrency control, causal/revision ordering, deterministic conflict reporting, and partial replay. An agent must not invent missing historical links.

**R2 scope:** R2 object listings are paginated. Maintain resumable, per-prefix scan checkpoints; do not claim a full inventory until completion. Incremental event integration for out-of-band changes may later use R2 notifications or a server-maintained journal. Never assume R2 exposes a complete intrinsic change history.

## 7. Ruthless efficiency: design constraints and honest budgets

The scale target is deliberately extreme:
- **1 trillion identities** requires efficient *partitioning and addressability*, not one trillion entries resident in extension memory.
- **1 million events/day for 10 years** is approximately **3.65 billion events** (excluding leap-day effects and catalog discovery). Even at just **16 bytes/event**, a pure event payload is about **58.4 GB**, before indexing, metadata, headers, or replication.
- **1 trillion individually distinguishable file IDs** alone require at least 40 bits each in a perfectly packed fixed-cardinality encoding (about **5 TB** at the information-theoretic minimum); typical practical IDs occupy considerably more.
- A universal **2–4 MB full fidelity manifest is impossible** at this scale with arbitrary filenames, locations, dates, and complete histories. Target a *small active directory/snapshot/index root* and independently stored compressed segments instead. Do not promise a hard size bound.
- The browser only opens the partition(s) necessary for the user’s active buckets and recent files. Reads/writes and memory should scale with **changed or requested records**, not all historical records.

Suggested performance and resource goals are **hypotheses until benchmarked**: bounded IndexedDB cursor batches (e.g., hundreds to thousands), incremental commits, zero full-data load to render a folder, configurable cache budget, under-4-MB *bootstrap/root metadata target where achievable*, and graceful operation on the project's low-end 4 GB Windows laptop. Benchmarks must measure actual R2 listings, long names, Unicode paths, high churn, fragmentation, and compression ratios.

At global-scale throughput, an ordinary extension cannot independently verify trillions of remote objects; RFIS-Packed must be streamable and sharded, with potentially server-side aggregation. Keep the local consumer simple.

## 8. Integrity, privacy, durability and portability

- Encrypt exports only if explicitly configured; avoid exposing private paths, filenames or metadata through unsafe upload defaults.
- Never store R2 credentials or transient signed URLs in manifest exports.
- Bind each manifest to an account/bucket namespace without treating display names as unique identities.
- Checksums validate segments; corruption should isolate a segment, not discard the whole history.
- Adopt schema evolution with `schemaVersion` and capability flags; old importers either ignore optional fields safely or reject incompatible required features.
- Use atomic migrations, backup-before-migrate, crash-safe replays, and tests proving old identities/histories survive upgrades.
- Consider Chrome extension IndexedDB potentially evictable/lost. Provide optional user-controlled local export or R2 backup and a documented recovery process.
- Prohibit silent cross-user file-identity sharing or merging from equal SHA-256 digests.

## 9. Phased development plan

### Phase A — RFIS contract (design first)
- Lock logical schema, typed event kinds, placement semantics, ID generator, integrity rules, and minimal JSON examples.
- Write fixtures for rename, multi-bucket move, copy, external apparent move, content change, partial scan, and corrupt segment.

### Phase B — Browser-local foundation
- Implement IndexedDB registry, location index, current-state projection, append-only events, import/export, schema/version migrations.
- Initial single-bucket R2 crawl with pagination, resumability, explicit progress and no fabricated downloaded dates.
- Tie initial Explorer folder lookup to verified index with remote revalidation; avoid regression of BUG-012 and BUG-013.

### Phase C — Live mutation history
- Instrument all ReDown-controlled upload, move, rename, copy, delete and download operations with idempotent events.
- Add File Biography in Explorer, recovery/rollback tests, and optional SHA-256 fingerprinting.

### Phase D — Packed encoding and scaling
- Build RFIS-Packed streaming encoder/decoder, segment verification, path dictionaries, indexes and background compaction (history-preserving).
- Benchmark 1M/10M records and high-churn synthetic workloads; validate slow devices first.
- Add optional snapshots and incremental export, later multi-device synchronization with explicit conflict rules.

### Phase E — Optional identity-stamp utility
- Separate, user-approved bulk migration with complete dry-run, pause/resume, verification, collision checks and URL-breakage warnings.
- Confirm copy semantics and ID-stamp compatibility with imported/foreign manifests.

## 10. Initial acceptance criteria

- Any ReDown-observed file has a stable ID and a recorded first observation; **unknown download dates remain unknown**.
- A confirmed move and rename preserve ID, current location changes, and complete history remains queryable.
- Copies and duplicate hashes do not silently merge identities.
- Multiple rapid operations create distinct, idempotent records without rewriting historical segments.
- JSON export → fresh IndexedDB import → JSON export preserves identity, lineage, timestamps, provenance, and event order.
- Interrupted scan/operation and missing IndexedDB state can resume or recover from an exported manifest without asserting nonexistent remote objects.
- Folder indexes distinguish cached versus remotely verified values; selectors never treat unrelated buckets or unverified presets as confirmed folders.
- Scaling benchmarks report measured size, throughput, memory and time; no 4 MB full-history guarantee is claimed.
- New data layers work without changing existing R2 keys or forcing users to stamp filenames.

## 11. Deferred architectural decisions

- Canonical binary codec and compression method after profiling representative real object names.
- Whether to use a UUID-like internal ID in addition to the 16-character Base62 display stamp.
- Cross-device history merging, signed event provenance, multiwriter reconciliation, and remote change journals.
- Snapshot frequency and storage budgets by tier/device.
- Optional remote manifest backup path and opt-in privacy model.

**Proposed next action:** Implement Phase A fixtures and a minimal Phase B IndexedDB proof of concept **without changing existing Cloudflare object names or the current download workflow**.
