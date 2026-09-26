# Setup

## 1. Create the R2 bucket

Create the bucket you want this tool to own, for example:

```text
webrev-assets
```

Do not put R2 account keys in this repository.

## 2. Configure the Worker binding

Edit `wrangler.toml`:

```toml
[[r2_buckets]]
binding = "ASSETS"
bucket_name = "webrev-assets"
```

Optionally set the public asset base URL:

```toml
[vars]
PUBLIC_ASSET_BASE_URL = "https://assets.webrev.online"
```

For stricter remote-source security, set an allowlist:

```toml
[vars]
ALLOWED_SOURCE_HOSTS = "example.com,cdn.example.net"
```

If `ALLOWED_SOURCE_HOSTS` is blank, public HTTPS hosts are allowed except obvious localhost/private-address targets.

## 3. Create the Worker secret

Generate a long random token locally and deploy it as a Worker secret:

```bash
npx wrangler secret put INGEST_TOKEN
```

Then deploy:

```bash
npm install
npm run deploy
```

## 4. Configure the local bridge

Copy:

```text
.env.example -> .env
```

Fill in only your own deployed Worker URL and the same ingest token.

```env
REMOTE_INGEST_URL=https://remote-download-2-cloudflare.<account>.workers.dev/ingest
REMOTE_INGEST_TOKEN=your-long-random-secret
LOCAL_PORT=8765
```

The `.env` file is ignored by Git.

Run:

```bash
npm run bridge
```

The bridge listens only on `127.0.0.1`.

## 5. Load the browser extension

In Chrome/Edge:

1. Open the extensions page.
2. Enable Developer mode.
3. Load unpacked.
4. Select the `extension/` folder.

Now right-click a link/image/page and use one of the **Send URL to Cloudflare** commands.

## What touches the local computer?

Only the URL and small JSON responses.

The asset bytes travel:

```text
remote source -> Cloudflare Worker -> R2
```

They are not downloaded by the local bridge.
