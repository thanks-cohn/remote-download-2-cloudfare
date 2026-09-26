# Setup

## Install the extension

Load the `extension/` directory as an unpacked extension in Chrome or Edge.

The extension includes:

- dynamic right-click menus
- a popup for pasted URLs
- destination profile settings
- direct Cloudflare Worker support
- direct GitHub workflow dispatch

No desktop app is required for v1.

## Add a Cloudflare R2 destination

Create or deploy the included Worker and bind it to the R2 bucket you want to use.

Set the Worker secret:

```bash
npx wrangler secret put INGEST_TOKEN
```

Then add a **Cloudflare R2** profile in the extension settings with:

- display name
- Worker ingest URL
- Worker token
- 2D / 3D / files folder names

The actual file transfer is:

```text
remote source -> Worker -> R2
```

## Add a GitHub destination

Add a **GitHub** profile with:

- repository in `owner/name` form
- target branch
- workflow filename
- token
- 2D / 3D / files paths

On first use, if the configured workflow is missing, the extension installs the
small generic workflow automatically, then dispatches it.

The workflow contains no hardcoded repository name.

The actual file transfer is:

```text
remote source -> GitHub Actions runner -> repository
```

## Token scope

Use the narrowest token permissions practical for the chosen destination.

The extension-only v1 stores configured credentials in `chrome.storage.local`.
A future desktop companion can move secrets into OS-protected storage without
changing the destination-profile format.

## Right-click use

After saving profiles:

```text
Send Remote Asset
  → My R2 Assets
      → 3D
      → 2D
      → Files
  → My GitHub Assets
      → 3D
      → 2D
      → Files
```

## Paste-a-URL fallback

Click the extension icon, paste the source URL, optionally provide a filename,
choose destination and type, then press **Send**.
