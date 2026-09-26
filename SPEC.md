# Specification

## Goal

Move a file from a public HTTPS URL into one specific Cloudflare R2 bucket without routing the file bytes through the user's computer.

The local machine sends only control data:

- source URL
- destination folder/key
- optional filename

The Cloudflare Worker performs the remote fetch and streams the response into R2.

## Security boundary

Credentials MUST NOT be committed to GitHub or embedded in the browser extension.

### Local-only values

Stored in `.env` beside the local bridge:

- `REMOTE_INGEST_URL` — deployed Worker endpoint
- `REMOTE_INGEST_TOKEN` — bearer token shared with the Worker

### Cloudflare-side values

- R2 binding `ASSETS`
- Worker secret `INGEST_TOKEN`
- optional `ALLOWED_SOURCE_HOSTS`
- optional `PUBLIC_ASSET_BASE_URL`

The Worker does not need an R2 access-key pair when using an R2 binding.

## Ingest request

```json
{
  "sourceUrl": "https://example.com/model.glb",
  "folder": "3d",
  "filename": "first-light-rose.glb"
}
```

`filename` is optional. When omitted, the source URL basename is used.

## Accepted folders

- `2d/`
- `3d/`
- `files/`

The Worker rejects path traversal and arbitrary absolute keys.

## Response

```json
{
  "ok": true,
  "key": "3d/first-light-rose.glb",
  "bytes": 1842391,
  "contentType": "model/gltf-binary",
  "publicUrl": "https://assets.example.com/3d/first-light-rose.glb"
}
```

## File transfer rule

The local bridge MUST NOT fetch the source asset. It only forwards metadata to the Worker.

The Worker:

1. validates request authentication;
2. validates the source URL;
3. fetches the remote source;
4. streams the response body through a byte-limiting transform;
5. writes that stream to R2;
6. returns metadata.

## Browser interaction

The extension adds three context-menu actions:

- Send URL to Cloudflare → 3D
- Send URL to Cloudflare → 2D
- Send URL to Cloudflare → Files

For a right-clicked link, the link target is sent. For a right-clicked image/media item, the media URL is sent. Otherwise the page URL is sent.
