const ROOT_MENU_ID = "redown";
const CF_CLIENT_ID = "d9db0f71eb24cd2eed86b50a650a045e";
const CF_AUTH_URL = "https://dash.cloudflare.com/oauth2/auth";
const CF_TOKEN_URL = "https://dash.cloudflare.com/oauth2/token";
const CF_API = "https://api.cloudflare.com/client/v4";

const GITHUB_WORKFLOW = `name: REDOWN Remote Ingest

on:
  workflow_dispatch:
    inputs:
      source_url:
        description: Remote HTTPS URL to fetch
        required: true
        type: string
      destination_path:
        description: Repository path to write
        required: true
        type: string

permissions:
  contents: write

jobs:
  ingest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Validate destination
        shell: bash
        run: |
          case "\${{ inputs.destination_path }}" in
            /*|*..*) echo "Unsafe destination path"; exit 1 ;;
          esac
      - name: Download remotely on GitHub runner
        shell: bash
        run: |
          mkdir -p "$(dirname "\${{ inputs.destination_path }}")"
          curl --fail --location --proto '=https' --max-redirs 5 \\
            --output "\${{ inputs.destination_path }}" \\
            "\${{ inputs.source_url }}"
      - name: Commit asset
        shell: bash
        run: |
          git config user.name "redown-ingest"
          git config user.email "redown-ingest@users.noreply.github.com"
          git add -- "\${{ inputs.destination_path }}"
          if git diff --cached --quiet; then exit 0; fi
          git commit -m "asset: ingest $(basename "\${{ inputs.destination_path }}")"
          git push
`;

