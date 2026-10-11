import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createAgentApi, inspectReferences } from '../agent/api.mjs';
const catalog = JSON.parse(readFileSync(new URL('../agent/catalog.json', import.meta.url)));
const api = createAgentApi();
const cli = fileURL => spawnSync(process.execPath, [new URL('../agent/cli.mjs', import.meta.url).pathname, ...fileURL], { encoding:'utf8', cwd:tmpdir() });

test('offline discovery advertises only implemented operations and distinct versions', () => {
  const r = api.query('describe');
  assert.equal(r.freshness.status, 'current');
  assert.equal(r.data.agentApiVersion, '0.1');
  assert.equal(r.data.forever.adapterImplemented, false);
  assert.deepEqual(r.data.forever.supportedModelVersions, []);
  for (const op of r.data.operations) assert.equal(api.query(op, ['explainOperation','getForeverLinks'].includes(op) ? {id:'cfFolderChildren'} : {}).error, undefined);
  assert.equal(r.provenance.reviewStatus, 'unreviewed');
});

test('operation descriptions retain exact destination, side effect and coverage limits', () => {
  const ids = api.query('listOperations').data.map(o => o.id);
  assert.deepEqual(ids, [...ids].sort());
  assert.equal(ids.length, 6);
  const r = api.query('explainOperation', {id:'context-menu-transfer', requestId:'audit-1'});
  assert.equal(r.requestId, 'audit-1');
  assert.ok(r.data.path.includes('ingestCloudflareAtPrefix'));
  assert.match(r.data.coverage, /absent/);
  assert.ok(r.sourceRefs.some(ref => ref.symbol === 'const WORKER_SOURCE'));
  assert.match(api.query('explainOperation',{id:'cfFolderChildren'}).data.output, /No completeness flag/);
});

test('errors are deterministic, exact-id and version aware without echoing arbitrary input', () => {
  for (const [op,input,code] of [
    ['explainOperation',{id:'missing'},'operation-not-found'],
    ['explainOperation',{id:'CFFolderChildren'},'operation-not-found'],
    ['explainOperation',{},'invalid-request'],
    ['describe',{apiVersion:'99'},'unsupported-version'],
    ['destroyBucket',{},'unsupported-operation'],
    ['describe',null,'invalid-request'],
    ['describe',{token:'PRIVATE_SENTINEL'},'invalid-request'],
    ['describe',{requestId:'token=value'},'invalid-request']
  ]) {
    const first=api.query(op,input), second=api.query(op,input);
    assert.deepEqual(first, second); assert.equal(first.error.code, code); assert.equal(first.data, null);
    assert.equal(JSON.stringify(first).includes('PRIVATE_SENTINEL'), false);
  }
  const future=structuredClone(catalog); future.catalogVersion='2';
  assert.equal(createAgentApi({catalog:future}).query('describe').error.code,'unsupported-catalog-version');
});

test('unknown Forever mappings never become accepted records or a conformance claim', () => {
  const r=api.query('getForeverLinks',{id:'cfCreateBucket'});
  assert.equal(r.evidenceStatus,'unknown'); assert.equal(r.data.status,'unknown');
  assert.deepEqual(r.data.links,[]);
  r.data.links.push({id:'invented'});
  assert.deepEqual(api.query('getForeverLinks',{id:'cfCreateBucket'}).data.links,[]);
});

test('reference inspection detects content drift, missing anchors/files and unsafe paths', () => {
  const root=mkdtempSync(join(tmpdir(),'redown-agent-'));
  try {
    const bytes='function fixture() {}'; writeFileSync(join(root,'source.js'),bytes);
    const ref={path:'source.js',symbol:'function fixture',sha256:createHash('sha256').update(bytes).digest('hex')};
    const fixture={...catalog,sourceRevisions:[ref],overview:{sourceRefs:[ref]},operations:[]};
    assert.equal(inspectReferences(fixture,root).status,'current');
    writeFileSync(join(root,'source.js'),'changed');
    const codes=inspectReferences(fixture,root).findings.map(f=>f.code);
    assert.ok(codes.includes('stale-source'));assert.ok(codes.includes('missing-anchor'));
    assert.equal(createAgentApi({catalog:fixture,root}).query('describe').evidenceStatus,'unknown');
    fixture.sourceRevisions=[{...ref,path:'../outside.js'}];
    assert.equal(inspectReferences(fixture,root).findings[0].code,'missing-or-unsafe-source');
    symlinkSync('/etc/hosts',join(root,'escape'));
    fixture.sourceRevisions=[{...ref,path:'escape'}];
    assert.equal(inspectReferences(fixture,root).findings[0].code,'missing-or-unsafe-source');
  } finally { rmSync(root,{recursive:true,force:true}); }
});

test('CLI works outside checkout, emits one JSON envelope and uses exit 2 for errors', () => {
  const ok=cli(['explainOperation','cfCreateFolder','--json','--request-id','fixture-1']);
  assert.equal(ok.status,0);assert.equal(ok.stderr,'');assert.equal(JSON.parse(ok.stdout).requestId,'fixture-1');
  for(const args of [['explainOperation','missing','--json'],['describe','--api-version','2','--json'],['describe','--bad','--json']]) {
    const r=cli(args);assert.equal(r.status,2);assert.ok(JSON.parse(r.stdout).error);
  }
  const human=cli(['getForeverLinks','cfCreateFolder']);
  assert.equal(human.status,0); assert.match(human.stdout,/No accepted ReDown/);assert.match(human.stdout,/unknown/);
});

test('catalog IDs, evidence labels, source hashes and references are internally consistent', () => {
  assert.equal(new Set(catalog.operations.map(o=>o.id)).size,catalog.operations.length);
  assert.deepEqual(inspectReferences(catalog).findings,[]);
  for (const o of catalog.operations) {
    assert.equal(o.evidenceStatus,'verified-in-source');
    assert.ok(o.sourceRefs.length);assert.ok(o.coverage);assert.equal(o.foreverLinks.status,'unknown');
    for(const ref of [...o.sourceRefs,...o.testRefs]) { assert.match(ref.sha256,/^[a-f0-9]{64}$/);assert.ok(ref.symbol); }
  }
});

test('portable request fixtures and JSON envelope contract', () => {
  const fixtures=JSON.parse(readFileSync(new URL('./fixtures/agent/requests.json',import.meta.url)));
  for(const fixture of fixtures) {
    const result=api.query(fixture.operation,fixture.input);
    assert.equal(result.error?.code || null,fixture.errorCode);
    assert.equal(typeof result.explanation,'string');
    assert.deepEqual(JSON.parse(JSON.stringify(result)),result);
  }
});

test('M0 inventory covers every literal message branch without inventing handlers', () => {
  const source=readFileSync(new URL('../extension/background.js',import.meta.url),'utf8').split('chrome.runtime.onMessage.addListener')[1];
  const actual=[...new Set([...source.matchAll(/message\?\.type === "([^"]+)"/g)].map(m=>m[1]))].sort();
  const inventory=readFileSync(new URL('../docs/agent/MESSAGE_INVENTORY.md',import.meta.url),'utf8');
  const documented=[...inventory.matchAll(/^\| `([^`]+)` \|/gm)].map(m=>m[1]).sort();
  assert.deepEqual(documented,actual);assert.equal(actual.length,33);
});
