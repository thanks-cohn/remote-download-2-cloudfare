# Remote Asset Ingest

A Chrome/Edge extension for sending a remote asset URL directly to either:

- Cloudflare R2, through a configured Worker
- a GitHub repository, through a small generic workflow the extension can install automatically

The asset does not need to be downloaded through the user's computer first.

## Normal use

1. Install the extension.
2. Add one or more destination profiles.
3. Right-click a link, image, video, audio item, or page.
4. Choose **Send Remote Asset** → destination → 2D / 3D / Files.

The popup also provides a paste-a-URL fallback.

## Transfer paths

Cloudflare:

```text
remote source -> Cloudflare Worker -> R2
```

GitHub:

```text
remote source -> GitHub Actions runner -> target repository
```

The extension only sends control metadata such as the source URL, destination,
path, and filename.

## Destination independence

Nothing in the runtime protocol depends on this repository name.

Cloudflare Worker URLs, bucket-facing paths, GitHub repositories, branches,
workflow filenames, and destination folders are all profile configuration.

Renaming this repository does not change the extension protocol.

## Desktop app later

A native Windows companion may be added later for stronger OS-protected secret
storage and additional integrations. It is not required for extension v1.

See `SETUP.md` and `DESTINATIONS.md`.