const WORKER_SOURCE = `
const REDOWN_SHARED_SECRET = "__REDOWN_SHARED_SECRET__";
function privateHost(hostname) {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h === "::1" || h === "0.0.0.0") return true;
  const m = h.match(/^(\\\\d{1,3})\\\\.(\\\\d{1,3})\\\\.(\\\\d{1,3})\\\\.(\\\\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]), b = Number(m[2]);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}
function cleanName(value) {
  const name = String(value || "").split(/[?#]/)[0].split("/").pop()
    .replace(/[^a-zA-Z0-9._ -]/g, "-").replace(/^\\\\.+/, "").slice(0, 180);
  if (!name || name === "." || name === "..") throw new Error("Invalid filename");
  return name;
}
function cleanPrefix(value) {
  return String(value || "").split("/").map(x => x.trim()).filter(Boolean)
    .map(x => x.replace(/[^a-zA-Z0-9._ -]/g, "-")).join("/");
}
function extensionForContentType(contentType) {
  const type = String(contentType || "").split(";")[0].trim().toLowerCase();
  const map = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
    "image/svg+xml": "svg",
    "image/bmp": "bmp",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "model/gltf-binary": "glb",
    "model/gltf+json": "gltf",
    "application/pdf": "pdf"
  };
  return map[type] || "";
}
function filenameWithInferredExtension(filename, contentType) {
  const clean = cleanName(filename);
  if (/\\.[a-z0-9]{1,10}$/i.test(clean)) return clean;
  const ext = extensionForContentType(contentType);
  return ext ? clean + "." + ext : clean;
}
function safePublicBase(value, requestUrl) {
  const fallback = requestUrl.origin + "/assets";
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return fallback;
    return url.toString().replace(/\\/+$/, "");
  } catch {
    return fallback;
  }
}

async function checkedFetch(raw, hops = 5) {
  let url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || privateHost(url.hostname)) {
    throw new Error("Only public HTTPS source URLs are allowed");
  }
  for (let i = 0; i <= hops; i++) {
    const res = await fetch(url, { redirect: "manual", headers: { "user-agent": "REDOWN/0.3" } });
    if (![301,302,303,307,308].includes(res.status)) return res;
    const next = res.headers.get("location");
    if (!next) throw new Error("Remote redirect missing Location");
    url = new URL(next, url);
    if (url.protocol !== "https:" || privateHost(url.hostname)) throw new Error("Unsafe redirect blocked");
  }
  throw new Error("Too many redirects");
}
export default {
  async fetch(request, env) {
    const requestUrl = new URL(request.url);
    const assetPrefix = "/assets/";

    if ((request.method === "GET" || request.method === "HEAD") && requestUrl.pathname.startsWith(assetPrefix)) {
      const rawKey = requestUrl.pathname.slice(assetPrefix.length);
      let key = "";
      try {
        key = decodeURIComponent(rawKey);
      } catch {
        return new Response("Invalid asset path", { status: 400 });
      }
      if (!key || key.includes("..")) return new Response("Invalid asset path", { status: 400 });

      const head = await env.STORAGE.head(key);
      if (!head) {
        return new Response("Not found", {
          status: 404,
          headers: { "access-control-allow-origin": "*" }
        });
      }

      const baseHeaders = new Headers();
      head.writeHttpMetadata(baseHeaders);
      baseHeaders.set("etag", head.httpEtag);
      baseHeaders.set("accept-ranges", "bytes");
      baseHeaders.set("access-control-allow-origin", "*");
      baseHeaders.set("access-control-expose-headers", "ETag, Content-Length, Content-Type, Accept-Ranges, Content-Range");
      baseHeaders.set("cache-control", baseHeaders.get("cache-control") || "public, max-age=31536000, immutable");

      if (request.method === "HEAD") {
        baseHeaders.set("content-length", String(head.size));
        return new Response(null, { status: 200, headers: baseHeaders });
      }

      const rangeHeader = request.headers.get("range");
      if (rangeHeader && rangeHeader.startsWith("bytes=")) {
        const firstRange = rangeHeader.slice(6).split(",")[0];
        const parts = firstRange.split("-");
        let start = parts[0] ? Number(parts[0]) : NaN;
        let end = parts[1] ? Number(parts[1]) : NaN;

        if (!Number.isFinite(start) && Number.isFinite(end)) {
          const suffixLength = Math.max(0, Math.floor(end));
          start = Math.max(0, head.size - suffixLength);
          end = head.size - 1;
        } else {
          start = Math.max(0, Math.floor(start));
          end = Number.isFinite(end) ? Math.min(head.size - 1, Math.floor(end)) : head.size - 1;
        }

        if (!Number.isFinite(start) || start >= head.size || end < start) {
          baseHeaders.set("content-range", \`bytes */\${head.size}\`);
          return new Response(null, { status: 416, headers: baseHeaders });
        }

        const length = end - start + 1;
        const object = await env.STORAGE.get(key, { range: { offset: start, length } });
        if (!object) return new Response("Not found", { status: 404, headers: baseHeaders });
        const headers = new Headers(baseHeaders);
        object.writeHttpMetadata(headers);
        headers.set("content-range", \`bytes \${start}-\${end}/\${head.size}\`);
        headers.set("content-length", String(length));
        return new Response(object.body, { status: 206, headers });
      }

      const object = await env.STORAGE.get(key);
      if (!object) return new Response("Not found", { status: 404, headers: baseHeaders });
      const headers = new Headers(baseHeaders);
      object.writeHttpMetadata(headers);
      headers.set("content-length", String(head.size));
      return new Response(object.body, { status: 200, headers });
    }

    if (request.method === "OPTIONS" && requestUrl.pathname.startsWith(assetPrefix)) {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, HEAD, OPTIONS",
          "access-control-allow-headers": "*",
          "access-control-max-age": "86400"
        }
      });
    }

    if (request.method === "GET") return Response.json({
      ok: true,
      service: "REDOWN",
      secretConfigured: Boolean(REDOWN_SHARED_SECRET),
      storageBound: Boolean(env.STORAGE)
    });
    if (request.method !== "POST") return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
    const auth = request.headers.get("authorization") || "";
    if (!REDOWN_SHARED_SECRET || auth !== \`Bearer \${REDOWN_SHARED_SECRET}\`) {
      return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      if (request.headers.get("x-redown-action") === "upload-local") {
        const rawFilename = request.headers.get("x-redown-filename") || "upload";
        let requestedFilename = rawFilename;
        try { requestedFilename = decodeURIComponent(rawFilename); } catch {}
        requestedFilename = cleanName(requestedFilename);

        const prefix = cleanPrefix(request.headers.get("x-redown-folder") || "");
        const contentType = request.headers.get("content-type") || "application/octet-stream";
        const filename = filenameWithInferredExtension(requestedFilename, contentType);
        const key = prefix ? \`\${prefix}/\${filename}\` : filename;
        const encodedKey = key.split("/").map(encodeURIComponent).join("/");
        const publicPath = \`/assets/\${encodedKey}\`;
        const publicBaseUrl = safePublicBase(request.headers.get("x-redown-public-base"), requestUrl);
        const publicUrl = \`\${publicBaseUrl}/\${encodedKey}\`;

        const length = Number(request.headers.get("content-length") || 0);
        const max = Number(env.MAX_BYTES || 314572800);
        if (length && length > max) {
          return Response.json({ ok: false, error: "Local file is larger than this REDOWN profile allows" }, { status: 413 });
        }
        if (!request.body) throw new Error("Local upload body is empty");

        const metadata = {
          httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" },
          customMetadata: {
            sourceType: "local-upload",
            originalFilename: requestedFilename,
            publicPath,
            publicUrl,
            importedBy: "REDOWN",
            importedAt: new Date().toISOString()
          }
        };

        let bytesWritten = 0;
        if (length > 0) {
          const fixed = new FixedLengthStream(length);
          let count = 0;
          const limiter = new TransformStream({
            transform(chunk, controller) {
              count += chunk.byteLength || 0;
              if (count > max) throw new Error("Local file exceeded size limit");
              controller.enqueue(chunk);
            }
          });
          const pipePromise = request.body.pipeThrough(limiter).pipeTo(fixed.writable);
          const putPromise = env.STORAGE.put(key, fixed.readable, metadata);
          await Promise.all([pipePromise, putPromise]);
          bytesWritten = count || length;
        } else {
          const bytes = new Uint8Array(await request.arrayBuffer());
          if (bytes.byteLength > max) throw new Error("Local file exceeded size limit");
          await env.STORAGE.put(key, bytes, metadata);
          bytesWritten = bytes.byteLength;
        }

        return Response.json({
          ok: true,
          key,
          filename,
          publicPath,
          publicUrl,
          bytes: bytesWritten,
          contentType
        });
      }

      const body = await request.json();

      if (body.action === "renameObject") {
        const oldKey = cleanPrefix(body.oldKey);
        if (!oldKey) throw new Error("Missing object key");
        const oldParts = oldKey.split("/");
        const oldFilename = oldParts.pop();
        const parent = oldParts.join("/");
        const newFilename = cleanName(body.newFilename || "");
        const newKey = parent ? \`\${parent}/\${newFilename}\` : newFilename;
        if (newKey === oldKey) {
          return Response.json({ ok: true, key: oldKey, filename: oldFilename });
        }
        if (await env.STORAGE.head(newKey)) {
          return Response.json({ ok: false, error: "A file with that name already exists in this location" }, { status: 409 });
        }
        const object = await env.STORAGE.get(oldKey);
        if (!object) {
          return Response.json({ ok: false, error: "Original file was not found" }, { status: 404 });
        }
        const encodedKey = newKey.split("/").map(encodeURIComponent).join("/");
        const publicPath = \`/assets/\${encodedKey}\`;
        const publicBaseUrl = safePublicBase(body.publicBaseUrl, requestUrl);
        const publicUrl = \`\${publicBaseUrl}/\${encodedKey}\`;
        await env.STORAGE.put(newKey, object.body, {
          httpMetadata: object.httpMetadata,
          customMetadata: {
            ...(object.customMetadata || {}),
            publicPath,
            publicUrl,
            renamedAt: new Date().toISOString()
          }
        });
        await env.STORAGE.delete(oldKey);
        return Response.json({ ok: true, key: newKey, filename: newFilename, publicPath, publicUrl });
      }

      if (body.action === "ensurePrefixes") {
        const requested = Array.isArray(body.prefixes) ? body.prefixes : [];
        const created = [];
        for (const value of requested) {
          const prefix = cleanPrefix(value);
          if (!prefix) continue;
          const key = \`\${prefix}/.redown\`;
          await env.STORAGE.put(key, "", {
            httpMetadata: { contentType: "text/plain; charset=utf-8", cacheControl: "no-store" },
            customMetadata: { redownMarker: "true", createdAt: new Date().toISOString() }
          });
          created.push(key);
        }
        return Response.json({ ok: true, created });
      }

      const sourceUrl = String(body.sourceUrl || "");
      const source = new URL(sourceUrl);
      const requestedFilename = cleanName(body.filename || source.pathname);
      const prefix = cleanPrefix(body.folder);

      const remote = await checkedFetch(sourceUrl);
      if (!remote.ok || !remote.body) throw new Error(\`Remote fetch failed: \${remote.status}\`);

      const length = Number(remote.headers.get("content-length") || 0);
      const max = Number(env.MAX_BYTES || 314572800);
      if (length && length > max) {
        return Response.json({ ok: false, error: "Remote file is larger than this REDOWN profile allows" }, { status: 413 });
      }

      const contentType = remote.headers.get("content-type") || "application/octet-stream";
      const filename = filenameWithInferredExtension(requestedFilename, contentType);
      const key = prefix ? \`\${prefix}/\${filename}\` : filename;
      const encodedKey = key.split("/").map(encodeURIComponent).join("/");
      const publicPath = \`/assets/\${encodedKey}\`;
      const publicBaseUrl = safePublicBase(body.publicBaseUrl, requestUrl);
      const publicUrl = \`\${publicBaseUrl}/\${encodedKey}\`;

      const metadata = {
        httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" },
        customMetadata: {
          sourceUrl,
          publicPath,
          publicUrl,
          importedBy: "REDOWN",
          importedAt: new Date().toISOString()
        }
      };
      let bytesWritten = 0;

      if (length > 0) {
        // R2 requires streamed request bodies to have a known length.
        const fixed = new FixedLengthStream(length);
        let count = 0;
        const limiter = new TransformStream({
          transform(chunk, controller) {
            count += chunk.byteLength || 0;
            if (count > max) throw new Error("Remote file exceeded size limit");
            controller.enqueue(chunk);
          }
        });

        const pipePromise = remote.body.pipeThrough(limiter).pipeTo(fixed.writable);
        const putPromise = env.STORAGE.put(key, fixed.readable, metadata);
        await Promise.all([pipePromise, putPromise]);
        bytesWritten = count || length;
      } else {
        // Some CDNs (including signed image URLs) omit Content-Length.
        // Buffer those responses so R2 receives a body with a definite size.
        const chunks = [];
        let count = 0;
        const reader = remote.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          count += value.byteLength || 0;
          if (count > max) throw new Error("Remote file exceeded size limit");
          chunks.push(value);
        }

        const combined = new Uint8Array(count);
        let offset = 0;
        for (const chunk of chunks) {
          combined.set(chunk, offset);
          offset += chunk.byteLength;
        }

        await env.STORAGE.put(key, combined, metadata);
        bytesWritten = count;
      }

      return Response.json({ ok: true, key, filename, publicPath, publicUrl, bytes: bytesWritten, contentType });
    } catch (error) {
      return Response.json({ ok: false, error: error?.message || "Ingest failed" }, { status: 400 });
    }
  }
};
`;

