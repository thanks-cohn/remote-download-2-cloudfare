import http from "node:http";
import fs from "node:fs";
import path from "node:path";

function loadDotEnv(filename = ".env") {
  const full = path.resolve(filename);
  if (!fs.existsSync(full)) return;
  for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

const workerUrl = process.env.REMOTE_INGEST_URL;
const token = process.env.REMOTE_INGEST_TOKEN;
const port = Number(process.env.LOCAL_PORT || 8765);

if (!workerUrl || !token) {
  console.error("Missing REMOTE_INGEST_URL or REMOTE_INGEST_TOKEN in .env");
  process.exit(1);
}

function send(res, status, payload, origin = "") {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": origin || "null",
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  const origin = String(req.headers.origin || "");
  const extensionOrigin = origin.startsWith("chrome-extension://") || origin.startsWith("moz-extension://");

  if (req.method === "OPTIONS") {
    if (!extensionOrigin) return send(res, 403, { ok: false, error: "Extension origin required" });
    return send(res, 204, {}, origin);
  }

  if (req.method !== "POST" || req.url !== "/ingest") {
    return send(res, 404, { ok: false, error: "Not found" }, extensionOrigin ? origin : "");
  }

  if (!extensionOrigin) {
    return send(res, 403, { ok: false, error: "Requests must come from the browser extension" });
  }

  let raw = "";
  req.setEncoding("utf8");
  req.on("data", (chunk) => {
    raw += chunk;
    if (raw.length > 32768) req.destroy();
  });

  req.on("end", async () => {
    try {
      const payload = JSON.parse(raw || "{}");
      const upstream = await fetch(workerUrl, {
        method: "POST",
        headers: {
          "authorization": `Bearer ${token}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          sourceUrl: payload.sourceUrl,
          folder: payload.folder,
          filename: payload.filename || undefined
        })
      });

      const text = await upstream.text();
      let body;
      try { body = JSON.parse(text); } catch { body = { ok: false, error: text }; }
      send(res, upstream.status, body, origin);
    } catch (error) {
      send(res, 500, { ok: false, error: error instanceof Error ? error.message : "Bridge failure" }, origin);
    }
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Local Cloudflare ingest bridge listening on http://127.0.0.1:${port}`);
});
