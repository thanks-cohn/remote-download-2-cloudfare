# REDOWN UI Demo Notes

This file records the prototype/demo versions that showed the ChatGPT preview message **“An error occurred inside the visualization”** during the nested-menu / vertical-tab experiments.

No production source files are changed by this note.

## Known problem versions

### Production 1G — Bottom Recall Anchor
**Status:** Broken prototype.

**Observed behavior:** The visualization failed after the bottom-most recall layout rewrite.

**Cause found:** `reflowRibbon()` contained a duplicate `const normalCompactCount` declaration. That made the generated demo JavaScript invalid for the preview runtime.

**Do not use 1G as a reference implementation.**

### Production 1H — Bottom Recall Anchor (Validated)
**Status:** Broken at runtime despite passing a syntax check.

**Observed behavior:** Opening **MOVE TO** could display **“An error occurred inside the visualization.”**

**Cause found:** The rewritten `reflowRibbon()` referenced `compactItems` outside the block where that variable was defined. This is valid JavaScript syntax, so a syntax-only check did not catch it; the failure occurred only when the affected interaction ran.

The same build also exposed a layering issue where the vertical memory tabs could appear behind pop-out menus.

**Do not use 1H as a reference implementation.**

### Production 1I — Tabs Always Above Popouts
**Status:** Broken prototype / inherited runtime failure.

**Observed behavior:** The vertical-tab z-index was corrected so the tabs could stay above pop-outs, but clicking **MOVE TO** still produced the visualization error because the 1H runtime bug was still present.

It also did not yet restore the intended active-tab motion: the **MOVE** vertical tab was not gliding upward into its active position when opened.

**Do not use 1I as a reference implementation.**

## Current follow-up

### Production 1J — Active Tab Lift + Runtime Fix
**Status:** Current candidate after the above failures.

Changes made:
- removes the out-of-scope `compactItems` runtime reference;
- keeps vertical tab decks above pop-out menus;
- makes the active vertical tab (for example **MOVE**) glide upward when its branch is opened.

A Node syntax check passed for the generated demo. That check verifies syntax only; interactive preview behavior should still be treated as needing user validation.

## Reference note

Earlier demos such as 1F rendered, but they had interaction/layout behavior that was being refined. In particular, 1F recalled an older layer to the wrong vertical position rather than making the clicked layer the bottom-most active menu. That was a design/behavior issue, not the **“error occurred inside the visualization”** crash documented above.