function bytesToBase64Url(bytes) {
  let raw = "";
  for (const b of bytes) raw += String.fromCharCode(b);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function randomString(bytes = 32) {
  const array = crypto.getRandomValues(new Uint8Array(bytes));
  return bytesToBase64Url(array);
}
async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}
function selectedUrl(info) {
  // For images/video/audio Chrome supplies srcUrl; prefer the actual media bytes
  // even when the media is wrapped in a hyperlink.
  return info.srcUrl || info.linkUrl || info.pageUrl || "";
}
function categoryForContext(info, sourceUrl, profile) {
  if (info?.mediaType === "video") return "videos";
  if (info?.mediaType === "image") return "2d";
  if (info?.mediaType === "audio") return "files";
  const ext = basenameFromUrl(sourceUrl).toLowerCase().split(".").pop();
  if (["mp4","webm","mov","m4v","avi","mkv"].includes(ext)) return "videos";
  if (["jpg","jpeg","png","gif","webp","bmp","avif","svg"].includes(ext)) return "2d";
  if (["glb","gltf"].includes(ext)) return "3d";
  return profile?.defaultCategory || "files";
}
function basenameFromUrl(raw) {
  try {
    const u = new URL(raw);
    const base = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || "download");
    return base.replace(/[^a-zA-Z0-9._ -]/g, "-") || "download";
  } catch { return "download"; }
}
function joinPath(...parts) {
  return parts.filter(Boolean).map((part, i) =>
    String(part).replace(i === 0 ? /\/+$/g : /^\/+|\/+$/g, "")
  ).filter(Boolean).join("/");
}
function safeSlug(value, max = 45) {
  return String(value || "assets").toLowerCase().replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, max) || "assets";
}
async function getProfiles() {
  const { profiles = [] } = await chrome.storage.local.get("profiles");
  return Array.isArray(profiles) ? profiles : [];
}
async function setProfiles(profiles) {
  await chrome.storage.local.set({ profiles });
}
async function recordTransfer(entry) {
  const { transferHistory = [] } = await chrome.storage.local.get("transferHistory");
  const history = Array.isArray(transferHistory) ? transferHistory : [];
  const now = new Date().toISOString();

  let cleaned = history;
  if (entry?.ok && entry?.sourceUrl) {
    const successAt = Date.now();
    cleaned = history.filter(item => {
      if (item?.ok) return true;
      if (item?.sourceUrl !== entry.sourceUrl) return true;
      if (entry.profileId && item?.profileId && item.profileId !== entry.profileId) return true;
      const age = Math.abs(successAt - new Date(item?.at || 0).getTime());
      return !Number.isFinite(age) || age > 5 * 60 * 1000;
    });
  }

  const next = [{
    id: crypto.randomUUID(),
    at: now,
    ...entry
  }, ...cleaned].slice(0, 50);
  await chrome.storage.local.set({ transferHistory: next });
}
async function notify(title, message) {
  try {
    await chrome.notifications.create({
      type: "basic", iconUrl: "icon.svg", title, message: String(message || "")
    });
  } catch (error) {
    // Notifications are cosmetic. A Chrome image/icon failure must never mark
    // an already-completed REDOWN transfer as failed.
    console.warn("REDOWN notification skipped:", error?.message || String(error));
  }
}
function cloudflareErrorMessage(body, fallback) {
  return body?.errors?.[0]?.message || body?.error_description || body?.error || fallback;
}
async function storeCloudflareToken(token, previous = {}) {
  const accessToken = token?.access_token;
  if (!accessToken) throw new Error("Cloudflare did not return an access token");
  const auth = {
    ...previous,
    accessToken,
    refreshToken: token.refresh_token || previous.refreshToken || null,
    expiresAt: token.expires_in ? Date.now() + Number(token.expires_in) * 1000 : null
  };
  await chrome.storage.local.set({ cloudflareAuth: auth });
  return auth;
}
async function refreshCloudflareToken(currentAuth) {
  if (!currentAuth?.refreshToken) {
    throw new Error("Cloudflare authorization expired. Reconnect Cloudflare.");
  }
  const res = await fetch(CF_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: CF_CLIENT_ID,
      refresh_token: currentAuth.refreshToken
    })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    await chrome.storage.local.remove("cloudflareAuth");
    throw new Error(cloudflareErrorMessage(body, "Cloudflare session expired. Connect Cloudflare again."));
  }
  return storeCloudflareToken(body, currentAuth);
}
async function getCloudflareAuth() {
  const { cloudflareAuth } = await chrome.storage.local.get("cloudflareAuth");
  if (!cloudflareAuth?.accessToken) throw new Error("Connect Cloudflare first");
  if (cloudflareAuth.expiresAt && Date.now() >= cloudflareAuth.expiresAt - 60000) {
    return refreshCloudflareToken(cloudflareAuth);
  }
  return cloudflareAuth;
}
async function cfFetch(path, options = {}) {
  let cloudflareAuth = await getCloudflareAuth();
  const makeRequest = async auth => {
    const headers = new Headers(options.headers || {});
    headers.set("authorization", `Bearer ${auth.accessToken}`);
    if (options.body && !(options.body instanceof FormData) && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    return fetch(`${CF_API}${path}`, { ...options, headers });
  };

  let res = await makeRequest(cloudflareAuth);
  if (res.status === 401 && cloudflareAuth.refreshToken) {
    cloudflareAuth = await refreshCloudflareToken(cloudflareAuth);
    res = await makeRequest(cloudflareAuth);
  }
  if (res.status === 401) {
    await chrome.storage.local.remove("cloudflareAuth");
    throw new Error("Cloudflare rejected this authorization. Connect Cloudflare again.");
  }
  return res;
}
async function cfJson(path, options = {}) {
  const res = await cfFetch(path, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    throw new Error(body?.errors?.[0]?.message || body?.error || `Cloudflare request failed (${res.status})`);
  }
  return body.result ?? body;
}
let cloudflareAuthInFlight = null;

async function connectCloudflare() {
  if (cloudflareAuthInFlight) return cloudflareAuthInFlight;

  cloudflareAuthInFlight = (async () => {
  const redirectUri = chrome.identity.getRedirectURL("cloudflare");
  const verifier = randomString(48);
  const challenge = await sha256Base64Url(verifier);
  const state = randomString(24);
  const auth = new URL(CF_AUTH_URL);
  auth.searchParams.set("client_id", CF_CLIENT_ID);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("code_challenge", challenge);
  auth.searchParams.set("code_challenge_method", "S256");
  auth.searchParams.set(
    "scope",
    [
      "workers-r2.read",
      "workers-r2.write",
      "workers-scripts.read",
      "workers-scripts.write"
    ].join(" ")
  );
  auth.searchParams.set("state", state);

  const callback = await chrome.identity.launchWebAuthFlow({
    url: auth.toString(), interactive: true
  });
  if (!callback) throw new Error("Cloudflare sign-in was cancelled");

  const returned = new URL(callback);
  if (returned.searchParams.get("state") !== state) throw new Error("Cloudflare OAuth state mismatch");
  const oauthError = returned.searchParams.get("error");
  if (oauthError) throw new Error(returned.searchParams.get("error_description") || oauthError);
  const code = returned.searchParams.get("code");
  if (!code) throw new Error("Cloudflare did not return an authorization code");

  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: CF_CLIENT_ID,
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier
  });
  const tokenRes = await fetch(CF_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: tokenBody
  });
  const token = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !token.access_token) {
    throw new Error(cloudflareErrorMessage(token, "Cloudflare token exchange failed"));
  }

  // A fresh install is not considered connected until the newly-issued token
  // succeeds against the Cloudflare API. This prevents stale/invalid local
  // state from making onboarding appear successful.
  const verifyRes = await fetch(`${CF_API}/accounts?per_page=50`, {
    headers: { authorization: `Bearer ${token.access_token}` }
  });
  const verifyBody = await verifyRes.json().catch(() => ({}));
  if (!verifyRes.ok || verifyBody.success === false) {
    throw new Error(
      `Cloudflare authorization was returned, but API verification failed: ${cloudflareErrorMessage(
        verifyBody,
        `HTTP ${verifyRes.status}`
      )}`
    );
  }

  const userRes = await fetch("https://dash.cloudflare.com/oauth2/userinfo", {
    headers: { authorization: `Bearer ${token.access_token}` }
  });
  const user = userRes.ok ? await userRes.json().catch(() => null) : null;

  await storeCloudflareToken(token, { user });

  const accounts = Array.isArray(verifyBody.result)
    ? verifyBody.result.map(x => ({ id: x.id, name: x.name }))
    : [];
  return { user, accounts };
  })();

  try {
    return await cloudflareAuthInFlight;
  } finally {
    cloudflareAuthInFlight = null;
  }
}
async function disconnectCloudflare() {
  const { cloudflareAuth } = await chrome.storage.local.get("cloudflareAuth");
  if (cloudflareAuth?.accessToken) {
    try {
      await fetch("https://dash.cloudflare.com/oauth2/revoke", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: cloudflareAuth.accessToken, client_id: CF_CLIENT_ID })
      });
    } catch {}
  }
  await chrome.storage.local.remove("cloudflareAuth");
}
async function listCloudflareAccounts() {
  const body = await cfJson("/accounts?per_page=50");
  return Array.isArray(body) ? body.map(x => ({ id: x.id, name: x.name })) : [];
}
async function listBuckets(accountId) {
  const result = await cfJson(`/accounts/${accountId}/r2/buckets`);
  const buckets = result?.buckets || [];
  return buckets.map(x => ({ name: x.name, location: x.location, jurisdiction: x.jurisdiction }));
}
async function createBucket(accountId, name, locationHint = "") {
  const clean = String(name || "").toLowerCase().trim();
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(clean)) {
    throw new Error("Bucket names must be 3–63 lowercase letters, numbers, or hyphens");
  }
  const payload = { name: clean };
  if (locationHint) payload.locationHint = locationHint;
  return cfJson(`/accounts/${accountId}/r2/buckets`, {
    method: "POST", body: JSON.stringify(payload)
  });
}
async function ensureWorkersSubdomain(accountId) {
  let res = await cfFetch(`/accounts/${accountId}/workers/subdomain`);
  if (res.ok) {
    const body = await res.json();
    if (body?.result?.subdomain) return body.result.subdomain;
  }
  const candidates = [
    `redown-${accountId.slice(0, 8)}`,
    `redown-${accountId.slice(0, 8)}-${Math.random().toString(36).slice(2, 7)}`
  ];
  for (const subdomain of candidates) {
    res = await cfFetch(`/accounts/${accountId}/workers/subdomain`, {
      method: "PUT",
      body: JSON.stringify({ subdomain })
    });
    if (res.ok) return subdomain;
  }
  throw new Error("Could not create a workers.dev subdomain for this Cloudflare account");
}
async function provisionCloudflareProfile({ accountId, accountName, bucketName, profileName, folders }) {
  if (!accountId || !bucketName) throw new Error("Choose an account and bucket");

  const profiles = await getProfiles();
  const existingIndex = profiles.findIndex(p =>
    p.type === "cloudflare-r2" && p.accountId === accountId && p.bucketName === bucketName
  );
  const existing = existingIndex >= 0 ? profiles[existingIndex] : null;

  const secret = existing?.token || randomString(36);
  const scriptName = existing?.scriptName || `redown-${safeSlug(bucketName, 38)}-${accountId.slice(0, 6)}`;

  // A workers.dev account subdomain must exist before a script can be enabled there.
  const subdomain = await ensureWorkersSubdomain(accountId);

  const metadata = {
    main_module: "worker.js",
    compatibility_date: "2026-09-26",
    bindings: [
      { type: "r2_bucket", name: "STORAGE", bucket_name: bucketName },
      { type: "plain_text", name: "MAX_BYTES", text: "314572800" }
    ]
  };
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  const deployedWorkerSource = WORKER_SOURCE.replace("__REDOWN_SHARED_SECRET__", secret);
  form.append("worker.js", new Blob([deployedWorkerSource], { type: "application/javascript+module" }), "worker.js");

  const upload = await cfFetch(`/accounts/${accountId}/workers/scripts/${scriptName}`, {
    method: "PUT", body: form
  });
  if (!upload.ok) {
    const text = await upload.text();
    throw new Error(`Could not provision REDOWN Worker (${upload.status}): ${text.slice(0, 300)}`);
  }

  const enable = await cfFetch(`/accounts/${accountId}/workers/scripts/${scriptName}/subdomain`, {
    method: "POST",
    body: JSON.stringify({ enabled: true, previews_enabled: false })
  });
  if (!enable.ok) {
    const text = await enable.text();
    throw new Error(`Worker uploaded, but workers.dev could not be enabled (${enable.status}): ${text.slice(0, 300)}`);
  }

  const workerUrl = `https://${scriptName}.${subdomain}.workers.dev`;

  // Do not save a broken preset. Confirm Cloudflare can actually execute the Worker.
  let health = null;
  let healthError = null;
  const healthStartedAt = Date.now();
  const healthTimeoutMs = 60_000;
  let attempt = 0;

  while (Date.now() - healthStartedAt < healthTimeoutMs) {
    attempt++;
    try {
      const response = await fetch(workerUrl, {
        method: "GET",
        cache: "no-store",
        headers: { "cache-control": "no-cache" }
      });
      if (response.ok) {
        health = await response.json().catch(() => ({ ok: true }));
        if (health?.ok) break;
      }
      healthError = `HTTP ${response.status}`;
    } catch (error) {
      // A freshly-created workers.dev route can be temporarily unreachable
      // from a browser profile/resolver even though the deployment API succeeded.
      healthError = error?.message || String(error);
    }

    const waitMs = Math.min(1000 + attempt * 500, 4000);
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }

  if (!health?.ok) {
    throw new Error(
      `REDOWN deployed the Worker, but this browser could not reach ${workerUrl} within 60 seconds` +
      `${healthError ? ` (last error: ${healthError})` : ""}. ` +
      "This is a workers.dev reachability/DNS issue, not an R2 authorization failure."
    );
  }
  const desiredFolders = {
    "2d": existing?.folders?.["2d"] || folders?.["2d"] || "2d",
    "3d": existing?.folders?.["3d"] || folders?.["3d"] || "3d",
    "videos": existing?.folders?.videos || folders?.videos || "videos",
    "files": existing?.folders?.files || folders?.files || "files"
  };

  // Verify the R2 binding with an actual write and materialize visible prefix markers
  // so brand-new empty buckets immediately show their configured REDOWN locations.
  const prefixCheck = await fetch(workerUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      action: "ensurePrefixes",
      prefixes: Object.values(desiredFolders)
    })
  });
  const prefixBody = await prefixCheck.json().catch(() => ({}));
  if (!prefixCheck.ok || !prefixBody?.ok) {
    throw new Error(
      prefixBody?.error ||
      `REDOWN Worker is reachable but cannot write to R2 (${prefixCheck.status})`
    );
  }

  const profile = {
    ...(existing || {}),
    id: existing?.id || crypto.randomUUID(),
    name: existing?.name || profileName || bucketName,
    type: "cloudflare-r2",
    accountId,
    accountName,
    bucketName,
    scriptName,
    workerUrl,
    publicBaseUrl: existing?.customAssetDomain
      ? `https://${existing.customAssetDomain}/assets`
      : `${workerUrl}/assets`,
    token: secret,
    folders: desiredFolders,
    defaultCategory: existing?.defaultCategory || "files",
    menuTree: Array.isArray(existing?.menuTree) ? existing.menuTree : [],
    showInContextMenu: existing?.showInContextMenu !== false,
    menuOrder: existing?.menuOrder ?? profiles.length
  };

  if (existingIndex >= 0) profiles[existingIndex] = profile;
  else profiles.push(profile);
  await setProfiles(profiles);
  return profile;
}
function normalizeWebOrigin(value) {
  const raw = String(value || "").trim();
  if (!raw) throw new Error("Enter a website such as webrev.online or cdn.website.com");
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new Error("Enter a valid website/domain");
  }
  if (url.protocol !== "https:") throw new Error("Production asset websites must use HTTPS");
  if (url.username || url.password) throw new Error("Website URL cannot contain credentials");
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Enter only the website origin, without a path, query, or fragment");
  }
  return url.origin;
}

