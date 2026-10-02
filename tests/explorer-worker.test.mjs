import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function workerModule() {
  const background = await readFile(new URL("../extension/background.js", import.meta.url), "utf8");
  const match = background.match(/const WORKER_SOURCE = `([\s\S]*?)`;\n\nfunction/);
  assert.ok(match, "embedded Explorer worker source is present");
  const source = Function(`return \`${match[1]}\``)().replace("__REDOWN_SHARED_SECRET__", "test-secret");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

class MemoryObject {
  constructor(key, bytes, options = {}) {
    this.key = key;
    this.bytes = bytes;
    this.size = bytes.byteLength;
    this.etag = `etag-${key}`;
    this.httpEtag = `"${this.etag}"`;
    this.uploaded = new Date("2026-10-02T12:00:00Z");
    this.httpMetadata = options.httpMetadata || {};
    this.customMetadata = options.customMetadata || {};
    this.body = new Blob([bytes]).stream();
  }
  writeHttpMetadata(headers) {
    if (this.httpMetadata.contentType) headers.set("content-type", this.httpMetadata.contentType);
    if (this.httpMetadata.cacheControl) headers.set("cache-control", this.httpMetadata.cacheControl);
  }
}

class MemoryBucket {
  objects = new Map();
  async head(key) { return this.objects.get(key) || null; }
  async get(key) {
    const object = this.objects.get(key);
    return object ? new MemoryObject(key, object.bytes, object) : null;
  }
  async put(key, value, options = {}) {
    const bytes = new Uint8Array(await new Response(value).arrayBuffer());
    this.objects.set(key, new MemoryObject(key, bytes, options));
  }
  async delete(keys) {
    for (const key of Array.isArray(keys) ? keys : [keys]) this.objects.delete(key);
  }
}

function manageRequest(body) {
  return new Request("https://bucket.workers.dev/", {
    method: "POST",
    headers: { authorization: "Bearer test-secret", "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

const text = value => new TextEncoder().encode(value);

test("same-bucket transfers stream objects and preserve metadata", async () => {
  const worker = (await workerModule()).default;
  const bucket = new MemoryBucket();
  await bucket.put("images/logo.png", text("logo"), { httpMetadata:{ contentType:"image/png" }, customMetadata:{ owner:"redown" } });
  const response = await worker.fetch(manageRequest({ action:"transferBatch", conflict:"skip", entries:[{ sourceKey:"images/logo.png", destinationKey:"archive/logo.png", sameBucket:true }] }), { STORAGE:bucket });
  const result = await response.json();
  assert.equal(result.results[0].status, "copied");
  assert.equal(new TextDecoder().decode((await bucket.get("archive/logo.png")).bytes), "logo");
  assert.equal((await bucket.head("archive/logo.png")).customMetadata.owner, "redown");
});

test("cross-bucket transfers stay Worker-to-Worker and keep-both resolves conflicts", async () => {
  const worker = (await workerModule()).default;
  const source = new MemoryBucket();
  const destination = new MemoryBucket();
  await source.put("models/ship.glb", text("remote-model"), { httpMetadata:{ contentType:"model/gltf-binary" } });
  await destination.put("ships/ship.glb", text("existing"));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "source.workers.dev") return worker.fetch(new Request(input, init), { STORAGE:source });
    return originalFetch(input, init);
  };
  try {
    const response = await worker.fetch(manageRequest({ action:"transferBatch", conflict:"keep", sourceWorkerUrl:"https://source.workers.dev", sourceToken:"test-secret", entries:[{ sourceKey:"models/ship.glb", destinationKey:"ships/ship.glb", sameBucket:false }] }), { STORAGE:destination });
    const result = await response.json();
    assert.equal(result.results[0].destinationKey, "ships/ship (2).glb");
    assert.equal(new TextDecoder().decode((await destination.get("ships/ship (2).glb")).bytes), "remote-model");
  } finally { globalThis.fetch = originalFetch; }
});

test("folder markers, properties, and batched deletes are real R2 operations", async () => {
  const worker = (await workerModule()).default;
  const bucket = new MemoryBucket();
  let response = await worker.fetch(manageRequest({ action:"ensurePrefixes", prefixes:["models/empty"] }), { STORAGE:bucket });
  assert.equal((await response.json()).created[0], "models/empty/.redown");
  response = await worker.fetch(manageRequest({ action:"headObject", key:"models/empty/.redown" }), { STORAGE:bucket });
  assert.equal((await response.json()).object.customMetadata.redownMarker, "true");
  response = await worker.fetch(manageRequest({ action:"deleteKeys", keys:["models/empty/.redown"] }), { STORAGE:bucket });
  assert.deepEqual((await response.json()).deleted, ["models/empty/.redown"]);
  assert.equal(await bucket.head("models/empty/.redown"), null);
});
