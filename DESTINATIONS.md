# Destination Profiles

The app should be configured once and then behave like a simple "send this there" utility.

A **Destination Profile** represents one remote destination.

## Cloudflare R2 profile

Example:

```json
{
  "name": "WebRev Assets",
  "type": "cloudflare-r2",
  "workerUrl": "https://remote-download-2-cloudflare.example.workers.dev/ingest",
  "defaultFolder": "3d"
}
```

The Worker token is stored locally and encrypted by the Windows application.

Transfer path:

```text
source website -> Cloudflare Worker -> R2
```

The PC sends only metadata.

## GitHub profile

Example:

```json
{
  "name": "WebRev GitHub Assets",
  "type": "github",
  "repository": "thanks-cohn/WebRev",
  "workflowFile": "remote-ingest.yml",
  "branch": "main",
  "defaultPath": "apps/playground/src/assets/3d-assets"
}
```

The GitHub token is stored locally and encrypted by the Windows application.

The app triggers the repository workflow and supplies:

- remote source URL
- destination path

Transfer path:

```text
source website -> GitHub Actions runner -> GitHub repository
```

The asset bytes do not pass through the user's PC.

## Naming

When the target project uses image-based discovery, users can choose a filename such as:

```text
first-light-rose.glb
first-light-memory.png
```

The destination system does not impose numeric suffixes.

## UX

The Windows app should show:

- URL field
- filename field
- destination profile dropdown
- destination folder/path dropdown
- Send button
- recent transfers/status

The Chrome right-click menu should show the configured profiles rather than technical transport choices.

Example:

```text
Send Remote Asset
  → WebRev Assets
  → WebRev GitHub Assets
```

After initial setup, ordinary use should not require editing JSON, opening terminals, or entering credentials again.