async function configureBucketAssetCors(accountId, bucketName, website) {
  if (!accountId || !bucketName) throw new Error("Missing Cloudflare account or bucket");
  const origin = normalizeWebOrigin(website);
  const path = `/accounts/${accountId}/r2/buckets/${encodeURIComponent(bucketName)}/cors`;

  let existingRules = [];
  const current = await cfFetch(path);
  if (current.ok) {
    const body = await current.json().catch(() => ({}));
    existingRules = Array.isArray(body?.result?.rules) ? body.result.rules : [];
  } else if (current.status !== 404) {
    const body = await current.json().catch(() => ({}));
    throw new Error(body?.errors?.[0]?.message || `Could not read R2 CORS configuration (${current.status})`);
  }

  const rules = existingRules.map(rule => structuredClone(rule));
  let matched = false;
  for (const rule of rules) {
    const origins = Array.isArray(rule?.allowed?.origins) ? rule.allowed.origins : [];
    if (!origins.includes(origin)) continue;
    matched = true;
    rule.allowed ??= {};
    rule.allowed.methods = Array.from(new Set([...(rule.allowed.methods || []), "GET", "HEAD"]));
    rule.allowed.headers = Array.from(new Set([...(rule.allowed.headers || []), "*"]));
    rule.expose_headers = Array.from(new Set([
      ...(rule.expose_headers || []),
      "ETag", "Content-Length", "Content-Type", "Accept-Ranges", "Content-Range"
    ]));
    rule.max_age_seconds = Math.max(Number(rule.max_age_seconds) || 0, 3600);
  }
  if (!matched) {
    rules.push({
      allowed: { origins: [origin], methods: ["GET", "HEAD"], headers: ["*"] },
      expose_headers: ["ETag", "Content-Length", "Content-Type", "Accept-Ranges", "Content-Range"],
      max_age_seconds: 3600
    });
  }
  await cfJson(path, { method: "PUT", body: JSON.stringify({ rules }) });
  return origin;
}

