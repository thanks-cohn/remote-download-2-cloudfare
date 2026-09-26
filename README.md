# Remote Asset Ingest

A small Windows-first utility for sending a remote URL directly to a configured
Cloudflare R2 bucket or GitHub repository without downloading the asset through
the local computer.

The repository name is not part of the runtime contract. It can be renamed
without changing the application protocol.

## Transfer paths

Cloudflare:

```text
remote source -> Cloudflare Worker -> R2
```

GitHub:

```text
remote source -> GitHub Actions runner -> target repository
```

In both cases the local PC sends only control metadata such as the source URL,
destination, path, and filename.

## User experience

- Configure one or more destination profiles once.
- Tokens stay local to the Windows user.
- Chrome/Edge reads the profile list from the local app and builds its
  right-click menu dynamically.
- Right-click a link/image/media URL and choose a destination.
- Or paste a URL directly into the Windows app and press **Send**.

See `SPEC.md`, `SETUP.md`, and `DESTINATIONS.md`.
