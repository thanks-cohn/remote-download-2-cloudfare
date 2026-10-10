# Monomedia / MinMax — Software Economics and Pricing Proposal

**Status:** Proposal, not an active pricing commitment  
**Date:** 2026-10-10  
**Scope:** ReDown, Substrate, Chute, and future products in the software family

## Philosophy

**Buy what exists. Own what you buy. Subscribe to what comes next.**

The software family should be accessible, delightful, fast, and competitively capable even in its free editions. The creator deserves compensation for genuinely new work; customers should not be charged repeatedly to retain features they already bought.

## Proposed offerings

| Edition | Initial pricing idea | Entitlement |
| --- | --- | --- |
| Basic | Free | Polished, useful core functionality; bug, security, and reasonable compatibility fixes for supported releases |
| Individual Premium | Approximately **$5 one-time** per app initially | Permanent license to the Premium feature set and major releases already acquired |
| Ongoing feature updates | Approximately **$1/month per app**, optional | New feature rollouts, improvements, and major editions released while subscribed |
| Complete software family bundle | Approximately **$50 one-time** initially | Current Premium editions of specifically listed included apps; future apps or features are not silently implied |
| Future major edition | Possibly **$7–$8**, adjusted over time | Buy the latest generation outright when desired; pricing may account for inflation, costs, and value |

Prices are exploratory; storefront fees, taxes, currency conversion, actual costs, and customer feedback must inform final values. Consider an optional discounted **suite-wide update subscription**, but do not assume a price until economics are measured.

## Ownership and updates

- A one-time Premium purchase continues to unlock the purchased edition's features. It is **not** converted into a rental.
- An optional update subscription gives access to major product/feature releases while active.
- **If a subscriber cancels, previously acquired Premium features and releases remain theirs**; future feature releases require renewing or purchasing a later major edition.
- Do **not** charge for ordinary bug fixes, security patches, or reasonable compatibility maintenance for supported versions. Basic is intentionally good, not degraded to sell Premium.
- Establish a published support lifecycle for older editions. Permanent license ownership does not guarantee every old binary will work unchanged with all future browser and cloud APIs forever.
- Clearly specify edition eligibility, included applications, and what counts as a new feature release versus maintenance, to avoid ambiguity.

## Product differentiation

### Basic ReDown
A delightful, responsive, fast Cloudflare transfer utility with reliable destination selection, lightweight operational caching, and dependable UX. No rich RFIS file-history database is required.

### Premium ReDown
Advanced Cloudflare Explorer UX, persistent file identities, portable structured manifests, history, location deltas, deeper searches, richer file operations, and future premium capabilities as implemented and released.

### Family pattern
Use the same ownership-and-update philosophy for Substrate, Chute, and future tools, while varying capabilities and pricing where required by real costs.

## Quality and Dependability Charter — Substrate and the entire family

**Strategic ambition:** Build software that people can confidently use for serious professional, academic, and creative work. Substrate should ultimately compete on dependability and capability with established products such as Microsoft Word, Google Docs, and Adobe Acrobat—not merely attract users through novelty, visual appeal, a proprietary format, or low price. This is a **long-term objective, not a claim of present feature parity**.

**The question for every release:** What makes established software feel trustworthy when someone's grade, career, business, or irreplaceable work depends on a document? Identify those properties, measure them, and make them non-negotiable acceptance criteria. ReDown, Chute, and every future product should follow the same discipline appropriate to its domain.

### Non-negotiable engineering commitments

