import {readFileSync, realpathSync, statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname, resolve, relative, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';

export const DEBUG_API_VERSION = '0.1';
export const DEBUG_RECORD_VERSION = '0.1';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OPERATIONS = ['describe', 'getHistory', 'getIncident', 'listIncidents', 'validateDebugRecords'];
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_EVENTS = 10000;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const safePath = path => typeof path === 'string' && /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(path)
  && !path.split('/').some(part => part === '.' || part === '..');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const schemas = Object.fromEntries(['common', 'manifest', 'incident', 'event'].map(name => [
  name, JSON.parse(readFileSync(new URL('./schemas/0.1/' + name + '.schema.json', import.meta.url), 'utf8'))
]));

// This small evaluator implements only assertions used by the frozen local schemas.
// It is not a general JSON Schema engine. Independent schema conformance is tested.
export function validateStructure(name, value) {
  const errors = [];
  const check = (schema, item, location) => {
    if (schema.$ref) {
      const [file, pointer] = schema.$ref.split('#');
      let target = schemas[file.replace('.schema.json', '')];
      for (const key of pointer.slice(1).split('/')) target = target[key];
      return check(target, item, location);
    }
    const matches = type => type === 'object' ? object(item) : type === 'array' ? Array.isArray(item)
      : type === 'null' ? item === null : type === 'integer' ? Number.isInteger(item)
      : type === 'number' ? typeof item === 'number' && Number.isFinite(item) : typeof item === type;
    const bad = () => errors.push({code: 'invalid-record', location});
    if (schema.type && !(Array.isArray(schema.type) ? schema.type : [schema.type]).some(matches)) {bad(); return;}
    if (schema.const !== undefined && item !== schema.const) bad();
    if (schema.enum && !schema.enum.includes(item)) bad();
    if (typeof item === 'string') {
      if (schema.minLength !== undefined && [...item].length < schema.minLength) bad();
      if (schema.pattern && !new RegExp(schema.pattern).test(item)) bad();
    }
    if (typeof item === 'number') {
      if (schema.minimum !== undefined && item < schema.minimum) bad();
      if (schema.maximum !== undefined && item > schema.maximum) bad();
    }
    if (Array.isArray(item)) {
      if (schema.minItems !== undefined && item.length < schema.minItems) bad();
      if (schema.maxItems !== undefined && item.length > schema.maxItems) bad();
      if (schema.uniqueItems && new Set(item.map(canonical)).size !== item.length) bad();
      if (schema.items) item.forEach((child, index) => check(schema.items, child, location + '[' + index + ']'));
    }
    if (object(item)) {
      for (const key of schema.required || []) if (!Object.hasOwn(item, key)) errors.push({code:'invalid-record', location:location + '.' + key});
      for (const [key, child] of Object.entries(schema.properties || {})) if (Object.hasOwn(item, key)) check(child, item[key], location + '.' + key);
    }
  };
  check(schemas[name], value, name);
  return errors;
}

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (object(value)) return '{' + Object.keys(value).sort(compare).map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}

function readBytes(root, path) {
  if (!safePath(path)) throw new Error('unsafe-path');
  let target;
  try {target = realpathSync(resolve(root, path));} catch {throw new Error('missing-record-file');}
  const rel = relative(root, target);
  if (rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel)) throw new Error('unsafe-path');
  const stat = statSync(target);
  if (!stat.isFile()) throw new Error('invalid-record-file');
  if (stat.size > MAX_BYTES) throw new Error('record-too-large');
  const bytes = readFileSync(target);
  if (bytes.length > MAX_BYTES) throw new Error('record-too-large');
  return bytes;
}
function decode(bytes) {
  try {return new TextDecoder('utf-8', {fatal:true}).decode(bytes);} catch {throw new Error('invalid-utf8');}
}
function parse(text) {
  try {return JSON.parse(text);} catch {throw new Error('invalid-json');}
}
function validDate(value, time = false) {
  if (value === null && !time) return true;
  if (typeof value !== 'string') return false;
  const expected = time ? value : value + 'T00:00:00Z';
  const date = new Date(expected);
  return Number.isFinite(date.getTime()) && date.toISOString().replace('.000Z', 'Z') === expected;
}

