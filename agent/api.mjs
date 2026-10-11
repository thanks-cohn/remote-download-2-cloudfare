import { readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

export const API_VERSION = '0.1';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OPERATIONS = ['describe', 'explainOperation', 'getForeverLinks', 'listOperations', 'projectOverview'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sorted = values => [...values].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// Only catalogued source files are read. Never execute code, Git, or network calls.
function readSource(root, path) {
  if (typeof path !== 'string' || isAbsolute(path) || path.split(/[\\/]/).includes('..')) throw new Error('unsafe-path');
  const target = realpathSync(resolve(root, path));
  const rel = relative(realpathSync(root), target);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('unsafe-path');
  return readFileSync(target);
}

export function inspectReferences(catalog, root = ROOT) {
  const findings = [];
  for (const ref of catalog.sourceRevisions) {
    try {
      if (hash(readSource(root, ref.path)) !== ref.sha256) findings.push({ code: 'stale-source', path: ref.path });
    } catch { findings.push({ code: 'missing-or-unsafe-source', path: ref.path }); }
  }
  const refs = [...catalog.overview.sourceRefs, ...catalog.operations.flatMap(o => [...o.sourceRefs, ...o.testRefs])];
  for (const ref of refs) {
    try {
      const bytes = readSource(root, ref.path);
      if (hash(bytes) !== ref.sha256) findings.push({ code: 'stale-reference', path: ref.path, symbol: ref.symbol });
      if (!bytes.toString('utf8').includes(ref.symbol)) findings.push({ code: 'missing-anchor', path: ref.path, symbol: ref.symbol });
    } catch { findings.push({ code: 'missing-or-unsafe-reference', path: ref.path, symbol: ref.symbol }); }
  }
  return { status: findings.length ? 'stale' : 'current', scope: 'catalogued files and literal anchors only; test outcomes and semantic completeness are unknown', findings };
}

export function createAgentApi({ catalog = JSON.parse(readFileSync(new URL('./catalog.json', import.meta.url), 'utf8')), root = ROOT } = {}) {
  // Defensive copy prevents consumers from modifying later responses.
  const model = structuredClone(catalog);
  return {
    query(operation, input = {}) {
      const envelope = {
        apiVersion: API_VERSION, data: null, sourceRefs: [], provenance: structuredClone(model.provenance),
        evidenceStatus: 'unknown', freshness: inspectReferences(model, root), explanation: ''
      };
      const fail = (code, message) => ({ ...envelope, explanation: message, error: { code, message, details: {} } });
      if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('invalid-request', 'Arguments must be a JSON object.');
      if (input.requestId !== undefined) {
        if (typeof input.requestId !== 'string' || !/^[A-Za-z0-9._-]{1,80}$/.test(input.requestId)) return fail('invalid-request', 'requestId must be a short opaque identifier.');
        envelope.requestId = input.requestId;
      }
      if (input.apiVersion !== undefined && input.apiVersion !== API_VERSION) return fail('unsupported-version', 'This adapter supports ReDown agent API 0.1.');
      if (model.apiVersion !== API_VERSION || model.catalogVersion !== '0.1') return fail('unsupported-catalog-version', 'This adapter supports catalog 0.1 only.');
      if (!OPERATIONS.includes(operation)) return fail('unsupported-operation', 'Operation is not advertised by describe.');
      if (Object.keys(input).some(k => !['apiVersion', 'requestId', ...(['explainOperation', 'getForeverLinks'].includes(operation) ? ['id'] : [])].includes(k))) return fail('invalid-request', 'Unexpected argument.');
      let data;
      if (operation === 'describe') {
        data = { agentApiVersion: API_VERSION, catalogVersion: model.catalogVersion, operations: [...OPERATIONS], readOnly: true,
          forever: { referencedStandardVersion: '0.1', referencedPublicApiVersion: '0.1', supportedModelVersions: [], adapterImplemented: false },
          sourceCommit: model.sourceCommit, discoveryLimits: model.discoveryLimits };
        envelope.explanation = 'Offline read-only project inspection. Discover supported operations here; Forever Works model integration is absent.';
      } else if (operation === 'projectOverview') {
        data = model.overview; envelope.sourceRefs = data.sourceRefs; envelope.explanation = data.summary;
      } else if (operation === 'listOperations') {
        data = sorted(model.operations).map(({ id, summary, evidenceStatus, coverage }) => ({ id, summary, evidenceStatus, coverage }));
        envelope.sourceRefs = model.operations.flatMap(o => o.sourceRefs);
        envelope.explanation = 'Six representative operations; this is not the complete extension message inventory.';
      } else {
        if (typeof input.id !== 'string' || !input.id) return fail('invalid-request', 'An exact operation id is required.');
        const entry = model.operations.find(o => o.id === input.id);
        if (!entry) return fail('operation-not-found', 'No catalogued operation has that exact id.');
        envelope.sourceRefs = [...entry.sourceRefs, ...entry.testRefs];
        data = operation === 'getForeverLinks' ? entry.foreverLinks : entry;
        envelope.explanation = operation === 'getForeverLinks' ? entry.foreverLinks.reason : `${entry.summary} Evidence: ${entry.coverage}`;
      }
      envelope.data = structuredClone(data);
      envelope.evidenceStatus = operation === 'getForeverLinks' || envelope.freshness.status !== 'current' ? 'unknown' : 'verified-in-source';
      return structuredClone(envelope);
    }
  };
}