- **Document fidelity first.** From the beginning, architect Substrate's word processing, document formatting, layout, pagination, fonts, images, tables, headers/footers, page breaks, printing, and PDF generation to avoid silent content loss or unexpected visual changes. Round-trip and export fidelity must be tested, not assumed.
- **Open and durable standards.** Prefer documented, versioned, interoperable formats and established standards (e.g., DOCX/OOXML where appropriate, PDF/PDF-A where applicable). Substrate's native format should have a public, well-specified schema, migration policy, and export pathways; users must not be trapped by a proprietary file type.
- **Boring stability.** Correctness, autosave, crash recovery, undo/redo, long-document performance, and reliable reopen/save behavior matter more than dazzling demonstrations. Never market a document capability as dependable before test evidence supports it.
- **Deep, approachable debugging.** Provide normal programmers with understandable logs, reproducible error reports, diagnostics, and clear failure states. Also offer structured machine-readable traces, deterministic reproduction fixtures, and stable diagnostic APIs for agents. Diagnostic facilities must respect user privacy and avoid silently collecting document contents.
- **Compatibility as continuous work.** Test imports/exports against a diverse real-world corpus and relevant application versions. Track unsupported constructs honestly; warn users before a lossy conversion rather than pretending it worked.
- **Evidence-based release gates.** Automated unit, property, integration, regression, fuzz, accessibility, cross-platform, and visual/PDF-diff tests; reproducible benchmarks; canary releases and rollback plans. No major feature ships until its failure modes and recovery behavior have been exercised.
- **Low-end-first excellence.** Keep startup, memory, responsiveness, and output correctness strong on modest hardware. Performance is part of quality, but must never be achieved by silently corrupting or degrading documents.
- **No quality paywall.** Basic should be reliable and delightful; Premium adds advanced capabilities and richer experiences, not the right to correct files or receive essential bug and security fixes.

### Substrate acceptance examples (future engineering checklist)

1. Repeatedly open → edit → save → reopen representative documents without losing text, styles, references, images, or layout semantics that the format supports.
2. Export identical source revisions to reproducible, standards-conforming PDF output within documented rendering tolerances; check page count, geometry, selectable text, links, and font embedding where supported.
3. Compare supported DOCX imports and exports with reference applications using a curated corpus of simple, complex, multilingual, and very long documents, recording discrepancies as actionable bugs.
4. Simulate crashes, interrupted saves, storage exhaustion, malformed files, missing fonts, and unsupported features; preserve originals and provide clear recovery or warnings.
5. Allow a non-agent programmer to diagnose a failed operation using human-readable logs, while an automated agent can retrieve an equivalent structured trace and reproduce the bug.
6. Publish a feature-compatibility matrix and known limitations; do not promise universal or perfect parity before achieving it.

### Business implication

Trust is an economic asset earned through repeated correct behavior. The goal is to make reliability a defining reason to choose Monomedia software, even in crowded markets. Sustainable pricing should fund rigorous testing, compatibility upkeep, customer support, diagnostics, and long-term stewardship. **Impressive to see; dependable in use.**

## Sustainability and fairness

- Make the software easy to support: good diagnostics, documentation, reliable defaults, automated bug capture (with privacy protections), and small efficient updates.
- Model payment processing, refunds, tax obligations, marketplace costs, infrastructure, ongoing API upkeep, customer support, and software development. A low sticker price does not by itself ensure sustainable income.
- Test whether a $5 price remains viable as the Premium feature set expands; do not make indefinite promises that cannot be maintained.
- Pricing for future editions may increase with inflation or added scope, but preserve affordable upgrade options where feasible.
- Clearly communicate that the optional $1/month buys **new development**, not necessary safety repairs.

## Example customer journeys

1. **Free user:** Installs Basic and receives a trustworthy working product without paying.
2. **One-time buyer:** Pays $5 for current Premium, uses it indefinitely as a licensed edition, and receives maintenance during its support lifecycle.
3. **Update subscriber:** Adds $1/month, receives new major feature releases, later cancels, and keeps features already received.
4. **Returning customer:** After years away, buys the newest substantially improved edition for its then-current price (perhaps $7–$8), without paying retroactively for missed subscription months.
5. **Suite customer:** Purchases the $50 family bundle, receiving the clearly enumerated Premium apps/editions at the time of purchase.

## Questions to settle before launch

- Is $1/month per app, per suite, or are both available?
- How are major-edition entitlements delivered across Chrome Web Store and any desktop versions?
- How is purchase ownership securely verified without compromising offline/local functionality?
- What is the minimum published maintenance-support period for each major edition?
- How will newly added apps affect the $50 bundle, and will existing owners have upgrade discounts?
- Which features depend on ongoing paid backend services and need a separate disclosed cost model?

**Working promise:** **Free should be excellent. Premium should be exceptional. Pay for new work, not repeated access to already purchased work.**
