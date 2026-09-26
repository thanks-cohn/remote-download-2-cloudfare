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
    if (request.method === "GET") return Response.json({ ok: true, service: "REDOWN" });
    if (request.method !== "POST") return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
    const auth = request.headers.get("authorization") || "";
    if (!env.REDOWN_SECRET || auth !== \`Bearer \${env.REDOWN_SECRET}\`) {
      return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      const body = await request.json();

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
      const filename = cleanName(body.filename || source.pathname);
      const prefix = cleanPrefix(body.folder);
      const key = prefix ? \`\${prefix}/\${filename}\` : filename;

      const remote = await checkedFetch(sourceUrl);
      if (!remote.ok || !remote.body) throw new Error(\`Remote fetch failed: \${remote.status}\`);

      const length = Number(remote.headers.get("content-length") || 0);
      const max = Number(env.MAX_BYTES || 314572800);
      if (length && length > max) {
        return Response.json({ ok: false, error: "Remote file is larger than this REDOWN profile allows" }, { status: 413 });
      }

      let count = 0;
      const limiter = new TransformStream({
        transform(chunk, controller) {
          count += chunk.byteLength || 0;
          if (count > max) throw new Error("Remote file exceeded size limit");
          controller.enqueue(chunk);
        }
      });

      const contentType = remote.headers.get("content-type") || "application/octet-stream";
      await env.STORAGE.put(key, remote.body.pipeThrough(limiter), {
        httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" },
        customMetadata: { sourceUrl, importedBy: "REDOWN", importedAt: new Date().toISOString() }
      });

      return Response.json({ ok: true, key, bytes: count || length || null, contentType });
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
  return info.linkUrl || info.srcUrl || info.pageUrl || "";
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
async function notify(title, message) {
  await chrome.notifications.create({
    type: "basic", iconUrl: "icon.svg", title, message: String(message || "")
  });
}
async function cfFetch(path, options = {}) {
  const { cloudflareAuth } = await chrome.storage.local.get("cloudflareAuth");
  if (!cloudflareAuth?.accessToken) throw new Error("Connect Cloudflare first");
  const headers = new Headers(options.headers || {});
  headers.set("authorization", `Bearer ${cloudflareAuth.accessToken}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const res = await fetch(`${CF_API}${path}`, { ...options, headers });
  if (res.status === 401) throw new Error("Cloudflare authorization expired. Reconnect Cloudflare.");
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
  const token = await tokenRes.json();
  if (!tokenRes.ok || !token.access_token) {
    throw new Error(token.error_description || token.error || "Cloudflare token exchange failed");
  }

  const userRes = await fetch("https://dash.cloudflare.com/oauth2/userinfo", {
    headers: { authorization: `Bearer ${token.access_token}` }
  });
  const user = userRes.ok ? await userRes.json().catch(() => null) : null;

  await chrome.storage.local.set({
    cloudflareAuth: {
      accessToken: token.access_token,
      refreshToken: token.refresh_token || null,
      expiresAt: token.expires_in ? Date.now() + Number(token.expires_in) * 1000 : null,
      user
    }
  });

  return { user, accounts: await listCloudflareAccounts() };
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
      { type: "secret_text", name: "REDOWN_SECRET", text: secret },
      { type: "plain_text", name: "MAX_BYTES", text: "314572800" }
    ]
  };
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("worker.js", new Blob([WORKER_SOURCE], { type: "application/javascript+module" }), "worker.js");

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
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const response = await fetch(workerUrl, { method: "GET", cache: "no-store" });
      if (response.ok) {
        health = await response.json().catch(() => ({ ok: true }));
        if (health?.ok) break;
      }
      healthError = `HTTP ${response.status}`;
    } catch (error) {
      healthError = error?.message || String(error);
    }
    await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
  }
  if (!health?.ok) {
    throw new Error(`REDOWN Worker did not become reachable at ${workerUrl}${healthError ? ` (${healthError})` : ""}`);
  }

  const desiredFolders = {
    "2d": existing?.folders?.["2d"] || folders?.["2d"] || "2d",
    "3d": existing?.folders?.["3d"] || folders?.["3d"] || "3d",
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
async function listObjects(accountId, bucketName, prefix = "") {
  const params = new URLSearchParams();
  if (prefix) params.set("prefix", prefix);
  const result = await cfJson(
    `/accounts/${accountId}/r2/buckets/${encodeURIComponent(bucketName)}/objects?${params}`
  );
  return result?.objects || result || [];
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
    body: JSON.stringify({ sourceUrl, folder, filename })
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { ok: false, error: text }; }
  if (!response.ok || !body.ok) throw new Error(body.error || `Cloudflare ingest failed (${response.status})`);
  return `${profile.bucketName}/${body.key}`;
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
      const location = await ingest(profile, sourceUrl, profile.defaultCategory || "files");
      await notify("REDOWN complete", location);
    } catch (error) {
      await notify("REDOWN failed", error?.message || String(error));
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
    await notify("REDOWN complete", location);
  } catch (error) {
    await notify("REDOWN failed", error?.message || String(error));
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
        return sendResponse({ ok:true, location:await ingest(
          profile, String(message.sourceUrl || ""), message.category || "files",
          message.filename || undefined
        )});
      }
      if (message?.type === "cfConnect") return sendResponse({ ok:true, ...(await connectCloudflare()) });
      if (message?.type === "cfDisconnect") { await disconnectCloudflare(); return sendResponse({ ok:true }); }
      if (message?.type === "cfAccounts") return sendResponse({ ok:true, accounts:await listCloudflareAccounts() });
      if (message?.type === "cfBuckets") return sendResponse({ ok:true, buckets:await listBuckets(message.accountId) });
      if (message?.type === "cfCreateBucket") return sendResponse({ ok:true, bucket:await createBucket(message.accountId,message.name,message.locationHint) });
      if (message?.type === "cfProvision") return sendResponse({ ok:true, profile:await provisionCloudflareProfile(message) });
      if (message?.type === "cfObjects") return sendResponse({ ok:true, objects:await listObjects(message.accountId,message.bucketName,message.prefix) });
      if (message?.type === "profiles") return sendResponse({ ok:true, profiles:await getProfiles() });
      throw new Error("Unknown request");
    } catch (error) {
      sendResponse({ ok:false, error:error?.message || String(error) });
    }
  })();
  return true;
});
