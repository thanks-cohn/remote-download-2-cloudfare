# ReDown Simple right-click menu — canonical specification and implementation status

**Recorded:** 2026-10-10  
**Status:** Authoritative requested behavior; some source changes already committed; end-to-end verification pending.  
**Scope:** The *Simple right-click menu mode*, not Basic/Premium product tiers or Deep Agent Access.

## Nonnegotiable defining feature: ONE pop-out

**Simple Mode has only ONE pop-out menu: `REDOWN → [flat list of destination choices]`.** There must be no additional `preset → Default location / additional option` submenu and no submenu mirroring nested R2 directory depth. A chosen destination can target any number of Cloudflare directory levels without creating additional right-click pop-outs.

Nested Mode is the separate choice for navigating directories as an actual tree.

### Label policy — explicitly selectable in settings

Each Simple destination's visible right-click title uses the following precedence:

1. **Custom Menu label:** When supplied and nonempty, show that exact user-defined label.
2. **When custom Menu label is blank:** Use the configured *automatic label fallback* setting:
   - **Lowest directory (default):** Show the final/deepest selected directory name in the destination's path. If the path is the bucket root, show the bucket name.
   - **Bucket name:** Show the selected bucket name (the highest/root directory designation), even if the saved destination points deep inside that bucket.

**This is a presentation setting, not a destination change.** The selected account, bucket, full prefix and transfer target remain unchanged regardless of which label rule is chosen.

Examples:

| Full destination | Custom Menu label | Fallback setting | Visible title |
| --- | --- | --- | --- |
| `artwork/images/portraits/finished` | `My portraits` | Either | `My portraits` |
| `artwork/images/portraits/finished` | empty | Lowest directory (default) | `finished` |
| `artwork/images/portraits/finished` | empty | Bucket name | `artwork` |
| `artwork/` | empty | Either | `artwork` |

The automatic-fallback selector belongs in Simple Mode settings and should apply consistently to default and additional destinations; decide whether it is global or overridable per destination without creating contradictory duplicate controls. For now, **global default plus optional per-destination override is a proposal**, not an established implemented API. Preserve backwards compatibility with existing saved profiles: absent setting means `lowest-directory`.

**Implementation gap:** Source commit `c172731` already makes all Simple destinations flat and implements explicit-label → deepest-directory → bucket fallback, but it **does not yet implement a user-selectable automatic fallback to bucket name for a deep location**. Do not claim that setting exists until delivered and tested.

## Row editor semantics

- Each Simple destination has an account/bucket choice and an independently selected series of existing child folders.
- On any row, existing-folder dropdown values are **never copied into** the adjacent `New directory name` input.
- A new folder is created only by explicitly pressing **Create**, scoped to the selected bucket and exact parent prefix.
- Every removable directory row has an **×**. It modifies only the menu configuration, never deletes R2 folders or files.
- Clearing an ancestor invalidates all its descendant *selections* but retains the lower *rows* as blank reusable selectors. Reselect a parent, then reselect its valid children.
- Invalid or unresolved descendants cannot silently remain valid transfer destinations.
- Small edits should update affected rows rather than rebuilding the entire settings panel; preserve unrelated drafts, labels, focus and scroll.
- Keep the present compact layout; do not add multi-panel UI merely to support these operations.

## Ordering is separate from menu depth

The existing **Order** field sorts destination *preset profiles*. Additional Simple options currently follow their saved sequence within a preset and have no independent Order field. Flattening the menu does not create a global per-option sort facility.

**Potential enhancement, not approved:** add per-option Move up / Move down for independently ordering flat Simple destinations. Do not confuse this with adding pop-outs.

## Current code, tests and bug history

| Item | Status | Source |
| --- | --- | --- |
| Flat one-pop-out Simple menu | Code committed; Chrome human testing pending | `extension/background.js` `c172731` |
| Label custom/deepest/root fallback | Code committed; Chrome human testing pending | `extension/background.js` `c172731` |
| **Selectable fallback: deepest vs bucket name** | **Required; not yet implemented** | This specification |
| Flat-menu regression test | Added; new tests not independently executed in prior session | `tests/simple-menu-flat.test.mjs` `0f88e43` |
| Simple per-row × and blank lower rows | Code committed; human testing pending | `extension/options.js` `7c1b0d6`, `3ac4496`, `376d933` |
| Explicit Create and separate new-folder draft | Code committed; human testing pending | Same path editor; `tests/simple-location-rows.test.mjs` `b6f2cda` |
| Settings stability and minimal redraw | Partial work; complete acceptance open | BUG-016 |
| Individual Order controls for extra destinations | Not implemented; choice pending | BUG-005 |
| Actual Chrome right-click transfer and bucket/prefix routing | Unverified in installed browser | Human testing pending |

The code should retain the existing `quick:` and `simple-option:` action IDs and verified destination routing even while changing labels/menu grouping.

## Required testing before closing

1. Right-click an image in Chrome in **Simple** mode with multiple presets and options: REDOWN opens **one** menu of direct clickable destinations, with no extra per-profile submenu.
2. Choose `artwork/images/portraits/finished` with blank label and the default **Lowest directory** setting: displayed title is `finished`.
3. Switch automatic fallback to **Bucket name**, without modifying the path: displayed title is `artwork`, still one pop-out. Persist setting across settings close/reopen and extension reload.
4. Enter custom label `My portraits`: it takes precedence under either automatic setting. Clear it to restore selected automatic fallback.
5. Test bucket-root destinations and same-named leaf folders across buckets; labels can duplicate but menu IDs and actual targets must remain distinct.
6. Validate Click → transfer goes to the *full* configured key prefix, not the directory suggested by its label.
7. Test per-row × (middle/root) preserving blank lower rows, dropdown scoping, separate empty create drafts, and explicit folder creation; no R2 deletion.
8. Verify ordering and keyboard access; document Chrome limitations if any.
9. Run targeted Node tests and full-suite comparison; record pass/fail separately from real Chrome testing. Historical full suite had 15 preexisting failures, not a green baseline.

## Evidence and links

- [Bug tracker and feature decisions](../bugs/README.md) (BUG-005, BUG-016 and flat-menu source-fix entry).
- [DBG-002 Simple path editor](debug/DBG-002_SIMPLE_LOCATION_ROWS.md).
- [Project debugging state](REDOWN_AGENTIC_DEBUGGING_STATE_AND_NEXT_STEPS_2026-10-10.md).
- [Offline debug API](debug/API.md).

**Conclusion:** Simple means **one pop-out and direct destination choices**, never one submenu per directory. Its display name is custom Menu label or, when blank, **the lowest folder by default, or the bucket name when the user selects that labeling preference**. The bucket-label preference is a newly clarified implementation requirement, not yet a shipped feature.
