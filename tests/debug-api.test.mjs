import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdtempSync, rmSync, symlinkSync, mkdirSync, statSync, cpSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createDebugApi, validateStructure} from '../agent/debug/api.mjs';
import {runCli} from '../agent/debug/cli.mjs';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const archivePath = 'tests/fixtures/debug/v0.1/';
const readJson = path => JSON.parse(readFileSync(join(ROOT,path),'utf8'));
const frozen = readJson(archivePath + 'expected.json');
const fixtureIncident = readJson(archivePath + 'incident.json');
const fixtureEvent = JSON.parse(readFileSync(join(ROOT,archivePath + 'history.jsonl'),'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const gitBlob = bytes => createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');

function fixture(fn) {
  const root = mkdtempSync(join(tmpdir(), 'redown-debug-'));
  const incident = structuredClone(fixtureIncident);
  const events = [structuredClone(fixtureEvent)];
  const manifest = {debugRecordVersion:'0.1', cases:[{caseId:incident.caseId,incidentPath:'incident.json',historyPath:'history.jsonl'}]};
  const write = (path, value) => writeFileSync(join(root,path), JSON.stringify(value,null,2) + '\n');
  const save = () => {write('manifest.json',manifest); write('incident.json',incident); writeFileSync(join(root,'history.jsonl'),events.map(e=>JSON.stringify(e)).join('\n')+'\n');};
  const api = () => createDebugApi({root,manifestPath:'manifest.json'});
  const validation = () => api().query('validateDebugRecords');
  const codes = () => validation().data.errors.map(e=>e.code);
  save();
  try {fn({root,incident,events,manifest,write,save,api,validation,codes});} finally {rmSync(root,{recursive:true,force:true});}
}
function nextEvent(events, changes = {}) {
  return {...structuredClone(events[0]), sequence:events.length+1,eventId:'DBG-900.event-' + (events.length+1),
    evidenceEventIds:[],counterEvidenceEventIds:[],...changes};
}
function sourceReference(root) {
  const bytes = 'function fixtureSource() {}\n';
  writeFileSync(join(root,'source.txt'), bytes);
  return {path:'source.txt',symbol:'function fixtureSource',sha256:digest(bytes),role:'source'};
}
const sourceProof = {method:'static-analysis',scope:'source',environment:'offline fixture',result:'pass'};

test('real discovery, case, history, filters and validation are deterministic and honest', () => {
  const api = createDebugApi();
  const discovery = api.query('describe');
  assert.deepEqual(discovery.data.operations,['describe','getHistory','getIncident','listIncidents','validateDebugRecords']);
  assert.deepEqual(discovery.data.supportedRecordVersions,['0.1']);
  assert.equal(discovery.data.forever.adapterImplemented,false);
  assert.deepEqual(discovery.data.forever.supportedModelVersions,[]);
  const validated = api.query('validateDebugRecords');
  assert.deepEqual(validated.data,{valid:true,errors:[],warnings:[],caseCount:1,eventCount:9});
  assert.equal(validated.freshness.status,'current');
  const result = api.query('getIncident',{caseId:'DBG-001'});
  assert.equal(result.data.lifecycle,'open');
  assert.equal(result.evidenceStatus,'unknown');
  assert.match(result.explanation,/No browser reproduction/);
  const cause = result.data.latestEvents.find(e=>e.hypothesisId==='nested-editor.stale-disabled-restoration');
  assert.equal(cause.hypothesisState,'confirmed');
  assert.equal(cause.scope,'source');
  const outcome = result.data.latestEvents.find(e=>e.kind==='outcome');
  assert.equal(outcome.outcomeStatus,'unverified');
  assert.equal(result.data.incident.foreverLinks.status,'unknown');
  assert.ok(result.data.incident.unknowns.length);
  for (const operation of discovery.data.operations) {
    const input = ['getIncident','getHistory'].includes(operation) ? {caseId:'DBG-001'} : {};
    assert.deepEqual(api.query(operation,input),api.query(operation,input));
  }
  assert.equal(api.query('listIncidents',{state:'closed'}).data.length,0);
  assert.equal(api.query('listIncidents',{severity:'high'}).data.length,1);
  const history = api.query('getHistory',{caseId:'DBG-001'}).data;
  assert.deepEqual(history,readFileSync(join(ROOT,'debug/cases/DBG-001.events.jsonl'),'utf8').trimEnd().split('\n').map(JSON.parse));
  assert.equal(history[1].occurredOn,null);
  assert.ok(history.some(e=>e.commit==='03efcc07358f64970d6158831884c2d1431ebd66'));
  result.data.incident.provenance.reviewStatus='accepted';
  assert.equal(api.query('getIncident',{caseId:'DBG-001'}).data.incident.provenance.reviewStatus,'unreviewed');
});

test('original case and proposal Markdown bytes are retained from pinned upstream', () => {
  assert.equal(gitBlob(readFileSync(join(ROOT,'docs/debug/DBG-001_NESTED_CHILD_DEPTH_DISABLED_STATE.md'))),'ff3a22e9107292da01985e390ebe0b19eaf0eed3');
  assert.equal(gitBlob(readFileSync(join(ROOT,'docs/debug/PROPOSED_CHANGES.md'))),'c33ecdf900236e5dd3927544ad0ab832f1edf405');
});

test('archived 0.1 semantic golden, unknown fields and inferred provenance survive JSON round trips', () => {
  const api = createDebugApi({manifestPath:archivePath + 'manifest.json'});
  const result = api.query('getIncident',{caseId:'DBG-900'});
  assert.equal(result.error,undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(result.data)),frozen);
  assert.deepEqual(api.query('getHistory',{caseId:'DBG-900'}).data,[fixtureEvent]);
  assert.equal(result.provenance.sourceType,'inferred');
  assert.equal(result.provenance.confidence,0.65);
  assert.equal(result.provenance.reviewStatus,'unreviewed');
  assert.equal(api.query('validateDebugRecords').data.valid,true);
});