function loadSnapshot(rootInput, manifestPath) {
  const errors = [], warnings = [], incidents = new Map(), events = new Map(), allEventIds = new Set();
  const sourceRefs = [], recordRefs = [], fileCache = new Map();
  const add = (code, location) => errors.push({code, location});
  let root;
  try {root = realpathSync(rootInput);} catch {add('missing-record-root', 'root');}
  const read = (path, location) => {
    try {
      if (!fileCache.has(path)) fileCache.set(path, readBytes(root, path));
      return fileCache.get(path);
    } catch (error) {
      const code = ['unsafe-path','missing-record-file','invalid-record-file','record-too-large'].includes(error.message) ? error.message : 'unreadable-record-file';
      add(code, location); return null;
    }
  };
  const json = (path, location, schema) => {
    const bytes = read(path, location);
    if (!bytes) return null;
    recordRefs.push({path, sha256:hash(bytes)});
    let value;
    try {value = parse(decode(bytes));} catch (error) {add(error.message, location); return null;}
    if (object(value) && value.debugRecordVersion !== undefined && value.debugRecordVersion !== DEBUG_RECORD_VERSION) {
      add('unsupported-record-version', location); return null;
    }
    const findings = validateStructure(schema, value);
    errors.push(...findings.map(f => ({...f, location:location + ':' + f.location})));
    return findings.length ? null : value;
  };
  const manifest = root ? json(manifestPath, 'manifest', 'manifest') : null;
  const usedPaths = new Set([manifestPath]);
  if (manifest) for (const [index, entry] of manifest.cases.entries()) {
    const location = 'cases[' + index + ']';
    if (incidents.has(entry.caseId)) {add('duplicate-case-id', location); continue;}
    // Reserve IDs even if the descriptor is bad; duplicates are never silently hidden.
    incidents.set(entry.caseId, null);
    for (const path of [entry.incidentPath, entry.historyPath]) {
      if (usedPaths.has(path)) add('duplicate-record-path', location);
      usedPaths.add(path);
    }
    const incident = json(entry.incidentPath, location + '.incident', 'incident');
    if (incident) {
      if (incident.caseId !== entry.caseId) add('inconsistent-case-id', location + '.incident');
      if (!validDate(incident.firstSeen)) add('invalid-date', location + '.incident.firstSeen');
      incidents.set(entry.caseId, incident);
    }
    const bytes = read(entry.historyPath, location + '.history');
    const journal = [];
    events.set(entry.caseId, journal);
    if (!bytes) continue;
    recordRefs.push({path:entry.historyPath, sha256:hash(bytes)});
    let lines;
    try {
      const text = decode(bytes);
      if (!text.endsWith('\n')) {add('incomplete-journal', location + '.history'); continue;}
      lines = text.slice(0, -1).split('\n');
      if (lines.length > MAX_EVENTS) {add('too-many-events', location + '.history'); continue;}
    } catch (error) {add(error.message, location + '.history'); continue;}
    let lastTime = '';
    const previous = new Map();
    for (const [offset, line] of lines.entries()) {
      const eventLocation = location + '.history[' + offset + ']';
      let event;
      try {event = parse(line);} catch (error) {add(error.message, eventLocation); continue;}
      if (object(event) && event.debugRecordVersion !== undefined && event.debugRecordVersion !== DEBUG_RECORD_VERSION) {
        add('unsupported-record-version', eventLocation); continue;
      }
      const findings = validateStructure('event', event);
      errors.push(...findings.map(f => ({...f, location:eventLocation + ':' + f.location})));
      if (findings.length) continue;
      if (allEventIds.has(event.eventId)) add('duplicate-event-id', eventLocation);
      allEventIds.add(event.eventId);
      if (event.caseId !== entry.caseId) add('inconsistent-case-id', eventLocation);
      if (event.sequence !== offset + 1) add('invalid-sequence', eventLocation);
      if (!validDate(event.recordedAt, true) || !validDate(event.occurredOn)) add('invalid-date', eventLocation);
      if (event.recordedAt < lastTime) add('invalid-chronology', eventLocation);
      lastTime = event.recordedAt;
      for (const id of [...event.evidenceEventIds, ...event.counterEvidenceEventIds]) if (!previous.has(id)) add('missing-event-link', eventLocation);
      for (const reference of event.sourceRefs) {
        if (!safePath(reference.path)) add('unsafe-path', eventLocation + '.sourceRefs');
        else sourceRefs.push(reference);
      }
      checkEvidence(event, previous, eventLocation, add);
      previous.set(event.eventId, event);
      journal.push(event);
    }
  }

  // Catalog IDs are links to implementation descriptions, never Forever IDs.
  if ([...incidents.values()].some(i => i?.operationIds.length)) {
    const bytes = read('agent/catalog.json', 'catalog');
    if (bytes) try {
      const catalog = parse(decode(bytes));
      if (catalog.catalogVersion !== '0.1' || !Array.isArray(catalog.operations)) add('unsupported-catalog-version', 'catalog');
      else for (const incident of incidents.values()) if (incident) for (const id of incident.operationIds) {
        if (!catalog.operations.some(operation => operation.id === id)) add('missing-operation-link', 'incident.operationIds');
      }
    } catch {add('invalid-catalog', 'catalog');}
  }
  const uniqueRefs = [...new Map(sourceRefs.map(ref => [canonical(ref), ref])).values()].sort((a,b) => compare(canonical(a), canonical(b)));
  for (const ref of uniqueRefs) {
    let bytes;
    try {
      if (!fileCache.has(ref.path)) fileCache.set(ref.path, readBytes(root, ref.path));
      bytes = fileCache.get(ref.path);
    } catch (error) {
      if (error.message === 'unsafe-path') add('unsafe-path', 'sourceRefs');
      else warnings.push({code:'missing-reference', path:ref.path, symbol:ref.symbol});
      continue;
    }
    if (hash(bytes) !== ref.sha256) warnings.push({code:'stale-reference', path:ref.path, symbol:ref.symbol});
    let text;
    try {text = decode(bytes);} catch {warnings.push({code:'unreadable-reference',path:ref.path,symbol:ref.symbol}); continue;}
    if (!text.includes(ref.symbol)) warnings.push({code:'missing-anchor', path:ref.path, symbol:ref.symbol});
  }
  const sortFindings = list => [...new Map(list.map(f => [canonical(f),f])).values()].sort((a,b) => compare(canonical(a),canonical(b)));
  return {incidents, events, sourceRefs:uniqueRefs, recordRefs:recordRefs.sort((a,b)=>compare(a.path,b.path)),
    errors:sortFindings(errors), warnings:sortFindings(warnings)};
}

