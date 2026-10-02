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
  async get(key, options = {}) {
    const object = this.objects.get(key);
    if (!object) return null;
    const range = options.range;
    const bytes = range ? object.bytes.slice(range.offset, range.offset + range.length) : object.bytes;
    return new MemoryObject(key, bytes, object);
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

function storedZip(entries) {
  const chunks = [], central = [];
  let offset = 0;
  for (const [name, value] of entries) {
    const nameBytes = text(name), data = text(value), local = new Uint8Array(30 + nameBytes.length + data.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint32(18, data.length, true); view.setUint32(22, data.length, true); view.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30); local.set(data, 30 + nameBytes.length); chunks.push(local);
    const header = new Uint8Array(46 + nameBytes.length), cv = new DataView(header.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, nameBytes.length, true); cv.setUint32(42, offset, true); header.set(nameBytes, 46); central.push(header);
    offset += local.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0), eocd = new Uint8Array(22), ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true); ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
  const output = new Uint8Array(offset + centralSize + eocd.length); let cursor = 0;
  for (const part of [...chunks, ...central, eocd]) { output.set(part, cursor); cursor += part.length; }
  return output;
}

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

test("private Explorer reads require auth while explicitly enabled public assets still work", async () => {
  const worker = (await workerModule()).default, bucket = new MemoryBucket();
  await bucket.put("private/story.txt", text("creator notes"), { httpMetadata:{ contentType:"text/plain" } });
  let response = await worker.fetch(new Request("https://bucket.workers.dev/object?key=private%2Fstory.txt"), { STORAGE:bucket, PUBLIC_ASSETS_ENABLED:"false" });
  assert.equal(response.status, 401);
  response = await worker.fetch(new Request("https://bucket.workers.dev/assets/private/story.txt"), { STORAGE:bucket, PUBLIC_ASSETS_ENABLED:"false" });
  assert.equal(response.status, 404, "Explorer preparation does not publish objects");
  response = await worker.fetch(new Request("https://bucket.workers.dev/object?key=private%2Fstory.txt", { headers:{ authorization:"Bearer test-secret", range:"bytes=0-6" } }), { STORAGE:bucket });
  assert.equal(response.status, 206); assert.equal(await response.text(), "creator");
  response = await worker.fetch(new Request("https://bucket.workers.dev/assets/private/story.txt"), { STORAGE:bucket, PUBLIC_ASSETS_ENABLED:"true" });
  assert.equal(response.status, 200); assert.equal(await response.text(), "creator notes");
});

test("short-lived private preview URLs support ranges for text, PDF, and GLB", async () => {
  const worker = (await workerModule()).default, bucket = new MemoryBucket();
  for (const [key, type] of [["notes.txt","text/plain"],["layout.pdf","application/pdf"],["scene.glb","model/gltf-binary"]]) {
    await bucket.put(key, text(`content:${key}`), { httpMetadata:{ contentType:type } });
    const signed = await (await worker.fetch(manageRequest({ action:"createReadUrl", key, ttl:60 }), { STORAGE:bucket })).json();
    const response = await worker.fetch(new Request(signed.url, { headers:{ range:"bytes=0-6" } }), { STORAGE:bucket });
    assert.equal(response.status, 206); assert.equal(await response.text(), "content"); assert.match(response.headers.get("cache-control"), /private/);
  }
});

test("ZIP and CBZ archives are listed as virtual folders and selected entries extract safely", async () => {
  const worker = (await workerModule()).default, bucket = new MemoryBucket();
  await bucket.put("comic.cbz", storedZip([["cover.jpg","cover"],["pages/",""],["pages/001.jpg","one"],["notes.txt","hello"]]));
  let result = await (await worker.fetch(manageRequest({ action:"listArchive", key:"comic.cbz" }), { STORAGE:bucket })).json();
  assert.equal(result.archive.type, "cbz"); assert.deepEqual(result.archive.entries.map(x => x.name), ["cover.jpg","pages/","pages/001.jpg","notes.txt"]);
  assert.equal(result.archive.entries.find(x => x.name === "pages/")?.directory, true);
  result = await (await worker.fetch(manageRequest({ action:"extractArchiveEntries", key:"comic.cbz", entries:["pages/001.jpg"], destinationPrefix:"project" }), { STORAGE:bucket })).json();
  assert.equal(result.results[0].status, "extracted"); assert.equal(new TextDecoder().decode((await bucket.get("project/pages/001.jpg")).bytes), "one");
  const preview = await (await worker.fetch(manageRequest({ action:"createArchiveEntryReadUrl", key:"comic.cbz", entry:"notes.txt", contentType:"text/plain" }), { STORAGE:bucket })).json();
  const previewResponse = await worker.fetch(new Request(preview.url), { STORAGE:bucket });
  assert.equal(previewResponse.status, 200); assert.equal(await previewResponse.text(), "hello");
});

test("archive traversal and malformed archives are rejected", async () => {
  const worker = (await workerModule()).default, bucket = new MemoryBucket();
  await bucket.put("unsafe.zip", storedZip([["../escape.txt","bad"]]));
  let response = await worker.fetch(manageRequest({ action:"listArchive", key:"unsafe.zip" }), { STORAGE:bucket });
  assert.equal(response.status, 400); assert.match((await response.json()).error, /unsafe path/);
  await bucket.put("broken.zip", text("not a zip"));
  response = await worker.fetch(manageRequest({ action:"listArchive", key:"broken.zip" }), { STORAGE:bucket });
  assert.equal(response.status, 400); assert.match((await response.json()).error, /Malformed/);
});