test('portable structural fixtures and frozen schema assertions match the lightweight evaluator', () => {
  for (const row of readJson('tests/fixtures/debug/structure-cases.json')) {
    assert.equal(validateStructure(row.schema,row.value).length===0,row.valid,row.name);
  }
  const supported=new Set(['$schema','$id','$defs','$ref','type','required','properties','additionalProperties','const','enum',
    'pattern','minLength','minItems','maxItems','uniqueItems','items','minimum','maximum']);
  const visit=schema=>{
    for (const key of Object.keys(schema)) assert.ok(supported.has(key),'Unsupported schema assertion: '+key);
    for (const child of Object.values(schema.properties || {})) visit(child);
    for (const child of Object.values(schema.$defs || {})) visit(child);
    if (schema.items) visit(schema.items);
    if (schema.additionalProperties !== undefined) assert.equal(schema.additionalProperties,true);
    if (schema.$ref) assert.match(schema.$ref,/^common\.schema\.json#\/\$defs\/[A-Za-z]+$/);
  };
  for (const name of ['manifest','incident','event','common']) visit(readJson('agent/debug/schemas/0.1/'+name+'.schema.json'));
});

test('new unknown optional fields are retained without reinterpreting lifecycle or evidence', () => fixture(f => {
  f.incident.futureNextVersion={arrays:[2,1],extensions:{'example.org/value':true}};
  f.events[0].futureNextVersion={proofLikeText:'accepted is only text'};
  f.save();
  const result=f.api().query('getIncident',{caseId:'DBG-900'});
  assert.deepEqual(result.data.incident,f.incident);
  assert.deepEqual(result.data.latestEvents,[f.events[0]]);
  assert.equal(result.data.lifecycle,'open');
  assert.equal(result.evidenceStatus,'unknown');
}));

test('missing case, bad requests, unsupported operations/versions have stable sanitized errors', () => {
  const api=createDebugApi();
  for (const [op,input,code] of [
    ['getIncident',{caseId:'DBG-999'},'incident-not-found'],
    ['getHistory',{caseId:'dbg-001'},'invalid-request'],
    ['getHistory',{},'invalid-request'],
    ['describe',null,'invalid-request'],
    ['describe',[],'invalid-request'],
    ['describe',{debugApiVersion:'99'},'unsupported-version'],
    ['describe',{requestId:'SECRET_SENTINEL=private'},'invalid-request'],
    ['describe',{token:'SECRET_SENTINEL'},'invalid-request'],
    ['getEvidence',{},'unsupported-operation'],
    ['listIncidents',{state:'resolved'},'invalid-request'],
    ['listIncidents',{severity:'urgent'},'invalid-request'],
    ['describe',{state:'open'},'invalid-request']
  ]) {
    const result=api.query(op,input);
    assert.equal(result.error.code,code);
    assert.equal(result.data,null);
    assert.equal(JSON.stringify(result).includes('SECRET_SENTINEL'),false);
    assert.deepEqual(result,api.query(op,input));
  }
  assert.equal(api.query('getIncident',{caseId:'DBG-001',requestId:'audit.1'}).requestId,'audit.1');
});

test('malformed JSON, non-UTF8, blank lines and truncated JSONL never yield partial query success', () => {
  for (const [file,bytes,code] of [
    ['manifest.json','{','invalid-json'],
    ['incident.json',Buffer.from([0xff]),'invalid-utf8'],
    ['history.jsonl','{','incomplete-journal'],
    ['history.jsonl','{}\n\n','invalid-json'],
    ['history.jsonl',Buffer.from([0xff,0x0a]),'invalid-utf8'],
    ['history.jsonl','{\n','invalid-json']
  ]) fixture(f=>{
    writeFileSync(join(f.root,file),bytes);
    assert.ok(f.codes().includes(code));
    assert.equal(f.api().query('getIncident',{caseId:'DBG-900'}).error.code,'invalid-debug-records');
    assert.equal(f.validation().data.valid,false);
  });
});

test('required fields, types, enum values, bounds and array uniqueness are actually checked', () => {
  for (const mutate of [
    f=>delete f.incident.provenance,
    f=>f.incident.provenance.confidence=1.1,
    f=>f.incident.fingerprints=[],
    f=>f.incident.unknowns=['same','same'],
    f=>f.incident.initialState='closed',
    f=>f.events[0].sequence=1.5,
    f=>f.events[0].evidenceStatus='accepted',
    f=>f.events[0].sourceRefs=[{path:'source.txt',symbol:'x',role:'source',sha256:'short'}],
    f=>f.manifest.cases={}
  ]) fixture(f=>{mutate(f);f.save();assert.ok(f.codes().includes('invalid-record'));});
  assert.ok(validateStructure('event',null).length);
});

test('every record format version is rejected explicitly; missing versions are structural failures', () => {
  for (const field of ['manifest','incident','event']) fixture(f=>{
    (field==='event' ? f.events[0] : f[field]).debugRecordVersion='0.2';
    f.save();
    assert.ok(f.codes().includes('unsupported-record-version'));
  });
  fixture(f=>{delete f.incident.debugRecordVersion;f.save();assert.ok(f.codes().includes('invalid-record'));});
});

test('duplicate case/event IDs and paths, mismatched case IDs and missing event links are not hidden', () => {
  for (const [mutate,code] of [
    [f=>f.manifest.cases.push(f.manifest.cases[0]),'duplicate-case-id'],
    [f=>f.manifest.cases.push({...f.manifest.cases[0],caseId:'DBG-901'}),'duplicate-record-path'],
    [f=>f.events.push({...f.events[0],sequence:2}),'duplicate-event-id'],
    [f=>f.incident.caseId='DBG-901','inconsistent-case-id'],
    [f=>f.events[0].caseId='DBG-901','inconsistent-case-id'],
    [f=>f.events[0].evidenceEventIds=['missing.event'],'missing-event-link'],
    [f=>f.events[0].counterEvidenceEventIds=['DBG-900.report'],'missing-event-link']
  ]) fixture(f=>{mutate(f);f.save();assert.ok(f.codes().includes(code));});
});

test('recorded chronology and exact physical sequence are validated; dates are never invented or sorted', () => {
  for (const [mutate,code] of [
    [f=>f.events[0].sequence=2,'invalid-sequence'],
    [f=>f.events[0].occurredOn='2026-02-30','invalid-date'],
    [f=>f.events[0].recordedAt='2026-02-30T01:00:00Z','invalid-date'],
    [f=>f.events.push(nextEvent(f.events,{recordedAt:'2020-01-01T00:00:00Z'})),'invalid-chronology']
  ]) fixture(f=>{mutate(f);f.save();assert.ok(f.codes().includes(code));});
  fixture(f=>{
    // Older occurrence discovered later: retain recording order and the older source date.
    f.events.push(nextEvent(f.events,{occurredOn:'2001-01-01'}));f.save();
    assert.equal(f.validation().data.valid,true);
    assert.equal(f.api().query('getHistory',{caseId:'DBG-900'}).data[1].occurredOn,'2001-01-01');
  });
});

test('deterministic list ordering and filter semantics do not depend on manifest order', () => fixture(f=>{
  const other={...f.incident,caseId:'DBG-901',severity:'low'};
  const otherEvent={...f.events[0],caseId:'DBG-901',eventId:'DBG-901.report'};
  f.write('other.json',other);writeFileSync(join(f.root,'other.jsonl'),JSON.stringify(otherEvent)+'\n');
  f.manifest.cases.unshift({caseId:'DBG-901',incidentPath:'other.json',historyPath:'other.jsonl'});f.save();
  assert.deepEqual(f.api().query('listIncidents').data.map(x=>x.incident.caseId),['DBG-900','DBG-901']);
  assert.deepEqual(f.api().query('listIncidents',{severity:'low'}).data.map(x=>x.incident.caseId),['DBG-901']);
}));

test('source hash drift, missing anchors and absence are freshness warnings, not falsified historical claims', () => {
  for (const change of ['hash','anchor','missing']) fixture(f=>{
    const reference=sourceReference(f.root);
    f.events[0].sourceRefs=[reference];f.save();
    assert.equal(f.validation().freshness.status,'current');
    if (change==='hash') writeFileSync(join(f.root,'source.txt'),'function fixtureSource() {} // changed');
    if (change==='anchor') {reference.symbol='absent anchor';f.save();}
    if (change==='missing') rmSync(join(f.root,'source.txt'));
    const r=f.validation();
    assert.equal(r.data.valid,true);
    assert.equal(r.freshness.status,'stale');
    assert.ok(r.data.warnings.some(x=>x.code===({hash:'stale-reference',anchor:'missing-anchor',missing:'missing-reference'})[change]));
    const history=f.api().query('getHistory',{caseId:'DBG-900'});
    assert.deepEqual(history.data[0],f.events[0]);
    assert.equal(history.evidenceStatus,'unknown');
  });
});

test('path traversal, absolute/Windows paths, NUL and escaping symlinks are rejected for records and evidence', () => {
  for (const path of ['../outside','/etc/hosts','C:\\Windows\\file','a/../../outside','a\\..\\outside','a\0b','./incident.json']) fixture(f=>{
    f.manifest.cases[0].incidentPath=path;f.save();assert.ok(f.codes().includes('unsafe-path'));
  });
  fixture(f=>{
    const outside=join(tmpdir(),'redown-debug-outside-' + f.root.split('/').at(-1));
    writeFileSync(outside,'PRIVATE_SENTINEL');
    try {
      symlinkSync(outside,join(f.root,'escape'));
      f.manifest.cases[0].incidentPath='escape';f.save();
      assert.ok(f.codes().includes('unsafe-path'));
      assert.equal(JSON.stringify(f.validation()).includes('PRIVATE_SENTINEL'),false);
      f.manifest.cases[0].incidentPath='incident.json';
      f.events[0].sourceRefs=[{path:'escape',symbol:'x',sha256:'0'.repeat(64),role:'source'}];f.save();
      assert.ok(f.codes().includes('unsafe-path'));
    } finally {rmSync(outside,{force:true});}
  });
  fixture(f=>{
    f.events[0].sourceRefs=[{path:'../outside',symbol:'x',sha256:'0'.repeat(64),role:'source'}];f.save();
    assert.ok(f.codes().includes('unsafe-path'));
  });
});

test('internal symlinks work; directories, unavailable roots/files and oversized records fail deterministically', () => {
  fixture(f=>{
    symlinkSync(join(f.root,'incident.json'),join(f.root,'inside'));
    f.manifest.cases[0].incidentPath='inside';f.save();
    assert.equal(f.validation().data.valid,true);
  });
  fixture(f=>{mkdirSync(join(f.root,'directory'));f.manifest.cases[0].incidentPath='directory';f.save();assert.ok(f.codes().includes('invalid-record-file'));});
  fixture(f=>{rmSync(join(f.root,'incident.json'));assert.ok(f.codes().includes('missing-record-file'));});
  fixture(f=>{writeFileSync(join(f.root,'incident.json'),Buffer.alloc(4*1024*1024+1));assert.ok(f.codes().includes('record-too-large'));});
  assert.equal(createDebugApi({root:'/missing-redown-debug-root'}).query('validateDebugRecords').data.errors[0].code,'missing-record-root');
});

test('operation references resolve exactly; Forever mappings remain unknown rather than invented', () => {
  for (const [catalog,code] of [
    [{catalogVersion:'0.1',operations:[{id:'another'}]},'missing-operation-link'],
    [{catalogVersion:'99',operations:[]},'unsupported-catalog-version']
  ]) fixture(f=>{
    mkdirSync(join(f.root,'agent'));f.write('agent/catalog.json',catalog);
    f.incident.operationIds=['cfCreateFolder'];f.save();assert.ok(f.codes().includes(code));
  });
  fixture(f=>{f.incident.foreverLinks.links=[{id:'invented.invariant'}];f.save();assert.ok(f.codes().includes('invalid-record'));});
});

test('source confirmation is scoped and requires proof; test pointers never imply test success', () => {
  fixture(f=>{
    f.events.push(nextEvent(f.events,{kind:'hypothesis',hypothesisId:'fixture.cause',hypothesisState:'confirmed',scope:'source',
      evidenceStatus:'verified-in-source',sourceRefs:[sourceReference(f.root)],proof:sourceProof,evidenceEventIds:['DBG-900.report']}));
    f.save();assert.equal(f.validation().data.valid,true);
    delete f.events[1].proof;f.save();assert.ok(f.codes().includes('invalid-proof'));
  });
  fixture(f=>{
    f.events[0].sourceRefs=[{...sourceReference(f.root),role:'test'}];f.save();
    assert.equal(f.validation().data.valid,true);
    assert.equal(f.api().query('getIncident',{caseId:'DBG-900'}).evidenceStatus,'unknown');
    f.events[0].evidenceStatus='verified-by-test';f.save();assert.ok(f.codes().includes('invalid-proof'));
  });
  fixture(f=>{
    f.events[0].evidenceStatus='verified-in-source';f.events[0].proof={...sourceProof,method:'manual-browser'};
    f.events[0].sourceRefs=[sourceReference(f.root)];f.save();assert.ok(f.codes().includes('invalid-proof'));
  });
});

test('hypothesis revisions and counterevidence preserve earlier beliefs and latest projection', () => fixture(f=>{
  f.events.push(nextEvent(f.events,{kind:'hypothesis',hypothesisId:'fixture.cause',hypothesisState:'supported',scope:'source',evidenceEventIds:['DBG-900.report']}));
  const supported=f.events[1].eventId;
  f.events.push(nextEvent(f.events,{kind:'hypothesis',hypothesisId:'fixture.cause',hypothesisState:'refuted',scope:'source',counterEvidenceEventIds:[supported]}));
  f.save();assert.equal(f.validation().data.valid,true);
  assert.deepEqual(f.api().query('getHistory',{caseId:'DBG-900'}).data,f.events);
  const latest=f.api().query('getIncident',{caseId:'DBG-900'}).data.latestEvents.find(e=>e.kind==='hypothesis');
  assert.equal(latest.hypothesisState,'refuted');
}));

test('closure requires recorded automation and browser outcomes; reopening retains closure evidence', () => fixture(f=>{
  f.events.push(nextEvent(f.events,{kind:'lifecycle',state:'closed'}));f.save();
  assert.ok(f.codes().includes('unverified-closure'));
  f.events.pop();
  const reference=sourceReference(f.root);
  f.events.push(nextEvent(f.events,{kind:'outcome',scope:'automated',outcomeStatus:'verified',evidenceStatus:'verified-by-test',
    sourceRefs:[{...reference,role:'test'}],proof:{method:'automated-test',scope:'automated',command:'fixture-test',environment:'fixture',result:'pass'}}));
  const automated=f.events[1].eventId;
  f.events.push(nextEvent(f.events,{kind:'outcome',scope:'browser',outcomeStatus:'verified',evidenceStatus:'observed-in-browser',
    sourceRefs:[{...reference,role:'document'}],proof:{method:'manual-browser',scope:'browser',environment:'fixture Chrome, not real execution',result:'pass'}}));
  const browser=f.events[2].eventId;
  f.events.push(nextEvent(f.events,{kind:'lifecycle',state:'closed',evidenceEventIds:[automated,browser]}));f.save();
  assert.equal(f.validation().data.valid,true);
  assert.equal(f.api().query('getIncident',{caseId:'DBG-900'}).data.lifecycle,'closed');
  f.events.push(nextEvent(f.events,{kind:'lifecycle',state:'open',evidenceEventIds:[browser]}));f.save();
  assert.equal(f.api().query('getIncident',{caseId:'DBG-900'}).data.lifecycle,'open');
  assert.equal(f.api().query('getHistory',{caseId:'DBG-900'}).data.length,5);
}));

test('invalid hypothesis, outcome and lifecycle payloads cannot masquerade as verified results', () => {
  for (const [changes,code] of [
    [{kind:'hypothesis'},'invalid-hypothesis'],
    [{hypothesisState:'confirmed'},'invalid-hypothesis'],
    [{kind:'outcome',scope:'browser',outcomeStatus:'verified'},'invalid-proof'],
    [{kind:'outcome'},'invalid-outcome'],
    [{outcomeStatus:'verified'},'invalid-outcome'],
    [{kind:'lifecycle'},'invalid-lifecycle'],
    [{state:'closed'},'invalid-lifecycle']
  ]) fixture(f=>{Object.assign(f.events[0],changes);f.save();assert.ok(f.codes().includes(code));});
});

test('immutable API snapshots avoid rescans and refresh only when a new reader is created', () => fixture(f=>{
  f.events[0].sourceRefs=[sourceReference(f.root)];f.save();
  const api=f.api(), first=api.query('getIncident',{caseId:'DBG-900'});
  f.incident.summary='New description';f.save();
  writeFileSync(join(f.root,'source.txt'),'changed');
  assert.deepEqual(api.query('getIncident',{caseId:'DBG-900'}),first);
  const refreshed=f.api().query('getIncident',{caseId:'DBG-900'});
  assert.equal(refreshed.data.incident.summary,'New description');
  assert.equal(refreshed.freshness.status,'stale');
  assert.notDeepEqual(refreshed.recordRefs,first.recordRefs);
}));

test('CLI adapter emits one JSON envelope, legible summaries and exact error/validation exits', () => {
  const result=runCli(['getIncident','DBG-001','--json','--request-id','test.1']);
  assert.equal(result.exitCode,0);
  assert.deepEqual(JSON.parse(result.output),result.result);
  assert.equal(result.result.requestId,'test.1');
  const human=runCli(['getIncident','DBG-001']).output;
  assert.match(human,/Proposed next verification/);
  assert.match(human,/extension\/nested-menu-editor.js/);
  assert.match(human,/Lifecycle: open/);
  assert.match(runCli(['getHistory','DBG-001']).output,/Occurred: unknown/);
  for (const argv of [
    ['getIncident','DBG-999','--json'],['getHistory','--json'],['describe','--json','--json'],
    ['describe','--api-version','--json'],['describe','--request-id','one','--request-id','two'],
    ['describe','--bogus'],['describe','extra'],['describe','--state','open']
  ]) assert.equal(runCli(argv).exitCode,2);
  assert.equal(runCli(['validateDebugRecords','--json']).exitCode,0);
});

test('actual CLI entry point works outside the checkout and exits 2 for invalid corpus validation', () => {
  const cli=join(ROOT,'agent/debug/cli.mjs');
  const invoke=(path,args)=>spawnSync(process.execPath,[path,...args],{cwd:tmpdir(),encoding:'utf8'});
  const success=invoke(cli,['getIncident','DBG-001','--json']);
  assert.equal(success.error,undefined);
  assert.equal(success.status,0);
  assert.equal(success.stderr,'');
  assert.equal(JSON.parse(success.stdout).data.incident.caseId,'DBG-001');
  const absent=invoke(cli,['getIncident','DBG-999','--json']);
  assert.equal(absent.status,2);
  assert.equal(JSON.parse(absent.stdout).error.code,'incident-not-found');
  fixture(f=>{
    mkdirSync(join(f.root,'agent'),{recursive:true});
    cpSync(join(ROOT,'agent/debug'),join(f.root,'agent/debug'),{recursive:true});
    mkdirSync(join(f.root,'debug'));
    writeFileSync(join(f.root,'debug/manifest.json'),'{');
    const invalid=invoke(join(f.root,'agent/debug/cli.mjs'),['validateDebugRecords','--json']);
    assert.equal(invalid.status,2);
    assert.equal(invalid.stderr,'');
    const result=JSON.parse(invalid.stdout);
    assert.equal(result.data.valid,false);
    assert.deepEqual(result.data.errors,[{code:'invalid-json',location:'manifest'}]);
  });
});

test('queries never modify the canonical corpus or cited historical evidence', () => {
  const api=createDebugApi();
  const refs=api.query('getIncident',{caseId:'DBG-001'});
  const paths=[...new Set([...refs.recordRefs,...refs.sourceRefs].map(ref=>ref.path))];
  const before=paths.map(path=>({path,bytes:readFileSync(join(ROOT,path)),mtime:statSync(join(ROOT,path)).mtimeMs}));
  for (const op of api.query('describe').data.operations) api.query(op,['getIncident','getHistory'].includes(op)?{caseId:'DBG-001'}:{});
  for (const file of before) {
    assert.deepEqual(readFileSync(join(ROOT,file.path)),file.bytes);
    assert.equal(statSync(join(ROOT,file.path)).mtimeMs,file.mtime);
  }
});
