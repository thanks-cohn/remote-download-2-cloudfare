# Destination Profiles

A destination profile answers one question:

> Where should this remote asset go?

The extension supports Cloudflare R2 and GitHub without hardcoding any repository,
bucket, project, or service name.

## Cloudflare R2

Example shape:

```json
{
  "name": "My R2 Assets",
  "type": "cloudflare-r2",
  "workerUrl": "https://example.workers.dev/ingest",
  "folders": {
    "2d": "2d",
    "3d": "3d",
    "files": "files"
  }
}
```

The token is saved with the profile locally in the browser extension.

## GitHub

Example shape:

```json
{
  "name": "My GitHub Assets",
  "type": "github",
  "repository": "owner/repository",
  "workflowFile": "remote-ingest.yml",
  "branch": "main",
  "paths": {
    "2d": "assets/2d",
    "3d": "assets/3d",
    "files": "assets/files"
  }
}
```

If the workflow is missing, the extension can install the generic workflow into
the configured repository automatically.

No repository name is compiled into the extension.

## Naming

Filename rules belong to the destination project, not this utility.

For the WebRev-style gallery, a useful convention is:

```text
<imageName>-<anything>.<extension>
```

Examples:

```text
first-light-rose.glb
first-light-memory.png
blue-room-clock.glb
```

## Future desktop companion

The same destination profile concept can later be reused by a Windows desktop app
without changing how Cloudflare or GitHub destinations are described.