function checkEvidence(event, previous, location, add) {
  const proof = event.proof;
  const scopedProof = scope => proof?.scope === scope && proof.result === 'pass' &&
    (scope === 'source' ? proof.method === 'static-analysis' && event.sourceRefs.some(ref=>ref.role==='source')
      : scope === 'automated' ? proof.method === 'automated-test' && Boolean(proof.command) && event.sourceRefs.some(ref=>ref.role==='test')
      : proof.method === 'manual-browser' && event.sourceRefs.some(ref=>ref.role==='document'));
  const statusFor = {source:'verified-in-source',automated:'verified-by-test',browser:'observed-in-browser'};
  if (proof && (proof.method !== {source:'static-analysis',automated:'automated-test',browser:'manual-browser'}[proof.scope]
      || (proof.scope === 'automated' && !proof.command))) add('invalid-proof', location);
  if (event.evidenceStatus === 'verified-in-source' && !scopedProof('source')) add('invalid-proof', location);
  if (event.evidenceStatus === 'verified-by-test' && !scopedProof('automated')) add('invalid-proof', location);
  if (event.evidenceStatus === 'observed-in-browser' && !scopedProof('browser')) add('invalid-proof', location);
  if (event.kind === 'hypothesis') {
    if (!event.hypothesisId || !event.hypothesisState || !event.scope) add('invalid-hypothesis', location);
    if (event.hypothesisState === 'confirmed' && (!scopedProof(event.scope) || !event.evidenceEventIds.length
        || event.evidenceStatus !== statusFor[event.scope])) add('invalid-proof', location);
  } else if (event.hypothesisId !== undefined || event.hypothesisState !== undefined) add('invalid-hypothesis', location);
  if (event.kind === 'outcome') {
    if (!event.outcomeStatus || !event.scope) add('invalid-outcome', location);
    if (event.outcomeStatus === 'verified' && (!scopedProof(event.scope) || event.evidenceStatus !== statusFor[event.scope])) add('invalid-proof', location);
    if (event.outcomeStatus !== 'verified' && ['verified-in-source','verified-by-test','observed-in-browser'].includes(event.evidenceStatus)) add('invalid-outcome', location);
  } else if (event.outcomeStatus !== undefined) add('invalid-outcome', location);
  if (event.kind === 'lifecycle') {
    if (!event.state) add('invalid-lifecycle', location);
    // Closing requires both recorded automation and browser outcomes, not a merged PR.
    if (event.state === 'closed' && !['automated','browser'].every(scope => event.evidenceEventIds.some(id => {
      const evidence = previous.get(id);
      return evidence?.kind === 'outcome' && evidence.scope === scope && evidence.outcomeStatus === 'verified';
    }))) add('unverified-closure', location);
  } else if (event.state !== undefined) add('invalid-lifecycle', location);
}

