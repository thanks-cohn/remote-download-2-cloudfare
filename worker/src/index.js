const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: JSON_HEADERS });
}

function safeEqual(a = "", b = "") {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function isBlockedHostname(hostname) {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "0.0.0.0" || h === "::1") return true;

  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;

  const [a, b] = ipv4.slice(1).map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function validateSourceUrl(raw, allowedHosts) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid source URL");
  }

  if (url.protocol !== "https:") throw new Error("Only HTTPS source URLs are allowed");
  if (url.username || url.password) throw new Error("Credentials in source URLs are not allowed");
  if (isBlockedHostname(url.hostname)) throw new Error("Private/local source hosts are not allowed");

  if (allowedHosts.length && !allowedHosts.includes(url.hostname.toLowerCase())) {
    throw new Error("Source host is not allowed");
  }

  return url;
}

function sanitizeFilename(value) {
  const clean = String(value || "")
    .split(/[?#]/)[0]
    .split("/")
    .pop()
    .replace(/[^a-zA-Z0-9._ -]/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 180);

  if (!clean || clean === "." || clean === "..") throw new Error("Invalid filename");
  return clean;
}

async function fetchRemoteSafely(source, allowedHosts, maxRedirects = 5) {
  let current = source;

  for (let i = 0; i <= maxRedirects; i++) {
    const response = await fetch(current.toString(), {
      redirect: "manual",
      headers: { "user-agent": "remote-download-2-cloudflare/0.1" }
    });

    if (![301, 302, 303, 307, 308].includes(response.status)) return response;

    const location = response.headers.get("location");
    if (!location) throw new Error("Remote redirect was missing Location");

    current = validateSourceUrl(new URL(location, current).toString(), allowedHosts);
  }

  throw new Error("Too many remote redirects");
}

function makeLimiter(maxBytes, counter) {
  return new TransformStream({
    transform(chunk, controller) {
      const bytes = chunk instanceof Uint8Array ? chunk.byteLength : new TextEncoder().encode(chunk).byteLength;
      counter.bytes += bytes;
      if (counter.bytes > maxBytes) throw new Error("Remote file exceeded MAX_BYTES");
      controller.enqueue(chunk);
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "remote-download-2-cloudflare" });
    }

    if (request.method !== "POST" || url.pathname !== "/ingest") {
      return json({ ok: false, error: "Not found" }, 404);
    }

    const auth = request.headers.get("authorization") || "";
    const expected = `Bearer ${env.INGEST_TOKEN || ""}`;
    if (!env.INGEST_TOKEN || !safeEqual(auth, expected)) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "Expected JSON body" }, 400);
    }

    try {
      const allowedHosts = String(env.ALLOWED_SOURCE_HOSTS || "")
        .split(",")
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean);

      const source = validateSourceUrl(body.sourceUrl, allowedHosts);
      const folder = ["2d", "3d", "files"].includes(body.folder) ? body.folder : "files";
      const filename = sanitizeFilename(body.filename || source.pathname);
      const key = `${folder}/${filename}`;
      const maxBytes = Math.max(1, Number(env.MAX_BYTES) || 104857600);

      const remote = await fetchRemoteSafely(source, allowedHosts);

      if (!remote.ok || !remote.body) {
        return json({ ok: false, error: `Remote fetch failed: ${remote.status}` }, 502);
      }

      const declaredLength = Number(remote.headers.get("content-length") || 0);
      if (declaredLength > maxBytes) {
        return json({ ok: false, error: "Remote file exceeds MAX_BYTES" }, 413);
      }

      const contentType = remote.headers.get("content-type") || "application/octet-stream";
      const counter = { bytes: 0 };
      const limited = remote.body.pipeThrough(makeLimiter(maxBytes, counter));

      await env.ASSETS.put(key, limited, {
        httpMetadata: {
          contentType,
          cacheControl: "public, max-age=31536000, immutable"
        },
        customMetadata: {
          sourceUrl: source.toString(),
          importedAt: new Date().toISOString()
        }
      });

      const publicBase = String(env.PUBLIC_ASSET_BASE_URL || "").replace(/\/$/, "");
      return json({
        ok: true,
        key,
        bytes: counter.bytes || declaredLength || null,
        contentType,
        publicUrl: publicBase ? `${publicBase}/${key}` : null
      });
    } catch (error) {
      return json({ ok: false, error: error instanceof Error ? error.message : "Ingest failed" }, 400);
    }
  }
};