async function configureAssetDomain(accountId, bucketName, website) {
  const origin = normalizeWebOrigin(website);
  const hostname = new URL(origin).hostname;
  const profiles = await getProfiles();
  const index = profiles.findIndex(p =>
    p.type === "cloudflare-r2" && p.accountId === accountId && p.bucketName === bucketName
  );
  if (index < 0) throw new Error("REDOWN destination not found");
  const profile = profiles[index];

  const attached = await cfJson(`/accounts/${accountId}/workers/domains`, {
    method: "PUT",
    body: JSON.stringify({
      hostname,
      service: profile.scriptName
    })
  });

  // Keep R2 CORS compatible too, in case the bucket later gets a direct public R2 domain.
  await configureBucketAssetCors(accountId, bucketName, origin);

  profiles[index] = {
    ...profile,
    customAssetDomain: hostname,
    allowedWebsiteOrigin: origin,
    publicBaseUrl: `https://${hostname}/assets`
  };
  await setProfiles(profiles);

  return {
    origin,
    hostname,
    publicBaseUrl: profiles[index].publicBaseUrl,
    domain: attached
  };
}

function publicAssetUrl(profile, key) {
  const base = String(profile.publicBaseUrl || `${profile.workerUrl}/assets`).replace(/\/+$/, "");
  return `${base}/${String(key).split("/").map(encodeURIComponent).join("/")}`;
}

