# REDOWN

**Remote downloads, without the download.**

REDOWN is a Chrome/Edge extension that sends remote files directly to a configured Cloudflare R2 bucket or GitHub repository. The source file does not need to pass through the user's computer.

## Install from GitHub

1. Download this repository as a ZIP.
2. Extract it.
3. Open `chrome://extensions`.
4. Enable **Developer mode**.
5. Choose **Load unpacked**.
6. Select the extracted repository's **`extension/`** folder.

The selected folder must contain `manifest.json`.

## Cloudflare

REDOWN uses Cloudflare OAuth. Users click **Connect Cloudflare**, authorize REDOWN, then choose or create an R2 bucket.

REDOWN provisions a small Worker bound to that bucket so the data path stays:

```text
remote source -> Cloudflare Worker -> R2
```

The user's computer sends control metadata only.

OAuth publisher:
- Client ID: `d9db0f71eb24cd2eed86b50a650a045e`
- Verified publisher domain: `webrev.online`
- Browser callback: `https://mkadkgpekmkknfbniacdlmgikihjjepf.chromiumapp.org/cloudflare`

No OAuth client secret is embedded in the extension. REDOWN uses Authorization Code + PKCE.

## Right-click presets

Every saved destination controls its own right-click behavior.

A bucket can be a one-click destination:

```text
REDOWN
  -> webrev-assets
```

or an arbitrary-depth tree:

```text
REDOWN
  -> webrev-assets
      -> 3D
          -> Characters
              -> Heroes
              -> NPCs
      -> 2D
          -> Portraits
```

Each leaf can target its own R2 prefix or GitHub path. Different buckets can have completely different menu depths and defaults.

## GitHub

A GitHub profile can remotely fetch through GitHub Actions:

```text
remote source -> GitHub Actions runner -> target repository
```

REDOWN can install its generic ingest workflow into the selected repository when needed.

## Repository independence

No runtime behavior depends on this repository's name. Destination repository names, Cloudflare accounts, buckets, paths, menu trees, and labels are user configuration.

See `SETUP.md` and `DESTINATIONS.md`.
