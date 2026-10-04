# REDOWN setup

## Install

Download/extract the repository, then load this folder in Chrome:

```text
<extracted repo>/extension/
```

Chrome path:

```text
chrome://extensions
Developer mode -> Load unpacked -> extension/
```

## Connect Cloudflare

1. Open REDOWN settings.
2. Select **Connect Cloudflare**.
3. A separate Cloudflare sign-in window opens immediately. Sign in and authorize the requested R2 and Worker permissions.
4. Choose a Cloudflare account.
5. Choose an existing R2 bucket or create a new one.
6. Click the bucket to prepare it for REDOWN.
7. Configure that bucket's right-click preset.

If you close the sign-in window or sign-in takes longer than five minutes, REDOWN restores the Connect button so you can retry. Clicking Connect from another settings tab focuses the current sign-in window instead of opening duplicates. Settings opens Cloudflare and completes OAuth directly, without waiting for a background-service message. Login progress survives the extension background worker going idle; closing the browser clears the temporary attempt. Network requests during verification time out after 30 seconds.

Version 0.5.9 uses a shared login controller in settings and the background worker. Cross-context locks prevent duplicate windows or token exchanges. Version 0.5.8 added `webNavigation` to capture only the exact OAuth callback from the sign-in tab, and `alarms` to expire stalled attempts. The extension ID, callback URL, scopes, PKCE, and state checks remain unchanged. After updating an unpacked install, reload REDOWN in `chrome://extensions` and reopen settings to load the new permissions and scripts.

REDOWN automatically provisions the per-bucket Worker required for true remote transfer.

## Configure a bucket preset

Each bucket has independent behavior.

### Quick send

In **Simple · Quick send**, set the direct destination and its menu label. This remains independent of the nested menu.

Right-click flow:

```text
REDOWN -> bucket -> download starts
```

### Nested Cloudflare locations

In **Nested · Cloudflare locations**, every row has three columns:

- **Existing location:** choose an actual bucket, or a folder immediately inside the selected parent.
- **Create a new location here:** enter a new name and click **Create**. Selecting the dropdown never fills this field.
- **Actions:** **+ Child** adds a row inside the selected location. **Remove** removes only the menu branch; it never deletes Cloudflare data.

A root row creates or selects a bucket. A child row creates or selects a folder within its parent. For example, `characters → heroes → wizard` uses the R2 prefix `characters/heroes/wizard/`. **+ Add bucket** adds another root row.

The right-click menu follows this hierarchy. A leaf sends directly to its location; a parent includes **Send here** alongside its children. **Show nested menu** hides or shows the hierarchy without erasing it. Quick send has its own visibility setting.

Previous R2 menu entries are retained as a backup and checked against actual locations. Missing locations must be selected or explicitly created; opening the nested editor does not create folders or move existing files.

GitHub retains its existing menu editor and repository paths.

## Paste-a-URL fallback

Open the REDOWN popup, paste a public HTTPS URL, choose a destination, and press **Send with REDOWN**.

## Security notes

- Cloudflare authorization uses OAuth Authorization Code + PKCE.
- No Cloudflare OAuth client secret is embedded in REDOWN.
- Per-bucket Worker ingest uses a generated secret stored in extension local storage.
- Source URLs must be public HTTPS URLs.
- Worker-side validation blocks obvious localhost/private IPv4 targets and revalidates redirects.

Version 0.5.10 reads previews and starts downloads directly through the authenticated Cloudflare object API. These actions do not deploy or wait for a REDOWN Worker. Inline previews are limited to 64 MiB; downloads stream through Chrome. Worker provisioning is serialized and preserves its access secret across retries. Failed access checks display a retry message instead of remaining on Connecting.