async function listObjects(accountId, bucketName, prefix = "") {
  const params = new URLSearchParams();
  if (prefix) params.set("prefix", prefix);
  const result = await cfJson(
    `/accounts/${accountId}/r2/buckets/${encodeURIComponent(bucketName)}/objects?${params}`
  );
  return result?.objects || result || [];
}
function objectKeyFromLocation(profile, location) {
  try {
    const target = new URL(String(location || ""));
    const base = new URL(String(profile.publicBaseUrl || `${profile.workerUrl}/assets`).replace(/\/+$/, "") + "/");
    if (target.origin !== base.origin) return "";
    const basePath = base.pathname.replace(/\/+$/, "") + "/";
    if (!target.pathname.startsWith(basePath)) return "";
    return target.pathname.slice(basePath.length).split("/").map(decodeURIComponent).join("/");
  } catch {
    return "";
  }
}
async function renameCloudflareTransfer(profile, location, newFilename) {
  const oldKey = objectKeyFromLocation(profile, location);
  if (!oldKey) throw new Error("Could not determine the R2 object path for this download");
  const response = await fetch(profile.workerUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${profile.token || ""}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      action: "renameObject",
      oldKey,
      newFilename,
      publicBaseUrl: profile.publicBaseUrl || `${profile.workerUrl}/assets`
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.ok) throw new Error(body?.error || `Rename failed (${response.status})`);
  return body;
}
async function renameWorkspaceObject(profileId, key, newFilename) {
  const profiles = await getProfiles();
  const profile = profiles.find(p => p.id === profileId);
  if (!profile || profile.type !== "cloudflare-r2") throw new Error("Cloudflare R2 destination not found");
  const location = publicAssetUrl(profile, key);
  const renamed = await renameCloudflareTransfer(profile, location, newFilename);
  return {
    key: renamed.key,
    filename: renamed.filename,
    publicUrl: renamed.publicUrl || publicAssetUrl(profile, renamed.key)
  };
}
async function renameTransferHistoryItem(id, newFilename) {
  const { transferHistory = [] } = await chrome.storage.local.get("transferHistory");
  const history = Array.isArray(transferHistory) ? transferHistory : [];
  const index = history.findIndex(item => item?.id === id);
  if (index < 0) throw new Error("Download history entry was not found");
  const item = history[index];
  if (!item?.ok) throw new Error("Only completed downloads can be renamed");
  const profiles = await getProfiles();
  const profile = profiles.find(p => p.id === item.profileId);
  if (!profile || profile.type !== "cloudflare-r2") throw new Error("Inline rename is currently available for Cloudflare R2 downloads");
  const renamed = await renameCloudflareTransfer(profile, item.location, newFilename);
  history[index] = { ...item, location: renamed.publicUrl || publicAssetUrl(profile, renamed.key), renamedAt: new Date().toISOString() };
  await chrome.storage.local.set({ transferHistory: history });
  return history[index];
}
async function ensureGitHubWorkflow(profile) {
  const repo = String(profile.repository || "").trim();
  const workflow = profile.workflowFile || "redown-ingest.yml";
  const branch = profile.branch || "main";
  const headers = {
    authorization: `Bearer ${profile.token || ""}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28"
  };
  const path = `.github/workflows/${workflow}`;
  const apiPath = encodeURIComponent(path).replace(/%2F/g, "/");
  const lookup = await fetch(
    `https://api.github.com/repos/${repo}/contents/${apiPath}?ref=${encodeURIComponent(branch)}`,
    { headers }
  );
  if (lookup.ok) return;
  if (lookup.status !== 404) throw new Error(`Could not check GitHub workflow (${lookup.status})`);
  const encoded = btoa(unescape(encodeURIComponent(GITHUB_WORKFLOW)));
  const create = await fetch(`https://api.github.com/repos/${repo}/contents/${apiPath}`, {
    method: "PUT",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({
      message: "chore: add REDOWN remote ingest workflow",
      content: encoded, branch
    })
  });
  if (!create.ok) throw new Error(`Could not install GitHub ingest workflow (${create.status})`);
}
async function ingestCloudflare(profile, sourceUrl, category, filename) {
  const folder = profile.folders?.[category] || category;
  const response = await fetch(profile.workerUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${profile.token || ""}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ sourceUrl, folder, filename, publicBaseUrl: profile.publicBaseUrl || `${profile.workerUrl}/assets` })
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { ok: false, error: text }; }
  if (!response.ok || !body.ok) throw new Error(body.error || `Cloudflare ingest failed (${response.status})`);
  return body.publicUrl || publicAssetUrl(profile, body.key);
}
async function ingestGitHub(profile, sourceUrl, category, filename) {
  const repo = String(profile.repository || "").trim();
  if (!/^[^/]+\/[^/]+$/.test(repo)) throw new Error("GitHub repository must be owner/name");
  const workflow = profile.workflowFile || "redown-ingest.yml";
  const ref = profile.branch || "main";
  const destinationPath = joinPath(profile.paths?.[category] || profile.defaultPath || "", filename);
  await ensureGitHubWorkflow(profile);
  const response = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${profile.token || ""}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "content-type": "application/json"
      },
      body: JSON.stringify({ ref, inputs: { source_url: sourceUrl, destination_path: destinationPath } })
    }
  );
  if (!response.ok) throw new Error(`GitHub dispatch failed (${response.status})`);
  return `${repo} → ${destinationPath}`;
}
async function ingest(profile, sourceUrl, category, filename) {
  const finalFilename = filename || basenameFromUrl(sourceUrl);
  if (!/^https:\/\//i.test(sourceUrl)) throw new Error("REDOWN accepts public HTTPS source URLs");
  if (profile.type === "cloudflare-r2") return ingestCloudflare(profile, sourceUrl, category, finalFilename);
  if (profile.type === "github") return ingestGitHub(profile, sourceUrl, category, finalFilename);
  throw new Error("Unsupported destination type");
}


function sanitizeMenuId(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "_");
}

