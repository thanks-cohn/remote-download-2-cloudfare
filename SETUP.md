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
3. Authorize the requested R2 and Worker permissions.
4. Choose a Cloudflare account.
5. Choose an existing R2 bucket or create a new one.
6. Click the bucket to prepare it for REDOWN.
7. Configure that bucket's right-click preset.

REDOWN automatically provisions the per-bucket Worker required for true remote transfer.

## Configure a bucket preset

Each bucket has independent behavior.

### Quick send

Leave its menu tree empty. Set the default destination type/path.

Right-click flow:

```text
REDOWN -> bucket -> download starts
```

### Nested menu

Select **Nested menu** and add menu items. Any item can have children, so menus can be as deep as you want.

A leaf is a real download destination. For R2 it stores a prefix such as:

```text
3d/characters/heroes
```

For GitHub it stores a repository path such as:

```text
assets/3d/characters/heroes
```

## Paste-a-URL fallback

Open the REDOWN popup, paste a public HTTPS URL, choose a destination, and press **Send with REDOWN**.

## Security notes

- Cloudflare authorization uses OAuth Authorization Code + PKCE.
- No Cloudflare OAuth client secret is embedded in REDOWN.
- Per-bucket Worker ingest uses a generated secret stored in extension local storage.
- Source URLs must be public HTTPS URLs.
- Worker-side validation blocks obvious localhost/private IPv4 targets and revalidates redirects.
