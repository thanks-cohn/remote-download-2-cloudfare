# Remote Download 2 Cloudflare

Local-control / remote-transfer utility for sending a remote asset URL straight to a Cloudflare R2 bucket without downloading the asset through the local computer.

Flow:

```text
Browser right-click URL
        ↓
local helper on 127.0.0.1
        ↓
authenticated Cloudflare Worker
        ↓
Worker fetch(source URL)
        ↓
stream directly into R2
```

The browser extension contains no Cloudflare credentials. The local helper reads the Worker URL and ingest token from a local `.env`. The Worker validates that token and writes to the configured R2 binding.

See `SPEC.md` and `SETUP.md`.