function addPresetTree(profile, nodes, parentId, pathPrefix = []) {
  for (const node of nodes || []) {
    const nodeId = sanitizeMenuId(node.id || crypto.randomUUID());
    const fullPath = [...pathPrefix, nodeId];
    const menuId = `tree:${profile.id}:${fullPath.join(".")}`;
    const isLeaf = !Array.isArray(node.children) || node.children.length === 0;

    chrome.contextMenus.create({
      id: menuId,
      parentId,
      title: node.label || node.name || node.prefix || "Destination",
      contexts: ["link","image","video","audio","page"]
    });

    if (!isLeaf) {
      addPresetTree(profile, node.children, menuId, fullPath);
    }
  }
}

async function rebuildMenus() {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: ROOT_MENU_ID, title: "REDOWN", contexts: ["link","image","video","audio","page"]
  });

  const profiles = await getProfiles();
  const presets = profiles
    .filter(p => p.showInContextMenu !== false)
    .sort((a,b) => (a.menuOrder ?? 999) - (b.menuOrder ?? 999));

  if (!presets.length) {
    chrome.contextMenus.create({
      id:"redown-setup", parentId:ROOT_MENU_ID, title:"Set up a destination…",
      contexts:["link","image","video","audio","page"]
    });
    return;
  }

  for (const p of presets) {
    const title = p.menuLabel || p.name || p.bucketName || p.repository || "Destination";

    if (Array.isArray(p.menuTree) && p.menuTree.length) {
      const parentId = `preset:${p.id}`;
      chrome.contextMenus.create({
        id: parentId, parentId: ROOT_MENU_ID, title,
        contexts:["link","image","video","audio","page"]
      });
      addPresetTree(p, p.menuTree, parentId);
    } else {
      chrome.contextMenus.create({
        id:`quick:${p.id}`, parentId:ROOT_MENU_ID, title,
        contexts:["link","image","video","audio","page"]
      });
    }
  }

  chrome.contextMenus.create({
    id:"redown-manage", parentId:ROOT_MENU_ID, title:"Manage destinations…",
    contexts:["link","image","video","audio","page"]
  });
}