export function createDebugApi({root = ROOT, manifestPath = 'debug/manifest.json'} = {}) {
  let snapshot;
  return {
    query(operation, input = {}) {
      const envelope = {debugApiVersion:DEBUG_API_VERSION, debugRecordVersion:DEBUG_RECORD_VERSION,
        data:null, sourceRefs:[], recordRefs:[], provenance:{sourceType:'historical',reviewStatus:'unreviewed'},
        evidenceStatus:'unknown', freshness:{status:'unknown', findings:[], scope:'Pinned record snapshot; source hashes and literal anchors only, never test or browser outcomes.'}, explanation:''};
      const fail = (code, message) => ({...envelope, explanation:message, error:{code,message,details:{}}});
      if (!object(input)) return fail('invalid-request', 'Arguments must be a JSON object.');
      if (input.requestId !== undefined) {
        if (typeof input.requestId !== 'string' || !/^[A-Za-z0-9._-]{1,80}$/.test(input.requestId)) return fail('invalid-request', 'Use a short opaque request identifier.');
        envelope.requestId = input.requestId;
      }
      if (input.debugApiVersion !== undefined && input.debugApiVersion !== DEBUG_API_VERSION) return fail('unsupported-version', 'This adapter supports debug API 0.1.');
      if (!OPERATIONS.includes(operation)) return fail('unsupported-operation', 'Operation is not advertised by describe.');
      const caseQuery = ['getIncident','getHistory'].includes(operation);
      const allowed = ['requestId','debugApiVersion', ...(caseQuery ? ['caseId'] : []), ...(operation === 'listIncidents' ? ['state','severity'] : [])];
      if (Object.keys(input).some(key=>!allowed.includes(key))) return fail('invalid-request', 'Unexpected argument.');
      if (caseQuery && (typeof input.caseId !== 'string' || !/^DBG-[0-9]{3,}$/.test(input.caseId))) return fail('invalid-request', 'An exact DBG case identifier is required.');
      if (input.state !== undefined && !['open','investigating','closed'].includes(input.state)) return fail('invalid-request', 'Unknown lifecycle filter.');
      if (input.severity !== undefined && !['low','medium','high','critical'].includes(input.severity)) return fail('invalid-request', 'Unknown severity filter.');
      if (operation === 'describe') {
        envelope.data = {debugApiVersion:DEBUG_API_VERSION, supportedRecordVersions:[DEBUG_RECORD_VERSION], operations:[...OPERATIONS],
          readOnly:true, snapshot:'lazy, immutable per API instance; recreate to refresh',
          limits:{bytesPerFile:MAX_BYTES,eventsPerCase:MAX_EVENTS,cases:1000},
          forever:{standardVersion:'0.1',publicApiVersion:'0.1',supportedModelVersions:[],adapterImplemented:false},
          coverage:'One curated incident; no similarity, impact graph, runtime import, live tests or remediation execution.'};
        envelope.explanation = 'Offline incident inspection. Discover operations here; record validation and runtime verification are separate.';
        return structuredClone(envelope);
      }
      snapshot ||= loadSnapshot(root, manifestPath);
      envelope.sourceRefs = snapshot.sourceRefs;
      envelope.recordRefs = snapshot.recordRefs;
      envelope.freshness.status = snapshot.errors.length ? 'unknown' : snapshot.warnings.length ? 'stale' : 'current';
      envelope.freshness.findings = snapshot.warnings;
      if (operation === 'validateDebugRecords') {
        envelope.data = {valid:!snapshot.errors.length, errors:snapshot.errors, warnings:snapshot.warnings,
          caseCount:snapshot.incidents.size, eventCount:[...snapshot.events.values()].reduce((count,list)=>count+list.length,0)};
        envelope.explanation = snapshot.errors.length ? 'Records are invalid; case queries are unavailable. Inspect stable validation codes.'
          : 'Records are structurally consistent. This does not prove hypotheses, author acceptance, test results or browser success.';
        return structuredClone(envelope);
      }
      if (snapshot.errors.length) return fail('invalid-debug-records', 'Records are invalid. Run validateDebugRecords for stable findings.');
      const project = incident => {
        const history = snapshot.events.get(incident.caseId);
        const lifecycle = history.filter(event=>event.kind==='lifecycle').at(-1)?.state || incident.initialState;
        const latest = new Map();
        for (const event of history) {
          const key = event.kind === 'hypothesis' ? 'hypothesis:' + event.hypothesisId
            : event.kind === 'outcome' ? 'outcome:' + event.scope : event.kind;
          latest.set(key, event);
        }
        return {incident, lifecycle, historyCount:history.length, latestEvents:[...latest.entries()].sort(([a],[b])=>compare(a,b)).map(([,event])=>event)};
      };
      if (operation === 'listIncidents') {
        envelope.data = [...snapshot.incidents.values()].sort((a,b)=>compare(a.caseId,b.caseId)).map(project)
          .filter(item=>(input.state === undefined || item.lifecycle === input.state) && (input.severity === undefined || item.incident.severity === input.severity));
        envelope.explanation = 'Incidents sorted by exact case ID. Filters use documented severity and derived lifecycle, not duplicate-report counts.';
      } else {
        const incident = snapshot.incidents.get(input.caseId);
        if (!incident) return fail('incident-not-found', 'No incident has that exact case ID.');
        envelope.provenance = incident.provenance;
        if (operation === 'getHistory') {
          envelope.data = snapshot.events.get(input.caseId);
          envelope.explanation = incident.caseId + ': recording chronology preserved by sequence. Unknown occurrence dates remain unknown; events are never silently reordered.';
        } else {
          envelope.data = project(incident);
          const source = envelope.data.latestEvents.find(event=>event.kind==='source-inspection');
          const outcome = envelope.data.latestEvents.find(event=>event.kind==='outcome' && event.scope==='browser');
          envelope.explanation = incident.caseId + ': ' + incident.symptom + (source ? '\nSource evidence: ' + source.claim : '') +
            (outcome ? '\nOutcome: ' + outcome.claim : '') + '\nStill unknown: ' + incident.unknowns.join('; ');
        }
      }
      return structuredClone(envelope);
    }
  };
}