chrome.runtime.onInstalled.addListener(rebuildMenus);
chrome.runtime.onStartup.addListener(rebuildMenus);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.profiles) rebuildMenus();
});
chrome.contextMenus.onClicked.addListener(async info => {
  if (info.menuItemId === "redown-setup" || info.menuItemId === "redown-manage") {
    return chrome.runtime.openOptionsPage();
  }

  const profiles = await getProfiles();
  const sourceUrl = selectedUrl(info);

  const quickMatch = String(info.menuItemId).match(/^quick:([^:]+)$/);
  if (quickMatch) {
    const profile = profiles.find(p => p.id === quickMatch[1]);
    if (!profile) return notify("REDOWN", "That destination no longer exists.");
    try {
      const category = categoryForContext(info, sourceUrl, profile);
      const location = await ingest(profile, sourceUrl, category);
      await recordTransfer({ ok:true, sourceUrl, profileId:profile.id, profileName:profile.name, category, location });
      await notify("REDOWN complete", location);
    } catch (error) {
      const message = error?.message || String(error);
      await recordTransfer({ ok:false, sourceUrl, profileId:profile.id, profileName:profile.name, category:profile.defaultCategory || "files", error:message });
      await notify("REDOWN failed", message);
    }
    return;
  }

  const treeMatch = String(info.menuItemId).match(/^tree:([^:]+):(.+)$/);
  if (!treeMatch) return;

  const profile = profiles.find(p => p.id === treeMatch[1]);
  if (!profile) return notify("REDOWN", "That destination no longer exists.");

  const ids = treeMatch[2].split(".");
  let nodes = profile.menuTree || [];
  let node = null;
  for (const id of ids) {
    node = nodes.find(n => sanitizeMenuId(n.id) === id);
    if (!node) break;
    nodes = node.children || [];
  }
  if (!node || (Array.isArray(node.children) && node.children.length)) return;

  const category = node.category || profile.defaultCategory || "files";
  const originalFolders = profile.folders;
  const originalPaths = profile.paths;

  try {
    if (profile.type === "cloudflare-r2" && node.prefix != null) {
      profile.folders = { ...(profile.folders || {}), [category]: node.prefix };
    }
    if (profile.type === "github" && node.path != null) {
      profile.paths = { ...(profile.paths || {}), [category]: node.path };
    }

    const location = await ingest(profile, sourceUrl, category);
    await recordTransfer({ ok:true, sourceUrl, profileId:profile.id, profileName:profile.name, category, location });
    await notify("REDOWN complete", location);
  } catch (error) {
    const message = error?.message || String(error);
    await recordTransfer({ ok:false, sourceUrl, profileId:profile.id, profileName:profile.name, category, error:message });
    await notify("REDOWN failed", message);
  } finally {
    profile.folders = originalFolders;
    profile.paths = originalPaths;
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      if (message?.type === "ingest") {
        const profiles = await getProfiles();
        const profile = profiles.find(p => p.id === message.profileId);
        if (!profile) throw new Error("Destination not found");
        const sourceUrl = String(message.sourceUrl || "");
        const category = message.category || "files";
        try {
          const location = await ingest(profile, sourceUrl, category, message.filename || undefined);
          await recordTransfer({ ok:true, sourceUrl, profileId:profile.id, profileName:profile.name, category, location });
          return sendResponse({ ok:true, location });
        } catch (error) {
          const errorMessage = error?.message || String(error);
          await recordTransfer({ ok:false, sourceUrl, profileId:profile.id, profileName:profile.name, category, error:errorMessage });
          throw error;
        }
      }
      if (message?.type === "cfConnect") return sendResponse({ ok:true, ...(await connectCloudflare()) });
      if (message?.type === "cfDisconnect") { await disconnectCloudflare(); return sendResponse({ ok:true }); }
      if (message?.type === "cfAccounts") return sendResponse({ ok:true, accounts:await listCloudflareAccounts() });
      if (message?.type === "cfBuckets") return sendResponse({ ok:true, buckets:await listBuckets(message.accountId) });
      if (message?.type === "cfCreateBucket") return sendResponse({ ok:true, bucket:await createBucket(message.accountId,message.name,message.locationHint) });
      if (message?.type === "cfProvision") return sendResponse({ ok:true, profile:await provisionCloudflareProfile(message) });
      if (message?.type === "cfSetAssetCors" || message?.type === "cfSetAssetDomain") {
        return sendResponse({ ok:true, ...(await configureAssetDomain(message.accountId,message.bucketName,message.website)) });
      }
      if (message?.type === "cfObjects") return sendResponse({ ok:true, objects:await listObjects(message.accountId,message.bucketName,message.prefix) });
      if (message?.type === "recordLocalTransfer") {
        await recordTransfer({
          ok: message.ok !== false,
          sourceUrl: "local-file",
          profileId: message.profileId,
          profileName: message.profileName,
          category: message.category || "files",
          location: message.location,
          error: message.error
        });
        return sendResponse({ ok:true });
      }
      if (message?.type === "profiles") return sendResponse({ ok:true, profiles:await getProfiles() });
      if (message?.type === "transferHistory") {
        const { transferHistory = [] } = await chrome.storage.local.get("transferHistory");
        return sendResponse({ ok:true, transferHistory });
      }
      if (message?.type === "renameTransfer") {
        return sendResponse({ ok:true, item:await renameTransferHistoryItem(message.id, message.newFilename) });
      }
      if (message?.type === "renameWorkspaceObject") {
        return sendResponse({ ok:true, ...(await renameWorkspaceObject(message.profileId, message.key, message.newFilename)) });
      }
      throw new Error("Unknown request");
    } catch (error) {
      sendResponse({ ok:false, error:error?.message || String(error) });
    }
  })();
  return true;
});
